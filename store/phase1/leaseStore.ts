// store/phase1/leaseStore.ts — Phase 1 & 2 Canonical Lease Store

import { create } from 'zustand';

export interface ActiveLease {
  id: string;
  leaseType: string;  // matches writerLeases.leaseType column
  acquiredAt: string; // ISO datetime string
}

export interface LeaseState {
  activeLease: ActiveLease | null;
  setActiveLease: (lease: ActiveLease | null) => void;
}

// In-memory only — leases are session-scoped and purged on boot
export const useLeaseStore = create<LeaseState>()((set) => ({
  activeLease: null,
  setActiveLease: (lease) => set({ activeLease: lease }),
}));

export const leaseStore = useLeaseStore;
export default useLeaseStore;
