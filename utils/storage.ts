// utils/storage.ts — Phase 1 v8.0 (FIX-V733-10, FIX-V7411-4, FIX-V742-6)
// Synchronous MMKV v4 Nitro storage wrapper + Zustand persist adapter.
// Expo Go is not supported (FIX-V744-9); in-memory fallback is restricted to Jest tests only.

import { createJSONStorage, type StateStorage } from 'zustand/middleware';

export interface StorageService extends StateStorage {
  // Synchronous Core API (MMKV-Compliant)
  getString: (key: string) => string | undefined;
  set: (key: string, value: boolean | string | number) => void;
  delete: (key: string) => void;
  getBoolean: (key: string) => boolean;
  getNumber: (key: string) => number | undefined;
  contains: (key: string) => boolean;
  clearAll: () => void;
  getAllKeys: () => string[];

  // Zustand StateStorage Contract
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const isTestEnv =
  typeof process !== 'undefined' &&
  (process.env?.NODE_ENV === 'test' || process.env?.JEST_WORKER_ID !== undefined);

function createNativeStorage(): StorageService {
  // FIX-V733-10 & FIX-V7411-4: MMKV v4 default instance via createMMKV() with no arguments
  const mmkvModule = require('react-native-mmkv');
  const mmkv =
    typeof mmkvModule.createMMKV === 'function'
      ? mmkvModule.createMMKV()
      : new mmkvModule.MMKV();

  // v4 renamed MMKV.delete() to MMKV.remove() (delete is reserved in C++)
  const removeKey = (key: string): void => {
    if (typeof mmkv.remove === 'function') {
      mmkv.remove(key);
    } else if (typeof mmkv.delete === 'function') {
      mmkv.delete(key);
    }
  };

  return {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
    delete: removeKey,
    getBoolean: (key) => mmkv.getBoolean(key) ?? false,
    getNumber: (key) => mmkv.getNumber(key),
    contains: (key) =>
      typeof mmkv.contains === 'function' ? mmkv.contains(key) : mmkv.getString(key) !== undefined,
    clearAll: () => {
      if (typeof mmkv.clearAll === 'function') mmkv.clearAll();
    },
    getAllKeys: () => (typeof mmkv.getAllKeys === 'function' ? mmkv.getAllKeys() : []),

    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: removeKey,
  };
}

function createTestMemoryStorage(): StorageService {
  const memoryStore: Record<string, string> = {};

  return {
    getString: (key) => memoryStore[key],
    set: (key, value) => {
      memoryStore[key] = String(value);
    },
    delete: (key) => {
      delete memoryStore[key];
    },
    getBoolean: (key) => memoryStore[key] === 'true',
    getNumber: (key) => (memoryStore[key] !== undefined ? Number(memoryStore[key]) : undefined),
    contains: (key) => key in memoryStore,
    clearAll: () => {
      Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
    },
    getAllKeys: () => Object.keys(memoryStore),

    getItem: (key) => memoryStore[key] ?? null,
    setItem: (key, value) => {
      memoryStore[key] = value;
    },
    removeItem: (key) => {
      delete memoryStore[key];
    },
  };
}

let storageInstance: StorageService;

try {
  storageInstance = createNativeStorage();
} catch (error) {
  if (!isTestEnv) {
    throw error;
  }
  storageInstance = createTestMemoryStorage();
}

export const storage = storageInstance;
export { storageInstance };

// FIX-V7411-4 & FIX-V742-6: Canonical Zustand persist storage adapter
export const persistStorage = createJSONStorage(() => storageInstance);

export default storageInstance;
