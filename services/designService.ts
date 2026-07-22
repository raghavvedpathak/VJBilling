import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { designRepository } from '../repositories/designRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { sanitizeText } from '../utils/sanitize';
import { ERR } from '../constants/errorCodes';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { designs, designCategoryMap } from '../db/schema';
import type { CreateDesignInput, Design, DrizzleTransaction } from '../types/phase2.types';

export function validateDesignName(name: string): void {
  const words = name.trim().split(' ').filter(w => w.length > 0);
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);
  if (!words.every(w => /^[A-Za-z]+$/.test(w))) throw new Error(ERR.DESIGN_NAME_INVALID);
}

function generateDesignCode(tx: DrizzleTransaction, firmId: string): string {
  const last = tx.select({ code: designs.code }).from(designs)
    .where(eq(designs.firmId, firmId)).orderBy(desc(designs.code)).limit(1).get() as any;
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
  async createDesign(input: CreateDesignInput, firmId: string): Promise<Design> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2

    validateDesignName(input.name); 

    const sanitizedName = sanitizeText(input.name);

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
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
            tx.insert(designCategoryMap).values({
              id: uuidv4(),
              designId: existing.id,
              categoryId: input.categoryId,
              firmId,
              createdAt: now(),
            }).run();
          }

          const restored = designRepository.getById(tx, firmId, existing.id)!;

          auditRepository.log(tx, {
            eventType: 'DESIGN_CREATED',
            firmId,
            entityId: restored.id,
            deviceId,
            payload: JSON.stringify({ designId: restored.id, name: restored.name, code: restored.code, metal: restored.metal, restored: true })
          });

          return restored;
        }
      }

      const code = generateDesignCode(tx, firmId);

      try {
        const design = designRepository.insert(tx, {
          id: uuidv4(),
          firmId,
          name: sanitizedName,
          code,
          metal: input.metal,
          defaultHsn: input.defaultHsn ?? null,
          isActive: 1,
          createdAt: now(),
          updatedAt: now(),
        });

        if (input.categoryId) {
          tx.insert(designCategoryMap).values({
            id: uuidv4(),
            designId: design.id,
            categoryId: input.categoryId,
            firmId,
            createdAt: now(),
          }).run();
        }

        auditRepository.log(tx, {
          eventType: 'DESIGN_CREATED',
          firmId,
          entityId: design.id,
          deviceId,
          payload: JSON.stringify({ designId: design.id, name: design.name, code: design.code, metal: design.metal })
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

  // 🔴 FIX-V1-3 (v1.23) — softDeleteDesign() DESIGN_HAS_ACTIVE_ITEMS Guard
  async softDeleteDesign(designId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      // Using the synchronous itemRepository helper
      const activeItems = itemRepository.findByDesignIdTx(tx, designId, firmId);
      
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
        payload: JSON.stringify({ designId, name: design.name })
      });
    });
  },

  // 🔴 FIX-UPDATE-DES-1 (v1.44) — updateDesign() Service
  async updateDesign(
    designId: string,
    firmId: string,
    input: { name?: string; defaultHsn?: string | null }
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const updateData: Partial<Pick<Design, 'name' | 'defaultHsn'>> = {};

      if (input.name !== undefined) {
        validateDesignName(input.name); // Validate raw input first
        updateData.name = sanitizeText(input.name); // Sanitize after validation
      }
      
      if (input.defaultHsn !== undefined) {
        updateData.defaultHsn = input.defaultHsn;
      }

      try {
        designRepository.update(tx, firmId, designId, updateData);
      } catch (e: any) {
        // Name uniqueness: UNIQUE(name, metal, firmId) index enforces at DB level
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
        payload: JSON.stringify({ designId, changes: input })
      });
    });
  }
};