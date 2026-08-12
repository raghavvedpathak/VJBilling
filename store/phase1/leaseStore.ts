// store/leaseStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';

export interface ActiveLease {
  id: string;
  leaseType: string;  // matches writerLeases.leaseType column
  acquiredAt: string; // ISO datetime string
}

interface LeaseState {
  activeLease: ActiveLease | null;
  setActiveLease: (lease: ActiveLease | null) => void;
}

// In-memory only — leases are session-scoped and purged on boot
export const useLeaseStore = create<LeaseState>()((set) => ({
  activeLease: null,
  setActiveLease: (lease) => set({ activeLease: lease }),
}));
