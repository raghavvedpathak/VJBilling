// repositories/phase2/stoneRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { stones, items } from '@/db/schema';
import type { DrizzleTransaction, Stone, NewStone } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface StoneRepository {
  // --- insert (Step 4 / createStone) ---
  insert(tx: DrizzleTransaction, data: NewStone): Stone;

  // --- getById (Overloaded for (id), (tx, id), and (tx, id, firmId) / (tx, firmId, id)) ---
  getById(id: string): Promise<Stone | null>;
  getById(tx: DrizzleTransaction, id: string): Stone | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): Stone | null;

  // --- findByFirmId (Step 4) ---
  findByFirmId(firmId: string): Promise<Stone[]>;

  // --- softDelete (Overloaded for (tx, id) and (tx, id, firmId) / (tx, firmId, id)) ---
  softDelete(tx: DrizzleTransaction, id: string): void;
  softDelete(tx: DrizzleTransaction, id: string, firmId: string): void;

  // --- update ---
  update(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewStone>): Stone;

  // --- isStoneUsedInItems ---
  isStoneUsedInItems(tx: DrizzleTransaction, stoneId: string, firmId: string): boolean;
}

export const stoneRepository: StoneRepository = {
  // --- insert (Step 4 / createStone) ---
  insert(tx: DrizzleTransaction, data: NewStone): Stone {
    tx.insert(stones).values(data).run();
    const result = tx.select().from(stones).where(eq(stones.id, data.id!)).get();
    return result as Stone;
  },

  // --- getById (Overloaded for (id), (tx, id), and (tx, id, firmId) / (tx, firmId, id)) ---
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(stones).where(eq(stones.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // Handles both (tx, id, firmId) and (tx, firmId, id)
      const res = tx
        .select()
        .from(stones)
        .where(
          and(
            eq(stones.id, second!),
            eq(stones.firmId, third)
          )
        )
        .get();
      if (res) return res as Stone;

      const resSwapped = tx
        .select()
        .from(stones)
        .where(
          and(
            eq(stones.id, third),
            eq(stones.firmId, second!)
          )
        )
        .get();
      return (resSwapped as Stone) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(stones).where(eq(stones.id, second!)).get();
    return (res as Stone) || null;
  },

  // --- findByFirmId (Step 4) ---
  async findByFirmId(firmId: string): Promise<Stone[]> {
    return db
      .select()
      .from(stones)
      .where(
        and(
          eq(stones.firmId, firmId),
          eq(stones.isActive, 1)
        )
      );
  },

  // --- softDelete (Overloaded for (tx, id) and (tx, id, firmId) / (tx, firmId, id)) ---
  softDelete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third !== undefined) {
      // Handles 3-arg call with firmId check
      tx.update(stones)
        .set({ isActive: 0, updatedAt: now() })
        .where(
          or(
            and(eq(stones.id, second), eq(stones.firmId, third)),
            and(eq(stones.id, third), eq(stones.firmId, second))
          )
        )
        .run();
    } else {
      // 2-arg call: softDelete(tx, id)
      tx.update(stones)
        .set({ isActive: 0, updatedAt: now() })
        .where(eq(stones.id, second))
        .run();
    }
  },

  update(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewStone>): Stone {
    tx.update(stones)
      .set({ ...data, updatedAt: now() })
      .where(and(eq(stones.id, id), eq(stones.firmId, firmId)))
      .run();
    const result = tx.select().from(stones).where(and(eq(stones.id, id), eq(stones.firmId, firmId))).get();
    return result as Stone;
  },

  isStoneUsedInItems(tx: DrizzleTransaction, stoneId: string, firmId: string): boolean {
    const res = tx
      .select({ count: items.id })
      .from(items)
      .where(
        and(
          eq(items.primaryStoneId, stoneId),
          eq(items.firmId, firmId)
        )
      )
      .limit(1)
      .get();
    return !!res;
  }
};