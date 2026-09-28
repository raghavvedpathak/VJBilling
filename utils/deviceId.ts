// utils/deviceId.ts — Phase 1 (v7.39) Canonical Device Identity
// Step B / Hardening 5 compliant — Two-phase bootstrap safely decoupled

import { storage } from './storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { now } from './now';

const DEVICE_ID_KEY = 'vjbilling_device_id';

export const generateId = () => Crypto.randomUUID();

/**
 * Returns the persisted device ID from MMKV.
 * Synchronous per Step B specification.
 * Throws if not initialized.
 */
export function getDeviceId(): string {
  const deviceId = storage.getString(DEVICE_ID_KEY);
  if (!deviceId) throw new Error('DEVICE_ID_NOT_INITIALIZED');
  return deviceId;
}

/**
 * Phase A: Generate and persist device ID — NO audit log.
 * Synchronous per Step B specification.
 * Called early in bootstrap before DB is ready.
 * Safe from circular dependencies.
 */
export function getOrGenerateDeviceId(): string {
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
 * Lazy-loads auditRepository to ensure zero circular evaluation issues.
 */
export async function auditDeviceIdIfNew(): Promise<void> {
  try {
    const { auditRepository } = require('@/repositories/phase1/auditRepository');
    const hasEvent = auditRepository.hasEvent('DEVICE_ID_GENERATED');

    if (!hasEvent) {
      console.log('[DeviceID] Phase B: Detected un-audited device identity. Logging now.');
      const deviceId = getDeviceId();
      const deviceName = Device.modelName || 'Unknown Device';
      const osName = Device.osName || 'Unknown OS';

      const payload = JSON.stringify({
        deviceId,
        generatedAt: now(),
        deviceName,
        os: osName,
      });

      if (typeof auditRepository.log === 'function') {
        auditRepository.log(null, {
          eventType: 'DEVICE_ID_GENERATED',
          firmId: null,
          payload,
          deviceId,
        });
      } else if (typeof auditRepository.create === 'function') {
        auditRepository.create({
          firmId: null,
          eventType: 'DEVICE_ID_GENERATED',
          payload,
          deviceId,
        });
      }
    }
  } catch (e) {
    console.error('[DeviceID] Phase B Audit Failed (Non-fatal):', e);
  }
}

/**
 * Derives a consistent Uint8Array from a canonical secret for portable unpassworded backups.
 */
export async function getCanonicalBackupKeyMaterial(): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest(
    'SHA-256',
    enc.encode('vjbilling_canonical_backup_secret_v1')
  );
  return new Uint8Array(raw);
}

// Re-export getDeviceDerivedKeyMaterial for backward compatibility
export { getDeviceDerivedKeyMaterial } from './deviceKey';