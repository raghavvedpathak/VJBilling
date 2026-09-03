// repositories/phase2/inventoryDrillDownRepository.ts — Phase 2 v2.24 Canonical Repository
// FEAT-DRILL-DOWN-1 (v1.65) / FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13) / FEAT-SCREEN-C-SIZE-1 (v2.13)
// All methods read-only. No DrizzleTransaction param.

import { sql, eq, and, or, desc, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, items, designs, designPurityThresholds, itemEvents, auditLogs } from '@/db/schema';
import type { 
  ItemSearchResult, 
  DesignCategoryStockResult, 
  ItemDetail, 
  ItemTimelineEvent, 
  MetalSourceStockResult, 
  StockStatus, 
  LowStockDesignPurityVariant,
  Metal
} from '@/types/phase2/phase2.types';

export const inventoryDrillDownRepository = {
  // Screen A (Category Browse — getCategoriesWithStock)
  async getCategoriesWithStock(firmId: string) {
    const results = await db
      .select({
        id: categories.id,
        name: categories.name,
        availableCount: sql<number>`COUNT(${items.id})`,
        totalNetWeightMg: sql<number>`SUM(${items.netWeightMg})`,
      })
      .from(categories)
      .innerJoin(
        items,
        and(
          eq(items.categoryId, categories.id),
          eq(items.status, 'AVAILABLE'),
          eq(items.firmId, firmId)
        )
      )
      .where(and(eq(categories.firmId, firmId), eq(categories.isActive, 1)))
      .groupBy(categories.id)
      .orderBy(asc(categories.name));

    return results.map(r => ({
      id: r.id,
      name: r.name,
      availableCount: Number(r.availableCount) || 0,
      totalNetWeightMg: Number(r.totalNetWeightMg) || 0,
    }));
  },

  // FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13): Grouped by (designId, purityPercent) variant
  async getLowStockDesignPurityVariants(firmId: string): Promise<LowStockDesignPurityVariant[]> {
    const results = await db
      .select({
        designId: designPurityThresholds.designId,
        designName: designs.name,
        purityPercent: designPurityThresholds.purityPercent,
        lowStockThreshold: designPurityThresholds.lowStockThreshold,
        availableCount: sql<number>`COUNT(${items.id})`,
      })
      .from(designPurityThresholds)
      .innerJoin(
        designs,
        and(
          eq(designs.id, designPurityThresholds.designId),
          eq(designs.firmId, firmId),
          eq(designs.isActive, 1)
        )
      )
      .leftJoin(
        items,
        and(
          eq(items.designId, designPurityThresholds.designId),
          eq(items.purityPercent, designPurityThresholds.purityPercent),
          eq(items.status, 'AVAILABLE'),
          eq(items.firmId, firmId)
        )
      )
      .where(eq(designs.firmId, firmId))
      .groupBy(designPurityThresholds.designId, designPurityThresholds.purityPercent)
      .having(({ availableCount, lowStockThreshold }) => sql`${availableCount} <= ${lowStockThreshold}`)
      .orderBy(({ availableCount }) => asc(availableCount));

    return results.map(r => ({
      designId: r.designId,
      designName: r.designName,
      purityPercent: Number(r.purityPercent),
      lowStockThreshold: Number(r.lowStockThreshold),
      availableCount: Number(r.availableCount) || 0,
    }));
  },

  // Backward-compatibility alias for services referencing getLowStockDesigns
  async getLowStockDesigns(firmId: string): Promise<LowStockDesignPurityVariant[]> {
    return this.getLowStockDesignPurityVariants(firmId);
  },

  // FEAT-GAP4-METALSOURCE-1 (v1.66)
  async getStockByMetalSource(firmId: string): Promise<MetalSourceStockResult[]> {
    const results = await db
      .select({
        metalSource: items.metalSource,
        metal: items.metal,
        totalNetWeightMg: sql<number>`SUM(${items.netWeightMg})`,
        itemCount: sql<number>`COUNT(*)`,
      })
      .from(items)
      .where(
        and(
          eq(items.firmId, firmId),
          eq(items.status, 'AVAILABLE')
        )
      )
      .groupBy(items.metalSource, items.metal)
      .orderBy(asc(items.metal), desc(sql`SUM(${items.netWeightMg})`));

    return results.map(r => ({
      metalSource: r.metalSource as string,
      metal: r.metal as 'GOLD' | 'SILVER',
      totalNetWeightMg: Number(r.totalNetWeightMg) || 0,
      itemCount: Number(r.itemCount) || 0,
    }));
  },

  // Screen B (Design List Under Category — getDesignsByCategory)
  // Supports both (firmId, categoryId) and (categoryId, firmId) parameter ordering
  async getDesignsByCategory(first: string, second: string): Promise<DesignCategoryStockResult[]> {
    const results = await db
      .select({
        designId: designs.id,
        designName: designs.name,
        metal: designs.metal,
        purityPercent: items.purityPercent,
        purityKarat: items.purityKarat,
        availableCount: sql<number>`COUNT(${items.id})`,
        totalNetWeightMg: sql<number>`SUM(${items.netWeightMg})`,
      })
      .from(designs)
      .innerJoin(
        items,
        and(
          eq(items.designId, designs.id),
          eq(items.status, 'AVAILABLE'),
          or(
            and(eq(items.firmId, first), eq(items.categoryId, second)),
            and(eq(items.firmId, second), eq(items.categoryId, first))
          )
        )
      )
      .where(
        and(
          or(eq(designs.firmId, first), eq(designs.firmId, second)),
          eq(designs.isActive, 1)
        )
      )
      .groupBy(designs.id, items.purityPercent)
      .orderBy(asc(designs.name), desc(items.purityPercent));

    return results.map(r => ({
      designId: r.designId,
      designName: r.designName,
      metal: r.metal as 'GOLD' | 'SILVER',
      purityPercent: Number(r.purityPercent),
      purityKarat: Number(r.purityKarat) || 0,
      availableCount: Number(r.availableCount) || 0,
      totalNetWeightMg: Number(r.totalNetWeightMg) || 0,
    }));
  },

  // Screen C (Individual Items Under Design — getItemsByDesign)
  // FEAT-SCREEN-C-SIZE-1 (v2.13): Sort order purityPercent DESC, sizeValue ASC, created_at DESC
  async getItemsByDesign(first: string, second: string, purityPercent?: number): Promise<ItemSearchResult[]> {
    const conditions = [
      or(
        and(eq(items.firmId, first), eq(items.designId, second)),
        and(eq(items.firmId, second), eq(items.designId, first))
      ),
      eq(items.status, 'AVAILABLE')
    ];

    if (purityPercent !== undefined && purityPercent !== null && !isNaN(purityPercent)) {
      conditions.push(sql`ABS(${items.purityPercent} - ${purityPercent}) < 0.05`);
    }

    const results = await db
      .select({
        itemId: items.id,
        sku: items.sku,
        designName: designs.name,
        categoryName: categories.name,
        metal: items.metal,
        grossWeightMg: items.grossWeightMg,
        purityPercent: items.purityPercent,
        huid: items.huid,
        status: items.status,
        location: items.location,
        barcode: items.barcode,
        netWeightMg: items.netWeightMg,
        purityKarat: items.purityKarat,
        sizeValue: items.sizeValue,
        sizeUnit: items.sizeUnit,
      })
      .from(items)
      .innerJoin(
        designs,
        and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId))
      )
      .innerJoin(
        categories,
        and(eq(categories.id, items.categoryId), eq(categories.firmId, items.firmId))
      )
      .where(and(...conditions))
      .orderBy(desc(items.purityPercent), asc(items.sizeValue), desc(items.createdAt));

    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as 'AVAILABLE' | 'PHANTOM_AVAILABLE',
      sizeUnit: r.sizeUnit as 'INCH'|'MM'|'CM'|'RING_SIZE'|null,
    }));
  },

  async getDraftItems(firmId: string): Promise<ItemSearchResult[]> {
    const results = await db
      .select({
        itemId: items.id,
        sku: items.sku,
        designName: designs.name,
        categoryName: categories.name,
        metal: items.metal,
        grossWeightMg: items.grossWeightMg,
        purityPercent: items.purityPercent,
        huid: items.huid,
        status: items.status,
        location: items.location,
        barcode: items.barcode,
        netWeightMg: items.netWeightMg,
        purityKarat: items.purityKarat,
        sizeValue: items.sizeValue,
        sizeUnit: items.sizeUnit,
      })
      .from(items)
      .leftJoin(designs, and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId)))
      .leftJoin(categories, and(eq(categories.id, items.categoryId), eq(categories.firmId, items.firmId)))
      .where(
        and(
          eq(items.firmId, firmId),
          eq(items.status, 'DRAFT')
        )
      )
      .orderBy(desc(items.createdAt));

    return results.map(r => ({
      ...r,
      designName: r.designName || 'Unknown Design',
      categoryName: r.categoryName || 'Unknown Category',
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as unknown as 'AVAILABLE' | 'PHANTOM_AVAILABLE',
      sizeUnit: r.sizeUnit as 'INCH'|'MM'|'CM'|'RING_SIZE'|null,
    }));
  },

  async getItemWithNames(firmId: string, itemId: string): Promise<Omit<ItemDetail, 'timeline'> | null> {
    const [result] = await db
      .select({
        item: items,
        designName: designs.name,
        categoryName: categories.name,
      })
      .from(items)
      .innerJoin(
        designs,
        and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId))
      )
      .innerJoin(
        categories,
        and(eq(categories.id, items.categoryId), eq(categories.firmId, items.firmId))
      )
      .where(
        and(
          eq(items.id, itemId),
          eq(items.firmId, firmId)
        )
      )
      .limit(1);

    if (!result) return null;

    return {
      ...result.item,
      metal: result.item.metal as Metal,
      status: result.item.status as StockStatus,
      designName: result.designName,
      categoryName: result.categoryName,
      saleInvoiceId: result.item.saleInvoiceId ?? null,
      purchaseInvoiceId: result.item.purchaseInvoiceId ?? null,
      barcodeReprintRequired: Boolean(result.item.barcodeReprintRequired),
    };
  },

  async getItemTimeline(firmId: string, itemId: string): Promise<ItemTimelineEvent[]> {
    const results = await db
      .select({
        id: itemEvents.id,
        eventType: itemEvents.eventType,
        severity: itemEvents.severity,
        timestamp: itemEvents.timestamp,
        oldValue: itemEvents.oldValue,
        newValue: itemEvents.newValue,
        reason: itemEvents.reason,
        performedBy: itemEvents.performedBy,
        karigarId: itemEvents.karigarId,
        payload: auditLogs.payload,
      })
      .from(itemEvents)
      .leftJoin(
        auditLogs,
        and(
          eq(auditLogs.entityId, itemEvents.itemId),
          eq(auditLogs.eventType, itemEvents.eventType),
          eq(auditLogs.firmId, itemEvents.firmId)
        )
      )
      .where(
        and(
          eq(itemEvents.itemId, itemId),
          eq(itemEvents.firmId, firmId)
        )
      )
      .orderBy(asc(itemEvents.timestamp));

    // Deduplicate in case multiple audit log rows match an event type
    const seenEventIds = new Set<string>();
    const timeline: ItemTimelineEvent[] = [];

    for (const r of results) {
      if (seenEventIds.has(r.id)) continue;
      seenEventIds.add(r.id);

      let karigarName: string | undefined = undefined;
      let outcome: string | undefined = undefined;
      let changes: Record<string, { old: unknown; new: unknown }> | undefined = undefined;

      if (r.payload) {
        try {
          const parsed = JSON.parse(r.payload as string);
          if (r.eventType === 'ITEM_SENT_TO_KARIGAR' || r.eventType === 'ITEM_RETURNED_FROM_KARIGAR') {
            karigarName = parsed.karigarName;
            outcome = parsed.outcome;
          } else if (r.eventType === 'ITEM_EDITED') {
            changes = parsed.changes;
          }
        } catch {
          // ignore JSON parse errors on payloads
        }
      }

      timeline.push({
        id: r.id,
        eventType: r.eventType as any,
        severity: r.severity as 'INFO' | 'WARNING' | 'ERROR',
        timestamp: r.timestamp,
        oldValue: r.oldValue,
        newValue: r.newValue,
        reason: r.reason,
        performedBy: r.performedBy,
        karigarId: r.karigarId ?? null,
        ...(karigarName !== undefined ? { karigarName } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
        ...(changes !== undefined ? { changes } : {}),
      });
    }

    return timeline;
  },

  // Screen D (Item Detail + Timeline — getItemDetail)
  async getItemDetail(firmId: string, itemId: string): Promise<ItemDetail | null> {
    const item = await this.getItemWithNames(firmId, itemId);
    if (!item) return null;
    const timeline = await this.getItemTimeline(firmId, itemId);
    return { ...item, timeline };
  }
};