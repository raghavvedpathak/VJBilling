import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { designs, items, categories } from '../db/schema';
import type { DrizzleTransaction, Design, DesignStockResult } from '../types/phase2.types';
import { now } from '../utils/now';

type NewDesign = typeof designs.$inferInsert;

export const designRepository = {
  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): Design | null {
    const design = tx
      .select()
      .from(designs)
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)))
      .limit(1)
      .get();

    return (design as unknown as Design) || null;
  },

  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: NewDesign): Design {
    tx.insert(designs).values(data).run();
    const result = tx.select().from(designs).where(eq(designs.id, data.id)).limit(1).get();
    return result as unknown as Design;
  },

  // Operates globally outside a transaction — safely left as async
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

  // FIX-V718-1: Synchronous execution using .run()
  softDelete(tx: DrizzleTransaction, firmId: string, id: string): void {
    tx.update(designs)
      .set({ isActive: 0, updatedAt: now() })
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)))
      .run();
  },

  // FIX-V718-1: Synchronous execution using .run()
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>>): void {
    tx.update(designs)
      .set({ ...data, updatedAt: now() })
      .where(and(eq(designs.id, id), eq(designs.firmId, firmId)))
      .run();
  },

  // Operates globally outside a transaction — safely left as async
  async searchStock(firmId: string, query: string): Promise<DesignStockResult[]> {
    // FIX-GAP-P2-SIZE-1 (v1.76): Size tokenization for search
    const tokens = query.trim().split(/\s+/);
    const sizeToken = tokens.find(t => /^\d+(\.\d+)?$/.test(t));
    const textQuery = tokens.filter(t => t !== sizeToken).join(' ');
    const likeQuery = `%${textQuery}%`;
    const results = await db
      .select({
        designId: designs.id,
        designName: designs.name,
        metal: designs.metal,
        purityPercent: items.purityPercent,
        categoryName: categories.name,
        totalGrossWeightMg: sql<number>`SUM(${items.grossWeightMg})`,
        availableCount: sql<number>`COUNT(${items.id})`,
        sizeValue: items.sizeValue,
        sizeUnit: items.sizeUnit
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
          like(designs.name, likeQuery),
          sizeToken ? eq(items.sizeValue, Number(sizeToken)) : undefined
        )
      )
      // BLOCK-5 (v1.15): GROUP BY designs.id, items.purity_percent
      .groupBy(designs.id, items.purityPercent, items.sizeValue, items.sizeUnit)
      .orderBy(designs.name, sql`${items.purityPercent} DESC`)
      .limit(20);

    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      sizeUnit: r.sizeUnit as 'INCH'|'MM'|'CM'|'RING_SIZE'|null
    }));
  }
};