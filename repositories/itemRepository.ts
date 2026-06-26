// repositories/itemRepository.ts
import { eq, and, sql, inArray, like, or } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs, categories } from '../db/schema';
import type { DrizzleTransaction, Item, ItemSearchResult } from '../types/phase2.types';
import { now } from '../utils/now';

export const itemRepository = {
  async getById(tx: DrizzleTransaction, firmId: string, id: string): Promise<Item | null> {
    const result = await tx.select().from(items).where(and(eq(items.id, id), eq(items.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  async updateBarcodeReprintFlag(tx: DrizzleTransaction, firmId: string, itemId: string, flag: boolean): Promise<void> {
    await tx
      .update(items)
      .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
      .where(and(eq(items.id, itemId), eq(items.firmId, firmId)));
  },

  async findByStatus(firmId: string, status: string): Promise<Item[]> {
    return db
      .select()
      .from(items)
      .where(
        and(
          eq(items.firmId, firmId),
          // @ts-ignore
          eq(items.status, status)
        )
      );
  },
  
  // SQL: SELECT * FROM items WHERE category_id = ? AND firm_id = ?
  async findByCategoryId(tx: DrizzleTransaction, categoryId: string, firmId: string): Promise<Item[]> {
    return tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.categoryId, categoryId),
          eq(items.firmId, firmId)
        )
      );
  },

  async findByDesignId(designId: string, firmId: string): Promise<Item[]> {
    return db
      .select()
      .from(items)
      .where(
        and(
          eq(items.designId, designId),
          eq(items.firmId, firmId)
        )
      );
  },

  async update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Item>): Promise<void> {
    await tx.update(items).set(data).where(and(eq(items.id, id), eq(items.firmId, firmId)));
  },

  async updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: string): Promise<void> {
    await tx.update(items).set({ status: status as any, updatedAt: now() }).where(and(eq(items.id, id), eq(items.firmId, firmId)));
  },

  async insert(tx: DrizzleTransaction, data: any): Promise<Item> {
    const result = await tx.insert(items).values(data).returning();
    return result[0];
  },

  async findBySku(firmId: string, sku: string): Promise<Item | null> {
    const result = await db.select().from(items).where(and(eq(items.sku, sku), eq(items.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  async findByHUID(firmId: string, huid: string): Promise<Item | null> {
    const result = await db.select().from(items).where(and(eq(items.huid, huid), eq(items.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  async findByFirmId(firmId: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.firmId, firmId));
  },

  async delete(tx: DrizzleTransaction, firmId: string, id: string): Promise<void> {
    await tx.delete(items).where(and(eq(items.id, id), eq(items.firmId, firmId)));
  },

  async getStockWeightSummary(firmId: string) {
    const rows = await db
      .select({
        metal: items.metal,
        availableNetWeightMg: sql<number>`SUM(CASE WHEN ${items.status} = 'AVAILABLE' THEN ${items.netWeightMg} ELSE 0 END)`,
        phantomDebtMg: sql<number>`SUM(CASE WHEN ${items.status} IN ('PHANTOM_AVAILABLE','PHANTOM_SOLD') AND ${items.phantomStockId} IS NULL THEN ${items.netWeightMg} ELSE 0 END)`,
        // Added Dynamic Total Cost Aggregation!
        totalInvestedPaise: sql<number>`SUM(CASE WHEN ${items.status} = 'AVAILABLE' THEN (
          (COALESCE(${items.fineGoldChargedMg}, ${items.fineWeightMg}) / 1000.0) * COALESCE(${items.purchaseRatePaise}, 0) +
          COALESCE(${items.makingChargePaise}, 0) +
          COALESCE(${items.stoneCostPaise}, 0)
        ) ELSE 0 END)`
      })
      .from(items)
      .where(and(
        eq(items.firmId, firmId),
        inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE', 'PHANTOM_SOLD'] as any[])
      ))
      .groupBy(items.metal);

    const summary = {
      goldNetWeightMg: 0,
      goldPhantomDebtMg: 0,
      goldBalanceMg: 0,
      goldInvestedPaise: 0,
      silverNetWeightMg: 0,
      silverPhantomDebtMg: 0,
      silverBalanceMg: 0,
      silverInvestedPaise: 0,
    };

    for (const row of rows) {
      const avail = row.availableNetWeightMg || 0;
      const debt = row.phantomDebtMg || 0;
      const balance = avail - debt;
      const invested = Math.round(row.totalInvestedPaise || 0);

      if (row.metal === 'GOLD') {
        summary.goldNetWeightMg = avail;
        summary.goldPhantomDebtMg = debt;
        summary.goldBalanceMg = balance;
        summary.goldInvestedPaise = invested;
      } else if (row.metal === 'SILVER') {
        summary.silverNetWeightMg = avail;
        summary.silverPhantomDebtMg = debt;
        summary.silverBalanceMg = balance;
        summary.silverInvestedPaise = invested;
      }
    }

    return summary;
  },

  async search(firmId: string, query: string): Promise<ItemSearchResult[]> {
    const safeQuery = `%${query}%`;
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
      })
      .from(items)
      .innerJoin(designs, eq(items.designId, designs.id))
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .where(
        and(
          eq(items.firmId, firmId),
          inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE']),
          // SEARCH-1 (v1.13) FIX: Now includes designs and categories
          or(
            like(items.sku, safeQuery),
            like(items.huid, safeQuery),
            like(designs.name, safeQuery),
            like(categories.name, safeQuery)
          )
        )
      )
      .limit(20);

    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as 'AVAILABLE' | 'PHANTOM_AVAILABLE'
    }));
  }
};