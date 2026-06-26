import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { designs, items, categories } from '../db/schema';
import type { DrizzleTransaction, Design, DesignStockResult } from '../types/phase2.types';
import { now } from '../utils/now';

type NewDesign = typeof designs.$inferInsert;

export const designRepository = {
  async getById(tx: DrizzleTransaction, firmId: string, id: string): Promise<Design | null> {
    const [design] = await tx
      .select()
      .from(designs)
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)))
      .limit(1);

    return design || null;
  },

  async insert(tx: DrizzleTransaction, data: NewDesign): Promise<Design> {
    const [inserted] = await tx.insert(designs).values(data).returning();
    return inserted;
  },

  async findByFirmId(firmId: string): Promise<Design[]> {
    return db
      .select()
      .from(designs)
      .where(
        and(
          eq(designs.firmId, firmId),
          eq(designs.isActive, 1)
        )
      );
  },

  async softDelete(tx: DrizzleTransaction, firmId: string, id: string): Promise<void> {
    await tx
      .update(designs)
      .set({ isActive: 0, updatedAt: now() })
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)));
  },

  async update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn'>>): Promise<void> {
    await tx
      .update(designs)
      .set({ ...data, updatedAt: now() })
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)));
  },

  async searchStock(firmId: string, query: string): Promise<DesignStockResult[]> {
    const likeQuery = `%${query}%`;
    const results = await db
      .select({
        designId: designs.id,
        designName: designs.name,
        metal: designs.metal,
        purityPercent: items.purityPercent,
        categoryName: categories.name,
        totalGrossWeightMg: sql<number>`SUM(${items.grossWeightMg})`,
        availableCount: sql<number>`COUNT(${items.id})`
      })
      .from(designs)
      // FIX-JOIN-ORDER-1: items joined before categories
      .innerJoin(
        items,
        and(
          eq(items.designId, designs.id),
          eq(items.status, 'AVAILABLE')
        )
      )
      // FIX-CAT-ITEM-FK: items own category, join via items.categoryId
      .innerJoin(
        categories,
        eq(categories.id, items.categoryId)
      )
      .where(
        and(
          eq(designs.firmId, firmId),
          like(designs.name, likeQuery)
        )
      )
      // BLOCK-5 (v1.15): GROUP BY designs.id, items.purity_percent
      .groupBy(designs.id, items.purityPercent)
      .orderBy(designs.name, sql`${items.purityPercent} DESC`)
      .limit(20);

    return results as DesignStockResult[];
  }
};
