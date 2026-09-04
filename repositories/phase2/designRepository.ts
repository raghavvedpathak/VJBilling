// repositories/phase2/designRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { designs, items, categories } from '@/db/schema';
import type { DrizzleTransaction, Design, DesignStockResult, NewDesign } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface DesignRepository {
  // --- getById (Synchronous inside tx per FIX-P2-SYNC-CONTRACT-1, async outside) ---
  getById(id: string): Promise<Design | null>;
  getById(id: string, firmId: string): Promise<Design | null>;
  getById(tx: DrizzleTransaction, id: string): Design | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): Design | null;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewDesign): Design;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<Design[]>;

  // --- softDelete (Supports both 2-arg and 3-arg calls) ---
  softDelete(tx: DrizzleTransaction, id: string): void;
  softDelete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- update (Supports both 3-arg and 4-arg calls) ---
  update(tx: DrizzleTransaction, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn' | 'updatedAt'>>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Design, 'name' | 'defaultHsn' | 'updatedAt'>>): void;

  // --- searchStock (BLOCK-5 v1.15, RED-7 LIMIT 20, FIX-JOIN-ORDER-1 v1.71, FIX-GAP-P2-SIZE-1 v1.76) ---
  searchStock(firmId: string, query: string): Promise<DesignStockResult[]>;
}

export const designRepository: DesignRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        // 2-arg async call: getById(id, firmId)
        return db
          .select()
          .from(designs)
          .where(and(eq(designs.id, first), eq(designs.firmId, second)))
          .limit(1)
          .then(r => r[0] || null);
      }
      return db
        .select()
        .from(designs)
        .where(eq(designs.id, first))
        .limit(1)
        .then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg call: getById(tx, firmId, id)
      const res = tx
        .select()
        .from(designs)
        .where(and(eq(designs.id, third), eq(designs.firmId, second!)))
        .get();
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
      )
      .orderBy(sql`${designs.name} COLLATE NOCASE ASC`);
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
    third: string | Partial<Pick<Design, 'name' | 'defaultHsn' | 'updatedAt'>>,
    fourth?: Partial<Pick<Design, 'name' | 'defaultHsn' | 'updatedAt'>>
  ): void {
    if (typeof third === 'object' && third !== null) {
      // 3-arg call: update(tx, id, data)
      tx.update(designs)
        .set({ ...third, updatedAt: third.updatedAt ?? now() })
        .where(eq(designs.id, second))
        .run();
    } else {
      // 4-arg call: update(tx, firmId, id, data)
      tx.update(designs)
        .set({ ...fourth, updatedAt: fourth?.updatedAt ?? now() })
        .where(and(eq(designs.id, third as string), eq(designs.firmId, second)))
        .run();
    }
  },

  async searchStock(firmId: string, query: string): Promise<DesignStockResult[]> {
    const tokens = query.trim().split(/\s+/).filter(t => t.length > 0);
    const sizeToken = tokens.find(t => /^\d+(\.\d+)?$/.test(t));
    const textQuery = tokens.filter(t => t !== sizeToken).join(' ');

    const conditions: any[] = [
      eq(designs.firmId, firmId),
    ];

    if (textQuery.length > 0) {
      conditions.push(like(designs.name, `%${textQuery}%`));
    }

    if (sizeToken) {
      conditions.push(eq(items.sizeValue, Number(sizeToken)));
    }

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
        sizeUnit: items.sizeUnit,
      })
      .from(designs)
      // FIX-JOIN-ORDER-1: items joined before categories
      .innerJoin(
        items,
        and(
          eq(items.designId, designs.id),
          eq(items.status, 'AVAILABLE'),
          eq(items.firmId, firmId)
        )
      )
      // FIX-CAT-ITEM-FK (v1.42): items own category, join via items.categoryId
      .innerJoin(
        categories,
        eq(categories.id, items.categoryId)
      )
      .where(and(...conditions))
      // BLOCK-5 (v1.15): GROUP BY designs.id, items.purityPercent
      .groupBy(designs.id, items.purityPercent, items.sizeValue, items.sizeUnit)
      .orderBy(sql`${designs.name} COLLATE NOCASE ASC`, sql`${items.purityPercent} DESC`, sql`${items.sizeValue} ASC`)
      .limit(20); // RED-7: Mandatory limit 20

    return results.map(r => ({
      ...r,
      totalGrossWeightMg: Number(r.totalGrossWeightMg) || 0,
      availableCount: Number(r.availableCount) || 0,
      metal: r.metal as 'GOLD' | 'SILVER',
      sizeUnit: r.sizeUnit as 'INCH' | 'MM' | 'CM' | 'RING_SIZE' | null,
    }));
  },
};