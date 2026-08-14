// repositories/inventoryDrillDownRepository.ts
// FEAT-DRILL-DOWN-1 (v1.65): All methods read-only. No DrizzleTransaction param.
import { sql, eq, and, desc, asc, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, items, designs, itemEvents, auditLogs } from '@/db/schema';
import type { ItemSearchResult, DesignCategoryStockResult, ItemDetail, ItemTimelineEvent, MetalSourceStockResult, StockStatus } from '@/types/phase2/phase2.types';

export const inventoryDrillDownRepository = {
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
      .where(eq(categories.firmId, firmId))
      .groupBy(categories.id)
      .orderBy(asc(categories.name));

    return results.map(r => ({
      id: r.id,
      name: r.name,
      availableCount: Number(r.availableCount) || 0,
      totalNetWeightMg: Number(r.totalNetWeightMg) || 0,
    }));
  },

  async getLowStockDesigns(firmId: string) {
    const results = await db
      .select({
        id: designs.id,
        name: designs.name,
        lowStockThreshold: designs.lowStockThreshold,
        availableCount: sql<number>`COUNT(${items.id})`,
      })
      .from(designs)
      .leftJoin(
        items,
        and(
          eq(items.designId, designs.id),
          eq(items.status, 'AVAILABLE'),
          eq(items.firmId, firmId)
        )
      )
      .where(
        and(
          eq(designs.firmId, firmId),
          isNotNull(designs.lowStockThreshold)
        )
      )
      .groupBy(designs.id)
      .having(({ availableCount }) => sql`${availableCount} <= ${designs.lowStockThreshold}`)
      .orderBy(({ availableCount }) => asc(availableCount));

    return results.map(r => ({
      id: r.id,
      name: r.name,
      lowStockThreshold: r.lowStockThreshold!,
      availableCount: Number(r.availableCount) || 0,
    }));
  },

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

  async getDesignsByCategory(firmId: string, categoryId: string): Promise<DesignCategoryStockResult[]> {
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
          eq(items.firmId, firmId),
          eq(items.categoryId, categoryId)
        )
      )
      .where(eq(designs.firmId, firmId))
      .groupBy(designs.id, items.purityPercent)
      .orderBy(asc(designs.name), desc(items.purityPercent));

    return results.map(r => ({
      designId: r.designId,
      designName: r.designName,
      categoryId,
      categoryName: '', // typically not selected from designs, passed implicitly by calling context or omitted
      metal: r.metal as 'GOLD' | 'SILVER',
      purityPercent: Number(r.purityPercent),
      purityKarat: Number(r.purityKarat) || 0,
      availableCount: Number(r.availableCount) || 0,
      totalNetWeightMg: Number(r.totalNetWeightMg) || 0,
    }));
  },

  async getItemsByDesign(firmId: string, designId: string, purityPercent?: number): Promise<ItemSearchResult[]> {
    const conditions = [
      eq(items.designId, designId),
      eq(items.firmId, firmId),
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
      .innerJoin(designs, eq(designs.id, items.designId))
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .where(and(...conditions))
      .orderBy(desc(items.createdAt));

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
      .leftJoin(designs, eq(designs.id, items.designId))
      .leftJoin(categories, eq(categories.id, items.categoryId))
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
      .innerJoin(designs, eq(designs.id, items.designId))
      .innerJoin(categories, eq(categories.id, items.categoryId))
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
      metal: result.item.metal as 'GOLD' | 'SILVER',
      status: result.item.status as StockStatus,
      designName: result.designName,
      categoryName: result.categoryName,
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

    return results.map(r => {
      let karigarName: string | undefined = undefined;
      let outcome: string | undefined = undefined;
      let changes: Record<string, { old: unknown; new: unknown }> | undefined = undefined;

      if (r.payload) {
        try {
          const parsed = JSON.parse(r.payload as string);
          if (r.eventType === 'ITEM_SENT_TO_KARIGAR') {
            karigarName = parsed.karigarName;
          } else if (r.eventType === 'ITEM_RETURNED_FROM_KARIGAR') {
            karigarName = parsed.karigarName;
            outcome = parsed.outcome;
          } else if (r.eventType === 'ITEM_EDITED') {
            changes = parsed.changes;
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      return {
        id: r.id,
        eventType: r.eventType as any,
        severity: r.severity as 'INFO' | 'WARNING' | 'ERROR',
        timestamp: r.timestamp,
        oldValue: r.oldValue,
        newValue: r.newValue,
        reason: r.reason,
        performedBy: r.performedBy,
        ...(karigarName !== undefined ? { karigarName } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
        ...(changes !== undefined ? { changes } : {}),
      };
    });
  }
};