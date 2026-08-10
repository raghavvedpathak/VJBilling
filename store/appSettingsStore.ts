// store/appSettingsStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';

type AppSettingsSlice = {
  theme: string;
  auditRetentionDays: number;
  auditRetentionLastRunAt: string | null;
  currency: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  dateFormatToken: string;
  warnUnsavedChanges: number; // 1 = ON, 0 = OFF (matches DB schema)
  updatedAt: string;

  setSettings: (settings: Partial<AppSettingsSlice>) => void;
};

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
      theme: 'saffron',
      auditRetentionDays: 30, // v7.10 default
      auditRetentionLastRunAt: null,
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
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);