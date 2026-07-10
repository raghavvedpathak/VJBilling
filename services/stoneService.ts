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

    // Hoisted async call outside transaction
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const stone = stoneRepository.insert(tx, {
        id: Crypto.randomUUID(), 
        name: input.name, 
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
        payload: JSON.stringify({ name: stone.name, type: stone.type }) 
      });

      return stone;
    });
  }
};