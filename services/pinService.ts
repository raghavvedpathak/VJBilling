// =================================================================
// v7.29 FIX-V729-1 & FIX-V729-2 — services/pinService.ts CANONICAL IMPLEMENTATION
// PIN gate runs BEFORE bootstrapDatabase(). On first boot: show PIN setup screen 
// with a "Skip for now" option. If a PIN is set: show PIN entry screen on every 
// subsequent boot (mandatory, no bypass once set). If skipped: proceed straight to 
// bootstrapDatabase() with no gate until the user sets a PIN from Settings > Security.
// =================================================================

import { storage } from '../utils/storage';
import { ERR } from '../constants/errorCodes';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'vjbilling_pin_hash';
const PIN_SALT_KEY = 'vjbilling_pin_salt';
const PIN_FAILED_KEY = 'vjbilling_pin_failed_attempts';
const PIN_LOCKOUT_KEY = 'vjbilling_pin_lockout_until';
const PIN_LENGTH_KEY = 'vjbilling_pin_length'; // v7.29 FIX-V729-2: '4' or '6'
const PIN_SKIPPED_KEY = 'vjbilling_pin_setup_skipped'; // v7.29 FIX-V729-1

const MAX_ATTEMPTS = 3;
const BASE_LOCKOUT_MS = 30_000; // 30 seconds, doubles each subsequent lockout

async function deriveKey(pin: string, saltHex: string): Promise<string> {
  // v7.33 FIX-V733-1: saltHex null check on corrupted/tampered MMKV data.
  const saltHexPairs = saltHex ? saltHex.match(/.{2}/g) : null;
  if (!saltHexPairs) {
    throw new Error(ERR.PIN_DATA_CORRUPTED + ': stored PIN salt is malformed');
  }
  // WebCrypto (crypto.subtle.deriveKey) is unsupported natively on Android JS engine.
  // We use expo-crypto with iterative SHA-256 hashing to simulate PBKDF2 stretch.
  let hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin + saltHex);
  for (let i = 0; i < 50; i++) {
    hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hash + saltHex);
  }
  return hash;
}

export function isPinSet(): boolean {
  return !!storage.getString(PIN_HASH_KEY);
}

export async function setPin(pin: string): Promise<void> {
  // v7.29 FIX-V729-2: PIN length is now user's choice — 4 digits or 6 digits — not fixed at 6.
  if (!/^\d{4}$/.test(pin) && !/^\d{6}$/.test(pin)) {
    throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');
  }
  
  const saltBytes = Crypto.getRandomBytes(16);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  storage.set(PIN_HASH_KEY, await deriveKey(pin, saltHex));
  storage.set(PIN_SALT_KEY, saltHex);
  storage.set(PIN_LENGTH_KEY, String(pin.length)); // '4' or '6'
  storage.delete(PIN_SKIPPED_KEY); // Safety: clear skipped flag if set
}

export function getPinLength(): 4 | 6 {
  const len = storage.getString(PIN_LENGTH_KEY);
  return len === '4' ? 4 : 6; // defaults to 6 if never set (pre-v7.29 installs, or unset)
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = storage.getString(PIN_HASH_KEY);
  const storedSalt = storage.getString(PIN_SALT_KEY);
  
  if (!storedHash || !storedSalt) return false;
  
  return (await deriveKey(pin, storedSalt)) === storedHash;
}

export function getFailedAttempts(): number {
  return parseInt(storage.getString(PIN_FAILED_KEY) ?? '0', 10);
}

export function incrementFailedAttempts(): void {
  const attempts = getFailedAttempts() + 1;
  storage.set(PIN_FAILED_KEY, String(attempts));
  
  if (attempts >= MAX_ATTEMPTS) {
    const ms = BASE_LOCKOUT_MS * Math.pow(2, Math.max(0, attempts - MAX_ATTEMPTS));
    storage.set(PIN_LOCKOUT_KEY, new Date(Date.now() + ms).toISOString());
  }
}

export function isLockedOut(): boolean {
  const until = storage.getString(PIN_LOCKOUT_KEY);
  return !!until && Date.now() < new Date(until).getTime();
}

export function resetFailedAttempts(): void {
  storage.delete(PIN_FAILED_KEY);
  storage.delete(PIN_LOCKOUT_KEY);
}

// ============================================================================
// v7.29 SKIP & CHANGE LOGIC
// ============================================================================

export function isPinSkipped(): boolean {
  return storage.getString(PIN_SKIPPED_KEY) === 'true';
}

export function setPinSkipped(): void {
  storage.set(PIN_SKIPPED_KEY, 'true');
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  const ok = await verifyPin(currentPin);
  if (!ok) throw new Error(ERR.PIN_INCORRECT + ': current PIN is incorrect');
  
  // v7.29 FIX-V729-2: new PIN may be 4 or 6 digits, independent of the old PIN's length.
  if (!/^\d{4}$/.test(newPin) && !/^\d{6}$/.test(newPin)) {
    throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');
  }
  
  await setPin(newPin);
  storage.delete(PIN_SKIPPED_KEY); // setting/changing a PIN always clears the skipped flag
}

export async function removePin(currentPin: string): Promise<void> {
  const ok = await verifyPin(currentPin);
  if (!ok) throw new Error(ERR.PIN_INCORRECT + ': current PIN is incorrect');
  
  storage.delete(PIN_HASH_KEY);
  storage.delete(PIN_SALT_KEY);
  storage.delete(PIN_LENGTH_KEY);
  storage.delete(PIN_FAILED_KEY);
  storage.delete(PIN_LOCKOUT_KEY);
  storage.delete(PIN_SKIPPED_KEY);
}