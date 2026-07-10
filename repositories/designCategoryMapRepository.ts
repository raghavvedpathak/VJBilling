import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { designCategoryMap } from '../db/schema';
import type { DrizzleTransaction } from '../types/phase2.types';
import * as Crypto from 'expo-crypto';
import { now } from '../utils/now';

type DCMRecord = typeof designCategoryMap.$inferSelect;

export const designCategoryMapRepository = {
  // FIX-DCM-WRITE-1 (v1.46): INSERT OR IGNORE automatically deduplicates.
  // FIX-V718-1: Synchronous execution using .run() inside transactions.
  insert(
    tx: DrizzleTransaction,
    data: { designId: string; categoryId: string; firmId: string }
  ): void {
    tx.insert(designCategoryMap).values({
      id: Crypto.randomUUID(),
      designId: data.designId,
      categoryId: data.categoryId,
      firmId: data.firmId,
      createdAt: now(),
    }).onConflictDoNothing().run(); // Unique constraint handles deduplication silently
  },

  // Operates globally outside a transaction — safely left as async
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

  // Operates globally outside a transaction — safely left as async
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

  // FIX-V718-1: Synchronous execution using .run() inside transactions.
  delete(tx: DrizzleTransaction, designId: string, categoryId: string, firmId: string): void {
    tx.delete(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.designId, designId),
          eq(designCategoryMap.categoryId, categoryId),
          eq(designCategoryMap.firmId, firmId)
        )
      )
      .run();
  }
};