// store/phase3/taxGroupStore.ts — Phase 3 Tax Group Zustand Cache (FIX-V520-3, FIX-V521-3)
// LOCKED INTERFACE (v5.21):
// interface TaxGroupStoreState {
//   groups: TaxGroupWithRates[] | null; // null = not loaded or invalidated
//   loadedAt: number | null; // Date.now() timestamp of last successful load
// }

import { create } from 'zustand';
import { TaxGroupWithRates } from '@/types/phase3/phase3.types';

export const TAX_GROUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface TaxGroupStoreState {
  groups: TaxGroupWithRates[] | null; // null = not loaded or invalidated
  loadedAt: number | null; // Date.now() timestamp of last successful load
  firmId: string | null;
  setGroups: (firmId: string, groups: TaxGroupWithRates[]) => void;
  invalidate: () => void;
  isFresh: (firmId: string) => boolean;
}

export const taxGroupStore = create<TaxGroupStoreState>((set, get) => ({
  groups: null,
  loadedAt: null,
  firmId: null,

  setGroups: (firmId: string, groups: TaxGroupWithRates[]) => {
    set({
      groups,
      firmId,
      loadedAt: Date.now(),
    });
  },

  invalidate: () => {
    set({
      groups: null,
      loadedAt: null,
      firmId: null,
    });
  },

  isFresh: (firmId: string) => {
    const { groups, firmId: cachedFirmId, loadedAt } = get();
    if (!groups || cachedFirmId !== firmId || !loadedAt) {
      return false;
    }
    return Date.now() - loadedAt < TAX_GROUP_TTL_MS;
  },
}));

/**
 * Selector with TTL enforcement (5 minutes):
 * CONSUMER RULE: calculateInvoice() and previewInvoice() call getGroupsWithTTL() before resolving rates.
 */
export const getGroupsWithTTL = async (firmId: string): Promise<TaxGroupWithRates[]> => {
  const { groups, loadedAt, firmId: cachedFirmId } = taxGroupStore.getState();
  const TTL = TAX_GROUP_TTL_MS;

  if (groups !== null && loadedAt !== null && cachedFirmId === firmId && Date.now() - loadedAt < TTL) {
    return groups;
  }

  // Dynamic import to prevent circular dependency with taxMasterService
  const { taxMasterService } = require('@/services/phase3/taxMasterService');
  const fresh: TaxGroupWithRates[] = await taxMasterService.getActiveTaxGroups(firmId);
  taxGroupStore.setState({ groups: fresh, loadedAt: Date.now(), firmId });
  return fresh;
};

export const useTaxGroupStore = taxGroupStore;
export default taxGroupStore;
