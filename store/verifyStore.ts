import { create } from 'zustand';
import { VerifyFinding } from '../services/verifyService'; // <-- FIX 1: Import the new canonical type

interface VerifyState {
  lastScanIssues: VerifyFinding[]; // <-- FIX 2: Update interface
  hasUnviewedWarnings: boolean;
  
  // Actions
  setScanResults: (issues: VerifyFinding[]) => void; // <-- FIX 3: Update interface
  markWarningsViewed: () => void;
}

// FIX: Renamed from useVerifyStore to verifyStore to comply with Phase 1 architectural naming conventions.
// UI Components needing reactivity should import `useStore` from `zustand` and bind to this instance.
export const verifyStore = create<VerifyState>((set) => ({
  lastScanIssues: [],
  hasUnviewedWarnings: false,
  
  // Called silently by verifyService
  setScanResults: (issues) => set({
    lastScanIssues: issues,
    // FIX 4: Use 'severity' instead of 'level' to match VerifyFinding
    hasUnviewedWarnings: issues.some(i => i.severity === 'WARNING') && !issues.some(i => i.severity === 'CRITICAL')
  }),
  
  // Called by the UI when the user taps the amber banner and views the details
  markWarningsViewed: () => set({ hasUnviewedWarnings: false }),
}));