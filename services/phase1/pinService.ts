// ================================================================
// v7.24 FIX-V724-1 / v7.29 FIX-V729-1 & FIX-V729-2 / v7.33 FIX-V733-1
// services/phase1/pinService.ts — NATIVE ACCELERATED IMPLEMENTATION (v7.38)
// Fast native PBKDF2 via react-native-quick-crypto (<25ms execution time)
// ================================================================

import { storage } from '@/utils/storage';
import { ERR } from '@/constants/errorCodes';
import quickCrypto from 'react-native-quick-crypto';

const PIN_HASH_KEY = 'vjbilling_pin_hash';
const PIN_SALT_KEY = 'vjbilling_pin_salt';
const PIN_FAILED_KEY = 'vjbilling_pin_failed_attempts';
const PIN_LOCKOUT_KEY = 'vjbilling_pin_lockout_until';
const PIN_LENGTH_KEY = 'vjbilling_pin_length'; // v7.29 FIX-V729-2: '4' or '6'
const PIN_SKIPPED_KEY = 'vjbilling_pin_setup_skipped'; // v7.29 FIX-V729-1

const MAX_ATTEMPTS = 3;
const BASE_LOCKOUT_MS = 30_000; // 30 seconds, doubles each subsequent lockout

function getCryptoModule(): any {
  return quickCrypto || (typeof require !== 'undefined' ? require('crypto') : null);
}

function deriveKey(pin: string, saltHex: string): string {
  // v7.33 FIX-V733-1: saltHex null guard prevents runtime errors on corrupted MMKV data
  const saltHexPairs = saltHex ? saltHex.match(/.{2}/g) : null;
  if (!saltHexPairs) {
    throw new Error(ERR.PIN_DATA_CORRUPTED + ': stored PIN salt is malformed');
  }
  
  const cryptoModule = getCryptoModule();
  const saltBuffer = Buffer.from(saltHex, 'hex');
  const pinBuffer = Buffer.from(pin, 'utf8');

  // Native C++ PBKDF2 (Executes in ~15-20ms instead of 3,500ms JS loop)
  const derivedKeyBuffer = cryptoModule.pbkdf2Sync(
    pinBuffer,
    saltBuffer,
    100_000,
    32,
    'sha256'
  );

  return derivedKeyBuffer.toString('hex');
}

export function isPinSet(): boolean {
  return !!storage.getString(PIN_HASH_KEY);
}

export async function setPin(pin: string): Promise<void> {
  // v7.29 FIX-V729-2: PIN length is user's choice — exactly 4 or 6 digits
  if (!/^\d{4}$/.test(pin) && !/^\d{6}$/.test(pin)) {
    throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');
  }

  const cryptoModule = getCryptoModule();
  const saltBytes = cryptoModule.randomBytes(16);
  const saltHex = saltBytes.toString('hex');

  storage.set(PIN_HASH_KEY, deriveKey(pin, saltHex));
  storage.set(PIN_SALT_KEY, saltHex);
  storage.set(PIN_LENGTH_KEY, String(pin.length)); // '4' or '6'
  storage.delete(PIN_SKIPPED_KEY); // Setting a PIN always clears the skipped flag
}

export function getPinLength(): 4 | 6 {
  const len = storage.getString(PIN_LENGTH_KEY);
  return len === '4' ? 4 : 6; // Defaults to 6 if never set
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = storage.getString(PIN_HASH_KEY);
  const storedSalt = storage.getString(PIN_SALT_KEY);

  if (!storedHash || !storedSalt) return false;

  return deriveKey(pin, storedSalt) === storedHash;
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

export async function changePin(
  currentPin: string,
  newPin: string,
  alreadyVerified: boolean = false
): Promise<void> {
  if (!alreadyVerified) {
    const ok = await verifyPin(currentPin);
    if (!ok) throw new Error(ERR.PIN_INCORRECT + ': current PIN is incorrect');
  }

  // v7.29 FIX-V729-2: new PIN may be 4 or 6 digits, independent of old PIN length
  if (!/^\d{4}$/.test(newPin) && !/^\d{6}$/.test(newPin)) {
    throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 4 or 6 digits');
  }

  await setPin(newPin);
  storage.delete(PIN_SKIPPED_KEY);
}

export async function removePin(currentPin?: string, alreadyVerified: boolean = false): Promise<void> {
  if (!alreadyVerified) {
    if (!currentPin) throw new Error(ERR.PIN_INCORRECT + ': current PIN is required');
    const ok = await verifyPin(currentPin);
    if (!ok) throw new Error(ERR.PIN_INCORRECT + ': current PIN is incorrect');
  }

  storage.delete(PIN_HASH_KEY);
  storage.delete(PIN_SALT_KEY);
  storage.delete(PIN_LENGTH_KEY);
  storage.delete(PIN_FAILED_KEY);
  storage.delete(PIN_LOCKOUT_KEY);
  storage.delete(PIN_SKIPPED_KEY);
}