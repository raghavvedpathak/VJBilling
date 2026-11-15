// services/phase1/autoBackupService.ts — Phase 1 v7.47 Canonical Daily Automatic Backup Service
// Implements FIX-V745-3, FIX-V746-1, FIX-V747-1, FIX-V747-2, FIX-V747-3

import * as BackgroundTask from 'expo-background-task';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { safeTransaction } from '@/db/safeTransaction';
import { storage } from '@/utils/storage';
import { createBackup, pruneAutoBackups } from '@/services/phase1/backupService';
import { bootstrapComplete } from '@/services/phase1/safeModeService';
import { ensureHeadlessReady } from '@/services/phase1/headlessService';
import {
  rescheduleOverdueReminder,
  dismissBackupFailureNotification,
  dismissMissedNotification,
  notifyBackupDone,
  notifyBackupFailed,
  cancelAllBackupNotifications,
} from '@/services/phase1/backupNotificationService';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { ERR } from '@/constants/errorCodes';
import {
  AB_KEYS,
  AUTO_BACKUP_INTERVAL_MS,
  AUTO_BACKUP_COOLDOWN_MS,
  AUTO_BACKUP_TASK,
  BACKGROUND_LEASE_TTL_MINUTES,
  isInBackupWindow,
  localDay,
  type AutoBackupReason,
  type AutoBackupResult,
  type BackupTrigger,
} from '@/constants/autoBackup';

let inFlight: Promise<AutoBackupResult> | null = null;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export function isAutoBackupDue(now = Date.now()): boolean {
  const last = storage.getString(AB_KEYS.lastSuccessAt);
  if (!last) return true;
  const t = Date.parse(last);
  if (Number.isNaN(t) || t > now) return true; // Unreadable, or the clock moved back
  return now - t >= AUTO_BACKUP_INTERVAL_MS;
}

export function runAutoBackupIfDue(trigger: BackupTrigger): Promise<AutoBackupResult> {
  if (inFlight) return Promise.resolve('RUNNING');
  inFlight = runInner(trigger).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// v7.47 FIX-V747-1: Canonical runInner() implementation
async function runInner(trigger: BackupTrigger): Promise<AutoBackupResult> {
  if (storage.getString(AB_KEYS.enabled) !== 'true') return 'DISABLED';
  const nowDate = new Date();
  const now = nowDate.getTime();

  if (trigger === 'BACKGROUND') {
    // Clock guards (FIX-V746-1)
    const y = nowDate.getFullYear();
    if (y < 2020 || y > 2040) return 'NOT_DUE';
    const lastOk = Date.parse(storage.getString(AB_KEYS.lastSuccessAt) ?? '');
    if (!Number.isNaN(lastOk) && now < lastOk) return 'NOT_DUE';

    // Window and once per local day. NO 24-hour rule here (FIX-V747-1)
    if (!isInBackupWindow(nowDate)) return 'NOT_DUE';
    if (storage.getString(AB_KEYS.lastSuccessDay) === localDay(nowDate)) return 'NOT_DUE';

    // Headless start: no React tree, so bootstrap never ran (FIX-V746-2, FIX-V747-2).
    // Safe Mode is NOT checked: backup is a read operation (G40 / FIX-V747-3).
    if (!bootstrapComplete.value && !(await ensureHeadlessReady())) {
      return await fail('FAILED', 'BACKGROUND_NOT_READY');
    }
  } else {
    if (!bootstrapComplete.value) return 'NOT_READY';
    if (trigger !== 'NOW') {
      if (!isAutoBackupDue(now)) return 'NOT_DUE'; // v7.45 24-hour rule: foreground catch-up only
      const lastAttempt = Date.parse(storage.getString(AB_KEYS.lastAttemptAt) ?? '');
      const lastStatus = storage.getString(AB_KEYS.lastStatus);
      if (
        (lastStatus === 'FAILED' || lastStatus === 'NEEDS_FOLDER') &&
        !Number.isNaN(lastAttempt) &&
        lastAttempt <= now &&
        now - lastAttempt < AUTO_BACKUP_COOLDOWN_MS
      ) {
        return 'COOLDOWN';
      }
    }
  }

  // Never back up an empty database; FIX-V746-6: plain SELECT, no transaction
  if (firmRepository.countFirmsReadOnly() === 0) return 'NO_DATA';

  storage.set(AB_KEYS.lastAttemptAt, new Date(now).toISOString());
  storage.set(AB_KEYS.lastTrigger, trigger);

  try {
    const dirUri = storage.getString('vjbilling_public_backup_dir_uri');
    if (!dirUri) return await fail('NEEDS_FOLDER', 'FOLDER_NOT_GRANTED');
    try {
      await StorageAccessFramework.readDirectoryAsync(dirUri);
    } catch {
      return await fail('NEEDS_FOLDER', 'FOLDER_ACCESS_REVOKED');
    }

    const r = await createBackup(undefined, {
      share: false,
      kind: 'AUTO',
      trigger,
      ...(trigger === 'BACKGROUND'
        ? { leaseTtlMinutes: BACKGROUND_LEASE_TTL_MINUTES }
        : {}),
    });

    if (!r.mirroredToPublicStorage) {
      return await fail('FAILED', 'MIRROR_FAILED'); // Internal-only does not survive an uninstall
    }

    const done = new Date();
    storage.set(AB_KEYS.lastSuccessAt, done.toISOString());
    storage.set(AB_KEYS.lastSuccessDay, localDay(done)); // FIX-V747-1: once-per-local-day guard
    storage.set(AB_KEYS.lastStatus, 'OK');
    storage.set(AB_KEYS.failCount, '0');
    storage.set(AB_KEYS.lastFileName, r.fileName);
    storage.set(AB_KEYS.lastSizeBytes, String(r.fileSizeBytes));

    await pruneAutoBackups(r.fileName).catch(() => {});
    await rescheduleOverdueReminder(done).catch(() => {});
    await dismissBackupFailureNotification().catch(() => {});
    await dismissMissedNotification().catch(() => {});

    if (trigger === 'BACKGROUND') {
      await notifyBackupDone().catch(() => {}); // Only a BACKGROUND success notifies
    }
    return 'OK';
  } catch (e) {
    if (String(e).includes(ERR.LEASE_HELD)) {
      storage.set(AB_KEYS.lastStatus, 'SKIPPED_BUSY');
      return 'BUSY'; // Not a failure
    }
    return await fail('FAILED', 'BACKUP_ERROR');
  }
}

async function fail(
  status: 'FAILED' | 'NEEDS_FOLDER',
  reason: AutoBackupReason
): Promise<AutoBackupResult> {
  const count = Number(storage.getString(AB_KEYS.failCount) ?? '0') + 1;
  storage.set(AB_KEYS.failCount, String(count));
  storage.set(AB_KEYS.lastStatus, status);

  try {
    if (shouldAuditFailure(count)) {
      const deviceId = getSafeDeviceId();
      safeTransaction((tx) => {
        auditRepository.log(tx, {
          eventType: 'AUTO_BACKUP_FAILED',
          firmId: null,
          deviceId,
          payload: JSON.stringify({
            reason,
            failCount: count,
            failedAt: new Date().toISOString(),
          }),
        });
      });
    }
  } catch {
    /* Notification and banner still report it */
  }

  await notifyBackupFailed(reason).catch(() => {});
  return status;
}

// First failure of a streak, then at most once per 24 h: no audit spam
function shouldAuditFailure(count: number): boolean {
  const last = Date.parse(storage.getString(AB_KEYS.lastFailAuditAt) ?? '');
  const due =
    count === 1 ||
    Number.isNaN(last) ||
    last > Date.now() ||
    Date.now() - last >= 24 * 60 * 60 * 1000;
  if (due) storage.set(AB_KEYS.lastFailAuditAt, new Date().toISOString());
  return due;
}

// v7.47 FIX-V747-2: Background task registration helpers
export async function registerAutoBackupTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(AUTO_BACKUP_TASK, { minimumInterval: 15 });
}

export async function unregisterAutoBackupTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK);
  } catch {
    /* not registered */
  }
}

export async function setAutoBackupEnabled(
  enabled: boolean,
  opts: { publicFolderGranted?: boolean; notificationsGranted?: boolean } = {}
): Promise<void> {
  const nowIso = new Date().toISOString();
  storage.set(AB_KEYS.enabled, enabled ? 'true' : 'false');
  if (enabled) {
    storage.set(AB_KEYS.enabledAt, nowIso);
    await registerAutoBackupTask().catch(() => {});
  } else {
    await unregisterAutoBackupTask().catch(() => {});
    await cancelAllBackupNotifications().catch(() => {});
  }

  try {
    const deviceId = getSafeDeviceId();
    safeTransaction((tx) => {
      auditRepository.log(tx, {
        eventType: 'AUTO_BACKUP_SETTING_CHANGED',
        firmId: null,
        deviceId,
        payload: JSON.stringify({
          enabled,
          ...(opts.publicFolderGranted !== undefined
            ? { publicFolderGranted: opts.publicFolderGranted }
            : {}),
          ...(opts.notificationsGranted !== undefined
            ? { notificationsGranted: opts.notificationsGranted }
            : {}),
          changedAt: nowIso,
        }),
      });
    });
  } catch (e) {
    console.warn('[AutoBackup] Failed to write AUTO_BACKUP_SETTING_CHANGED audit:', e);
  }
}

export const autoBackupService = {
  isAutoBackupDue,
  runAutoBackupIfDue,
  registerAutoBackupTask,
  unregisterAutoBackupTask,
  setAutoBackupEnabled,
};

export default autoBackupService;
