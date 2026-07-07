import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { categoryRepository } from '../repositories/categoryRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { sanitizeText } from '../utils/sanitize';
import { ERR } from '../constants/errorCodes';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export const categoryService = {
  // 🔴 FIX-CAT-DELETE-GUARD-1 (v1.44) — softDeleteCategory() Active Items Guard
  async softDeleteCategory(categoryId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      // FIX-CAT-DELETE-GUARD-1 (v1.44): Block if any non-terminal items reference this category
      const activeItems = await itemRepository.findByCategoryId(tx, categoryId, firmId);
      const blocked = activeItems.filter(i =>
        ['AVAILABLE', 'DRAFT', 'SENT_TO_KARIGAR', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
      );

      // FEAT-PHANTOM-INVENTORY-1 (v1.67): PHANTOM_AVAILABLE added. 
      // DAMAGED added (v1.70): non-terminal state, item awaiting karigar repair or return — must not orphan category
      if (blocked.length > 0) throw new Error(ERR.CATEGORY_HAS_ACTIVE_ITEMS);

      await categoryRepository.softDelete(tx, firmId, categoryId);

      await auditRepository.log(tx, {
        eventType: 'CATEGORY_SOFT_DELETED',
        firmId,
        entityId: categoryId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ categoryId, name: cat.name })
      });
    });
  },

  async createCategory(firmId: string, name: string, metal: 'GOLD' | 'SILVER', code: string, lowStockThreshold?: number): Promise<string> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    const sanitizedName = sanitizeText(name);
    const categoryId = uuidv4();

    return db.transaction(async (tx) => {
      try {
        await categoryRepository.insert(tx, {
          id: categoryId,
          firmId,
          name: sanitizedName,
          metal,
          code,
          lowStockThreshold: lowStockThreshold ?? null,
          isActive: 1,
          createdAt: now(),
          updatedAt: now()
        });
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(ERR.CATEGORY_NAME_DUPLICATE);
        }
        throw e;
      }

      await auditRepository.log(tx, {
        eventType: 'CATEGORY_CREATED',
        firmId,
        entityId: categoryId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ categoryId, name: sanitizedName, metal, code })
      });

      return categoryId;
    });
  },

  // 🔴 FIX-UPDATE-CAT-1 (v1.44) — updateCategory() Service
  async updateCategory(categoryId: string, firmId: string, name: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      const sanitizedName = sanitizeText(name); // GAP-P1ALIGN-4 (v1.74): FIX-VSEC-7

      // UNIQUE INDEX uq_category_firm_name enforces name uniqueness at DB level.
      // Catch Drizzle unique constraint violation and re-throw as CATEGORY_NAME_DUPLICATE.
      try {
        await categoryRepository.update(tx, firmId, categoryId, { name: sanitizedName });
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(ERR.CATEGORY_NAME_DUPLICATE);
        }
        throw e;
      }

      await auditRepository.log(tx, {
        eventType: 'CATEGORY_UPDATED',
        firmId,
        entityId: categoryId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ categoryId, oldName: cat.name, newName: sanitizedName })
      });
    });
  },

  async updateCategoryLowStockThreshold(categoryId: string, firmId: string, threshold: number | null): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      await categoryRepository.update(tx, firmId, categoryId, { lowStockThreshold: threshold });

      await auditRepository.log(tx, {
        eventType: 'CATEGORY_UPDATED',
        firmId,
        entityId: categoryId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ categoryId, oldThreshold: cat.lowStockThreshold, newThreshold: threshold })
      });
    });
  }
};
