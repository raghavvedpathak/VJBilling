// utils/deviceId.ts — Phase 2 v2.11 Canonical Device Identity

import { storage } from './storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { now } from './now';

const DEVICE_ID_KEY = 'vjbilling_device_id';

// Exposed unique ID generator for database entities
export const generateId = () => Crypto.randomUUID();

/**
 * Returns the persisted device ID from MMKV.
 * Throws if not initialized.
 */
export async function getDeviceId(): Promise<string> {
  const deviceId = storage.getString(DEVICE_ID_KEY);
  if (!deviceId) throw new Error('DEVICE_ID_NOT_INITIALIZED');
  return deviceId;
}

/**
 * Phase A: Generate and persist device ID — NO audit log.
 * Called early in bootstrap before DB is ready.
 * Safe from circular dependencies (does not touch auditRepository).
 */
export async function getOrGenerateDeviceId(): Promise<string> {
  const existingId = storage.getString(DEVICE_ID_KEY);

  if (!existingId) {
    const newId = Crypto.randomUUID();
    storage.set(DEVICE_ID_KEY, newId);
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
 */
export async function auditDeviceIdIfNew(): Promise<void> {
  try {
    const hasEvent = auditRepository.hasEvent('DEVICE_ID_GENERATED');

    if (!hasEvent) {
      console.log('[DeviceID] Phase B: Detected un-audited device identity. Logging now.');
      const deviceId = await getDeviceId();
      const deviceName = Device.modelName || 'Unknown Device';
      const osName = Device.osName || 'Unknown OS';

      auditRepository.create({
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
 * Derives a consistent Uint8Array from a canonical secret for portable unpassworded backups.
 */
export async function getCanonicalBackupKeyMaterial(): Promise<Uint8Array> {
  const hexHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    'vjbilling_canonical_backup_secret_v1'
  );
  const enc = new TextEncoder();
  return enc.encode(hexHash);
}

/**
 * Derives a consistent Uint8Array from the Device ID (or provided overrideDeviceId) for use as 
 * raw key material when an automated backup runs without a user password.
 */
export async function getDeviceDerivedKeyMaterial(overrideDeviceId?: string): Promise<Uint8Array> {
  const deviceId = overrideDeviceId || await getDeviceId();
  const hexHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    'vjbilling_device_key_v1:' + deviceId
  );
  const enc = new TextEncoder();
  return enc.encode(hexHash);
}