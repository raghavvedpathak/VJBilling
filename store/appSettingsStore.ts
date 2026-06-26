import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';

// ============================================================================
// NAMING FIX: This store was previously exported as `appSettingsStore`.
// That name is wrong for two reasons:
//   1. Zustand stores created with create() ARE React hooks. React's rules of
//      hooks require all hooks to start with `use`. ESLint will error otherwise.
//   2. useUnsavedChangesGuard calls useAppSettingsStore((s) => s.warnUnsavedChanges)
//      as a reactive selector — this pattern only works when the export name
//      starts with `use`. The previous name caused a silent runtime mismatch.
//
// The "ARCHITECT FIX: Renamed from useAppSettingsStore to appSettingsStore"
// comment in the old file was incorrect. The correct name is useAppSettingsStore.
// ============================================================================

type AppSettingsSlice = {
  theme: string;
  auditRetentionDays: number;
  auditRetentionLastRunAt: string | null;
  currency: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  dateFormatToken: string;
  warnUnsavedChanges: number; // integer: 1 = ON, 0 = OFF (matches DB schema)
  updatedAt: string;

  // Action: called by settingsService after loading/updating app_settings from DB.
  // Also called on bootstrap to hydrate from DB into the store.
  setSettings: (settings: Partial<AppSettingsSlice>) => void;
};

export const useAppSettingsStore = create<AppSettingsSlice>()(
  persist(
    (set) => ({
      // Defaults match the seed row inserted by db/client.ts Migration Zero fallback.
      theme: 'system',
      auditRetentionDays: 30, // matches schema v7.10 default
      auditRetentionLastRunAt: null,
      currency: 'INR',
      currencySymbol: '\u20B9', // ₹ — Unicode escape per G67-LINT
      currencyDecimalPlaces: 2,
      dateFormatToken: 'dd/MM/yyyy', // date-fns v3 casing
      warnUnsavedChanges: 1,
      updatedAt: '', // Empty string until first DB hydration — prevents mismatch

      setSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'app-settings-store',
      storage: createJSONStorage(() => storage as any),
    }
  )
);