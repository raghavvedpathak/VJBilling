// store/phase2/mastersSyncStore.ts — Phase 2 Canonical Master Sync Store

import { create } from 'zustand';

export interface MastersSyncState {
  categoryVersion: number;
  designVersion: number;
  stoneVersion: number;
  notifyCategoryChanged: () => void;
  notifyDesignChanged: () => void;
  notifyStoneChanged: () => void;
  notifyAllChanged: () => void;
}

export const useMastersSyncStore = create<MastersSyncState>((set) => ({
  categoryVersion: 0,
  designVersion: 0,
  stoneVersion: 0,
  notifyCategoryChanged: () =>
    set((state) => ({ categoryVersion: state.categoryVersion + 1 })),
  notifyDesignChanged: () =>
    set((state) => ({ designVersion: state.designVersion + 1 })),
  notifyStoneChanged: () =>
    set((state) => ({ stoneVersion: state.stoneVersion + 1 })),
  notifyAllChanged: () =>
    set((state) => ({
      categoryVersion: state.categoryVersion + 1,
      designVersion: state.designVersion + 1,
      stoneVersion: state.stoneVersion + 1,
    })),
}));

export const mastersSyncStore = useMastersSyncStore;
