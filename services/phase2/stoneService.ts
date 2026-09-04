// services/phase2/stoneService.ts — Phase 2 v2.24 Canonical Service

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
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';

// --- createStone (Step 4 / FIX-STONE-1) ---
export async function createStone(input: CreateStoneInput, firmId: string): Promise<Stone> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const sanitizedName = sanitizeText(input.name); // GAP-P1ALIGN-4 (v1.74)
  const deviceId = await getDeviceId();

  const stone = db.transaction((tx) => {
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
      payload: { name: stone.name, type: stone.type },
    });

    return stone;
  });

  useMastersSyncStore.getState().notifyStoneChanged();
  return stone;
}

// --- updateStone ---
export async function updateStone(
  stoneId: string,
  input: Partial<CreateStoneInput>,
  firmId: string
): Promise<Stone> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const deviceId = await getDeviceId();

  const updated = db.transaction((tx) => {
    const existing = stoneRepository.getById(tx, stoneId, firmId);
    if (!existing || existing.firmId !== firmId) {
      throw new Error(ERR.STONE_NOT_FOUND_OR_WRONG_FIRM);
    }

    const updateData: Partial<CreateStoneInput> = {};
    if (input.name) updateData.name = sanitizeText(input.name);
    if (input.type) updateData.type = input.type;

    const updated = stoneRepository.update(tx, stoneId, firmId, updateData);

    auditRepository.log(tx, {
      eventType: 'STONE_UPDATED',
      firmId,
      entityId: stoneId,
      deviceId,
      payload: {
        stoneId,
        oldName: existing.name,
        newName: updated.name,
        oldType: existing.type,
        newType: updated.type,
      },
    });

    return updated;
  });

  useMastersSyncStore.getState().notifyStoneChanged();
  return updated;
}

// --- softDeleteStone (Step 4 / FIX-STONE-1) ---
export async function softDeleteStone(stoneId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const deviceId = await getDeviceId();

  await db.transaction(async (tx) => {
    const stone = stoneRepository.getById(tx, stoneId, firmId);
    if (!stone || stone.firmId !== firmId) {
      throw new Error(ERR.STONE_NOT_FOUND_OR_WRONG_FIRM);
    }

    const isUsed = stoneRepository.isStoneUsedInItems(tx, stoneId, firmId);
    if (isUsed) {
      throw new Error('Cannot delete stone: This stone type is currently assigned to active stock items in inventory.');
    }

    stoneRepository.softDelete(tx, stoneId, firmId);

    auditRepository.log(tx, {
      eventType: 'STONE_DELETED',
      firmId,
      entityId: stoneId,
      deviceId,
      payload: { stoneId, name: stone.name },
    });
  });

  useMastersSyncStore.getState().notifyStoneChanged();
}

// --- Read Queries ---
export async function getStoneById(firmId: string, stoneId: string): Promise<Stone | null> {
  return stoneRepository.getById(stoneId, firmId);
}

export async function getStonesByFirm(firmId: string): Promise<Stone[]> {
  return stoneRepository.findByFirmId(firmId);
}

export const stoneService = {
  createStone,
  updateStone,
  softDeleteStone,
  getById: getStoneById,
  findByFirmId: getStonesByFirm,
};