import AsyncStorage from '@react-native-async-storage/async-storage';

// Define the interface for our storage engine
export interface StorageService {
  setItem: (key: string, value: string) => void | Promise<void>;
  getItem: (key: string) => string | null | Promise<string | null>;
  removeItem: (key: string) => void | Promise<void>;
  
  // Custom helpers for boolean/number flags (e.g., VerifyService & Safe Mode)
  set: (key: string, value: boolean | string | number) => void | Promise<void>;
  getBoolean: (key: string) => boolean | Promise<boolean>;
}

let storageInstance: StorageService;

try {
  // 1. Try to load MMKV dynamically (Production / Native Build)
  const { MMKV } = require('react-native-mmkv');
  
  const mmkv = new MMKV({
    id: 'vjbilling-storage',
  });

  // 2. Setup MMKV Adapter (Synchronous & Blisteringly Fast)
  storageInstance = {
    setItem: (key, value) => mmkv.set(key, value),
    getItem: (key) => {
      const value = mmkv.getString(key);
      return value ?? null;
    },
    removeItem: (key) => mmkv.delete(key),
    
    // Extended Methods
    set: (key, value) => mmkv.set(key, value),
    getBoolean: (key) => mmkv.getBoolean(key) ?? false
  };
  
  console.log('[Storage] High-Performance MMKV Engine Initialized');

} catch (e) {
  // 3. Fallback to AsyncStorage (Safe Mode for Expo Go / Web)
  console.log('[Storage] Native MMKV not found, safely falling back to AsyncStorage');
  
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
      // AsyncStorage only stores strings natively
      await AsyncStorage.setItem(key, String(value));
    },
    getBoolean: async (key) => {
      const val = await AsyncStorage.getItem(key);
      return val === 'true';
    }
  };
}

// Export the singleton instance
export const storage = storageInstance;