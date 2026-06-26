import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { designRepository } from '../repositories/designRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import type { Design } from '../types/phase2.types';

export function validateDesignName(name: string): void {
  const words = name.trim().split(/\s+/);
  // FIX-DESIGN-VALIDATE-1 (v1.41): No special chars, exactly 1 or 2 words.
  if (words.length === 0 || words.length > 2 || name.trim() === '') {
    throw new Error('DESIGN_NAME_INVALID');
  }
  const specialCharRegex = /[^a-zA-Z0-9\s]/;
  if (specialCharRegex.test(name)) {
    throw new Error('DESIGN_NAME_INVALID');
  }
}

export const designService = {
  // 🔴 FIX-V1-3 (v1.23) — softDeleteDesign() DESIGN_HAS_ACTIVE_ITEMS Guard
  async softDeleteDesign(designId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const design = await designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error('DESIGN_NOT_FOUND_OR_WRONG_FIRM');

      const activeItems = await itemRepository.findByDesignId(designId, firmId);
      
      const blocked = activeItems.filter(i =>
        ['AVAILABLE', 'DRAFT', 'SENT_TO_REFINERY', 'SENT_TO_MELT', 'SENT_TO_KARIGAR', 'DAMAGED', 'PHANTOM_AVAILABLE'].includes(i.status)
      );

      if (blocked.length > 0) throw new Error('DESIGN_HAS_ACTIVE_ITEMS');

      await designRepository.softDelete(tx, firmId, designId);

      await auditRepository.log(tx, {
        eventType: 'DESIGN_SOFT_DELETED',
        firmId,
        entityId: designId,
        deviceId: await getDeviceId(),
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

    return db.transaction(async (tx) => {
      const design = await designRepository.getById(tx, firmId, designId);
      if (!design || design.firmId !== firmId) throw new Error('DESIGN_NOT_FOUND_OR_WRONG_FIRM');

      const updateData: Partial<Pick<Design, 'name' | 'defaultHsn'>> = {};

      if (input.name !== undefined) {
        validateDesignName(input.name);
        updateData.name = input.name;
      }
      
      if (input.defaultHsn !== undefined) {
        updateData.defaultHsn = input.defaultHsn;
      }

      try {
        await designRepository.update(tx, firmId, designId, updateData);
      } catch (e: any) {
        // Name uniqueness: UNIQUE(name, metal, firmId) index enforces at DB level
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('DESIGN_NAME_TAKEN');
        }
        throw e;
      }

      await auditRepository.log(tx, {
        eventType: 'DESIGN_UPDATED',
        firmId,
        entityId: designId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ designId, changes: input })
      });
    });
  }
};
