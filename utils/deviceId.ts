// utils/deviceId.ts — Phase 1 v7.38 Canonical Device Identity & Key Derivation

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
 * Safe from circular dependencies (does not touch auditRepository).
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
 * Handles reinstalls correctly — checks DB directly, not MMKV flag.
 * Non-fatal: errors are caught and logged, never bubble up to crash bootstrap.
 */
export async function auditDeviceIdIfNew(): Promise<void> {
  try {
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

      if (typeof (auditRepository as any).log === 'function') {
        (auditRepository as any).log(null, {
          eventType: 'DEVICE_ID_GENERATED',
          firmId: null,
          payload,
          deviceId,
        });
      } else if (typeof (auditRepository as any).create === 'function') {
        (auditRepository as any).create({
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

/**
 * Derives a consistent 32-byte Uint8Array from the Device ID (or provided overrideDeviceId)
 * for use as raw key material when an automated backup runs without a user password (FIX-V726-6).
 */
export async function getDeviceDerivedKeyMaterial(overrideDeviceId?: string): Promise<Uint8Array> {
  const deviceId = overrideDeviceId || getDeviceId();
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest(
    'SHA-256',
    enc.encode('vjbilling_device_key_v1:' + deviceId)
  );
  return new Uint8Array(raw);
}