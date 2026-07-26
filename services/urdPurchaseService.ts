import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { urdPurchases } from '../db/schema';
import { ERR } from '../constants/errorCodes';
import { urdPurchaseRepository } from '../repositories/urdPurchaseRepository';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
import { sequenceCounterRepository } from '../repositories/sequenceCounterRepository';
import { auditRepository } from '../repositories/auditRepository';
import { financialYearRepository } from '../repositories/fyRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { fyService } from './fyService';
import type { CreateURDPurchaseInput, URDPurchase } from '../types/phase2.types';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { firmRepository } from '../repositories/firmRepository';
import { amountToWords, getCurrencySymbol } from '../utils/currency';

import { urdPrintService } from './urdPrintService';

function uuid() {
  return Crypto.randomUUID();
}

export async function getById(
  id: string,
  firmId: string,
): Promise<URDPurchase | null> {
  return urdPurchaseService.getById(id, firmId);
}

export async function generateURDPurchaseBill(
  urdId: string,
  firmId: string,
): Promise<string> {
  return urdPurchaseService.generateURDPurchaseBill(urdId, firmId);
}

export async function generateURDCustomerDeclaration(
  urdId: string,
  firmId: string,
): Promise<string> {
  return urdPurchaseService.generateURDCustomerDeclaration(urdId, firmId);
}

export async function deleteURDPurchase(
  urdId: string,
  firmId: string,
): Promise<void> {
  return urdPurchaseService.deleteURDPurchase(urdId, firmId);
}

export const urdPurchaseService = {
  // PUBLIC EXPORT — Phase 3 cross-phase seam. Phase 3 MUST call this;
  // NEVER call urdPurchaseRepository.getById() from Phase 3 directly.
  async getById(
    id: string,
    firmId: string,
  ): Promise<URDPurchase | null> {
    const urd = await db.select().from(urdPurchases)
      .where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId)))
      .limit(1)
      .then(res => res[0] as unknown as URDPurchase || null);
      
    if (!urd || urd.firmId !== firmId) return null;
    return urd;
  },

  async createURDPurchase(
    input: CreateURDPurchaseInput,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.customerName?.trim()) throw new Error(ERR.URD_CUSTOMER_NAME_REQUIRED);
    if (input.grossWeightMg <= 0) throw new Error(ERR.URD_GROSS_WEIGHT_INVALID);
    if (input.purityPercent <= 0 || input.purityPercent > 100)
      throw new Error(ERR.URD_PURITY_PERCENT_INVALID);
    if (input.ratePerGramPaise <= 0) throw new Error(ERR.URD_RATE_INVALID);

    if ((input.paymentMode === 'BANK' || input.paymentMode === 'UPI') && !input.bankAccountId)
      throw new Error(ERR.URD_BANK_ACCOUNT_REQUIRED);
    if (input.paymentMode === 'CASH' && input.bankAccountId)
      throw new Error(ERR.URD_BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);

    const fineWeightMg = Math.round(input.grossWeightMg * input.purityPercent / 100);
    const totalValuePaise = Math.round((fineWeightMg / 1000) * input.ratePerGramPaise);

    const fyId = await fyService.resolveTransactionFyId(firmId, input.purchaseDate);
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const lot = oldGoldLotRepository.insert(tx, {
        id: uuid(),
        firmId,
        receivedFrom: input.customerName,
        customerId: input.customerId ?? null,
        receivedDate: input.purchaseDate,
        grossWeightMg: input.grossWeightMg,
        purityPercent: input.purityPercent,
        metalSource: 'CUSTOMER',
        fineWeightMg,
        purchaseRatePaise: input.ratePerGramPaise ?? null,
        totalAmountPaise: totalValuePaise,
        notes: input.notes ?? null,
        status: 'RECEIVED',
        createdAt: now(), updatedAt: now(),
      });

      const urd = urdPurchaseRepository.insert(tx, {
        id: uuid(),
        firmId,
        fyId,
        urdNumber: null,
        purchaseDate: input.purchaseDate,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerAddress: input.customerAddress ?? null,
        customerMobile: input.customerMobile ?? null,
        customerAadhaar: input.customerAadhaar ?? null,
        customerPAN: input.customerPAN ?? null,
        metalType: input.metalType,
        grossWeightMg: input.grossWeightMg,
        purityPercent: input.purityPercent,
        fineWeightMg,
        ratePerGramPaise: input.ratePerGramPaise,
        totalValuePaise,
        paymentMode: input.paymentMode,
        bankAccountId: input.bankAccountId ?? null,
        oldGoldLotId: lot.id,
        status: 'DRAFT',
        notes: input.notes ?? null,
        createdAt: now(), updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CREATED', firmId, entityId: urd.id,
        deviceId,
        payload: JSON.stringify({
          urdId: urd.id, lotId: lot.id,
          customerName: urd.customerName, customerId: urd.customerId,
          grossWeightMg: input.grossWeightMg, purityPercent: input.purityPercent,
          fineWeightMg, totalValuePaise,
        }),
      });

      return urd;
    });
  },

  async updateURDPurchase(
    urdId: string,
    firmId: string,
    input: Partial<CreateURDPurchaseInput>
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
      if (urd.status !== 'DRAFT') throw new Error(ERR.URD_ALREADY_CONFIRMED);

      const customerName = input.customerName ?? urd.customerName;
      const grossWeightMg = input.grossWeightMg ?? urd.grossWeightMg;
      const purityPercent = input.purityPercent ?? urd.purityPercent;
      const ratePerGramPaise = input.ratePerGramPaise ?? urd.ratePerGramPaise;
      const paymentMode = input.paymentMode ?? urd.paymentMode;
      const bankAccountId = paymentMode === 'CASH' ? null : (input.bankAccountId ?? urd.bankAccountId);

      if (!customerName?.trim()) throw new Error(ERR.URD_CUSTOMER_NAME_REQUIRED);
      if (grossWeightMg <= 0) throw new Error(ERR.URD_GROSS_WEIGHT_INVALID);
      if (purityPercent <= 0 || purityPercent > 100) throw new Error(ERR.URD_PURITY_PERCENT_INVALID);
      if (ratePerGramPaise <= 0) throw new Error(ERR.URD_RATE_INVALID);

      const fineWeightMg = Math.round(grossWeightMg * purityPercent / 100);
      const totalValuePaise = Math.round((fineWeightMg / 1000) * ratePerGramPaise);

      if (urd.oldGoldLotId) {
        oldGoldLotRepository.insert(tx, {
          id: urd.oldGoldLotId,
          firmId,
          receivedFrom: customerName,
          customerId: input.customerId ?? urd.customerId,
          receivedDate: input.purchaseDate ?? urd.purchaseDate,
          grossWeightMg,
          purityPercent,
          metalSource: 'CUSTOMER',
          fineWeightMg,
          purchaseRatePaise: ratePerGramPaise,
          totalAmountPaise: totalValuePaise,
          notes: input.notes ?? urd.notes,
          status: 'RECEIVED',
          createdAt: urd.createdAt, updatedAt: now(),
        });
      }

      urdPurchaseRepository.update(tx, firmId, urdId, {
        customerName,
        customerAddress: input.customerAddress !== undefined ? input.customerAddress : urd.customerAddress,
        customerMobile: input.customerMobile !== undefined ? input.customerMobile : urd.customerMobile,
        customerAadhaar: input.customerAadhaar !== undefined ? input.customerAadhaar : urd.customerAadhaar,
        customerPAN: input.customerPAN !== undefined ? input.customerPAN : urd.customerPAN,
        metalType: input.metalType ?? urd.metalType,
        grossWeightMg,
        purityPercent,
        fineWeightMg,
        ratePerGramPaise,
        totalValuePaise,
        paymentMode,
        bankAccountId,
        notes: input.notes !== undefined ? input.notes : urd.notes,
        updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_UPDATED', firmId, entityId: urdId,
        deviceId,
        payload: JSON.stringify({ urdId, customerName, grossWeightMg, purityPercent, totalValuePaise }),
      });

      return {
        ...urd,
        customerName,
        grossWeightMg,
        purityPercent,
        fineWeightMg,
        ratePerGramPaise,
        totalValuePaise,
        paymentMode,
        bankAccountId,
        updatedAt: now(),
      };
    });
  },

  async deleteURDPurchase(urdId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
      if (urd.status !== 'DRAFT') throw new Error('Cannot delete confirmed URD purchase bill.');

      if (urd.oldGoldLotId) {
        oldGoldLotRepository.delete(tx, firmId, urd.oldGoldLotId);
      }
      urdPurchaseRepository.delete(tx, firmId, urdId);

      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_DELETED', firmId, entityId: urdId,
        deviceId,
        payload: JSON.stringify({ urdId, urdNumber: urd.urdNumber }),
      });
    });
  },

  async confirmURDPurchase(
    urdId: string,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
      if (urd.status !== 'DRAFT') throw new Error(ERR.URD_ALREADY_CONFIRMED);

      if (urd.totalValuePaise > 999999999) throw new Error(ERR.URD_AMOUNT_EXCEEDS_MAX);

      const seq = sequenceCounterRepository.nextVal(tx, firmId, urd.fyId, 'URD');
      const fy = financialYearRepository.getById(tx, firmId, urd.fyId);
      if (!fy) throw new Error(ERR.FY_NOT_FOUND);
      const fyLabel = fy.label;

      const urdNumber = `URD/${fyLabel}/${String(seq).padStart(4, '0')}`;

      urdPurchaseRepository.update(tx, firmId, urdId, {
        status: 'CONFIRMED',
        urdNumber,
        updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CONFIRMED', firmId, entityId: urdId,
        deviceId,
        payload: JSON.stringify({ urdId, urdNumber, totalValuePaise: urd.totalValuePaise }),
      });

      return { ...urd, status: 'CONFIRMED', urdNumber };
    });
  },

  async generateURDPurchaseBill(urdId: string, firmId: string): Promise<string> {
    return urdPrintService.generateURDPurchaseBill(urdId, firmId);
  },

  async generateURDCustomerDeclaration(urdId: string, firmId: string): Promise<string> {
    return urdPrintService.generateURDCustomerDeclaration(urdId, firmId);
  }
};