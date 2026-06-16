import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { designCategoryMap } from '../db/schema';
import type { DrizzleTransaction } from '../types/phase2.types';
import * as Crypto from 'expo-crypto';
import { now } from '../utils/now';

// designCategoryMapRepository: insert, findByDesignId, findByCategory, delete

type DCMRecord = typeof designCategoryMap.$inferSelect;

export const designCategoryMapRepository = {
  // FIX-DCM-WRITE-1 (v1.46): INSERT OR IGNORE automatically deduplicates.
  // We use .onConflictDoNothing() in Drizzle SQLite to mimic this behaviour safely.
  async insert(
    tx: DrizzleTransaction,
    data: { designId: string; categoryId: string; firmId: string }
  ): Promise<void> {
    await tx.insert(designCategoryMap).values({
      id: Crypto.randomUUID(),
      designId: data.designId,
      categoryId: data.categoryId,
      firmId: data.firmId,
      createdAt: now(),
    }).onConflictDoNothing(); // Unique constraint handles deduplication silently
  },

  async findByDesignId(designId: string, firmId: string): Promise<DCMRecord[]> {
    return db
      .select()
      .from(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.designId, designId),
          eq(designCategoryMap.firmId, firmId)
        )
      );
  },

  async findByCategory(categoryId: string, firmId: string): Promise<DCMRecord[]> {
    return db
      .select()
      .from(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.categoryId, categoryId),
          eq(designCategoryMap.firmId, firmId)
        )
      );
  },

  async delete(tx: DrizzleTransaction, designId: string, categoryId: string, firmId: string): Promise<void> {
    await tx
      .delete(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.designId, designId),
          eq(designCategoryMap.categoryId, categoryId),
          eq(designCategoryMap.firmId, firmId)
        )
      );
  }
};
