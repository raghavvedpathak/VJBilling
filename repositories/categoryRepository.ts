import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { categories } from '../db/schema';
import type { DrizzleTransaction, Category } from '../types/phase2.types';
import { now } from '../utils/now';

type NewCategory = typeof categories.$inferInsert;

export const categoryRepository = {
  async insert(tx: DrizzleTransaction, data: NewCategory): Promise<Category> {
    const [inserted] = await tx.insert(categories).values(data).returning();
    return inserted;
  },

  async getById(tx: DrizzleTransaction, firmId: string, id: string): Promise<Category | null> {
    const [category] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)))
      .limit(1);

    return category || null;
  },

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

  async update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Pick<Category, 'name' | 'lowStockThreshold'>>): Promise<void> {
    await tx
      .update(categories)
      .set({ ...data, updatedAt: now() })
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)));
  },

  async softDelete(tx: DrizzleTransaction, firmId: string, id: string): Promise<void> {
    await tx
      .update(categories)
      .set({ isActive: 0, updatedAt: now() })
      .where(and(eq(categories.id, id), eq(categories.firmId, firmId)));
  }
};
