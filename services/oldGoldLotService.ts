import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { oldGoldLots } from '../db/schema';
import type { OldGoldLot, CreateOldGoldLotInput, OldGoldLotStatus } from '../types/phase2.types';
import { VALID_LOT_TRANSITIONS } from '../types/phase2.types';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
import { auditRepository } from '../repositories/auditRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';

export const oldGoldLotService = {
  async getPendingRefineryLots(firmId: string): Promise<OldGoldLot[]> {
    const rows = await db
      .select()
      .from(oldGoldLots)
      .where(and(
        eq(oldGoldLots.firmId, firmId),
        inArray(oldGoldLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
      ))
      .orderBy(desc(oldGoldLots.createdAt));
      
    return rows;
  },

  async createOldGoldLot(
    input: CreateOldGoldLotInput, firmId: string
  ): Promise<OldGoldLot> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (input.grossWeightMg <= 0) throw new Error('OLD_GOLD_GROSS_WEIGHT_INVALID');
    if (input.purityPercent <= 0 || input.purityPercent > 100) {
      throw new Error('OLD_GOLD_PURITY_PERCENT_INVALID');
    }

    const fineWeightMg = Math.round(input.grossWeightMg * input.purityPercent / 100);
    const totalAmountPaise = input.purchaseRatePaise 
      ? Math.round((fineWeightMg / 1000) * input.purchaseRatePaise)
      : null;

    return db.transaction(async (tx) => {
      const lot = await oldGoldLotRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId,
        receivedFrom: input.receivedFrom,
        fineWeightMg,
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

      await auditRepository.log(tx, {
        eventType: 'OLD_GOLD_LOT_CREATED', firmId, entityId: lot.id,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({
          lotId: lot.id, grossWeightMg: lot.grossWeightMg,
          purityPercent: lot.purityPercent, metalSource: lot.metalSource,
          receivedFrom: lot.receivedFrom, receivedDate: lot.receivedDate,
          fineWeightMg: lot.fineWeightMg, purchaseRatePaise: lot.purchaseRatePaise,
          totalAmountPaise: lot.totalAmountPaise,
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

    return db.transaction(async (tx) => {
      const lot = await oldGoldLotRepository.getById(tx, firmId, lotId);
      if (!lot || lot.firmId !== firmId) throw new Error('OLD_GOLD_LOT_NOT_FOUND_OR_WRONG_FIRM');

      const allowed = VALID_LOT_TRANSITIONS[lot.status as OldGoldLotStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new Error(`INVALID_LOT_TRANSITION: ${lot.status} -> ${newStatus}`);
      }

      if (newStatus === 'ISSUED_TO_KARIGAR' && lot.metalSource !== 'MELT_OUTPUT') {
        throw new Error('ISSUED_TO_KARIGAR_REQUIRES_MELT_OUTPUT: raw customer gold must be melted first');
      }

      const oldStatus = lot.status;
      await oldGoldLotRepository.updateStatus(tx, firmId, lotId, newStatus);

      await auditRepository.log(tx, {
        eventType: 'OLD_GOLD_LOT_STATUS_CHANGED', firmId, entityId: lotId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ lotId, oldStatus, newStatus, reason: reason ?? null }),
      });
    });
  }
};
