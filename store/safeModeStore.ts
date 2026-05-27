import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';

export type SafeModeTrigger = 
  | 'RESTORE_VALIDATION_FAILED'
  | 'VERIFY_CRITICAL_ISSUE'
  | 'MIGRATION_FAILED'
  | 'SCHEMA_VERSION_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'FY_INTEGRITY_BROKEN'
  | 'STORAGE_CORRUPTION_DETECTED' // ARCHITECT FIX: Added missing constitutional trigger
  | 'UNKNOWN_ERROR';

type SafeModeSlice = { 
  isActive: boolean; 
  reason: SafeModeTrigger | null; 
  activatedAt: string | null; 
  setState: (state: Partial<SafeModeSlice>) => void;
};

export const useSafeModeStore = create<SafeModeSlice>()(
  persist(
    (set) => ({ 
      isActive: false, 
      reason: null, 
      activatedAt: null,
      setState: (newState) => set((state) => ({ ...state, ...newState }))
    }),
    { name: 'safe-mode-store', storage: createJSONStorage(() => storage) }
  )
);