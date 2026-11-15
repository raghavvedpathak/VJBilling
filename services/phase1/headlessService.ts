// services/phase1/headlessService.ts — Phase 1 v7.47 Canonical Headless Readiness Service
// Implements FIX-V746-2 & FIX-V747-2

import { getSqlite } from '@/db';
import { loadSafeModeState, bootstrapComplete } from '@/services/phase1/safeModeService';
import { SCHEMA_VERSION } from '@/constants/appVersion';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';
import { getDeviceId } from '@/utils/deviceId';

/**
 * Minimal readiness for a BACKGROUND backup run (FIX-V746-2, FIX-V747-2).
 * NEVER runs migrate(), purgeExpiredAuditLogs(), runVerify(), or flushPendingAudit().
 */
export async function ensureHeadlessReady(): Promise<boolean> {
  try {
    // First-time PIN setup unfinished: onboarding is not complete, do nothing
    if (!isPinSet() && !isPinSkipped()) return false;

    const row = getSqlite().getFirstSync<{ current_version: number }>(
      'SELECT current_version FROM schema_version WHERE id = 1'
    );
    // Needs a migration: the next normal app open will migrate
    if (!row || row.current_version !== SCHEMA_VERSION) return false;

    // Throws DEVICE_ID_NOT_INITIALIZED if missing
    getDeviceId();

    await loadSafeModeState();
    // Safe Mode is NOT a reason to stop (G40 / FIX-V747-3: backup is a read operation)
    bootstrapComplete.value = true; // This headless JS context only
    return true;
  } catch {
    return false;
  }
}

export const headlessService = {
  ensureHeadlessReady,
};

export default headlessService;
