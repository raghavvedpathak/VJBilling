// services/karigarService.ts — Phase 2 v2.11 Canonical Service

import { db } from '@/db/client';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { karigarRepository } from '@/repositories/phase2/karigarRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { ERR } from '@/constants/errorCodes';
import type { KarigarIssuedItem, StockStatus } from '@/types/phase2/phase2.types';
import { ALLOWED_TRANSITIONS } from '@/types/phase2/phase2.types';

export type KarigarOutcome = 'REPAIRED' | 'UNREPAIRABLE' | 'PARTIALLY_REPAIRED';

export const karigarService = {
  // --- sendToKarigar (Step 10.7 / FIX-SERVICE-BODY-1 v1.35) ---
  async sendToKarigar(
    itemId: string, firmId: string, karigarName: string, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      if (item.status !== 'DAMAGED') {
        throw new Error(`${ERR.INVALID_TRANSITION}: must be DAMAGED to send to karigar`);
      }

      // FIX-LOOP-1 (v1.33): Loop guard — count prior ITEM_SENT_TO_KARIGAR events
      const priorKarigarCount = itemEventRepository.countByItemIdAndEventType(
        tx, itemId, 'ITEM_SENT_TO_KARIGAR'
      );
      
      if (priorKarigarCount >= 3) throw new Error(ERR.KARIGAR_LOOP_LIMIT_EXCEEDED);

      itemRepository.updateStatus(tx, firmId, itemId, 'SENT_TO_KARIGAR');

      itemEventRepository.insert(tx, {
        id: Crypto.randomUUID(),
        itemId,
        firmId,
        eventType: 'ITEM_SENT_TO_KARIGAR',
        severity: 'WARNING',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: 'DAMAGED',
        newValue: 'SENT_TO_KARIGAR',
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_SENT_TO_KARIGAR',
        firmId,
        entityId: itemId,
        deviceId,
        payload: { itemId, sku: item.sku, karigarName, reason, priorKarigarCount },
      });
    });
  },

  // --- returnFromKarigar (Step 10.7 / FIX-SERVICE-BODY-1 v1.35) ---
  async returnFromKarigar(
    itemId: string, firmId: string,
    outcome: KarigarOutcome, karigarName: string, reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const nextStatus: StockStatus =
      outcome === 'REPAIRED' ? 'AVAILABLE' :
      outcome === 'UNREPAIRABLE' ? 'SENT_TO_REFINERY' :
      'DAMAGED';

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      if (item.status !== 'SENT_TO_KARIGAR') {
        throw new Error(`${ERR.INVALID_TRANSITION}: item must be SENT_TO_KARIGAR to return from karigar`);
      }

      const allowed = ALLOWED_TRANSITIONS['SENT_TO_KARIGAR'];
      if (!allowed || !allowed.includes(nextStatus)) {
        throw new Error(`${ERR.INVALID_TRANSITION}: SENT_TO_KARIGAR -> ${nextStatus}`);
      }

      itemRepository.updateStatus(tx, firmId, itemId, nextStatus);

      itemEventRepository.insert(tx, {
        id: Crypto.randomUUID(),
        itemId,
        firmId,
        eventType: 'ITEM_RETURNED_FROM_KARIGAR',
        severity: 'INFO',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: 'SENT_TO_KARIGAR',
        newValue: nextStatus,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_RETURNED_FROM_KARIGAR',
        firmId,
        entityId: itemId,
        deviceId,
        payload: { itemId, sku: item.sku, outcome, nextStatus, karigarName, reason: reason ?? null },
      });
    });
  },

  // --- getKarigarIssuedItems (Step 10.8 / FEAT-GAP6-KARIGAR-SUMMARY-1 v1.66) ---
  async getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItem[]> {
    const rawRows = await karigarRepository.getKarigarIssuedItemsRaw(firmId);

    return rawRows.map((row: any) => {
      let karigarName: string | null = null;
      if (row.auditPayload) {
        try {
          const parsed = typeof row.auditPayload === 'string' ? JSON.parse(row.auditPayload) : row.auditPayload;
          karigarName = parsed.karigarName ?? null;
        } catch (e) {
          console.error('[karigarService] Failed to parse audit payload', e);
        }
      }

      return {
        id: row.id,
        sku: row.sku,
        barcode: row.barcode,
        designName: row.designName,
        metal: row.metal,
        purityPercent: row.purityPercent,
        purityKarat: row.purityKarat,
        grossWeightMg: row.grossWeightMg,
        netWeightMg: row.netWeightMg,
        karigarName,
        updatedAt: row.updatedAt,
      };
    });
  }
};