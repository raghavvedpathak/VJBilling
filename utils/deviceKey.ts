// ================================================================
// utils/deviceKey.ts
// v7.26 FIX-V726-6 [build-blocker]: Canonical device-derived key utility
// Shared by createBackup(), restore(), and pre-migration snapshot encryption.
// ================================================================

import { getDeviceId } from '@/utils/deviceId';

export async function getDeviceDerivedKeyMaterial(): Promise<Uint8Array> {
  const deviceId = await getDeviceId();
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest(
    'SHA-256',
    enc.encode('vjbilling_device_key_v1:' + deviceId)
  );
  return new Uint8Array(raw);
}
