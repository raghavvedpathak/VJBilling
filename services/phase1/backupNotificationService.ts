// services/phase1/backupNotificationService.ts — Phase 1 v8.1 Canonical Local Notification Service
// Implements FIX-V745-4, FIX-V746-4, FIX-V747-2, FIX-V81-3 (Local notifications only; zero push/network)
// Hardened: Ensures the 'backup-alerts' channel exists before Android 13+ permission prompts
// and during closed-app headless background runs; records outcome in AB_KEYS.lastNotify.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { storage } from '@/utils/storage';
import {
  AB_KEYS,
  AUTO_BACKUP_WINDOW,
  localDay,
  type AutoBackupReason,
} from '@/constants/autoBackup';

const CHANNEL_ID = 'backup-alerts';
const FAILED_ID = 'vjbilling-backup-failed';
const DONE_ID = 'vjbilling-backup-done';     // v7.47 FIX-V747-2
const MISSED_ID = 'vjbilling-backup-missed'; // v7.47 FIX-V747-2

let channelInitialized = false;

// v8.1 FIX-V81-3: Records outcome of the last notification attempt. Never throws.
// Value: '<DONE|FAILED|MISSED>:<SENT|NO_PERMISSION|ERROR:<name>>|<ISO time>' (error NAME only).
function noteNotify(kind: 'DONE' | 'FAILED' | 'MISSED', result: string): void {
  try {
    storage.set(AB_KEYS.lastNotify, kind + ':' + result + '|' + new Date().toISOString());
  } catch {
    /* status only */
  }
}

function errName(e: unknown): string {
  return ((e as Error)?.name ?? 'Error').slice(0, 40);
}

export async function initBackupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Backup alerts',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      lightColor: '#D4AF37',
      enableLights: true,
    });
  }
  channelInitialized = true;
}

async function ensureChannelReady(): Promise<void> {
  if (!channelInitialized) {
    await initBackupNotifications();
  }
}

// Call ONLY from the Settings toggle when turning automatic backup ON (FIX-V745-4)
export async function ensureNotificationPermission(): Promise<boolean> {
  await ensureChannelReady();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// v7.46 FIX-V746-4: Next day at 20:45 local time
export function computeOverdueReminderAt(lastSuccess: Date): Date {
  const t = new Date(lastSuccess);
  t.setDate(t.getDate() + 1);
  t.setHours(20, 45, 0, 0);
  return t;
}

export async function rescheduleOverdueReminder(lastSuccess: Date): Promise<void> {
  await ensureChannelReady();
  await cancelOverdueReminder();
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Backup overdue',
      body: 'No backup has been saved for over a day. Open VJ Billing to back up now.',
      color: '#D4AF37',
      data: { kind: 'BACKUP_OVERDUE' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: computeOverdueReminderAt(lastSuccess),
      channelId: CHANNEL_ID,
    },
  });
  storage.set(AB_KEYS.reminderId, id);
}

// FIX-V745-4: Reconciles the overdue reminder after bootstrap Step 7b (non-blocking)
export async function reconcileOverdueReminder(): Promise<void> {
  if (storage.getString(AB_KEYS.enabled) !== 'true') return;
  const lastSuccessIso = storage.getString(AB_KEYS.lastSuccessAt);
  if (!lastSuccessIso) return;
  const lastSuccess = new Date(lastSuccessIso);
  if (Number.isNaN(lastSuccess.getTime())) return;
  await ensureChannelReady();
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const storedId = storage.getString(AB_KEYS.reminderId);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const exists = !!storedId && scheduled.some((n) => n.identifier === storedId);
  if (!exists && computeOverdueReminderAt(lastSuccess).getTime() > Date.now()) {
    await rescheduleOverdueReminder(lastSuccess);
  }
}

export async function cancelOverdueReminder(): Promise<void> {
  const id = storage.getString(AB_KEYS.reminderId);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  storage.delete(AB_KEYS.reminderId);
}

export async function notifyBackupFailed(reason: AutoBackupReason): Promise<void> {
  const last = Date.parse(storage.getString(AB_KEYS.lastFailNotifiedAt) ?? '');
  // Rate limit: at most one failure notification per 24 hours
  if (!Number.isNaN(last) && Date.now() - last < 24 * 60 * 60 * 1000 && last <= Date.now()) {
    return;
  }

  const body =
    reason === 'FOLDER_NOT_GRANTED' || reason === 'FOLDER_ACCESS_REVOKED'
      ? 'Backup folder access was removed. Open VJ Billing > Settings > Backup to grant it again.'
      : 'Automatic backup did not complete. Open VJ Billing > Settings > Backup.';

  // v8.1 FIX-V81-3: Record outcome; never throw
  try {
    await ensureChannelReady();
    if (!(await Notifications.getPermissionsAsync()).granted) {
      noteNotify('FAILED', 'NO_PERMISSION');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: FAILED_ID,
      content: {
        title: 'Backup needs attention',
        body,
        color: '#D4AF37',
        data: { kind: 'BACKUP_FAILED' },
      },
      trigger: { channelId: CHANNEL_ID },
    });
    storage.set(AB_KEYS.lastFailNotifiedAt, new Date().toISOString());
    noteNotify('FAILED', 'SENT');
  } catch (e) {
    noteNotify('FAILED', 'ERROR:' + errName(e));
  }
}

export async function dismissBackupFailureNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(FAILED_ID).catch(() => {});
}

// v7.47 FIX-V747-2 & v8.1 FIX-V81-3: Sent after a BACKGROUND success only
export async function notifyBackupDone(): Promise<void> {
  try {
    await ensureChannelReady();
    if (!(await Notifications.getPermissionsAsync()).granted) {
      noteNotify('DONE', 'NO_PERMISSION');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: DONE_ID,
      content: {
        title: 'Backup completed',
        body: 'Your daily backup was saved.',
        color: '#D4AF37',
        data: { kind: 'BACKUP_DONE' },
      },
      trigger: { channelId: CHANNEL_ID },
    });
    noteNotify('DONE', 'SENT');
  } catch (e) {
    noteNotify('DONE', 'ERROR:' + errName(e));
    return;
  }
  await dismissBackupFailureNotification().catch(() => {});
  await dismissMissedNotification().catch(() => {});
}

export async function dismissMissedNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(MISSED_ID).catch(() => {});
}

// v7.47 FIX-V747-2 & v8.1 FIX-V81-3: Called by the background task when it runs outside the 20:00-20:30 window
export async function maybeNotifyMissed(now: Date): Promise<void> {
  const endM = AUTO_BACKUP_WINDOW.endH * 60 + AUTO_BACKUP_WINDOW.endM;
  if (now.getHours() * 60 + now.getMinutes() <= endM) return; // Only AFTER 20:30

  const today = localDay(now);
  if (storage.getString(AB_KEYS.lastSuccessDay) === today) return; // Already backed up today
  if (storage.getString(AB_KEYS.missedNotifiedDay) === today) return; // Once per local day

  try {
    await ensureChannelReady();
    if (!(await Notifications.getPermissionsAsync()).granted) {
      noteNotify('MISSED', 'NO_PERMISSION');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: MISSED_ID,
      content: {
        title: 'Backup missed',
        body: "Tonight's backup did not run. Open VJ Billing to back up now.",
        color: '#D4AF37',
        data: { kind: 'BACKUP_MISSED' },
      },
      trigger: { channelId: CHANNEL_ID },
    });
    storage.set(AB_KEYS.missedNotifiedDay, today);
    noteNotify('MISSED', 'SENT');
  } catch (e) {
    noteNotify('MISSED', 'ERROR:' + errName(e));
  }
}

export async function cancelAllBackupNotifications(): Promise<void> {
  await cancelOverdueReminder();
  await dismissBackupFailureNotification();
  await dismissMissedNotification();
  await Notifications.dismissNotificationAsync(DONE_ID).catch(() => {});
}

export const backupNotificationService = {
  initBackupNotifications,
  ensureNotificationPermission,
  computeOverdueReminderAt,
  rescheduleOverdueReminder,
  reconcileOverdueReminder,
  cancelOverdueReminder,
  notifyBackupFailed,
  dismissBackupFailureNotification,
  notifyBackupDone,
  dismissMissedNotification,
  maybeNotifyMissed,
  cancelAllBackupNotifications,
};

export default backupNotificationService;
