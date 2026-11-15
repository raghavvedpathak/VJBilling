// store/phase1/appSettingsStore.ts — Phase 1 v7.47 (BLOCKER A, FIX-V740-6, FIX-V742-6) & Phase 2 Canonical Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/storage';

export type AppSettingsSlice = {
  theme: string;                 // 'system' | 'light' | 'dark' (FIX-V740-6)
  auditRetentionDays: number;    // v7.10: default 30
  auditRetentionLastRunAt: string | null; // v7.10: ISO-8601, null until first purge runs
  currency: string;              // 'INR' — read-only, never user-changeable (G67)
  currencySymbol: string;        // '₹' (G67)
  currencyDecimalPlaces: number; // 2 — paise (G67)
  dateFormatToken: string;       // default 'dd/MM/yyyy' (G68) — date-fns v3 token
  warnUnsavedChanges: number;    // 1 = ON (default), 0 = OFF (G69)
  updatedAt: string;             // ISO-8601

  setSettings: (settings: Partial<AppSettingsSlice>) => void;
};

export const appSettingsStore = create<AppSettingsSlice>()(
  persist(
    (set) => ({
      theme: 'system', // Matches DB seed (BLOCKER A / FIX-V740-6)
      auditRetentionDays: 30, // v7.10 default
      auditRetentionLastRunAt: null, // Matches DB seed
      currency: 'INR',
      currencySymbol: '\u20B9', // ₹ — Unicode escape per G67-LINT
      currencyDecimalPlaces: 2,
      dateFormatToken: 'dd/MM/yyyy', // date-fns v3 token
      warnUnsavedChanges: 1,
      updatedAt: '',

      setSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'app-settings-store',
      storage: persistStorage, // v7.42 FIX-V742-6
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.currencySymbol || state.currencySymbol === '$') {
            state.currencySymbol = '\u20B9';
          }
          if (!state.currency || state.currency === 'USD') {
            state.currency = 'INR';
          }
        }
      },
    }
  )
);
