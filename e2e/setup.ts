// e2e/setup.ts
// v7.8 FIX-V78-7 — Canonical Implementation
// Detox / Jest setup file for Layer 2 Restore Tests.

import { jest } from '@jest/globals';

// ============================================================================
// 1. MOCK: expo-updates (v7.8 Review Item 5)
// In development/debug builds, Updates.reloadAsync() throws an unhandled
// native module error ("not supported in development builds"), breaking tests.
// This mock intercepts the call and resolves silently.
// ============================================================================
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(async () => {}),
}));

// ============================================================================
// 2. HELPER: restoreAndBootstrap()
// All Layer 2 restore tests MUST use this helper. 
// NOTE: Since Phase 1 DB bootstrapping is safely encapsulated inside the 
// useDatabase() React hook, programmatic E2E DB injection is stubbed here 
// until Detox UI-automation tests are explicitly written.
// ============================================================================
export async function restoreAndBootstrap(backupFileUri: string): Promise<void> {
  console.log(`[E2E] Simulating Layer 2 Restore with backup: ${backupFileUri}`);
  console.warn(`[E2E] Programmatic DB injection stub reached.`);
  
  // Future Detox API calls will be placed here to tap the UI buttons
  // for the restore flow instead of injecting the DB directly.
}