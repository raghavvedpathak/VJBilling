// store/phase1/safeModeStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '@/utils/storage';

export type SafeModeTrigger = 
  | 'RESTORE_VALIDATION_FAILED'
  | 'VERIFY_CRITICAL_ISSUE'
  | 'MIGRATION_FAILED'
  | 'SCHEMA_VERSION_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'FY_INTEGRITY_BROKEN'
  | 'STORAGE_CORRUPTION_DETECTED'
  | 'UNKNOWN_ERROR';

type SafeModeSlice = { 
  isActive: boolean; 
  reason: SafeModeTrigger | null; 
  activatedAt: string | null; 
  setState: (state: Partial<SafeModeSlice>) => void;
};

// MMKV Synchronous StateStorage Adapter
const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    storage.delete(name);
  },
};

export const safeModeStore = create<SafeModeSlice>()(
  persist(
    (set) => ({ 
      isActive: false, 
      reason: null, 
      activatedAt: null, 
      setState: (newState) => set((state) => ({ ...state, ...newState }))
    }),
    { 
      name: 'safe-mode-store', 
      storage: createJSONStorage(() => zustandStorage) 
    }
  )
);

export const useSafeModeStore = safeModeStore;