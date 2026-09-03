// repositories/phase2/designCategoryMapRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { designCategoryMap } from '@/db/schema';
import type { DrizzleTransaction, DesignCategoryMap } from '@/types/phase2/phase2.types';
import * as Crypto from 'expo-crypto';
import { now } from '@/utils/now';

export interface DesignCategoryMapRepository {
  // --- insert (FIX-DCM-WRITE-1 v1.46 / Step 3.5 & Step 6) ---
  insert(
    tx: DrizzleTransaction,
    data: { designId: string; categoryId: string; firmId: string; id?: string; createdAt?: string }
  ): void;

  // --- findByDesignId (Sync tx overload and async standalone) ---
  findByDesignId(designId: string, firmId: string): Promise<DesignCategoryMap[]>;
  findByDesignId(tx: DrizzleTransaction, designId: string, firmId: string): DesignCategoryMap[];

  // --- findByCategory (Sync tx overload and async standalone) ---
  findByCategory(categoryId: string, firmId: string): Promise<DesignCategoryMap[]>;
  findByCategory(tx: DrizzleTransaction, categoryId: string, firmId: string): DesignCategoryMap[];

  // --- delete (FIX-V718-1) ---
  delete(tx: DrizzleTransaction, designId: string, categoryId: string, firmId: string): void;
}

export const designCategoryMapRepository: DesignCategoryMapRepository = {
  // --- insert (FIX-DCM-WRITE-1 v1.46 / Step 3.5 & Step 6) ---
  // Accepts id/createdAt from createItem() or auto-generates if omitted.
  // .onConflictDoNothing() handles UNIQUE(designId, categoryId, firmId) deduplication silently.
  insert(
    tx: DrizzleTransaction,
    data: { designId: string; categoryId: string; firmId: string; id?: string; createdAt?: string }
  ): void {
    tx.insert(designCategoryMap)
      .values({
        id: data.id ?? Crypto.randomUUID(),
        designId: data.designId,
        categoryId: data.categoryId,
        firmId: data.firmId,
        createdAt: data.createdAt ?? now(),
      })
      .onConflictDoNothing()
      .run();
  },

  // --- findByDesignId (Sync tx overload and async standalone) ---
  findByDesignId(
    first: DrizzleTransaction | string,
    second: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(designCategoryMap)
        .where(
          and(
            eq(designCategoryMap.designId, first),
            eq(designCategoryMap.firmId, second)
          )
        )
        .orderBy(designCategoryMap.createdAt);
    }
    const tx = first as DrizzleTransaction;
    const designId = second;
    const firmId = third!;
    return tx
      .select()
      .from(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.designId, designId),
          eq(designCategoryMap.firmId, firmId)
        )
      )
      .orderBy(designCategoryMap.createdAt)
      .all() as DesignCategoryMap[];
  },

  // --- findByCategory (Sync tx overload and async standalone) ---
  findByCategory(
    first: DrizzleTransaction | string,
    second: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(designCategoryMap)
        .where(
          and(
            eq(designCategoryMap.categoryId, first),
            eq(designCategoryMap.firmId, second)
          )
        )
        .orderBy(designCategoryMap.createdAt);
    }
    const tx = first as DrizzleTransaction;
    const categoryId = second;
    const firmId = third!;
    return tx
      .select()
      .from(designCategoryMap)
      .where(
        and(
          eq(designCategoryMap.categoryId, categoryId),
          eq(designCategoryMap.firmId, firmId)
        )
      )
      .orderBy(designCategoryMap.createdAt)
      .all() as DesignCategoryMap[];
  },

  // --- delete (FIX-V718-1) ---
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
  },
};