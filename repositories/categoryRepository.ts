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

  async getById(txOrId: DrizzleTransaction | string, id?: string): Promise<Category | null> {
    let tx: DrizzleTransaction | typeof db;
    let categoryId: string;

    if (typeof txOrId === 'string') {
      tx = db;
      categoryId = txOrId;
    } else {
      tx = txOrId as DrizzleTransaction;
      categoryId = id as string;
    }

    const [category] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
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

  async update(tx: DrizzleTransaction, id: string, data: Partial<Pick<Category, 'name' | 'lowStockThreshold'>>): Promise<void> {
    await tx
      .update(categories)
      .set({ ...data, updatedAt: now() })
      .where(eq(categories.id, id));
  },

  async softDelete(tx: DrizzleTransaction, id: string): Promise<void> {
    await tx
      .update(categories)
      .set({ isActive: 0, updatedAt: now() })
      .where(eq(categories.id, id));
  }
};
