// store/phase1/leaseStore.ts — Phase 1 v7.47 (Step 8, v5.1 S3, FIX-V742-6) & Phase 2 Canonical Lease Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/storage';

export interface ActiveLease {
  id: string;
  type?: string; // Canonical Step 8 property
  leaseType?: string; // Schema column alias
  acquiredAt?: string;
}

export interface LeaseState {
  activeLease: ActiveLease | null;
  setActiveLease: (lease: ActiveLease | null) => void;
}

export const useLeaseStore = create<LeaseState>()(
  persist(
    (set) => ({
      activeLease: null,
      setActiveLease: (lease) => set({ activeLease: lease }),
    }),
    {
      name: 'lease-store',
      storage: persistStorage, // v7.42 FIX-V742-6
    }
  )
);

export const leaseStore = useLeaseStore;
export default useLeaseStore;
