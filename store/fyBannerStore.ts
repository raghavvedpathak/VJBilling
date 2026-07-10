// store/fyBannerStore.ts
import { create } from 'zustand';

interface FyBannerState {
  bannerVisible: boolean;
  setBannerVisible: (visible: boolean) => void;
}

export const useFyBannerStore = create<FyBannerState>((set) => ({
  bannerVisible: false,
  setBannerVisible: (visible: boolean) => set({ bannerVisible: visible }),
}));