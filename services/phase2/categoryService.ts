// services/phase2/categoryService.ts — Phase 2 v2.24 Canonical Service

import { db } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { ERR } from '@/constants/errorCodes';
import * as Crypto from 'expo-crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { categories } from '@/db/schema';
import type { CreateCategoryInput, Category, DrizzleTransaction } from '@/types/phase2/phase2.types';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';

// Step 2 / FIX-MISSING-CREATE-1 (v1.95)
export function generateCategoryCode(tx: DrizzleTransaction, firmId: string): string {
  const last = tx
    .select({ code: categories.code })
    .from(categories)
    .where(eq(categories.firmId, firmId))
    .orderBy(desc(categories.code))
    .limit(1)
    .get();

  let nextNum = last ? parseInt(last.code.replace('CAT', ''), 10) + 1 : 1;
  const MAX_CODE_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const candidate = `CAT${String(nextNum).padStart(4, '0')}`;
    const collision = tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.code, candidate), eq(categories.firmId, firmId)))
      .get();

    if (!collision) return candidate;
    nextNum += 1;
  }

  throw new Error(ERR.CATEGORY_CODE_GENERATION_FAILED);
}

// --- softDeleteCategory (Step 2 / FIX-CAT-DELETE-GUARD-1 v1.44 / v1.70) ---
export async function softDeleteCategory(categoryId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  await db.transaction(async (tx) => {
    const cat = categoryRepository.getById(tx, firmId, categoryId);
    if (!cat || cat.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

    // Block if any non-terminal items reference this category
    const activeItems = itemRepository.findByCategoryId(tx, categoryId, firmId);
    const blocked = activeItems.filter((i) =>
      ['AVAILABLE', 'DRAFT', 'SENT_TO_KARIGAR', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
    );

    if (blocked.length > 0) throw new Error(ERR.CATEGORY_HAS_ACTIVE_ITEMS);

    categoryRepository.softDelete(tx, firmId, categoryId);

    auditRepository.log(tx, {
      eventType: 'CATEGORY_SOFT_DELETED',
      firmId,
      entityId: categoryId,
      deviceId,
      payload: { categoryId, name: cat.name },
    });
  });

  useMastersSyncStore.getState().notifyCategoryChanged();
}

// --- createCategory (Step 2 / FIX-MISSING-CREATE-1 v1.95) ---
export async function createCategory(input: CreateCategoryInput, firmId: string): Promise<Category> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const sanitizedName = sanitizeText(input.name); // GAP-P1ALIGN-4 v1.74
  const deviceId = await getDeviceId();

  const result = db.transaction((tx) => {
    // Case-insensitive check matching uq_category_firm_name index
    const existing = tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.firmId, firmId),
          sql`lower(${categories.name}) = lower(${sanitizedName})`
        )
      )
      .limit(1)
      .get() as Category | undefined;

    if (existing) {
      if (existing.isActive === 1) {
        throw new Error(ERR.CATEGORY_NAME_DUPLICATE);
      } else {
        // Restore soft-deleted category
        categoryRepository.update(tx, firmId, existing.id, {
          name: sanitizedName,
        });

        // Reactivate it
        tx.update(categories)
          .set({ isActive: 1, updatedAt: now() })
          .where(and(eq(categories.id, existing.id), eq(categories.firmId, firmId)))
          .run();

        const restored = categoryRepository.getById(tx, firmId, existing.id)!;

        auditRepository.log(tx, {
          eventType: 'CATEGORY_CREATED',
          firmId,
          entityId: restored.id,
          deviceId,
          payload: { categoryId: restored.id, name: restored.name, code: restored.code, restored: true },
        });

        return restored;
      }
    }

    const code = generateCategoryCode(tx, firmId);

    try {
      const category = categoryRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId,
        name: sanitizedName,
        code,
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });

      auditRepository.log(tx, {
        eventType: 'CATEGORY_CREATED',
        firmId,
        entityId: category.id,
        deviceId,
        payload: { categoryId: category.id, name: category.name, code: category.code },
      });

      return category;
    } catch (e: any) {
      if (
        e.message?.includes('UNIQUE constraint failed') ||
        e.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        String(e).includes('UNIQUE')
      ) {
        throw new Error(ERR.CATEGORY_NAME_DUPLICATE);
      }
      throw e;
    }
  });

  useMastersSyncStore.getState().notifyCategoryChanged();
  return result;
}

// --- updateCategory (Step 2 / FIX-UPDATE-CAT-1 v1.44) ---
export async function updateCategory(categoryId: string, firmId: string, name: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  await db.transaction(async (tx) => {
    const cat = categoryRepository.getById(tx, firmId, categoryId);
    if (!cat || cat.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

    const sanitizedName = sanitizeText(name); // GAP-P1ALIGN-4 (v1.74): FIX-VSEC-7

    try {
      categoryRepository.update(tx, firmId, categoryId, { name: sanitizedName });
    } catch (e: any) {
      if (
        e.message?.includes('UNIQUE constraint failed') ||
        e.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        String(e).includes('UNIQUE')
      ) {
        throw new Error(ERR.CATEGORY_NAME_DUPLICATE);
      }
      throw e;
    }

    auditRepository.log(tx, {
      eventType: 'CATEGORY_UPDATED',
      firmId,
      entityId: categoryId,
      deviceId,
      payload: { categoryId, oldName: cat.name, newName: sanitizedName },
    });
  });

  useMastersSyncStore.getState().notifyCategoryChanged();
}

export const categoryService = {
  softDeleteCategory,
  createCategory,
  updateCategory,
};