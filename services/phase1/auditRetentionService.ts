// services/phase1/auditRetentionService.ts — Phase 1 v7.47 Canonical Service
// Implements FIX-V740-6, FIX-V740-8, FIX-V741-6, FIX-V742-2

import { subDays } from 'date-fns';
import { and, eq, lt, max, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { safeTransaction } from '@/db/safeTransaction';
import { auditLogs, auditDeleteGate, appSettings } from '@/db/schema';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import {
  MIN_AUDIT_RETENTION_DAYS,
  MAX_CLOCK_GAP_DAYS,
  PURGE_EXEMPT_EVENTS,
} from '@/constants/auditRetention';

export { MIN_AUDIT_RETENTION_DAYS, MAX_CLOCK_GAP_DAYS, PURGE_EXEMPT_EVENTS };

const DAY = 86_400_000;

export async function purgeExpiredAuditLogs(): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1 — Dual Guard
  safeModeService.assertNotInSafeMode();    // GUARD 2 — Dual Guard

  const { auditRetentionDays, auditRetentionLastRunAt: lastRun } =
    appSettingsStore.getState(); // default 30

  // FIX-V740-6: Refuse to purge if retention is non-integer or below 30 days
  if (
    !Number.isInteger(auditRetentionDays) ||
    auditRetentionDays < MIN_AUDIT_RETENTION_DAYS
  ) {
    throw new Error(
      ERR.AUDIT_RETENTION_INVALID +
        ': refusing to purge with auditRetentionDays=' +
        auditRetentionDays
    );
  }

  // FIX-V740-6: Clock-skew year window — a wrong clock must never trigger deletion
  const nowDate = new Date();
  const nowYear = nowDate.getFullYear();
  if (nowYear < 2020 || nowYear > 2040) {
    return;
  }

  // FIX-V741-6: Three clock guards
  const nowMs = nowDate.getTime();

  // (1) Clock moved BACK since the last purge
  if (lastRun && nowMs < Date.parse(lastRun)) {
    console.warn('audit purge skipped: clock earlier than last purge');
    return;
  }

  const newestRow = db
    .select({ t: max(auditLogs.createdAt) })
    .from(auditLogs)
    .get();
  const newest = newestRow?.t ?? null;

  if (newest) {
    const newestMs = Date.parse(newest);
    // (2) Newest audit row is in the future
    if (newestMs > nowMs + DAY) {
      console.warn('audit purge skipped: newest audit row is in the future');
      return;
    }
    // (3) Implausible jump forward (> 90 days since newest audit row)
    if (nowMs - newestMs > MAX_CLOCK_GAP_DAYS * DAY) {
      console.warn('audit purge skipped: clock gap too large');
      return;
    }
  }

  const cutoff = subDays(nowDate, auditRetentionDays).toISOString();

  let deviceId: string;
  try {
    deviceId = getDeviceId();
  } catch {
    deviceId = 'DEV-DEVICE-ID';
  }

  const executionTime = now();

  // FIX-V740-8 & FIX-V742-2: Synchronous transaction with identity events exempted
  safeTransaction((tx) => {
    tx.update(auditDeleteGate)
      .set({ gateOpen: 1 })
      .where(eq(auditDeleteGate.id, 1))
      .run();

    const result = tx
      .delete(auditLogs)
      .where(
        and(
          lt(auditLogs.createdAt, cutoff),
          notInArray(auditLogs.eventType, [...PURGE_EXEMPT_EVENTS])
        )
      )
      .run();

    tx.update(auditDeleteGate)
      .set({ gateOpen: 0 })
      .where(eq(auditDeleteGate.id, 1))
      .run();

    auditRepository.log(tx, {
      eventType: 'AUDIT_RETENTION_PURGE_EXECUTED',
      firmId: null,
      deviceId,
      payload: JSON.stringify({
        deletedCount: result?.changes ?? 0,
        auditRetentionDays,
        cutoff,
        executedAt: executionTime,
      }),
    });

    tx.update(appSettings)
      .set({ auditRetentionLastRunAt: executionTime })
      .where(eq(appSettings.id, 1))
      .run();
  });

  // SETSTATE-OUTSIDE-TX COROLLARY: updates Zustand store strictly after tx commits
  appSettingsStore.setState({ auditRetentionLastRunAt: executionTime });
}

export const auditRetentionService = {
  purgeExpiredAuditLogs,
};

export default purgeExpiredAuditLogs;
