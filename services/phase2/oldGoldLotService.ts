// services/phase2/oldGoldLotService.ts — Phase 2 v2.34 Canonical Service
// Implements FIX-PURITYROUND-SCOPE-EXPAND-1 (v2.26), FIX-OLDMETAL-RENAME-1 (v2.32),
// FIX-OLDGOLD-TXNLINK-1 (v2.31), FIX-OLDMETAL-VOID-1 (v2.33), FIX-OLDGOLD-METAL-VALIDATION-1 (v2.28)

import { db } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import type { OldMetalLot, CreateOldMetalLotInput, OldMetalLotStatus } from '@/types/phase2/phase2.types';
import { VALID_LOT_TRANSITIONS } from '@/types/phase2/phase2.types';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { resolveFineWeightMg } from '@/utils/purity.constants';
import * as Crypto from 'expo-crypto';

// --- getPendingRefineryLots (Step 12.6A / FEAT-GAP5-REFINERYPENDING-1 v1.66) ---
export async function getPendingRefineryLots(firmId: string): Promise<OldMetalLot[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return oldMetalLotRepository.getPendingRefineryLots(firmId);
}

// --- findAvailableForIssuance (DOMAIN-FIX-1 v1.22 / FIX-IDX-3 v1.25) ---
export async function findAvailableForIssuance(firmId: string): Promise<OldMetalLot[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return oldMetalLotRepository.findAvailableForIssuance(firmId);
}

// --- findBySaleInvoiceId (FIX-OLDMETAL-VOID-1 v2.33 / v2.34) ---
export async function findBySaleInvoiceId(firmId: string, saleInvoiceId: string): Promise<OldMetalLot | null> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return oldMetalLotRepository.findBySaleInvoiceId(firmId, saleInvoiceId);
}

// --- createOldMetalLot (Step 12.6 / FIX-OLDMETAL-RENAME-1 v2.32 / FIX-OLDGOLD-TXNLINK-1 v2.31) ---
export async function createOldMetalLot(
  input: CreateOldMetalLotInput,
  firmId: string
): Promise<OldMetalLot> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  // FIX-OLDMETAL-TYPE-INVALID (v2.28/v2.32): runtime validation on metal
  if (input.metal !== 'GOLD' && input.metal !== 'SILVER') {
    throw new Error(ERR.OLD_METAL_TYPE_INVALID);
  }
  if (input.grossWeightMg <= 0) throw new Error(ERR.OLD_METAL_GROSS_WEIGHT_INVALID);
  if (input.purityPercent <= 0 || input.purityPercent > 100) {
    throw new Error(ERR.OLD_METAL_PURITY_PERCENT_INVALID);
  }

  // FIX-PURITYROUND-SCOPE-EXPAND-1 (v2.26): Scope expanded to ALL metalSource values unconditionally.
  const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(
    input.grossWeightMg,
    input.purityPercent,
    input.metal
  );

  const totalAmountPaise = input.purchaseRatePaise
    ? Math.round((fineWeightMg / 1000) * input.purchaseRatePaise)
    : null;

  const sanitizedReceivedFrom = sanitizeText(input.receivedFrom);
  const sanitizedNotes = input.notes ? sanitizeText(input.notes) : null;
  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const lotId = Crypto.randomUUID();

    const lot = oldMetalLotRepository.insert(tx, {
      id: lotId,
      firmId,
      metal: input.metal,
      receivedFrom: sanitizedReceivedFrom,
      fineWeightMg,
      purityRoundingDeltaMg,
      purchaseRatePaise: input.purchaseRatePaise ?? null,
      totalAmountPaise,
      receivedDate: input.receivedDate,
      grossWeightMg: input.grossWeightMg,
      purityPercent: input.purityPercent,
      metalSource: input.metalSource ?? 'CUSTOMER',
      customerId: input.customerId ?? null,
      saleInvoiceId: input.saleInvoiceId ?? null, // FIX-OLDGOLD-TXNLINK-1 (v2.31)
      urdPurchaseId: input.urdPurchaseId ?? null, // FIX-OLDGOLD-TXNLINK-1 (v2.31)
      notes: sanitizedNotes,
      status: 'RECEIVED',
      createdAt: now(),
      updatedAt: now(),
    });

    auditRepository.log(tx, {
      eventType: 'OLD_METAL_LOT_CREATED',
      firmId,
      entityId: lot.id,
      deviceId,
      payload: {
        lotId: lot.id,
        metal: input.metal,
        grossWeightMg: lot.grossWeightMg,
        purityPercent: lot.purityPercent,
        metalSource: lot.metalSource,
        receivedFrom: lot.receivedFrom,
        receivedDate: lot.receivedDate,
        fineWeightMg: lot.fineWeightMg,
        purityRoundingDeltaMg: lot.purityRoundingDeltaMg,
        purchaseRatePaise: lot.purchaseRatePaise,
        totalAmountPaise: lot.totalAmountPaise,
        customerId: lot.customerId,
        saleInvoiceId: lot.saleInvoiceId,
        urdPurchaseId: lot.urdPurchaseId,
      },
    });

    return lot;
  });
}

// --- updateOldMetalLotStatus (Step 12.6 / FIX-OLDMETAL-VOID-1 v2.33 / FIX-OLDMETAL-RENAME-1 v2.32) ---
export async function updateOldMetalLotStatus(
  lotId: string,
  firmId: string,
  newStatus: OldMetalLotStatus,
  reason?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const lot = oldMetalLotRepository.getById(tx, firmId, lotId);
    if (!lot || lot.firmId !== firmId) throw new Error(ERR.OLD_METAL_LOT_NOT_FOUND_OR_WRONG_FIRM);

    const allowed = VALID_LOT_TRANSITIONS[lot.status as OldMetalLotStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`${ERR.INVALID_LOT_TRANSITION}: ${lot.status} -> ${newStatus}`);
    }

    // DOMAIN-FIX-1 (v1.22): ISSUED_TO_KARIGAR guard — metalSource MUST be MELT_OUTPUT
    if (newStatus === 'ISSUED_TO_KARIGAR' && lot.metalSource !== 'MELT_OUTPUT') {
      throw new Error(`${ERR.ISSUED_TO_KARIGAR_REQUIRES_MELT_OUTPUT}: raw customer gold must be melted first`);
    }

    const oldStatus = lot.status;
    oldMetalLotRepository.updateStatus(tx, firmId, lotId, newStatus);

    auditRepository.log(tx, {
      eventType: 'OLD_METAL_LOT_STATUS_CHANGED',
      firmId,
      entityId: lotId,
      deviceId,
      payload: { lotId, oldStatus, newStatus, reason: reason ? sanitizeText(reason) : null },
    });
  });
}

// Service-layer read queries
export async function getOldMetalLotById(firmId: string, lotId: string): Promise<OldMetalLot | null> {
  return oldMetalLotRepository.getById(lotId, firmId);
}

export async function getOldMetalLotsByFirm(firmId: string): Promise<OldMetalLot[]> {
  return oldMetalLotRepository.findByFirmId(firmId);
}

export const oldMetalLotService = {
  getPendingRefineryLots,
  findAvailableForIssuance,
  findBySaleInvoiceId,
  createOldMetalLot,
  updateOldMetalLotStatus,
  getById: getOldMetalLotById,
  findByFirmId: getOldMetalLotsByFirm,
};

// Backward-compatibility aliases
export const createOldGoldLot = createOldMetalLot;
export const updateOldGoldLotStatus = updateOldMetalLotStatus;
export const getOldGoldLotById = getOldMetalLotById;
export const getOldGoldLotsByFirm = getOldMetalLotsByFirm;
export const oldGoldLotService = oldMetalLotService;