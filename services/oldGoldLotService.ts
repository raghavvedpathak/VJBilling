import { db } from '../db/client';
import { ERR } from '../constants/errorCodes';
import type { OldGoldLot, CreateOldGoldLotInput, OldGoldLotStatus } from '../types/phase2.types';
import { VALID_LOT_TRANSITIONS } from '../types/phase2.types';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
import { auditRepository } from '../repositories/auditRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { resolveFineWeightMg } from '../utils/calculations';
import * as Crypto from 'expo-crypto';

export const oldGoldLotService = {
  
  // FEAT-GAP5-REFINERYPENDING-1 (v1.66)
  async getPendingRefineryLots(firmId: string): Promise<OldGoldLot[]> {
    // RED-9: firmId is mandatory
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    
    // Correctly delegated to the repository method
    return oldGoldLotRepository.getPendingRefineryLots(firmId);
  },

  async createOldGoldLot(
    input: CreateOldGoldLotInput, firmId: string
  ): Promise<OldGoldLot> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (input.grossWeightMg <= 0) throw new Error(ERR.OLD_GOLD_GROSS_WEIGHT_INVALID);
    if (input.purityPercent <= 0 || input.purityPercent > 100) {
      throw new Error(ERR.OLD_GOLD_PURITY_PERCENT_INVALID);
    }

    const isMeltOutput = (input.metalSource ?? 'CUSTOMER') === 'MELT_OUTPUT';
    const { fineWeightMg, purityRoundingDeltaMg } = isMeltOutput
      ? resolveFineWeightMg(input.grossWeightMg, input.purityPercent, 'GOLD')
      : { fineWeightMg: Math.round(input.grossWeightMg * input.purityPercent / 100), purityRoundingDeltaMg: 0 };

    const totalAmountPaise = input.purchaseRatePaise 
      ? Math.round((fineWeightMg / 1000) * input.purchaseRatePaise)
      : null;

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const lotId = Crypto.randomUUID();

      const lot = oldGoldLotRepository.insert(tx, {
        id: lotId,
        firmId,
        receivedFrom: input.receivedFrom,
        fineWeightMg,
        purityRoundingDeltaMg,
        purchaseRatePaise: input.purchaseRatePaise ?? null,
        totalAmountPaise,
        receivedDate: input.receivedDate,
        grossWeightMg: input.grossWeightMg,
        purityPercent: input.purityPercent,
        metalSource: input.metalSource ?? 'CUSTOMER',
        customerId: input.customerId ?? null,
        notes: input.notes ?? null,
        status: 'RECEIVED',
        createdAt: now(),
        updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'OLD_GOLD_LOT_CREATED', firmId, entityId: lot.id,
        deviceId,
        payload: JSON.stringify({
          lotId: lot.id, grossWeightMg: lot.grossWeightMg,
          purityPercent: lot.purityPercent, metalSource: lot.metalSource,
          receivedFrom: lot.receivedFrom, receivedDate: lot.receivedDate,
          fineWeightMg: lot.fineWeightMg, purityRoundingDeltaMg: lot.purityRoundingDeltaMg,
          purchaseRatePaise: lot.purchaseRatePaise, totalAmountPaise: lot.totalAmountPaise,
        }),
      });

      return lot;
    });
  },

  async updateOldGoldLotStatus(
    lotId: string, firmId: string, newStatus: OldGoldLotStatus, reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const lot = oldGoldLotRepository.getById(tx, firmId, lotId);
      if (!lot || lot.firmId !== firmId) throw new Error(ERR.OLD_GOLD_LOT_NOT_FOUND_OR_WRONG_FIRM);

      const allowed = VALID_LOT_TRANSITIONS[lot.status as OldGoldLotStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new Error(`${ERR.INVALID_LOT_TRANSITION}: ${lot.status} -> ${newStatus}`);
      }

      if (newStatus === 'ISSUED_TO_KARIGAR' && lot.metalSource !== 'MELT_OUTPUT') {
        throw new Error(`${ERR.ISSUED_TO_KARIGAR_REQUIRES_MELT_OUTPUT}: raw customer gold must be melted first`);
      }

      const oldStatus = lot.status;
      oldGoldLotRepository.updateStatus(tx, firmId, lotId, newStatus);

      auditRepository.log(tx, {
        eventType: 'OLD_GOLD_LOT_STATUS_CHANGED', firmId, entityId: lotId,
        deviceId,
        payload: JSON.stringify({ lotId, oldStatus, newStatus, reason: reason ?? null }),
      });
    });
  }
};