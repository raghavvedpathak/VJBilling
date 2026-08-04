import { sql, eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { itemEvents } from '../db/schema';
import type { KarigarIssuedItem, StockStatus } from '../types/phase2.types';
import { ALLOWED_TRANSITIONS } from '../types/phase2.types';
import { itemRepository } from '../repositories/itemRepository';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { karigarRepository } from '../repositories/karigarRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { ERR } from '../constants';

export type KarigarOutcome = 'REPAIRED' | 'UNREPAIRABLE' | 'PARTIALLY_REPAIRED';

export const karigarService = {
  // Removed old implementation that delegated to karigarRepository

  async sendToKarigar(
    itemId: string, firmId: string, karigarName: string, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Hoisted async call BEFORE transaction lock
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous execution using inline tx calls
    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      if (item.status !== 'DAMAGED') {
        throw new Error(`${ERR.INVALID_TRANSITION}: must be DAMAGED to send to karigar`);
      }

      // FIX-LOOP-1 (v1.33): Loop guard — count prior ITEM_SENT_TO_KARIGAR events
      const priorKarigarCount = itemEventRepository.countByItemIdAndEventType(
        tx, firmId, itemId, 'ITEM_SENT_TO_KARIGAR'
      );
      
      if (priorKarigarCount >= 3) throw new Error(ERR.KARIGAR_LOOP_LIMIT_EXCEEDED);

      itemRepository.updateStatus(tx, firmId, itemId, 'SENT_TO_KARIGAR');

      // FIX for TS2353: 'id' removed, relies on repository omitting it
      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_SENT_TO_KARIGAR',
        severity: 'WARNING',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: 'DAMAGED',
        newValue: 'SENT_TO_KARIGAR',
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_SENT_TO_KARIGAR', firmId, entityId: itemId,
        deviceId: deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku, karigarName, reason, priorKarigarCount }),
      });
    });
  },

  async returnFromKarigar(
    itemId: string, firmId: string,
    outcome: KarigarOutcome, karigarName: string, reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    const nextStatus: StockStatus =
      outcome === 'REPAIRED' ? 'AVAILABLE' :
      outcome === 'UNREPAIRABLE' ? 'SENT_TO_REFINERY' :
      'DAMAGED';

    // Hoisted async call BEFORE transaction lock
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction execution
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

      // FIX for TS2353: 'id' removed, relies on repository omitting it
      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_RETURNED_FROM_KARIGAR',
        severity: 'INFO',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: 'SENT_TO_KARIGAR',
        newValue: nextStatus,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_RETURNED_FROM_KARIGAR', firmId, entityId: itemId,
        deviceId: deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku, outcome, nextStatus, karigarName, reason: reason ?? null }),
      });
    });
  },

  // FEAT-GAP6-KARIGAR-SUMMARY-1 (v1.66): Karigar Issued Items Summary
  async getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItem[]> {
    const rawRows = await db.all(sql`
      SELECT 
        items.id, 
        items.sku, 
        items.barcode, 
        items.gross_weight_mg AS grossWeightMg,
        items.net_weight_mg AS netWeightMg, 
        items.purity_percent AS purityPercent,
        items.purity_karat AS purityKarat, 
        items.metal, 
        items.updated_at AS updatedAt,
        designs.name AS designName, 
        al.payload AS auditPayload
      FROM items 
      JOIN designs ON designs.id = items.design_id
      LEFT JOIN audit_logs al ON al.entity_id = items.id
        AND al.event_type = 'ITEM_SENT_TO_KARIGAR' 
        AND al.firm_id = items.firm_id
        AND al.created_at = (
          SELECT MAX(al2.created_at) 
          FROM audit_logs al2 
          WHERE al2.entity_id = items.id 
            AND al2.event_type = 'ITEM_SENT_TO_KARIGAR' 
            AND al2.firm_id = items.firm_id
        )
      WHERE items.firm_id = ${firmId} 
        AND items.status = 'SENT_TO_KARIGAR'
      ORDER BY items.updated_at DESC
    `);

    return rawRows.map((row: any) => {
      let karigarName: string | null = null;
      if (row.auditPayload) {
        try {
          const parsed = JSON.parse(row.auditPayload);
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