// store/phase1/leaseStore.ts — Phase 1 & 2 Canonical Lease Store (Step 8, v5.1 S3)

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '@/utils/storage';

export interface ActiveLease {
  id: string;
  type?: string;      // Canonical Step 8 property
  leaseType?: string; // Schema column alias
  acquiredAt?: string;
}

export interface LeaseState {
  activeLease: ActiveLease | null;
  setActiveLease: (lease: ActiveLease | null) => void;
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

export const useLeaseStore = create<LeaseState>()(
  persist(
    (set) => ({
      activeLease: null,
      setActiveLease: (lease) => set({ activeLease: lease }),
    }),
    {
      name: 'lease-store',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);

export const leaseStore = useLeaseStore;
export default useLeaseStore;