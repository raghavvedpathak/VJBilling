import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { categories } from '../db/schema';
import type { DrizzleTransaction, Category } from '../types/phase2.types';
import { now } from '../utils/now';

type NewCategory = typeof categories.$inferInsert;

export const categoryRepository = {
  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: NewCategory): Category {
    tx.insert(categories).values(data).run();
    const result = tx.select().from(categories).where(eq(categories.id, data.id)).limit(1).get();
    return result as unknown as Category;
  },

  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): Category | null {
    const category = tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
      .limit(1)
      .get();

    return (category as unknown as Category) || null;
  },

  // Operates globally outside a transaction — safely left as async
  async findByFirmId(firmId: string): Promise<Category[]> {
    return db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.firmId, firmId),
          eq(categories.isActive, 1) // Only active categories
        )
      );
  },

  // FIX-V718-1: Synchronous execution using .run()
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Category, 'name'>>): void {
    tx.update(categories)
      .set({ ...data, updatedAt: now() })
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
      .run();
  },

  // FIX-V718-1: Synchronous execution using .run()
  softDelete(tx: DrizzleTransaction, firmId: string, id: string): void {
    tx.update(categories)
      .set({ isActive: 0, updatedAt: now() })
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
      .run();
  }
};