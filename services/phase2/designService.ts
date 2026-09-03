// services/phase2/designService.ts — Phase 2 v2.24 Canonical Service
// Aligned with FIX-LOOSESTOCK-STOCKTYPE-1 (v2.24) & FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13)

import { db } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { ERR } from '@/constants/errorCodes';
import * as Crypto from 'expo-crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { designs, designCategoryMap, designPurityThresholds, looseStockLots } from '@/db/schema';
import type { CreateDesignInput, Design, DrizzleTransaction } from '@/types/phase2/phase2.types';

// Step 3 / FIX-DESIGN-VALIDATE-1: 1 or 2 words only, letters only
export function validateDesignName(name: string): void {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);
  if (!words.every((w) => /^[A-Za-z]+$/.test(w))) throw new Error(ERR.DESIGN_NAME_INVALID);
}

// Step 3 / FIX-MISSING-CREATE-1 (v1.95): DES0001 sequential code generator with retry deduping
export function generateDesignCode(tx: DrizzleTransaction, firmId: string): string {
  const last = tx
    .select({ code: designs.code })
    .from(designs)
    .where(eq(designs.firmId, firmId))
    .orderBy(desc(designs.code))
    .limit(1)
    .get();

  let nextNum = last ? parseInt(last.code.replace('DES', ''), 10) + 1 : 1;
  const MAX_CODE_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const candidate = `DES${String(nextNum).padStart(4, '0')}`;
    const collision = tx
      .select({ id: designs.id })
      .from(designs)
      .where(and(eq(designs.code, candidate), eq(designs.firmId, firmId)))
      .get();

    if (!collision) return candidate;
    nextNum += 1;
  }

  throw new Error(ERR.DESIGN_CODE_GENERATION_FAILED);
}

// --- createDesign (Step 3 / FIX-MISSING-CREATE-1 v1.95 / FIX-LOOSESTOCK-STOCKTYPE-1 v2.24) ---
export async function createDesign(
  input: CreateDesignInput & { categoryId?: string },
  firmId: string
): Promise<Design> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    validateDesignName(input.name); // throws DESIGN_NAME_INVALID
    const sanitizedName = sanitizeText(input.name);

    // Check if a design with the same name and metal already exists for this firm
    const existing = tx
      .select()
      .from(designs)
      .where(
        and(
          eq(designs.firmId, firmId),
          sql`lower(${designs.name}) = lower(${sanitizedName})`,
          eq(designs.metal, input.metal)
        )
      )
      .limit(1)
      .get() as Design | undefined;

    if (existing) {
      if (existing.isActive === 1) {
        throw new Error(ERR.DESIGN_NAME_TAKEN);
      } else {
        // Restore design
        tx.update(designs)
          .set({
            isActive: 1,
            stockType: input.stockType ?? existing.stockType ?? 'SERIALIZED',
            defaultHsn: input.defaultHsn ?? existing.defaultHsn,
            updatedAt: now(),
          })
          .where(and(eq(designs.id, existing.id), eq(designs.firmId, firmId)))
          .run();

        // Reconnect design-category mapping if categoryId is provided
        tx.delete(designCategoryMap)
          .where(and(eq(designCategoryMap.designId, existing.id), eq(designCategoryMap.firmId, firmId)))
          .run();

        if (input.categoryId) {
          designCategoryMapRepository.insert(tx, {
            designId: existing.id,
            categoryId: input.categoryId,
            firmId,
          });
        }

        const restored = designRepository.getById(tx, firmId, existing.id)!;

        auditRepository.log(tx, {
          eventType: 'DESIGN_CREATED',
          firmId,
          entityId: restored.id,
          deviceId,
          payload: {
            designId: restored.id,
            name: restored.name,
            code: restored.code,
            metal: restored.metal,
            restored: true,
          },
        });

        return restored;
      }
    }

    const code = generateDesignCode(tx, firmId);

    try {
      // FIX-LOOSESTOCK-STOCKTYPE-1 (v2.24): pass stockType explicitly
      const design = designRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId,
        name: sanitizedName,
        code,
        metal: input.metal,
        stockType: input.stockType ?? 'SERIALIZED',
        defaultHsn: input.defaultHsn ?? null,
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });

      if (input.categoryId) {
        designCategoryMapRepository.insert(tx, {
          designId: design.id,
          categoryId: input.categoryId,
          firmId,
        });
      }

      auditRepository.log(tx, {
        eventType: 'DESIGN_CREATED',
        firmId,
        entityId: design.id,
        deviceId,
        payload: {
          designId: design.id,
          name: design.name,
          code: design.code,
          metal: design.metal,
        },
      });

      return design;
    } catch (e: any) {
      if (
        e.message?.includes('UNIQUE constraint failed') ||
        e.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        String(e).includes('UNIQUE')
      ) {
        throw new Error(ERR.DESIGN_NAME_TAKEN);
      }
      throw e;
    }
  });
}

// --- softDeleteDesign (Step 3 / FIX-V1-3 v1.23 / FEAT-LOOSE-STOCK-1 v2.23) ---
export async function softDeleteDesign(designId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

    // 1. Guard against active serialized items
    const activeItems = itemRepository.findByDesignId(tx, designId, firmId);
    const blockedItems = activeItems.filter((i) =>
      ['AVAILABLE', 'DRAFT', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'SENT_TO_KARIGAR', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
    );

    if (blockedItems.length > 0) throw new Error(ERR.DESIGN_HAS_ACTIVE_ITEMS);

    // 2. Guard against active loose stock lots (v2.23)
    const activeLooseLots = tx
      .select({ id: looseStockLots.id, pieceCount: looseStockLots.pieceCount })
      .from(looseStockLots)
      .where(
        and(
          eq(looseStockLots.designId, designId),
          eq(looseStockLots.firmId, firmId),
          eq(looseStockLots.status, 'ACTIVE')
        )
      )
      .all();

    const hasLooseStock = activeLooseLots.some((lot) => lot.pieceCount > 0);
    if (hasLooseStock) throw new Error(ERR.DESIGN_HAS_ACTIVE_ITEMS);

    designRepository.softDelete(tx, firmId, designId);

    auditRepository.log(tx, {
      eventType: 'DESIGN_SOFT_DELETED',
      firmId,
      entityId: designId,
      deviceId,
      payload: { designId, name: design.name },
    });
  });
}

// --- updateDesign (Step 3 / FIX-UPDATE-DES-1 v1.44) ---
export async function updateDesign(
  designId: string,
  firmId: string,
  input: { name?: string; defaultHsn?: string | null }
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

    const updateData: Partial<Pick<Design, 'name' | 'defaultHsn' | 'updatedAt'>> = {
      updatedAt: now(),
    };

    if (input.name !== undefined) {
      validateDesignName(input.name);
      updateData.name = sanitizeText(input.name);
    }

    if (input.defaultHsn !== undefined) {
      updateData.defaultHsn = input.defaultHsn;
    }

    try {
      designRepository.update(tx, firmId, designId, updateData);
    } catch (e: any) {
      if (
        e.message?.includes('UNIQUE constraint failed') ||
        e.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        String(e).includes('UNIQUE')
      ) {
        throw new Error(ERR.DESIGN_NAME_TAKEN);
      }
      throw e;
    }

    auditRepository.log(tx, {
      eventType: 'DESIGN_UPDATED',
      firmId,
      entityId: designId,
      deviceId,
      payload: { designId, changes: input },
    });
  });
}

// --- updateDesignPurityLowStockThreshold (v2.13 FIX-LOWSTOCK-PURITYGRAIN-1) ---
export async function updateDesignPurityLowStockThreshold(
  designId: string,
  firmId: string,
  purityPercent: number,
  threshold: number | null
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    throw new Error(ERR.DESIGN_PURITY_LOW_STOCK_THRESHOLD_INVALID);
  }

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

    const existing = tx
      .select()
      .from(designPurityThresholds)
      .where(
        and(
          eq(designPurityThresholds.designId, designId),
          eq(designPurityThresholds.purityPercent, purityPercent)
        )
      )
      .get();

    const oldThreshold = existing ? existing.lowStockThreshold : null;

    if (threshold !== null) {
      tx.insert(designPurityThresholds)
        .values({
          designId,
          purityPercent,
          lowStockThreshold: threshold,
        })
        .onConflictDoUpdate({
          target: [designPurityThresholds.designId, designPurityThresholds.purityPercent],
          set: { lowStockThreshold: threshold },
        })
        .run();
    } else {
      tx.delete(designPurityThresholds)
        .where(
          and(
            eq(designPurityThresholds.designId, designId),
            eq(designPurityThresholds.purityPercent, purityPercent)
          )
        )
        .run();
    }

    auditRepository.log(tx, {
      eventType: 'DESIGN_UPDATED',
      firmId,
      entityId: designId,
      deviceId,
      payload: {
        designId,
        purityPercent,
        oldThreshold,
        newThreshold: threshold,
      },
    });
  });
}

// Backward-compatibility alias
export async function updateDesignLowStockThreshold(
  designId: string,
  firmId: string,
  thresholdOrPurity: number | null,
  maybeThreshold?: number | null
): Promise<void> {
  if (typeof thresholdOrPurity === 'number' && typeof maybeThreshold !== 'undefined') {
    return updateDesignPurityLowStockThreshold(designId, firmId, thresholdOrPurity, maybeThreshold);
  }
  // Fallback default purity (22K = 91.6) if called via legacy signature
  return updateDesignPurityLowStockThreshold(designId, firmId, 91.6, thresholdOrPurity);
}

export const designService = {
  createDesign,
  softDeleteDesign,
  updateDesign,
  updateDesignPurityLowStockThreshold,
  updateDesignLowStockThreshold,
};