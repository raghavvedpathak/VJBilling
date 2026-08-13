import AsyncStorage from '@react-native-async-storage/async-storage';

// Define the interface for our storage engine
export interface StorageService {
  setItem: (key: string, value: string) => void | Promise<void>;
  getItem: (key: string) => string | null | Promise<string | null>;
  removeItem: (key: string) => void | Promise<void>;
  
  // Custom helpers for boolean/number/string flags
  set: (key: string, value: boolean | string | number) => void | Promise<void>;
  getBoolean: (key: string) => boolean | Promise<boolean>;

  // Methods required by canonical pinService.ts, verifyService.ts, and bootstrapService.ts
  getString: (key: string) => string | undefined;
  delete: (key: string) => void | Promise<void>;
}

let storageInstance: StorageService;

try {
  // 1. Try to load MMKV dynamically (Production / Native Build)
  const { createMMKV, MMKV } = require('react-native-mmkv');
  
  const mmkv = typeof createMMKV === 'function' 
    ? createMMKV({ id: 'vjbilling-storage' }) 
    : new MMKV({ id: 'vjbilling-storage' });

  const safeDelete = (key: string) => {
    if (typeof mmkv.delete === 'function') {
      mmkv.delete(key);
    } else if (typeof (mmkv as any).remove === 'function') {
      (mmkv as any).remove(key);
    }
  };

  // 2. Setup MMKV Adapter (Synchronous & Blisteringly Fast)
  storageInstance = {
    setItem: (key, value) => mmkv.set(key, value),
    getItem: (key) => {
      const value = mmkv.getString(key);
      return value ?? null;
    },
    removeItem: (key) => safeDelete(key),
    
    // Extended Methods
    set: (key, value) => mmkv.set(key, value),
    getBoolean: (key) => mmkv.getBoolean(key) ?? false,

    // Methods required by canonical pinService, verifyService, and bootstrapService
    getString: (key) => mmkv.getString(key),
    delete: (key) => safeDelete(key)
  };
  
  console.log('[Storage] High-Performance MMKV Engine Initialized');

} catch (e: any) {
  // 3. Fallback to AsyncStorage (Safe Mode for Expo Go / Web)
  console.log('[Storage] Native MMKV not found, safely falling back to AsyncStorage. Error:', e?.message ?? e);
  
  storageInstance = {
    setItem: async (key, value) => {
      await AsyncStorage.setItem(key, value);
    },
    getItem: async (key) => {
      return await AsyncStorage.getItem(key);
    },
    removeItem: async (key) => {
      await AsyncStorage.removeItem(key);
    },
    
    // Extended Methods (Async Shim)
    set: async (key, value) => {
      await AsyncStorage.setItem(key, String(value));
    },
    getBoolean: async (key) => {
      const val = await AsyncStorage.getItem(key);
      return val === 'true';
    },

    // Fallback for pinService.ts / verifyService.ts methods
    getString: (key) => {
      console.warn(`[Storage] WARNING: Synchronous getString('${key}') called on AsyncStorage fallback.`);
      return undefined;
    },
    delete: async (key) => {
      await AsyncStorage.removeItem(key);
    }
  };
}

// Export the singleton instance
export const storage = storageInstance;