import { eq, and, sql, inArray, like, or } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs, categories } from '../db/schema';
import type { DrizzleTransaction, Item, ItemSearchResult } from '../types/phase2.types';
import { now } from '../utils/now';

export const itemRepository = {
  async getById(txOrId: DrizzleTransaction | string, id?: string): Promise<Item | null> {
    const isTx = typeof txOrId !== 'string';
    const tx = isTx ? txOrId as DrizzleTransaction : db;
    const itemId = isTx ? id! : txOrId as string;
    const result = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
    return result[0] || null;
  },

  async updateBarcodeReprintFlag(tx: DrizzleTransaction, itemId: string, flag: boolean): Promise<void> {
    await tx
      .update(items)
      .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
      .where(eq(items.id, itemId));
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
  // New repository method required (add to itemRepository.ts):
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

  async update(tx: DrizzleTransaction, id: string, data: Partial<Item>): Promise<void> {
    await tx.update(items).set(data).where(eq(items.id, id));
  },

  async updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: string): Promise<void> {
    await tx.update(items).set({ status: status as any, updatedAt: now() }).where(and(eq(items.id, id), eq(items.firmId, firmId)));
  },

  async insert(tx: DrizzleTransaction, data: any): Promise<Item> {
    const result = await tx.insert(items).values(data).returning();
    return result[0];
  },

  async findBySku(sku: string): Promise<Item | null> {
    const result = await db.select().from(items).where(eq(items.sku, sku)).limit(1);
    return result[0] || null;
  },

  async findByHUID(huid: string): Promise<Item | null> {
    const result = await db.select().from(items).where(eq(items.huid, huid)).limit(1);
    return result[0] || null;
  },

  async findByFirmId(firmId: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.firmId, firmId));
  },

  async delete(tx: DrizzleTransaction, id: string): Promise<void> {
    await tx.delete(items).where(eq(items.id, id));
  },


  async getStockWeightSummary(firmId: string) {
    const rows = await db
      .select({
        metal: items.metal,
        availableNetWeightMg: sql<number>`SUM(CASE WHEN ${items.status} = 'AVAILABLE' THEN ${items.netWeightMg} ELSE 0 END)`,
        phantomDebtMg: sql<number>`SUM(CASE WHEN ${items.status} IN ('PHANTOM_AVAILABLE','PHANTOM_SOLD') AND ${items.phantomStockId} IS NULL THEN ${items.netWeightMg} ELSE 0 END)`
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
      silverNetWeightMg: 0,
      silverPhantomDebtMg: 0,
      silverBalanceMg: 0,
    };

    for (const row of rows) {
      const avail = row.availableNetWeightMg || 0;
      const debt = row.phantomDebtMg || 0;
      const balance = avail - debt;

      if (row.metal === 'GOLD') {
        summary.goldNetWeightMg = avail;
        summary.goldPhantomDebtMg = debt;
        summary.goldBalanceMg = balance;
      } else if (row.metal === 'SILVER') {
        summary.silverNetWeightMg = avail;
        summary.silverPhantomDebtMg = debt;
        summary.silverBalanceMg = balance;
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
      })
      .from(items)
      .innerJoin(designs, eq(items.designId, designs.id))
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .where(
        and(
          eq(items.firmId, firmId),
          inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE']),
          or(
            like(items.sku, safeQuery),
            like(items.huid, safeQuery)
          )
        )
      )
      .limit(20);

    // Cast status safely to match TS union because Drizzle infers string
    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as 'AVAILABLE' | 'PHANTOM_AVAILABLE'
    }));
  }
};
