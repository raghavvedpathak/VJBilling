import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';

// ============================================================================
// SPEC ALIGNMENT FIX: The Phase 1 Contract (G64) explicitly names this 
// store `appSettingsStore`. Renaming it to `useAppSettingsStore` breaks 
// the `.getState()` and `.setState()` calls in all the background services.
//
// To use this in a React component without violating hooks rules:
// import { useStore } from 'zustand';
// const theme = useStore(appSettingsStore, (state) => state.theme);
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

// Map our custom storage interface to Zustand's StateStorage
const zustandStorage: StateStorage = {
  setItem: async (name, value) => {
    await storage.setItem(name, value);
  },
  getItem: async (name) => {
    const value = await storage.getItem(name);
    return value ?? null;
  },
  removeItem: async (name) => {
    await storage.removeItem(name);
  },
};

export const appSettingsStore = create<AppSettingsSlice>()(
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
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);