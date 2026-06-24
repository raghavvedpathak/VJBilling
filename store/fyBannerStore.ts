// store/fyBannerStore.ts
import { create } from 'zustand';

interface FyBannerState {
  isDismissed: boolean;
  dismissBanner: () => void;
  resetBanner: () => void;
}

export const useFyBannerStore = create<FyBannerState>((set) => ({
  isDismissed: false,
  dismissBanner: () => set({ isDismissed: true }),
  resetBanner: () => set({ isDismissed: false }),
}));