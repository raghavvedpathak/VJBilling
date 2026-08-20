// e2e/setup.ts — Canonical Detox / Jest Setup File
// v7.8 FIX-V78-7: Updates.reloadAsync() mock
// POST-V726 FIX: restoreAndBootstrap signature aligned with restore(encryptedFileContent, password)

import { jest } from '@jest/globals';
import { restore, restoreService } from '@/services/phase1/restoreService';
import { bootstrapDatabase } from '@/services/phase1/bootstrapService';

// 1. MOCK: expo-updates
// Intercepts Updates.reloadAsync() in development/debug builds to prevent native crashes.
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn().mockImplementation(async () => {}),
}));

// 2. HELPER: restoreAndBootstrap() (Review Item 5 / POST-V726 FIX)
// Manually executes bootstrapDatabase() after restore() to simulate the post-reload bootstrap in test builds.
export async function restoreAndBootstrap(
  encryptedFileContent: string,
  password?: string
): Promise<void> {
  if (typeof restore === 'function') {
    await restore(encryptedFileContent, password);
  } else if (restoreService && typeof restoreService.restore === 'function') {
    await restoreService.restore(encryptedFileContent, password);
  }
  await bootstrapDatabase();
}