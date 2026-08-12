// store/phase1/verifyStore.ts — Phase 2 v2.11 Canonical Store

import { create } from 'zustand';
import type { VerifyFinding } from '@/services/phase1/verifyService';

interface VerifyState {
  lastScanIssues: VerifyFinding[];
  hasUnviewedWarnings: boolean;
  
  setScanResults: (issues: VerifyFinding[]) => void;
  markWarningsViewed: () => void;
}

export const verifyStore = create<VerifyState>((set) => ({
  lastScanIssues: [],
  hasUnviewedWarnings: false,
  
  setScanResults: (issues) => set({
    lastScanIssues: issues,
    hasUnviewedWarnings: issues.some(i => i.severity === 'WARNING') && !issues.some(i => i.severity === 'CRITICAL')
  }),
  
  markWarningsViewed: () => set({ hasUnviewedWarnings: false }),
}));

export const useVerifyStore = verifyStore;