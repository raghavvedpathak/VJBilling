// e2e/setup.ts — Canonical Detox / Jest Setup File

import { jest } from '@jest/globals';

// 1. MOCK: expo-updates
// Intercepts Updates.reloadAsync() in development/debug builds to prevent native crashes.
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(async () => {}),
}));

// 2. HELPER: restoreAndBootstrap()
export async function restoreAndBootstrap(backupFileUri: string): Promise<void> {
  console.log(`[E2E] Simulating Layer 2 Restore with backup: ${backupFileUri}`);
  console.warn(`[E2E] Programmatic DB injection stub reached.`);
}