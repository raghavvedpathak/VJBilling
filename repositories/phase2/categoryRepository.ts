// repositories/phase2/categoryRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories } from '@/db/schema';
import type { DrizzleTransaction, Category, NewCategory } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface CategoryRepository {
  // --- getById (Overloaded to support 2-arg and 3-arg calls) ---
  getById(id: string): Promise<Category | null>;
  getById(tx: DrizzleTransaction, id: string): Category | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): Category | null;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewCategory): Category;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<Category[]>;

  // --- update (Overloaded to support 3-arg and 4-arg calls) ---
  update(tx: DrizzleTransaction, id: string, data: Partial<Pick<Category, 'name'>>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Category, 'name'>>): void;

  // --- softDelete (Overloaded to support 2-arg and 3-arg calls) ---
  softDelete(tx: DrizzleTransaction, id: string): void;
  softDelete(tx: DrizzleTransaction, firmId: string, id: string): void;
}

export const categoryRepository: CategoryRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(categories).where(eq(categories.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg call: getById(tx, firmId, id)
      const res = tx.select().from(categories).where(and(eq(categories.id, third), eq(categories.firmId, second!))).get();
      return (res as Category) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(categories).where(eq(categories.id, second!)).get();
    return (res as Category) || null;
  },

  insert(tx: DrizzleTransaction, data: NewCategory): Category {
    tx.insert(categories).values(data).run();
    const result = tx.select().from(categories).where(eq(categories.id, data.id)).limit(1).get();
    return result as Category;
  },

  async findByFirmId(firmId: string): Promise<Category[]> {
    return db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.firmId, firmId),
          eq(categories.isActive, 1)
        )
      );
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<Pick<Category, 'name'>>,
    fourth?: Partial<Pick<Category, 'name'>>
  ): void {
    if (typeof third === 'object') {
      // 3-arg call: update(tx, id, data)
      tx.update(categories)
        .set({ ...third, updatedAt: now() })
        .where(eq(categories.id, second))
        .run();
    } else {
      // 4-arg call: update(tx, firmId, id, data)
      tx.update(categories)
        .set({ ...fourth, updatedAt: now() })
        .where(and(eq(categories.id, third as string), eq(categories.firmId, second)))
        .run();
    }
  },

  softDelete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      // 2-arg call: softDelete(tx, id)
      tx.update(categories)
        .set({ isActive: 0, updatedAt: now() })
        .where(eq(categories.id, second))
        .run();
    } else {
      // 3-arg call: softDelete(tx, firmId, id)
      tx.update(categories)
        .set({ isActive: 0, updatedAt: now() })
        .where(and(eq(categories.id, third), eq(categories.firmId, second)))
        .run();
    }
  }
};