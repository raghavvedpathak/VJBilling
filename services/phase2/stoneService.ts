// services/stoneService.ts — Phase 2 v2.11 Canonical Service

import { db } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import * as Crypto from 'expo-crypto';
import type { CreateStoneInput, Stone } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

export const stoneService = {
  // --- createStone (Step 4 / FIX-STONE-1) ---
  async createStone(input: CreateStoneInput, firmId: string): Promise<Stone> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const sanitizedName = sanitizeText(input.name); // GAP-P1ALIGN-4 (v1.74)
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const stone = stoneRepository.insert(tx, {
        id: Crypto.randomUUID(), 
        name: sanitizedName, 
        type: input.type,
        firmId, 
        isActive: 1, 
        createdAt: now(), 
        updatedAt: now(),
      });

      auditRepository.log(tx, { 
        eventType: 'STONE_CREATED', 
        firmId, 
        entityId: stone.id,
        deviceId, 
        payload: { name: stone.name, type: stone.type } 
      });

      return stone;
    });
  },

  // --- softDeleteStone (Step 4 / FIX-STONE-1) ---
  async softDeleteStone(stoneId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const stone = stoneRepository.getById(tx, stoneId, firmId);
      if (!stone || stone.firmId !== firmId) {
        throw new Error(ERR.STONE_NOT_FOUND_OR_WRONG_FIRM);
      }

      stoneRepository.softDelete(tx, stoneId, firmId);

      auditRepository.log(tx, {
        eventType: 'STONE_DELETED',
        firmId,
        entityId: stoneId,
        deviceId,
        payload: { stoneId, name: stone.name }
      });
    });
  }
};