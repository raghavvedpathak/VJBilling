// utils/verifyCache.ts — Phase 1 v7.47 Canonical Verify Boot Cache HMAC Guard
// Implements FIX-VSEC-2 (MMKV cache tamper detection) & FIX-V746-6 (ASCII '|' separator)

import * as SecureStore from 'expo-secure-store';
import { differenceInMinutes, parseISO } from 'date-fns';
import { storage } from '@/utils/storage';
import { bytesToBase64, base64ToBytes } from '@/utils/backupCrypto';
import type { VerifyStatus } from '@/services/phase1/verifyService';

const VERIFY_STATUS_KEY = 'vjbilling_last_verify_status';
const VERIFY_AT_KEY = 'vjbilling_last_verify_at';
const VERIFY_HMAC_KEY = 'vjbilling_last_verify_hmac';
const HMAC_SECRET_STORE_KEY = 'vjbilling_verify_hmac_key_v1';

const enc = new TextEncoder();

// FIX-V746-6: Pinned to ASCII vertical bar "|" (0x7C)
function msg(status: string, timestamp: string): Uint8Array {
  return enc.encode(`${status}|${timestamp}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getVerifyHmacKey(createIfMissing: boolean): Promise<CryptoKey | null> {
  const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  try {
    let b64 = await SecureStore.getItemAsync(HMAC_SECRET_STORE_KEY, opts);
    if (!b64) {
      if (!createIfMissing) return null;
      const raw = crypto.getRandomValues(new Uint8Array(32));
      b64 = bytesToBase64(raw);
      await SecureStore.setItemAsync(HMAC_SECRET_STORE_KEY, b64, opts);
    }
    const keyBytes = base64ToBytes(b64);
    if (keyBytes.byteLength !== 32) return null;
    return await crypto.subtle.importKey(
      'raw',
      keyBytes as any,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  } catch {
    return null;
  }
}

export async function writeVerifyCache(status: VerifyStatus, atIso = new Date().toISOString()): Promise<void> {
  storage.set(VERIFY_STATUS_KEY, status);
  storage.set(VERIFY_AT_KEY, atIso);
  const key = await getVerifyHmacKey(true);
  if (key) {
    const sig = await crypto.subtle.sign('HMAC', key, msg(status, atIso) as any);
    storage.set(VERIFY_HMAC_KEY, bytesToHex(new Uint8Array(sig)));
  }
}

export async function isHealthyVerifyCacheValid(previousBootWasInterrupted: boolean): Promise<boolean> {
  if (previousBootWasInterrupted) return false;
  const status = storage.getString(VERIFY_STATUS_KEY);
  const atIso = storage.getString(VERIFY_AT_KEY);
  const storedHmac = storage.getString(VERIFY_HMAC_KEY);

  if (status !== 'HEALTHY' || !atIso || !storedHmac) return false;

  try {
    const diff = differenceInMinutes(new Date(), parseISO(atIso));
    if (Number.isNaN(diff) || diff < 0 || diff >= 30) return false;

    const key = await getVerifyHmacKey(false);
    if (!key) return false;

    const sig = await crypto.subtle.sign('HMAC', key, msg(status, atIso) as any);
    const computedHmac = bytesToHex(new Uint8Array(sig));
    return computedHmac === storedHmac;
  } catch {
    return false;
  }
}

export function clearVerifyCache(): void {
  storage.delete(VERIFY_STATUS_KEY);
  storage.delete(VERIFY_AT_KEY);
  storage.delete(VERIFY_HMAC_KEY);
}
