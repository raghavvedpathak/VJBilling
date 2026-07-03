// =================================================================
// v7.24 FIXV724-1 — services/pinService.ts CANONICAL IMPLEMENTATION
// PIN gate runs BEFORE bootstrapDatabase(). On first boot: show PIN setup screen.
// On subsequent boots: show PIN entry screen (mandatory, no bypass).
// =================================================================

import { storage } from '../utils/storage';
import { ERR } from '../constants/errorCodes';

const PIN_HASH_KEY = 'vjbilling_pin_hash';
const PIN_SALT_KEY = 'vjbilling_pin_salt';
const PIN_FAILED_KEY = 'vjbilling_pin_failed_attempts';
const PIN_LOCKOUT_KEY = 'vjbilling_pin_lockout_until';

const MAX_ATTEMPTS = 3;
const BASE_LOCKOUT_MS = 30_000; // 30 seconds, doubles each subsequent lockout

async function deriveKey(pin: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  
  const km = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    km,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  );
  
  const raw = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(raw as ArrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function isPinSet(): Promise<boolean> {
  const hash = await storage.getItem(PIN_HASH_KEY);
  return !!hash;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error(ERR.PIN_INCORRECT + ': PIN must be exactly 6 digits');
  }
  
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  await storage.set(PIN_HASH_KEY, await deriveKey(pin, saltHex));
  await storage.set(PIN_SALT_KEY, saltHex);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = await storage.getItem(PIN_HASH_KEY);
  const storedSalt = await storage.getItem(PIN_SALT_KEY);
  
  if (!storedHash || !storedSalt) return false;
  
  return (await deriveKey(pin, storedSalt)) === storedHash;
}

export async function getFailedAttempts(): Promise<number> {
  const val = await storage.getItem(PIN_FAILED_KEY);
  return parseInt(val ?? '0', 10);
}

export async function incrementFailedAttempts(): Promise<void> {
  const attempts = (await getFailedAttempts()) + 1;
  await storage.set(PIN_FAILED_KEY, String(attempts));
  
  if (attempts >= MAX_ATTEMPTS) {
    const ms = BASE_LOCKOUT_MS * Math.pow(2, Math.max(0, attempts - MAX_ATTEMPTS));
    await storage.set(PIN_LOCKOUT_KEY, new Date(Date.now() + ms).toISOString());
  }
}

export async function isLockedOut(): Promise<boolean> {
  const until = await storage.getItem(PIN_LOCKOUT_KEY);
  return !!until && Date.now() < new Date(until).getTime();
}

export async function resetFailedAttempts(): Promise<void> {
  await storage.removeItem(PIN_FAILED_KEY);
  await storage.removeItem(PIN_LOCKOUT_KEY);
}