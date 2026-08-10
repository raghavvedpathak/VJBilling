// store/fyBannerStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';

interface FyBannerState {
  bannerVisible: boolean;
  setBannerVisible: (visible: boolean) => void;
}

export const useFyBannerStore = create<FyBannerState>((set) => ({
  bannerVisible: false,
  setBannerVisible: (visible: boolean) => set({ bannerVisible: visible }),
}));