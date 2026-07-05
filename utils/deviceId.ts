// utils/deviceId.ts
// Stable device identity — two-phase initialization.
// Phase A: generate + persist to MMKV (no audit log — called before DB is ready)
// Phase B: write DEVICE_ID_GENERATED audit event (called after DB + repos are ready)
// v7.26 FIX-VSEC-14: getDeviceDerivedKeyMaterial added for AES backup key derivation.

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
 * Throws if not initialized according to Hardening 5.
 */
export async function getDeviceId(): Promise<string> {
  const deviceId = await storage.getItem(DEVICE_ID_KEY);
  if (!deviceId) throw new Error('DEVICE_ID_NOT_INITIALIZED');
  return deviceId;
}

/**
 * Phase A: Generate and persist device ID — NO audit log.
 * Called early in bootstrap before DB is ready.
 * Safe from circular dependencies (does not touch auditRepository).
 */
export async function getOrGenerateDeviceId(): Promise<string> {
  const existingId = await storage.getItem(DEVICE_ID_KEY);

  if (!existingId) {
    const newId = Crypto.randomUUID();
    await storage.setItem(DEVICE_ID_KEY, newId);
    console.log('[DeviceID] Phase A: New Stable Identity Generated:', newId);
    return newId;
  }

  return existingId;
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
    // FIX: Added 'await' to properly resolve the boolean instead of a truthy Promise
    const hasEvent = await auditRepository.hasEvent('DEVICE_ID_GENERATED');

    if (!hasEvent) {
      console.log('[DeviceID] Phase B: Detected un-audited device identity. Logging now.');
      const deviceId = await getDeviceId(); // This remains async (MMKV read)
      const deviceName = Device.modelName || 'Unknown Device';
      const osName = Device.osName || 'Unknown OS';

      // FIX: Added 'await' to ensure the event is fully committed
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

/**
 * v7.26 FIX-VSEC-14: Backup Crypto Fallback
 * Derives a consistent Uint8Array from the Device ID for use as 
 * raw key material when an automated backup runs without a user password.
 */
export async function getDeviceDerivedKeyMaterial(): Promise<Uint8Array> {
  const deviceId = await getDeviceId();
  // We use the stable device ID combined with a static app salt string
  const rawMaterial = `${deviceId}_vjbilling_internal_salt_v1`;
  return new TextEncoder().encode(rawMaterial);
}