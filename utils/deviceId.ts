// utils/deviceId.ts
// Stable device identity — two-phase initialization.
// Phase A: generate + persist to MMKV (no audit log — called before DB is ready)
// Phase B: write DEVICE_ID_GENERATED audit event (called after DB + repos are ready)

import { storage } from './storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { auditRepository } from '../repositories/auditRepository';
import { now } from './now';

const DEVICE_ID_KEY = 'vjbilling_device_id';

// Phase 2: Exposed unique ID generator for database entities
export const generateId = () => Crypto.randomUUID();

/**
 * Returns the persisted device ID from MMKV/AsyncStorage.
 * Returns 'UNKNOWN_DEVICE' if not yet initialized (should not happen after bootstrap).
 */
export async function getDeviceId(): Promise<string> {
  const deviceId = await storage.getItem(DEVICE_ID_KEY);
  return deviceId || 'UNKNOWN_DEVICE';
}

/**
 * Phase A: Generate and persist device ID — NO audit log.
 * Called early in bootstrap before DB is ready.
 * Safe from circular dependencies (does not touch auditRepository).
 */
export async function initializeDeviceId(): Promise<string> {
  let deviceId = await storage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await storage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('[DeviceID] Phase A: New Stable Identity Generated:', deviceId);
  }

  return deviceId;
}

/**
 * Phase B: Write DEVICE_ID_GENERATED audit event if not already logged.
 * Called after DB and repositories are fully initialized (bootstrap Step 7).
 * Handles reinstalls correctly — checks DB directly, not MMKV flag.
 * Non-fatal: errors are caught and logged, never bubble up to crash bootstrap.
 *
 * G41 CONTRACT: DEVICE_ID_GENERATED is one of the 3 exempt events — tx not required.
 */
export async function auditDeviceIdIfNew(): Promise<void> {
  try {
    const hasEvent = await auditRepository.hasEvent('DEVICE_ID_GENERATED');

    if (!hasEvent) {
      console.log('[DeviceID] Phase B: Detected un-audited device identity. Logging now.');
      const deviceId = await getDeviceId();
      const deviceName = Device.modelName || 'Unknown Device';
      const osName = Device.osName || 'Unknown OS';

      // FIX: now() replaces new Date().toISOString() — consistent with centralized time utility
      await auditRepository.create({
        firmId: null,
        eventType: 'DEVICE_ID_GENERATED',
        payload: JSON.stringify({
          deviceId,
          generatedAt: now(),
          deviceName,
          os: osName,
        }),
        deviceId,
      });
    }
  } catch (e) {
    console.error('[DeviceID] Phase B Audit Failed (Non-fatal):', e);
  }
}