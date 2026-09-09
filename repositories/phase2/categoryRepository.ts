// repositories/phase2/categoryRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories } from '@/db/schema';
import type { DrizzleTransaction, Category, NewCategory } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface CategoryRepository {
  // --- getById (Synchronous inside tx per FIX-P2-SYNC-CONTRACT-1, async outside) ---
  getById(id: string): Promise<Category | null>;
  getById(id: string, firmId: string): Promise<Category | null>;
  getById(tx: DrizzleTransaction, id: string): Category | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): Category | null;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewCategory): Category;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<Category[]>;

  // --- update ---
  update(tx: DrizzleTransaction, id: string, data: Partial<Pick<Category, 'name' | 'updatedAt'>>): void;
  update(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<Pick<Category, 'name' | 'updatedAt'>>): void;

  // --- softDelete ---
  softDelete(tx: DrizzleTransaction, id: string): void;
  softDelete(tx: DrizzleTransaction, id: string, firmId: string): void;
}

export const categoryRepository: CategoryRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    // Standalone async call: getById(id, firmId?)
    if (typeof first === 'string') {
      const id = first;
      const firmId = second;
      if (firmId !== undefined) {
        return db
          .select()
          .from(categories)
          .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
          .limit(1)
          .then((r) => r[0] || null);
      }
      return db
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1)
        .then((r) => r[0] || null);
    }

    // Synchronous transaction call: getById(tx, id, firmId?)
    const tx = first as DrizzleTransaction;
    const id = second!;
    const firmId = third;

    if (firmId !== undefined) {
      const res = tx
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
        .get();
      return (res as Category) || null;
    }

    const res = tx
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .get();
    return (res as Category) || null;
  },

  insert(tx: DrizzleTransaction, data: NewCategory): Category {
    tx.insert(categories).values(data).run();
    const result = tx
      .select()
      .from(categories)
      .where(eq(categories.id, data.id))
      .limit(1)
      .get();
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
      )
      .orderBy(sql`${categories.name} COLLATE NOCASE ASC`);
  },

  update(
    tx: DrizzleTransaction,
    id: string,
    third: string | Partial<Pick<Category, 'name' | 'updatedAt'>>,
    fourth?: Partial<Pick<Category, 'name' | 'updatedAt'>>
  ): void {
    if (typeof third === 'object' && third !== null) {
      // update(tx, id, data)
      tx.update(categories)
        .set({ ...third, updatedAt: third.updatedAt ?? now() })
        .where(eq(categories.id, id))
        .run();
    } else {
      // update(tx, id, firmId, data)
      const firmId = third as string;
      const data = fourth ?? {};
      tx.update(categories)
        .set({ ...data, updatedAt: data.updatedAt ?? now() })
        .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
        .run();
    }
  },

  softDelete(tx: DrizzleTransaction, id: string, firmId?: string): void {
    if (firmId === undefined) {
      // softDelete(tx, id)
      tx.update(categories)
        .set({ isActive: 0, updatedAt: now() })
        .where(eq(categories.id, id))
        .run();
    } else {
      // softDelete(tx, id, firmId)
      tx.update(categories)
        .set({ isActive: 0, updatedAt: now() })
        .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
        .run();
    }
  },
};