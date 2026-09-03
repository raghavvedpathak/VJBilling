// repositories/phase2/karigarRepository.ts — Phase 2 v2.24 Canonical Repository
// FEAT-GAP6-KARIGAR-SUMMARY-1 (v1.66) / FIX-KARIGAR-DUPES-1 (v1.71) / Step 5.5 FY Close Integration

import { sql, eq, and, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { items, designs, auditLogs } from '@/db/schema';
import type { DrizzleTransaction, Metal } from '@/types/phase2/phase2.types';

export interface KarigarIssuedItemRow {
  id: string;
  sku: string;
  barcode: string;
  grossWeightMg: number;
  netWeightMg: number;
  purityPercent: number;
  purityKarat: number;
  metal: Metal;
  updatedAt: string;
  designName: string;
  auditPayload: string | null;
}

export interface KarigarRepository {
  getOutstandingFineMg(tx: DrizzleTransaction, firmId: string): number;
  getKarigarIssuedItemsRaw(firmId: string): Promise<KarigarIssuedItemRow[]>;
  getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItemRow[]>;
}

export const karigarRepository: KarigarRepository = {
  // ARCH-NOTE (FIX-CLOSEF-1 v1.37 / Step 5.5): Stub interface returning 0 until Phase 4 registers FY close hook
  getOutstandingFineMg(_tx: DrizzleTransaction, _firmId: string): number {
    return 0;
  },

  // FEAT-GAP6-KARIGAR-SUMMARY-1 (v1.66) & FIX-KARIGAR-DUPES-1 (v1.71):
  // Correlated subquery on audit_logs.created_at (covered by idx_audit_logs_entity_event)
  async getKarigarIssuedItemsRaw(firmId: string): Promise<KarigarIssuedItemRow[]> {
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
        auditPayload: auditLogs.payload,
      })
      .from(items)
      .innerJoin(
        designs,
        and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId))
      )
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
      .where(
        and(
          eq(items.firmId, firmId),
          eq(items.status, 'SENT_TO_KARIGAR')
        )
      )
      .orderBy(desc(items.updatedAt));

    return rows.map((r) => ({
      ...r,
      metal: r.metal as Metal,
    }));
  },

  async getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItemRow[]> {
    return this.getKarigarIssuedItemsRaw(firmId);
  },
};