// store/phase1/useFirmStore.ts — Phase 1 v7.47 (Step 7, Step 8, v5.1 S3, FIX-V742-6) & Phase 2 Canonical Firm Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/storage';
import { firms } from '@/db/schema';

export type Firm = typeof firms.$inferSelect;

export interface FirmState {
  activeFirmId: string | null;
  firms: Firm[];
  setActiveFirm: (id: string) => void;
  setFirms: (firms: Firm[]) => void;
  clearActiveFirm: () => void;
  switchFirm: (id: string) => void;
}

export const useFirmStore = create<FirmState>()(
  persist(
    (set) => ({
      activeFirmId: null,
      firms: [],

      setActiveFirm: (id) => set({ activeFirmId: id }),
      setFirms: (firms) => set({ firms }),
      clearActiveFirm: () => set({ activeFirmId: null }),

      switchFirm: (firmId: string) => {
        set({ activeFirmId: firmId });
      },
    }),
    {
      name: 'firm-store',
      storage: persistStorage, // v7.42 FIX-V742-6
    }
  )
);

export const firmStore = useFirmStore;
export default useFirmStore;
