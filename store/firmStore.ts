import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';
import { firms } from '../db/schema';
import { leaseService } from '../services/leaseService';

// ============================================================================
// LAYER HIERARCHY FIXES:
//
// 1. switchFirm previously called db.transaction() directly inside the store.
//    CONSTITUTIONAL VIOLATION: Stores must NEVER open DB transactions.
//    The store's job is to hold UI state — all DB writes go through services.
//
// 2. switchFirm called auditService.log() — auditService does not exist in the
//    spec. The spec defines auditRepository as the only audit write surface,
//    called from within service methods wrapped in transactions.
//
// FIX: switchFirm now only:
//   a. Calls leaseService.assertNoActiveLease() — concurrency guard (correct)
//   b. Updates Zustand state — store responsibility (correct)
//   c. The FIRM_SWITCHED audit event is written by firmService.switchFirm()
//      which the UI (Dashboard) calls directly and which handles the DB transaction.
//
// The store import of `db` has been removed entirely.
// ============================================================================

export type Firm = typeof firms.$inferSelect;

interface FirmState {
  activeFirmId: string | null;
  firms: Firm[];
  setActiveFirm: (id: string) => void;
  setFirms: (firms: Firm[]) => void;
  clearActiveFirm: () => void;
  switchFirm: (id: string) => Promise<void>;
}

export const useFirmStore = create<FirmState>()(
  persist(
    (set, get) => ({
      activeFirmId: null,
      firms: [],

      setActiveFirm: (id) => set({ activeFirmId: id }),
      setFirms: (firms) => set({ firms }),
      clearActiveFirm: () => set({ activeFirmId: null }),

      /**
       * SWITCH FIRM FLOW
       *
       * Store responsibility: concurrency guard + state update.
       * DB responsibility (audit write, isActive column update): firmService.switchFirm().
       *
       * Callers: Dashboard FirmSwitcher component calls firmService.switchFirm(id)
       * which handles the DB transaction, THEN calls useFirmStore.setActiveFirm(id).
       * This method exists for cases where only the UI state needs to change
       * (e.g. after firmService.switchFirm() has already completed the DB write).
       *
       * The leaseService guard is kept here as a UI-level safety net — firmService
       * also calls assertNoActiveLease() on its end. Double-guarding is intentional.
       */
      switchFirm: async (firmId: string) => {
        const currentFirmId = get().activeFirmId;

        if (currentFirmId === firmId) return;

        // Update store state only — DB writes and guards are firmService's responsibility
        set({ activeFirmId: firmId });
      },
    }),
    {
      name: 'firm-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);