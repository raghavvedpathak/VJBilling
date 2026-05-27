import { create } from 'zustand';

// ============================================================================
// ARCHITECTURAL FIX: persist() REMOVED.
//
// Leases are session-scoped. bootstrapService.initApp() Step 3 purges ALL
// writer leases from the DB on every app start:
//   await db.transaction(tx => tx.delete(writerLeases))
//
// If lease state were persisted to MMKV, a stale "ACTIVE" lease could survive
// a crash and cause LeaseStatusBanner to show a false lock state on the next
// boot — even though the DB has no active leases. The banner's DB poll would
// eventually correct this, but there would be a flash of incorrect UI.
//
// The source of truth for lease state is always the DB, read via
// leaseRepository.getActiveLease(). This store is an in-memory cache only —
// it does NOT persist across app restarts.
//
// FIELD FIX: `type` renamed to `leaseType` to match the writerLeases schema
// column name. Using `type` caused a field name mismatch when leaseService
// set the store from a DB row.
//
// FIELD FIX: `acquiredAt` made required. Every lease row has an acquiredAt
// timestamp — making it optional allowed incomplete lease objects in the store.
// ============================================================================

export interface ActiveLease {
  id: string;
  leaseType: string;  // matches writerLeases.leaseType column — was incorrectly `type`
  acquiredAt: string; // required — every lease has this timestamp
}

interface LeaseState {
  activeLease: ActiveLease | null;
  setActiveLease: (lease: ActiveLease | null) => void;
}

// No persist() — leases are session-scoped, purged on every boot
export const useLeaseStore = create<LeaseState>()((set) => ({
  activeLease: null,
  setActiveLease: (lease) => set({ activeLease: lease }),
}));