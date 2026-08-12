// store/phase1/firmStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '@/utils/storage';
import { firms } from '@/db/schema';

export type Firm = typeof firms.$inferSelect;

interface FirmState {
  activeFirmId: string | null;
  firms: Firm[];
  setActiveFirm: (id: string) => void;
  setFirms: (firms: Firm[]) => void;
  clearActiveFirm: () => void;
  switchFirm: (id: string) => Promise<void>;
}

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

export const useFirmStore = create<FirmState>()(
  persist(
    (set, get) => ({
      activeFirmId: null,
      firms: [],

      setActiveFirm: (id) => set({ activeFirmId: id }),
      setFirms: (firms) => set({ firms }),
      clearActiveFirm: () => set({ activeFirmId: null }),

      switchFirm: async (firmId: string) => {
        const currentFirmId = get().activeFirmId;
        if (currentFirmId === firmId) return;
        set({ activeFirmId: firmId });
      },
    }),
    {
      name: 'firm-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
