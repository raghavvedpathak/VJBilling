import { sql, eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs, auditLogs } from '../db/schema';

export const karigarRepository = {
  // FEAT-GAP6-KARIGAR-SUMMARY-1 (v1.66): Read-only globally executed query
  async getKarigarIssuedItemsRaw(firmId: string) {
    return db
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
  }
};