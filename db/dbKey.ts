// db/dbKey.ts (v7.41 / FIX-V742-5 — async SecureStore API only)
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';

const DB_KEY_NAME = 'vjbilling_db_key_v1';
const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

// 32 random bytes as 64 hex characters (raw key form, SQLCipher skips its own KDF).
export function newDbKeyHex(): string {
  return Array.from(getRandomBytes(32), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function readDbKeyHex(): Promise<string | null> {
  const k = await SecureStore.getItemAsync(DB_KEY_NAME, OPTS);
  return k !== null && /^[0-9a-f]{64}$/.test(k) ? k : null; // malformed value counts as missing
}

export async function storeDbKeyHex(hex: string): Promise<void> {
  await SecureStore.setItemAsync(DB_KEY_NAME, hex, OPTS);
}

export async function deleteDbKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DB_KEY_NAME, OPTS);
}

