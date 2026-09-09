// services/phase2/oldGoldLotService.ts — Phase 2 v2.30 Canonical Service
// Aligned with FIX-PURITYROUND-SCOPE-EXPAND-1 (v2.26), FIX-OLDGOLD-METAL-1 (v2.26),
// FIX-OLDGOLD-METAL-VALIDATION-1 (v2.28), DOMAIN-FIX-1 (v1.22) & FIX-OLDGOLD-BODY-1 (v1.35)

import { db } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import type { OldGoldLot, CreateOldGoldLotInput, OldGoldLotStatus } from '@/types/phase2/phase2.types';
import { VALID_LOT_TRANSITIONS } from '@/types/phase2/phase2.types';
import { oldGoldLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { resolveFineWeightMg } from '@/utils/calculations';
import * as Crypto from 'expo-crypto';

// --- getPendingRefineryLots (Step 12.6A / FEAT-GAP5-REFINERYPENDING-1 v1.66) ---
export async function getPendingRefineryLots(firmId: string): Promise<OldGoldLot[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return oldGoldLotRepository.getPendingRefineryLots(firmId);
}

// --- findAvailableForIssuance (DOMAIN-FIX-1 v1.22 / FIX-IDX-3 v1.25) ---
export async function findAvailableForIssuance(firmId: string): Promise<OldGoldLot[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return oldGoldLotRepository.findAvailableForIssuance(firmId);
}

// --- createOldGoldLot (Step 12.6 / FIX-OLDGOLD-BODY-1 v1.35 / FIX-PURITYROUND-SCOPE-EXPAND-1 v2.26 / FIX-OLDGOLD-METAL-VALIDATION-1 v2.28) ---
export async function createOldGoldLot(
  input: CreateOldGoldLotInput,
  firmId: string
): Promise<OldGoldLot> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  // FIX-OLDGOLD-METAL-VALIDATION-1 (v2.28): runtime validation on metal
  if (input.metal !== 'GOLD' && input.metal !== 'SILVER') {
    throw new Error(ERR.OLD_GOLD_METAL_INVALID);
  }
  if (input.grossWeightMg <= 0) throw new Error(ERR.OLD_GOLD_GROSS_WEIGHT_INVALID);
  if (input.purityPercent <= 0 || input.purityPercent > 100) {
    throw new Error(ERR.OLD_GOLD_PURITY_PERCENT_INVALID);
  }

  // FIX-PURITYROUND-SCOPE-EXPAND-1 (v2.26): Scope expanded to ALL metalSource values unconditionally.
  // The 100%-purity trade convention rounding applies to old-gold lots of ANY metalSource.
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

    const lot = oldGoldLotRepository.insert(tx, {
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
      notes: sanitizedNotes,
      status: 'RECEIVED',
      createdAt: now(),
      updatedAt: now(),
    });

    auditRepository.log(tx, {
      eventType: 'OLD_GOLD_LOT_CREATED',
      firmId,
      entityId: lot.id,
      deviceId,
      payload: {
        lotId: lot.id,
        metal: input.metal, // FIX-OLDGOLD-METAL-VALIDATION-1 (v2.28): metal in audit payload
        grossWeightMg: lot.grossWeightMg,
        purityPercent: lot.purityPercent,
        metalSource: lot.metalSource,
        receivedFrom: lot.receivedFrom,
        receivedDate: lot.receivedDate,
        fineWeightMg: lot.fineWeightMg,
        purityRoundingDeltaMg: lot.purityRoundingDeltaMg,
        purchaseRatePaise: lot.purchaseRatePaise,
        totalAmountPaise: lot.totalAmountPaise,
      },
    });

    return lot;
  });
}

// --- updateOldGoldLotStatus (Step 12.6 / FIX-OLDGOLD-BODY-1 v1.35) ---
export async function updateOldGoldLotStatus(
  lotId: string,
  firmId: string,
  newStatus: OldGoldLotStatus,
  reason?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const lot = oldGoldLotRepository.getById(tx, firmId, lotId);
    if (!lot || lot.firmId !== firmId) throw new Error(ERR.OLD_GOLD_LOT_NOT_FOUND_OR_WRONG_FIRM);

    const allowed = VALID_LOT_TRANSITIONS[lot.status as OldGoldLotStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`${ERR.INVALID_LOT_TRANSITION}: ${lot.status} -> ${newStatus}`);
    }

    // DOMAIN-FIX-1 (v1.22): ISSUED_TO_KARIGAR guard — metalSource MUST be MELT_OUTPUT
    if (newStatus === 'ISSUED_TO_KARIGAR' && lot.metalSource !== 'MELT_OUTPUT') {
      throw new Error(`${ERR.ISSUED_TO_KARIGAR_REQUIRES_MELT_OUTPUT}: raw customer gold must be melted first`);
    }

    const oldStatus = lot.status;
    oldGoldLotRepository.updateStatus(tx, firmId, lotId, newStatus);

    auditRepository.log(tx, {
      eventType: 'OLD_GOLD_LOT_STATUS_CHANGED',
      firmId,
      entityId: lotId,
      deviceId,
      payload: { lotId, oldStatus, newStatus, reason: reason ? sanitizeText(reason) : null },
    });
  });
}

// Service-layer read queries
export async function getOldGoldLotById(firmId: string, lotId: string): Promise<OldGoldLot | null> {
  return oldGoldLotRepository.getById(lotId, firmId);
}

export async function getOldGoldLotsByFirm(firmId: string): Promise<OldGoldLot[]> {
  return oldGoldLotRepository.findByFirmId(firmId);
}

export const oldGoldLotService = {
  getPendingRefineryLots,
  findAvailableForIssuance,
  createOldGoldLot,
  updateOldGoldLotStatus,
  getById: getOldGoldLotById,
  findByFirmId: getOldGoldLotsByFirm,
};