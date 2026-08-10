// repositories/designRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { designs, items, categories } from '../db/schema';
import type { DrizzleTransaction, Design, DesignStockResult, NewDesign } from '../types/phase2.types';
import { now } from '../utils/now';

export interface DesignRepository {
  // --- getById (Overloaded to support 2-arg and 3-arg calls) ---
  getById(id: string): Promise<Design | null>;
  getById(tx: DrizzleTransaction, id: string): Design | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): Design | null;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewDesign): Design;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<Design[]>;

  // --- softDelete (Overloaded to support 2-arg and 3-arg calls) ---
  softDelete(tx: DrizzleTransaction, id: string): void;
  softDelete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- update (Overloaded to support 3-arg and 4-arg calls) ---
  update(tx: DrizzleTransaction, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>>): void;

  // --- searchStock ---
  searchStock(firmId: string, query: string): Promise<DesignStockResult[]>;
}

export const designRepository: DesignRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(designs).where(eq(designs.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg call: getById(tx, firmId, id)
      const res = tx.select().from(designs).where(and(eq(designs.id, third), eq(designs.firmId, second!))).get();
      return (res as Design) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(designs).where(eq(designs.id, second!)).get();
    return (res as Design) || null;
  },

  insert(tx: DrizzleTransaction, data: NewDesign): Design {
    tx.insert(designs).values(data).run();
    const result = tx.select().from(designs).where(eq(designs.id, data.id)).limit(1).get();
    return result as Design;
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

  softDelete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      // 2-arg call: softDelete(tx, id)
      tx.update(designs)
        .set({ isActive: 0, updatedAt: now() })
        .where(eq(designs.id, second))
        .run();
    } else {
      // 3-arg call: softDelete(tx, firmId, id)
      tx.update(designs)
        .set({ isActive: 0, updatedAt: now() })
        .where(and(eq(designs.id, third), eq(designs.firmId, second)))
        .run();
    }
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>>,
    fourth?: Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>>
  ): void {
    if (typeof third === 'object') {
      // 3-arg call: update(tx, id, data)
      tx.update(designs)
        .set({ ...third, updatedAt: now() })
        .where(eq(designs.id, second))
        .run();
    } else {
      // 4-arg call: update(tx, firmId, id, data)
      tx.update(designs)
        .set({ ...fourth, updatedAt: now() })
        .where(and(eq(designs.id, third as string), eq(designs.firmId, second)))
        .run();
    }
  },

  async searchStock(firmId: string, query: string): Promise<DesignStockResult[]> {
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
      // BLOCK-5 (v1.15): GROUP BY designs.id, items.purityPercent
      .groupBy(designs.id, items.purityPercent, items.sizeValue, items.sizeUnit)
      .orderBy(designs.name, sql`${items.purityPercent} DESC`)
      .limit(20); // RED-7

    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      sizeUnit: r.sizeUnit as 'INCH'|'MM'|'CM'|'RING_SIZE'|null
    }));
  }
};