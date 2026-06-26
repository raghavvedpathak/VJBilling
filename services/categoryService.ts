import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { categoryRepository } from '../repositories/categoryRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';

export const categoryService = {
  // 🔴 FIX-CAT-DELETE-GUARD-1 (v1.44) — softDeleteCategory() Active Items Guard
  async softDeleteCategory(categoryId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');

      // FIX-CAT-DELETE-GUARD-1 (v1.44): Block if any non-terminal items reference this category
      const activeItems = await itemRepository.findByCategoryId(tx, categoryId, firmId);
      const blocked = activeItems.filter(i =>
        ['AVAILABLE', 'DRAFT', 'SENT_TO_KARIGAR', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
      );

      // FEAT-PHANTOM-INVENTORY-1 (v1.67): PHANTOM_AVAILABLE added. 
      // DAMAGED added (v1.70): non-terminal state, item awaiting karigar repair or return — must not orphan category
      if (blocked.length > 0) throw new Error('CATEGORY_HAS_ACTIVE_ITEMS');

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

  // 🔴 FIX-UPDATE-CAT-1 (v1.44) — updateCategory() Service
  async updateCategory(categoryId: string, firmId: string, name: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');

      // UNIQUE INDEX uq_category_firm_name enforces name uniqueness at DB level.
      // Catch Drizzle unique constraint violation and re-throw as CATEGORY_NAME_DUPLICATE.
      try {
        await categoryRepository.update(tx, firmId, categoryId, { name });
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('CATEGORY_NAME_DUPLICATE');
        }
        throw e;
      }

      await auditRepository.log(tx, {
        eventType: 'CATEGORY_UPDATED',
        firmId,
        entityId: categoryId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ categoryId, oldName: cat.name, newName: name })
      });
    });
  },

  async updateCategoryLowStockThreshold(categoryId: string, firmId: string, threshold: number | null): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const cat = await categoryRepository.getById(tx, firmId, categoryId);
      if (!cat || cat.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');

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
