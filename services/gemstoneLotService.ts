import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { gemstoneLotRepository } from '../repositories/gemstoneLotRepository';
import { stoneRepository } from '../repositories/stoneRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { 
  CreateGemstoneLotInput, 
  GemstoneLot, 
  GemstoneStatus, 
  GEMSTONE_LOT_TRANSITIONS 
} from '../types/phase2.types';

export const gemstoneLotService = {
  // createGemstoneLot() — Canonical Service Body (GEMSTONE-1 v1.21 + FIX-V1-2 v1.23)
  async createGemstoneLot(input: CreateGemstoneLotInput, firmId: string): Promise<GemstoneLot> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2

    // FIX-V1-2 (v1.23): Input validation before insert
    if (input.weightCaratX100 <= 0) throw new Error('GEMSTONE_WEIGHT_INVALID');
    if ((input.quantity ?? 1) <= 0) throw new Error('GEMSTONE_QUANTITY_INVALID');

    return db.transaction(async (tx) => {
      const stone = await stoneRepository.getById(tx, input.stoneId, firmId);
      if (!stone) throw new Error('STONE_NOT_FOUND_OR_WRONG_FIRM');

      const lot = await gemstoneLotRepository.insert(tx, {
        id: Crypto.randomUUID(), 
        firmId, 
        stoneId: input.stoneId, 
        name: input.name,
        weightCaratX100: input.weightCaratX100, 
        quantity: input.quantity ?? 1,
        purchaseRatePaisePerCarat: input.purchaseRatePaisePerCarat ?? null,
        totalPurchaseAmountPaise: input.totalPurchaseAmountPaise ?? null,
        supplierName: input.supplierName ?? null,
        certificationRef: input.certificationRef ?? null,
        status: 'AVAILABLE', 
        notes: input.notes ?? null,
        createdAt: now(), 
        updatedAt: now(),
      });

      await auditRepository.log(tx, { 
        eventType: 'GEMSTONE_LOT_CREATED', 
        firmId, 
        entityId: lot.id,
        deviceId: await getDeviceId(), 
        payload: JSON.stringify({ 
          lotId: lot.id, 
          stoneId: lot.stoneId, 
          name: lot.name,
          weightCaratX100: lot.weightCaratX100, 
          quantity: lot.quantity,
          purchaseRatePaisePerCarat: lot.purchaseRatePaisePerCarat,
          totalPurchaseAmountPaise: lot.totalPurchaseAmountPaise 
        }) 
      });

      return lot;
    });
  },

  // updateGemstoneLotStatus() — Canonical Service Body
  async updateGemstoneLotStatus(
    lotId: string, 
    firmId: string, 
    newStatus: GemstoneStatus, 
    reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); 
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const lot = await gemstoneLotRepository.getById(tx, lotId, firmId);
      if (!lot) throw new Error('GEMSTONE_LOT_NOT_FOUND_OR_WRONG_FIRM');

      const allowed = GEMSTONE_LOT_TRANSITIONS[lot.status as GemstoneStatus];
      if (!allowed.includes(newStatus)) {
        throw new Error(`INVALID_GEMSTONE_TRANSITION: ${lot.status} -> ${newStatus}`);
      }

      await gemstoneLotRepository.updateStatus(tx, firmId, lotId, newStatus);

      await auditRepository.log(tx, { 
        eventType: 'GEMSTONE_LOT_STATUS_CHANGED', 
        firmId, 
        entityId: lotId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ 
          lotId, 
          oldStatus: lot.status, 
          newStatus, 
          reason: reason ?? null 
        }) 
      });
    });
  }
};
