// ================================================================
// utils/deviceKey.ts
// v7.26 FIX-V726-6 [build-blocker]: Canonical device-derived key utility
// Shared by createBackup(), restore(), and pre-migration snapshot encryption.
// ================================================================

import { getDeviceId } from '@/utils/deviceId';
import * as Crypto from 'expo-crypto';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a consistent 32-byte Uint8Array from the Device ID (or provided overrideDeviceId)
 * for raw key material in AES-256-GCM / PBKDF2 operations.
 */
export async function getDeviceDerivedKeyMaterial(overrideDeviceId?: string): Promise<Uint8Array> {
  const deviceId = overrideDeviceId || getDeviceId();
  const rawKeyString = 'vjbilling_device_key_v1:' + deviceId;

  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const enc = new TextEncoder();
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(rawKeyString));
    return new Uint8Array(raw);
  }

  const hexHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawKeyString
  );
  
  return hexToBytes(hexHash);
}