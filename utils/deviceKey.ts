// ================================================================
// utils/deviceKey.ts
// v7.26 FIX-V726-6 / v7.41 FIX-V741-5: Legacy v1 device-derived key utility
// Retained for decrypting legacy encryptionVersion: 1 backups.
// ================================================================

import { storage } from '@/utils/storage';
import { ERR } from '@/constants/errorCodes';

/**
 * Derives a consistent 32-byte Uint8Array from the Device ID (or provided overrideDeviceId)
 * for legacy v1 backup decryption.
 */
export async function getDeviceDerivedKeyMaterial(overrideDeviceId?: string): Promise<Uint8Array> {
  const deviceId = overrideDeviceId || storage.getString('vjbilling_device_id');
  if (!deviceId) throw new Error(ERR.DEVICE_ID_NOT_INITIALIZED);
  const rawKeyString = 'vjbilling_device_key_v1:' + deviceId;

  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(rawKeyString));
  return new Uint8Array(raw);
}

export default getDeviceDerivedKeyMaterial;
