// services/phase2/designService.ts — Phase 2 v2.11 Canonical Service

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
import { eq, and, desc } from 'drizzle-orm';
import { designs, designCategoryMap } from '@/db/schema';
import type { CreateDesignInput, Design, DrizzleTransaction } from '@/types/phase2/phase2.types';

// Step 3 / FIX-DESIGN-VALIDATE-1
export function validateDesignName(name: string): void {
  const words = name.trim().split(' ').filter(w => w.length > 0);
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);
  if (!words.every(w => /^[A-Za-z]+$/.test(w))) throw new Error(ERR.DESIGN_NAME_INVALID);
}

// Step 3 / FIX-MISSING-CREATE-1 (v1.95)
function generateDesignCode(tx: DrizzleTransaction, firmId: string): string {
  const last = tx.select({ code: designs.code }).from(designs)
    .where(eq(designs.firmId, firmId)).orderBy(desc(designs.code)).limit(1).get();
  let nextNum = last ? parseInt(last.code.replace('DES', ''), 10) + 1 : 1;
  const MAX_CODE_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const candidate = `DES${String(nextNum).padStart(4, '0')}`;
    const collision = tx.select({ id: designs.id }).from(designs)
      .where(and(eq(designs.code, candidate), eq(designs.firmId, firmId))).get();
    if (!collision) return candidate;
    nextNum += 1;
  }
  throw new Error(ERR.DESIGN_CODE_GENERATION_FAILED);
}

export const designService = {
  // --- createDesign (Step 3 / FIX-MISSING-CREATE-1 v1.95) ---
  async createDesign(input: CreateDesignInput & { categoryId?: string }, firmId: string): Promise<Design> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();     // GUARD 2

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      validateDesignName(input.name); // throws DESIGN_NAME_INVALID
      const sanitizedName = sanitizeText(input.name);

      // Check if a design with the same name and metal already exists for this firm
      const existing = tx.select().from(designs)
        .where(and(
          eq(designs.firmId, firmId),
          eq(designs.name, sanitizedName),
          eq(designs.metal, input.metal)
        ))
        .limit(1)
        .get() as Design | undefined;

      if (existing) {
        if (existing.isActive === 1) {
          throw new Error(ERR.DESIGN_NAME_TAKEN);
        } else {
          // Restore design
          tx.update(designs)
            .set({ isActive: 1, updatedAt: now() })
            .where(and(eq(designs.id, existing.id), eq(designs.firmId, firmId)))
            .run();

          // Delete old design-category mappings
          tx.delete(designCategoryMap)
            .where(and(eq(designCategoryMap.designId, existing.id), eq(designCategoryMap.firmId, firmId)))
            .run();

          // Insert new design-category mapping if categoryId is provided
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
            payload: { designId: restored.id, name: restored.name, code: restored.code, metal: restored.metal, restored: true }
          });

          return restored;
        }
      }

      const code = generateDesignCode(tx, firmId);

      try {
        const design = designRepository.insert(tx, {
          id: Crypto.randomUUID(),
          firmId,
          name: sanitizedName,
          code,
          metal: input.metal,
          defaultHsn: input.defaultHsn ?? null,
          lowStockThreshold: input.lowStockThreshold ?? null,
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
          payload: { designId: design.id, name: design.name, code: design.code, metal: design.metal }
        });

        return design;
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(ERR.DESIGN_NAME_TAKEN);
        }
        throw e;
      }
    });
  },

  // --- softDeleteDesign (Step 3 / FIX-V1-3 v1.23) ---
  async softDeleteDesign(designId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();     // GUARD 2

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const activeItems = itemRepository.findByDesignId(tx, designId, firmId);
      
      const blocked = activeItems.filter(i =>
        ['AVAILABLE', 'DRAFT', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'SENT_TO_KARIGAR', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
      );

      if (blocked.length > 0) throw new Error(ERR.DESIGN_HAS_ACTIVE_ITEMS);

      designRepository.softDelete(tx, firmId, designId);

      auditRepository.log(tx, {
        eventType: 'DESIGN_SOFT_DELETED',
        firmId,
        entityId: designId,
        deviceId,
        payload: { designId, name: design.name }
      });
    });
  },

  // --- updateDesign (Step 3 / FIX-UPDATE-DES-1 v1.44) ---
  async updateDesign(
    designId: string,
    firmId: string,
    input: { name?: string; defaultHsn?: string | null; lowStockThreshold?: number | null }
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();     // GUARD 2

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const updateData: Partial<Pick<Design, 'name' | 'defaultHsn' | 'lowStockThreshold'>> = {};

      if (input.name !== undefined) {
        validateDesignName(input.name);
        updateData.name = sanitizeText(input.name);
      }
      
      if (input.defaultHsn !== undefined) {
        updateData.defaultHsn = input.defaultHsn;
      }

      if (input.lowStockThreshold !== undefined) {
        updateData.lowStockThreshold = input.lowStockThreshold;
      }

      try {
        designRepository.update(tx, firmId, designId, updateData);
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(ERR.DESIGN_NAME_TAKEN);
        }
        throw e;
      }

      auditRepository.log(tx, {
        eventType: 'DESIGN_UPDATED',
        firmId,
        entityId: designId,
        deviceId,
        payload: { designId, changes: input }
      });
    });
  },

  // --- updateDesignLowStockThreshold (v2.08 / v2.09 FIX-LOWSTOCK-UI-1) ---
  async updateDesignLowStockThreshold(designId: string, firmId: string, threshold: number | null): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();     // GUARD 2
    
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
      throw new Error(ERR.DESIGN_LOW_STOCK_THRESHOLD_INVALID);
    }

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      designRepository.update(tx, firmId, designId, { lowStockThreshold: threshold });

      auditRepository.log(tx, {
        eventType: 'DESIGN_UPDATED',
        firmId,
        entityId: designId,
        deviceId,
        payload: { designId, oldThreshold: design.lowStockThreshold, newThreshold: threshold }
      });
    });
  }
};