// e2e/setup.ts — Canonical Detox / Jest Setup File (Phase 1 v8.0)
// v7.8 FIX-V78-7 & v7.15 FIX-V715-5: Expo SDK 57 expo-updates reloadAsync() no-op mock
// POST-V726 FIX: restoreAndBootstrap signature aligned with restore(encryptedFileContent, password)

import { jest } from '@jest/globals';
import { restore, restoreService } from '@/services/phase1/restoreService';
import { bootstrapDatabase } from '@/services/phase1/bootstrapService';

// 1. MOCK: expo-updates reloadAsync() no-op so Layer 2 restore tests do not kill the test runtime
const reloadAsyncMock = jest.fn(async () => undefined);
jest.mock('expo-updates', () => ({
  __esModule: true,
  reloadAsync: reloadAsyncMock,
  default: {
    reloadAsync: reloadAsyncMock,
  },
}));

// 2. HELPER: restoreAndBootstrap() (Review Item 5 / POST-V726 FIX)
// Manually executes bootstrapDatabase() after restore() to simulate post-reload bootstrap in test builds.
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
