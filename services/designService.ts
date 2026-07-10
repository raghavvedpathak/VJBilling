import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { designRepository } from '../repositories/designRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import type { Design } from '../types/phase2.types';
import { sanitizeText } from '../utils/sanitize';
import { ERR } from '../constants/errorCodes';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export function validateDesignName(name: string): void {
  const words = name.trim().split(/\s+/);
  // FIX-DESIGN-VALIDATE-1 (v1.41): No special chars, exactly 1 or 2 words.
  if (words.length === 0 || words.length > 2 || name.trim() === '') {
    throw new Error(ERR.DESIGN_NAME_INVALID);
  }
  const specialCharRegex = /[^a-zA-Z0-9\s]/;
  if (specialCharRegex.test(name)) {
    throw new Error(ERR.DESIGN_NAME_INVALID);
  }
}

export const designService = {
  async createDesign(firmId: string, name: string, metal: 'GOLD' | 'SILVER', code: string, defaultHsn?: string | null): Promise<string> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    validateDesignName(name); // Validate raw input first
    const sanitizedName = sanitizeText(name); // Sanitize after validation

    const designId = uuidv4();
    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      try {
        designRepository.insert(tx, {
          id: designId,
          firmId,
          name: sanitizedName,
          metal,
          code,
          defaultHsn: defaultHsn ?? null,
          isActive: 1,
          createdAt: now(),
          updatedAt: now()
        });
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(ERR.DESIGN_NAME_TAKEN);
        }
        throw e;
      }

      auditRepository.log(tx, {
        eventType: 'DESIGN_CREATED',
        firmId,
        entityId: designId,
        deviceId,
        payload: JSON.stringify({ designId, name: sanitizedName, metal, code })
      });

      return designId;
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