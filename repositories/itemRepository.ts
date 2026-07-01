// repositories/itemRepository.ts
import { eq, and, sql, inArray, like, or } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs, categories } from '../db/schema';
import type { DrizzleTransaction, Item, ItemSearchResult } from '../types/phase2.types';
import { now } from '../utils/now';

export const itemRepository = {
  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): Item | null {
    const result = tx.select().from(items).where(and(eq(items.id, id), eq(items.firmId, firmId))).limit(1).get();
    return (result as unknown as Item) || null;
  },

  // FIX-V718-1: Synchronous execution using .run()
  updateBarcodeReprintFlag(tx: DrizzleTransaction, firmId: string, itemId: string, flag: boolean): void {
    tx.update(items)
      .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
      .where(and(eq(items.id, itemId), eq(items.firmId, firmId)))
      .run();
  },

  // Operates on global async db - left as async
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
  
  // FIX-V718-1: Synchronous execution using .all()
  // SQL: SELECT * FROM items WHERE category_id = ? AND firm_id = ?
  findByCategoryId(tx: DrizzleTransaction, categoryId: string, firmId: string): Item[] {
    return tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.categoryId, categoryId),
          eq(items.firmId, firmId)
        )
      )
      .all() as unknown as Item[];
  },

  // Operates on global async db - left as async
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

  async getAvailableStockForDesign(designId: string, firmId: string): Promise<{ totalNetWeightMg: number, count: number }> {
    const result = await db
      .select({
        totalNetWeightMg: sql<number>`SUM(${items.grossWeightMg} - COALESCE(${items.stoneWeightMg}, 0) - COALESCE(${items.beadsWeightMg}, 0))`,
        count: sql<number>`COUNT(${items.id})`
      })
      .from(items)
      .where(
        and(
          eq(items.designId, designId),
          eq(items.firmId, firmId),
          eq(items.status, 'AVAILABLE')
        )
      );
    return {
      totalNetWeightMg: result[0]?.totalNetWeightMg || 0,
      count: result[0]?.count || 0
    };
  },

  // FIX-V718-1: Synchronous execution using .run()
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Item>): void {
    tx.update(items).set(data).where(and(eq(items.id, id), eq(items.firmId, firmId))).run();
  },

  // FIX-V718-1: Synchronous execution using .run()
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: string): void {
    tx.update(items).set({ status: status as any, updatedAt: now() }).where(and(eq(items.id, id), eq(items.firmId, firmId))).run();
  },

  // FIX-V718-1: Synchronous execution using .returning().get()
  insert(tx: DrizzleTransaction, data: any): Item {
    const result = tx.insert(items).values(data).returning().get();
    return result as unknown as Item;
  },

  // Operates on global async db - left as async
  async findBySku(firmId: string, sku: string): Promise<Item | null> {
    const result = await db.select().from(items).where(and(eq(items.sku, sku), eq(items.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  // Operates on global async db - left as async
  async findByHUID(firmId: string, huid: string): Promise<Item | null> {
    const result = await db.select().from(items).where(and(eq(items.huid, huid), eq(items.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  // Operates on global async db - left as async
  async findByFirmId(firmId: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.firmId, firmId));
  },

  // FIX-V718-1: Synchronous execution using .run()
  delete(tx: DrizzleTransaction, firmId: string, id: string): void {
    tx.delete(items).where(and(eq(items.id, id), eq(items.firmId, firmId))).run();
  },

  // Operates on global async db - left as async
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

  // Operates on global async db - left as async
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