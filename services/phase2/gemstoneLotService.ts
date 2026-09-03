// services/phase2/gemstoneLotService.ts — Phase 2 v2.24 Canonical Service
// Step 4.5 / GEMSTONE-1 (v1.21), FIX-V1-2 (v1.23) & RED-7

import { db } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { gemstoneLotRepository } from '@/repositories/phase2/gemstoneLotRepository';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { sanitizeText } from '@/utils/sanitize';
import type { 
  CreateGemstoneLotInput, 
  GemstoneLot, 
  GemstoneStatus 
} from '@/types/phase2/phase2.types';
import { GEMSTONE_LOT_TRANSITIONS } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

// --- createGemstoneLot (Step 4.5 / GEMSTONE-1 v1.21 + FIX-V1-2 v1.23) ---
export async function createGemstoneLot(
  input: CreateGemstoneLotInput,
  firmId: string
): Promise<GemstoneLot> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  // FIX-V1-2 (v1.23): Input validation before insert
  if (input.weightCaratX100 <= 0) throw new Error(ERR.GEMSTONE_WEIGHT_INVALID);
  if ((input.quantity ?? 1) <= 0) throw new Error(ERR.GEMSTONE_QUANTITY_INVALID);

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const stone = stoneRepository.getById(tx, input.stoneId, firmId);
    if (!stone || stone.isActive !== 1) throw new Error(ERR.STONE_NOT_FOUND_OR_WRONG_FIRM);

    const sanitizedGemName = sanitizeText(input.name); // GAP-P1ALIGN-4 (v1.74)

    // Auto-calculate total amount if rate is provided and total is omitted
    const totalPurchaseAmountPaise =
      input.totalPurchaseAmountPaise ??
      (input.purchaseRatePaisePerCarat
        ? Math.round((input.weightCaratX100 / 100) * input.purchaseRatePaisePerCarat)
        : null);

    const lot = gemstoneLotRepository.insert(tx, {
      id: Crypto.randomUUID(), 
      firmId, 
      stoneId: input.stoneId, 
      name: sanitizedGemName, 
      weightCaratX100: input.weightCaratX100, 
      quantity: input.quantity ?? 1, 
      purchaseRatePaisePerCarat: input.purchaseRatePaisePerCarat ?? null, 
      totalPurchaseAmountPaise, 
      supplierName: input.supplierName ? sanitizeText(input.supplierName) : null, 
      certificationRef: input.certificationRef ? sanitizeText(input.certificationRef) : null, 
      status: 'AVAILABLE', 
      notes: input.notes ? sanitizeText(input.notes) : null, 
      createdAt: now(), 
      updatedAt: now(), 
    });

    auditRepository.log(tx, { 
      eventType: 'GEMSTONE_LOT_CREATED', 
      firmId, 
      entityId: lot.id, 
      deviceId, 
      payload: { 
        lotId: lot.id, 
        stoneId: lot.stoneId, 
        name: lot.name, 
        weightCaratX100: lot.weightCaratX100, 
        quantity: lot.quantity, 
        purchaseRatePaisePerCarat: lot.purchaseRatePaisePerCarat ?? null, 
        totalPurchaseAmountPaise: lot.totalPurchaseAmountPaise ?? null,
      }, 
    });

    return lot;
  });
}

// --- updateGemstoneLotStatus (Step 4.5 / GEMSTONE-1 v1.21) ---
export async function updateGemstoneLotStatus(
  lotId: string, 
  firmId: string, 
  newStatus: GemstoneStatus, 
  reason?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const lot = gemstoneLotRepository.getById(tx, lotId, firmId);
    if (!lot || lot.firmId !== firmId) throw new Error(ERR.GEMSTONE_LOT_NOT_FOUND_OR_WRONG_FIRM);

    const allowed = GEMSTONE_LOT_TRANSITIONS[lot.status as GemstoneStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`${ERR.INVALID_GEMSTONE_TRANSITION}: ${lot.status} -> ${newStatus}`);
    }

    gemstoneLotRepository.updateStatus(tx, firmId, lotId, newStatus);

    auditRepository.log(tx, { 
      eventType: 'GEMSTONE_LOT_STATUS_CHANGED', 
      firmId, 
      entityId: lotId, 
      deviceId, 
      payload: { 
        lotId, 
        oldStatus: lot.status, 
        newStatus, 
        reason: reason ? sanitizeText(reason) : null,
      }, 
    });
  });
}

// --- Read Queries ---
export async function getGemstoneLotById(firmId: string, lotId: string): Promise<GemstoneLot | null> {
  return gemstoneLotRepository.getById(lotId, firmId);
}

export async function getGemstoneLotsByFirm(firmId: string): Promise<GemstoneLot[]> {
  return gemstoneLotRepository.findByFirmId(firmId);
}

export async function getGemstoneLotsByStatus(firmId: string, status: GemstoneStatus): Promise<GemstoneLot[]> {
  return gemstoneLotRepository.findByStatus(firmId, status);
}

export async function searchGemstoneLots(firmId: string, query: string): Promise<GemstoneLot[]> {
  return gemstoneLotRepository.search(firmId, query);
}

export const gemstoneLotService = {
  createGemstoneLot,
  updateGemstoneLotStatus,
  getById: getGemstoneLotById,
  findByFirmId: getGemstoneLotsByFirm,
  findByStatus: getGemstoneLotsByStatus,
  search: searchGemstoneLots,
};