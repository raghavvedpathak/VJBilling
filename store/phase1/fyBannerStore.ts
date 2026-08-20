// store/phase1/fyBannerStore.ts — Phase 1 & 2 Canonical FY Banner Store

import { create } from 'zustand';

export interface FyBannerState {
  bannerVisible: boolean;
  setBannerVisible: (visible: boolean) => void;
}

export const useFyBannerStore = create<FyBannerState>((set) => ({
  bannerVisible: false,
  setBannerVisible: (visible: boolean) => set({ bannerVisible: visible }),
}));

export const fyBannerStore = useFyBannerStore;
export default useFyBannerStore;