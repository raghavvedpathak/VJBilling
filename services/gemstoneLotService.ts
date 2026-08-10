// services/gemstoneLotService.ts — Phase 2 v2.11 Canonical Service

import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { gemstoneLotRepository } from '../repositories/gemstoneLotRepository';
import { stoneRepository } from '../repositories/stoneRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { sanitizeText } from '../utils/sanitize';
import { 
  CreateGemstoneLotInput, 
  GemstoneLot, 
  GemstoneStatus, 
  GEMSTONE_LOT_TRANSITIONS 
} from '../types/phase2.types';
import { ERR } from '../constants/errorCodes';

export const gemstoneLotService = {
  // --- createGemstoneLot (Step 4.5 / GEMSTONE-1 v1.21 + FIX-V1-2 v1.23) ---
  async createGemstoneLot(input: CreateGemstoneLotInput, firmId: string): Promise<GemstoneLot> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    // FIX-V1-2 (v1.23): Input validation before insert
    if (input.weightCaratX100 <= 0) throw new Error(ERR.GEMSTONE_WEIGHT_INVALID);
    if ((input.quantity ?? 1) <= 0) throw new Error(ERR.GEMSTONE_QUANTITY_INVALID);

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const stone = stoneRepository.getById(tx, input.stoneId, firmId);
      if (!stone) throw new Error(ERR.STONE_NOT_FOUND_OR_WRONG_FIRM);

      const sanitizedGemName = sanitizeText(input.name); // GAP-P1ALIGN-4 (v1.74)

      const lot = gemstoneLotRepository.insert(tx, {
        id: Crypto.randomUUID(), 
        firmId, 
        stoneId: input.stoneId, 
        name: sanitizedGemName,
        weightCaratX100: input.weightCaratX100, 
        quantity: input.quantity ?? 1,
        purchaseRatePaisePerCarat: input.purchaseRatePaisePerCarat ?? null,
        totalPurchaseAmountPaise: input.totalPurchaseAmountPaise ?? null,
        supplierName: input.supplierName ? sanitizeText(input.supplierName) : null,
        certificationRef: input.certificationRef ?? null,
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
          purchaseRatePaisePerCarat: lot.purchaseRatePaisePerCarat!,
          totalPurchaseAmountPaise: lot.totalPurchaseAmountPaise! 
        } 
      });

      return lot;
    });
  },

  // --- updateGemstoneLotStatus (Step 4.5 / GEMSTONE-1 v1.21) ---
  async updateGemstoneLotStatus(
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
      if (!lot) throw new Error(ERR.GEMSTONE_LOT_NOT_FOUND_OR_WRONG_FIRM);

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
          reason: reason ?? null 
        } 
      });
    });
  }
};