// store/phase1/safeModeStore.ts — Phase 1 v7.47 (Step 8, v5.1 S3, FIX-V742-6) & Phase 2 Canonical Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/storage';

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

export const safeModeStore = create<SafeModeSlice>()(
  persist(
    (set) => ({
      isActive: false,
      reason: null,
      activatedAt: null,
      setState: (newState) => set((state) => ({ ...state, ...newState })),
    }),
    {
      name: 'safe-mode-store',
      storage: persistStorage, // v7.42 FIX-V742-6
    }
  )
);

export const useSafeModeStore = safeModeStore;
