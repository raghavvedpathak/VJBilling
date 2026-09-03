// services/phase2/urdPurchaseService.ts — Phase 2 v2.24 Canonical Service
// Aligned with FIX-URD-1 (v1.49), FIX-URD-COST-1 (v1.62) & FIX-URD-SEQ-ARCH-1

import { ERR } from '@/constants/errorCodes';
import { db } from '@/db/client';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { fyRepository, financialYearRepository } from '@/repositories/phase1/fyRepository';
import { sequenceCounterRepository } from '@/repositories/phase1/sequenceCounterRepository';
import { oldGoldLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';
import { fyService } from '@/services/phase1/fyService';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { urdPrintService } from '@/services/phase2/urdPrintService';
import type { CreateURDPurchaseInput, URDPurchase } from '@/types/phase2/phase2.types';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { computeURDFineWeightMg, computeURDTotalValuePaise } from '@/utils/purity.constants';
import { sanitizeText } from '@/utils/sanitize';
import * as Crypto from 'expo-crypto';

const resolvedFyRepository = fyRepository ?? financialYearRepository;

// PUBLIC EXPORT — Phase 3 cross-phase seam (URD-SERVICE-SEAM-1 v1.72)
export async function getById(
  id: string,
  firmId: string,
): Promise<URDPurchase | null> {
  return urdPurchaseRepository.getById(id, firmId);
}

// --- createURDPurchase (Step 12.11 / FIX-URD-1 v1.49 & FIX-URD-COST-1 v1.62) ---
export async function createURDPurchase(
  input: CreateURDPurchaseInput,
  firmId: string
): Promise<URDPurchase> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  if (!input.customerName?.trim()) throw new Error(ERR.URD_CUSTOMER_NAME_REQUIRED);
  if (input.grossWeightMg <= 0) throw new Error(ERR.URD_GROSS_WEIGHT_INVALID);
  if (input.purityPercent <= 0 || input.purityPercent > 100) {
    throw new Error(ERR.URD_PURITY_PERCENT_INVALID);
  }
  if (input.ratePerGramPaise <= 0) throw new Error(ERR.URD_RATE_INVALID);

  if ((input.paymentMode === 'BANK' || input.paymentMode === 'UPI') && !input.bankAccountId) {
    throw new Error(ERR.URD_BANK_ACCOUNT_REQUIRED);
  }
  if (input.paymentMode === 'CASH' && input.bankAccountId) {
    throw new Error(ERR.URD_BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);
  }

  const sanitizedCustomerName = sanitizeText(input.customerName);
  const sanitizedCustomerAddress = input.customerAddress ? sanitizeText(input.customerAddress) : null;
  const sanitizedNotes = input.notes ? sanitizeText(input.notes) : null;

  const fineWeightMg = computeURDFineWeightMg(input.grossWeightMg, input.purityPercent);
  const totalValuePaise = input.totalValuePaise ?? computeURDTotalValuePaise(fineWeightMg, input.ratePerGramPaise, input.adjustmentPaise ?? 0);
  const totalAmountPaise = totalValuePaise; // Resolves TS18004 shorthand scope error
  if (totalValuePaise > 999999999) throw new Error(ERR.URD_AMOUNT_EXCEEDS_MAX); // ALIGN-P1-V77

  const fyId = await fyService.resolveTransactionFyId(firmId, input.purchaseDate);
  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    // 1. Create linked old_gold_lots row
    const lot = oldGoldLotRepository.insert(tx, {
      id: Crypto.randomUUID(),
      firmId,
      receivedFrom: sanitizedCustomerName,
      customerId: input.customerId ?? null,
      receivedDate: input.purchaseDate,
      grossWeightMg: input.grossWeightMg,
      purityPercent: input.purityPercent,
      metalSource: 'CUSTOMER',
      fineWeightMg,
      purityRoundingDeltaMg: 0,
      purchaseRatePaise: input.ratePerGramPaise ?? null,
      totalAmountPaise,
      notes: sanitizedNotes,
      status: 'RECEIVED',
      createdAt: now(),
      updatedAt: now(),
    });

    // 2. Create urd_purchases row (DRAFT — urdNumber assigned upon confirmation)
    const urd = urdPurchaseRepository.insert(tx, {
      id: Crypto.randomUUID(),
      firmId,
      fyId,
      urdNumber: null,
      purchaseDate: input.purchaseDate,
      customerId: input.customerId ?? null,
      customerName: sanitizedCustomerName,
      customerAddress: sanitizedCustomerAddress,
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
      notes: sanitizedNotes,
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
}

// --- updateURDPurchase ---
export async function updateURDPurchase(
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
    if (urd.status !== 'DRAFT') throw new Error(ERR.URD_ALREADY_CONFIRMED);

    const customerName = input.customerName ? sanitizeText(input.customerName) : urd.customerName;
    const customerAddress = input.customerAddress !== undefined ? (input.customerAddress ? sanitizeText(input.customerAddress) : null) : urd.customerAddress;
    const grossWeightMg = input.grossWeightMg ?? urd.grossWeightMg;
    const purityPercent = input.purityPercent ?? urd.purityPercent;
    const ratePerGramPaise = input.ratePerGramPaise ?? urd.ratePerGramPaise;
    const paymentMode = input.paymentMode ?? urd.paymentMode;
    const bankAccountId = paymentMode === 'CASH' ? null : (input.bankAccountId ?? urd.bankAccountId);
    const notes = input.notes !== undefined ? (input.notes ? sanitizeText(input.notes) : null) : urd.notes;

    if (!customerName?.trim()) throw new Error(ERR.URD_CUSTOMER_NAME_REQUIRED);
    if (grossWeightMg <= 0) throw new Error(ERR.URD_GROSS_WEIGHT_INVALID);
    if (purityPercent <= 0 || purityPercent > 100) throw new Error(ERR.URD_PURITY_PERCENT_INVALID);
    if (ratePerGramPaise <= 0) throw new Error(ERR.URD_RATE_INVALID);

    const fineWeightMg = computeURDFineWeightMg(grossWeightMg, purityPercent);
    const totalValuePaise = input.totalValuePaise ?? computeURDTotalValuePaise(fineWeightMg, ratePerGramPaise, input.adjustmentPaise ?? 0);
    const totalAmountPaise = totalValuePaise;
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
        totalAmountPaise,
        notes,
      });
    }

    urdPurchaseRepository.update(tx, firmId, urdId, {
      customerName,
      customerAddress,
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
      notes,
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
      customerAddress,
      grossWeightMg,
      purityPercent,
      fineWeightMg,
      ratePerGramPaise,
      totalValuePaise,
      paymentMode,
      bankAccountId,
      notes,
      updatedAt: now(),
    };
  });
}

// --- deleteURDPurchase ---
export async function deleteURDPurchase(urdId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2
  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const urd = urdPurchaseRepository.getById(tx, firmId, urdId);
    if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
    if (urd.status !== 'DRAFT') throw new Error(ERR.URD_ALREADY_CONFIRMED);

    // Child must be deleted before parent old_gold_lots to prevent SQLITE_CONSTRAINT_FOREIGNKEY
    urdPurchaseRepository.delete(tx, firmId, urdId);

    if (urd.oldGoldLotId) {
      oldGoldLotRepository.delete(tx, firmId, urd.oldGoldLotId);
    }

    auditRepository.log(tx, {
      eventType: 'URD_PURCHASE_DELETED' as any,
      firmId,
      entityId: urdId,
      deviceId,
      payload: { urdId, urdNumber: urd.urdNumber },
    });
  });
}

// --- confirmURDPurchase (Step 12.11 / FIX-URD-1 v1.49) ---
export async function confirmURDPurchase(
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
    const fy = resolvedFyRepository.getById(tx, firmId, urd.fyId) ?? resolvedFyRepository.getById(tx, urd.fyId);
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
}

export async function findURDByFirmId(firmId: string): Promise<URDPurchase[]> {
  return urdPurchaseRepository.findByFirmId(firmId);
}

export async function findURDByFyId(firmId: string, fyId: string): Promise<URDPurchase[]> {
  return urdPurchaseRepository.findByFyId(firmId, fyId);
}

export async function findURDByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]> {
  return urdPurchaseRepository.findByCustomerId(firmId, customerId);
}

export const urdPurchaseService = {
  getById,
  createURDPurchase,
  updateURDPurchase,
  deleteURDPurchase,
  confirmURDPurchase,
  generateURDPurchaseBill: (urdId: string, firmId: string) =>
    urdPrintService.generateURDPurchaseBill(urdId, firmId),
  generateURDCustomerDeclaration: (urdId: string, firmId: string, templateId?: 'template1' | 'template2') =>
    urdPrintService.generateURDCustomerDeclaration(urdId, firmId, templateId),
  findByFirmId: findURDByFirmId,
  findByFyId: findURDByFyId,
  findByCustomerId: findURDByCustomerId,
};