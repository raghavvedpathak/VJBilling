import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { stoneRepository } from '../repositories/stoneRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import type { CreateStoneInput, Stone } from '../types/phase2.types';

export const stoneService = {
  // createStone() service body from Step 4
  async createStone(input: CreateStoneInput, firmId: string): Promise<Stone> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2

    return db.transaction(async (tx) => {
      const stone = await stoneRepository.insert(tx, {
        id: Crypto.randomUUID(), 
        name: input.name, 
        type: input.type,
        firmId, 
        isActive: 1, 
        createdAt: now(), 
        updatedAt: now(),
      });

      await auditRepository.log(tx, { 
        eventType: 'STONE_CREATED', 
        firmId, 
        entityId: stone.id,
        deviceId: await getDeviceId(), 
        payload: JSON.stringify({ name: stone.name, type: stone.type }) 
      });

      return stone;
    });
  }
};
