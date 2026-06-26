import { sql, eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs, auditLogs } from '../db/schema';
import type { KarigarIssuedItem, StockStatus } from '../types/phase2.types';
import { ALLOWED_TRANSITIONS } from '../types/phase2.types';
import { itemRepository } from '../repositories/itemRepository';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';

export type KarigarOutcome = 'REPAIRED' | 'UNREPAIRABLE' | 'PARTIALLY_REPAIRED';

export const karigarService = {
  async getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItem[]> {
    const rows = await db
      .select({
        id: items.id,
        sku: items.sku,
        barcode: items.barcode,
        grossWeightMg: items.grossWeightMg,
        netWeightMg: items.netWeightMg,
        purityPercent: items.purityPercent,
        purityKarat: items.purityKarat,
        metal: items.metal,
        updatedAt: items.updatedAt,
        designName: designs.name,
        auditPayload: auditLogs.payload
      })
      .from(items)
      .innerJoin(designs, eq(designs.id, items.designId))
      .leftJoin(
        auditLogs,
        sql`${auditLogs.entityId} = ${items.id} 
        AND ${auditLogs.eventType} = 'ITEM_SENT_TO_KARIGAR' 
        AND ${auditLogs.firmId} = ${items.firmId} 
        AND ${auditLogs.createdAt} = (
          SELECT MAX(al2.created_at) 
          FROM audit_logs al2 
          WHERE al2.entity_id = ${items.id} 
          AND al2.event_type = 'ITEM_SENT_TO_KARIGAR' 
          AND al2.firm_id = ${items.firmId}
        )`
      )
      .where(and(
        eq(items.firmId, firmId),
        eq(items.status, 'SENT_TO_KARIGAR')
      ))
      .orderBy(desc(items.updatedAt));

    return rows.map(r => {
      let karigarName: string | null = null;
      if (r.auditPayload) {
        try {
          const parsed = JSON.parse(r.auditPayload);
          karigarName = parsed.karigarName ?? null;
        } catch {
          // ignore parse error
        }
      }

      return {
        id: r.id,
        sku: r.sku,
        barcode: r.barcode as string,
        designName: r.designName,
        metal: r.metal as 'GOLD' | 'SILVER',
        purityPercent: r.purityPercent,
        purityKarat: r.purityKarat,
        grossWeightMg: r.grossWeightMg,
        netWeightMg: r.netWeightMg,
        karigarName,
        updatedAt: r.updatedAt
      };
    });
  },

  async sendToKarigar(
    itemId: string, firmId: string, karigarName: string, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      if (item.status !== 'DAMAGED') {
        throw new Error('INVALID_TRANSITION: must be DAMAGED to send to karigar');
      }

      const priorKarigarCount = await itemEventRepository.countByItemIdAndEventType(
        tx, firmId, itemId, 'ITEM_SENT_TO_KARIGAR'
      );
      if (priorKarigarCount >= 3) throw new Error('KARIGAR_LOOP_LIMIT_EXCEEDED');

      await itemRepository.updateStatus(tx, firmId, itemId, 'SENT_TO_KARIGAR');

      await itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_SENT_TO_KARIGAR',
        severity: 'WARNING',
        performedBy: await getDeviceId(),
        reason: reason ?? null,
        oldValue: 'DAMAGED',
        newValue: 'SENT_TO_KARIGAR',
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_SENT_TO_KARIGAR', firmId, entityId: itemId,
        deviceId: await getDeviceId(),
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

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      if (item.status !== 'SENT_TO_KARIGAR') {
        throw new Error('INVALID_TRANSITION: item must be SENT_TO_KARIGAR to return from karigar');
      }

      const allowed = ALLOWED_TRANSITIONS['SENT_TO_KARIGAR'];
      if (!allowed || !allowed.includes(nextStatus)) {
        throw new Error(`INVALID_TRANSITION: SENT_TO_KARIGAR -> ${nextStatus}`);
      }

      await itemRepository.updateStatus(tx, firmId, itemId, nextStatus);

      await itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_RETURNED_FROM_KARIGAR',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: reason ?? null,
        oldValue: 'SENT_TO_KARIGAR',
        newValue: nextStatus,
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_RETURNED_FROM_KARIGAR', firmId, entityId: itemId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ itemId, sku: item.sku, outcome, nextStatus, karigarName, reason: reason ?? null }),
      });
    });
  }
};
