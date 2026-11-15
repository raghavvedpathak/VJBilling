// utils/storage.ts — Phase 1 v7.47 (FIX-V7411-4, FIX-V742-6) & Phase 2–4 Canonical Synchronous Storage Service

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

export interface StorageService {
  // Synchronous Core API (MMKV-Compliant)
  getString: (key: string) => string | undefined;
  set: (key: string, value: boolean | string | number) => void;
  delete: (key: string) => void;
  getBoolean: (key: string) => boolean;
  getNumber: (key: string) => number | undefined;
  contains: (key: string) => boolean;
  clearAll: () => void;
  getAllKeys: () => string[];

  // Zustand StateStorage Compatibility Helpers
  setItem: (key: string, value: string) => void;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
}

let storageInstance: StorageService;

try {
  // 1. Production / Native Build: MMKV v4 Nitro Engine (FIX-V733-10, FIX-V7411-4)
  const { createMMKV, MMKV } = require('react-native-mmkv');

  // FIX-V7411-4: Call createMMKV() with NO arguments to open the default instance
  const mmkv = typeof createMMKV === 'function' ? createMMKV() : new MMKV();

  // v7.33 FIX-V733-10: Prioritize .remove() for MMKV v4; fallback to .delete() for v3
  const safeDelete = (key: string) => {
    if (typeof (mmkv as any).remove === 'function') {
      (mmkv as any).remove(key);
    } else if (typeof (mmkv as any).delete === 'function') {
      (mmkv as any).delete(key);
    }
  };

  storageInstance = {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
    delete: (key) => safeDelete(key),
    getBoolean: (key) => mmkv.getBoolean(key) ?? false,
    getNumber: (key) => mmkv.getNumber(key),
    contains: (key) =>
      typeof mmkv.contains === 'function' ? mmkv.contains(key) : mmkv.getString(key) !== undefined,
    clearAll: () => {
      if (typeof mmkv.clearAll === 'function') {
        mmkv.clearAll();
      }
    },
    getAllKeys: () => (typeof mmkv.getAllKeys === 'function' ? mmkv.getAllKeys() : []),

    // Zustand StateStorage Adapter Mappings
    setItem: (key, value) => mmkv.set(key, value),
    getItem: (key) => mmkv.getString(key) ?? null,
    removeItem: (key) => safeDelete(key),
  };
} catch {
  // 2. Fallback: In-Memory Synchronous Cache + AsyncStorage Sync (Jest Test Environment Only)
  const memoryStore: Record<string, string> = {};

  AsyncStorage.getAllKeys()
    .then(async (keys) => {
      const pairs = await AsyncStorage.multiGet(keys);
      pairs.forEach(([k, v]) => {
        if (v !== null) memoryStore[k] = v;
      });
    })
    .catch(() => {});

  storageInstance = {
    getString: (key) => memoryStore[key],
    set: (key, value) => {
      const strVal = String(value);
      memoryStore[key] = strVal;
      AsyncStorage.setItem(key, strVal).catch(() => {});
    },
    delete: (key) => {
      delete memoryStore[key];
      AsyncStorage.removeItem(key).catch(() => {});
    },
    getBoolean: (key) => memoryStore[key] === 'true',
    getNumber: (key) => (memoryStore[key] !== undefined ? Number(memoryStore[key]) : undefined),
    contains: (key) => key in memoryStore,
    clearAll: () => {
      Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
      AsyncStorage.clear().catch(() => {});
    },
    getAllKeys: () => Object.keys(memoryStore),

    setItem: (key, value) => {
      memoryStore[key] = value;
      AsyncStorage.setItem(key, value).catch(() => {});
    },
    getItem: (key) => memoryStore[key] ?? null,
    removeItem: (key) => {
      delete memoryStore[key];
      AsyncStorage.removeItem(key).catch(() => {});
    },
  };
}

export const storage = storageInstance;
export { storageInstance };

const zustandStorage: StateStorage = {
  getItem: (name) => storageInstance.getString(name) ?? null,
  setItem: (name, value) => storageInstance.set(name, value),
  removeItem: (name) => storageInstance.delete(name),
};

// FIX-V7411-4 & FIX-V742-6: Canonical Zustand persist storage adapter
export const persistStorage = createJSONStorage(() => zustandStorage);

export default storageInstance;
