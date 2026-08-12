// services/urdPurchaseService.ts — Phase 2 v2.11 Canonical Service

import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { urdPurchases } from '@/db/schema';
import { ERR } from '@/constants/errorCodes';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';
import { oldGoldLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { sequenceCounterRepository } from '@/repositories/phase1/sequenceCounterRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { financialYearRepository } from '@/repositories/phase1/fyRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { fyService } from '@/services/phase1/fyService';
import type { CreateURDPurchaseInput, URDPurchase } from '@/types/phase2/phase2.types';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { computeURDFineWeightMg, computeURDTotalValuePaise } from '@/utils/purity.constants';
import { urdPrintService } from '@/services/phase2/urdPrintService';

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
  templateId?: 'template1' | 'template2'
): Promise<string> {
  return urdPurchaseService.generateURDCustomerDeclaration(urdId, firmId, templateId);
}

export async function deleteURDPurchase(
  urdId: string,
  firmId: string,
): Promise<void> {
  return urdPurchaseService.deleteURDPurchase(urdId, firmId);
}

export async function updateURDPurchase(
  urdId: string,
  input: Partial<CreateURDPurchaseInput>,
  firmId: string,
): Promise<URDPurchase> {
  return urdPurchaseService.updateURDPurchase(urdId, input, firmId);
}

export const urdPurchaseService = {
  // PUBLIC EXPORT — Phase 3 cross-phase seam (URD-SERVICE-SEAM-1 v1.72)
  // Phase 3 MUST call this; NEVER call urdPurchaseRepository.getById() from Phase 3 directly.
  async getById(
    id: string,
    firmId: string,
  ): Promise<URDPurchase | null> {
    const urd = await db.select().from(urdPurchases)
      .where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId)))
      .limit(1)
      .then(res => res[0] as URDPurchase || null);
      
    if (!urd || urd.firmId !== firmId) return null;
    return urd;
  },

  // --- createURDPurchase (Step 12.11 / FIX-URD-1 v1.49 & FIX-URD-COST-1 v1.62) ---
  async createURDPurchase(
    input: CreateURDPurchaseInput,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    if (!input.customerName?.trim()) throw new Error(ERR.URD_CUSTOMER_NAME_REQUIRED);
    if (input.grossWeightMg <= 0) throw new Error(ERR.URD_GROSS_WEIGHT_INVALID);
    if (input.purityPercent <= 0 || input.purityPercent > 100)
      throw new Error(ERR.URD_PURITY_PERCENT_INVALID);
    if (input.ratePerGramPaise <= 0) throw new Error(ERR.URD_RATE_INVALID);

    if ((input.paymentMode === 'BANK' || input.paymentMode === 'UPI') && !input.bankAccountId)
      throw new Error(ERR.URD_BANK_ACCOUNT_REQUIRED);
    if (input.paymentMode === 'CASH' && input.bankAccountId)
      throw new Error(ERR.URD_BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);

    const fineWeightMg = computeURDFineWeightMg(input.grossWeightMg, input.purityPercent);
    const totalValuePaise = input.totalValuePaise ?? computeURDTotalValuePaise(fineWeightMg, input.ratePerGramPaise, input.adjustmentPaise ?? 0);
    if (totalValuePaise > 999999999) throw new Error(ERR.URD_AMOUNT_EXCEEDS_MAX); // ALIGN-P1-V77 / FIX-V79-4

    const fyId = await fyService.resolveTransactionFyId(firmId, input.purchaseDate);
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      // 1. Create old_gold_lots row
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
        createdAt: now(),
        updatedAt: now(),
      });

      // 2. Create urd_purchases row (DRAFT — no urdNumber yet)
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
        createdAt: now(),
        updatedAt: now(),
      });

      // 3. Audit log
      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CREATED',
        firmId,
        entityId: urd.id,
        deviceId,
        payload: {
          urdId: urd.id,
          lotId: lot.id,
          customerName: urd.customerName,
          customerId: urd.customerId,
          grossWeightMg: input.grossWeightMg,
          purityPercent: input.purityPercent,
          fineWeightMg,
          totalValuePaise,
        },
      });

      return urd;
    });
  },

  // --- updateURDPurchase ---
  async updateURDPurchase(
    urdId: string,
    input: Partial<CreateURDPurchaseInput>,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);

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

      const fineWeightMg = computeURDFineWeightMg(grossWeightMg, purityPercent);
      const totalValuePaise = input.totalValuePaise ?? computeURDTotalValuePaise(fineWeightMg, ratePerGramPaise, input.adjustmentPaise ?? 0);
      if (totalValuePaise > 999999999) throw new Error(ERR.URD_AMOUNT_EXCEEDS_MAX);

      if (urd.oldGoldLotId) {
        oldGoldLotRepository.update(tx, firmId, urd.oldGoldLotId, {
          receivedFrom: customerName,
          customerId: input.customerId ?? urd.customerId,
          receivedDate: input.purchaseDate ?? urd.purchaseDate,
          grossWeightMg,
          purityPercent,
          fineWeightMg,
          purchaseRatePaise: ratePerGramPaise,
          totalAmountPaise: totalValuePaise,
          notes: input.notes ?? urd.notes,
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
        eventType: 'URD_PURCHASE_UPDATED' as any,
        firmId,
        entityId: urdId,
        deviceId,
        payload: { urdId, customerName, grossWeightMg, purityPercent, totalValuePaise },
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

  // --- deleteURDPurchase ---
  async deleteURDPurchase(urdId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
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
        eventType: 'URD_PURCHASE_DELETED' as any,
        firmId,
        entityId: urdId,
        deviceId,
        payload: { urdId, urdNumber: urd.urdNumber },
      });
    });
  },

  // --- confirmURDPurchase (Step 12.11 / FIX-URD-1 v1.49) ---
  async confirmURDPurchase(
    urdId: string,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
      if (urd.status !== 'DRAFT') throw new Error(ERR.URD_ALREADY_CONFIRMED);

      if (urd.totalValuePaise > 999999999) throw new Error(ERR.URD_AMOUNT_EXCEEDS_MAX);

      const seq = sequenceCounterRepository.nextVal(tx, firmId, urd.fyId, 'URD');
      const fy = financialYearRepository.getById(tx, firmId, urd.fyId) ?? financialYearRepository.getById(tx, urd.fyId);
      if (!fy) throw new Error(ERR.FY_NOT_FOUND);
      const fyLabel = fy.label;

      const urdNumber = `URD/${fyLabel}/${String(seq).padStart(4, '0')}`;

      urdPurchaseRepository.update(tx, firmId, urdId, {
        status: 'CONFIRMED',
        urdNumber,
        updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CONFIRMED',
        firmId,
        entityId: urdId,
        deviceId,
        payload: { urdId, urdNumber, totalValuePaise: urd.totalValuePaise },
      });

      return { ...urd, status: 'CONFIRMED', urdNumber };
    });
  },

  async generateURDPurchaseBill(urdId: string, firmId: string): Promise<string> {
    return urdPrintService.generateURDPurchaseBill(urdId, firmId);
  },

  async generateURDCustomerDeclaration(urdId: string, firmId: string, templateId?: 'template1' | 'template2'): Promise<string> {
    return urdPrintService.generateURDCustomerDeclaration(urdId, firmId, templateId);
  }
};