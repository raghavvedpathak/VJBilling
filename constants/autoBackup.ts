// constants/autoBackup.ts — Phase 1 v8.1 Canonical Automatic Backup Constants
// Implements FIX-V745-3, FIX-V746-1, FIX-V747-1, FIX-V747-4, FIX-V81-2, FIX-V81-3

export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const AUTO_BACKUP_COOLDOWN_MS = 30 * 60 * 1000; // after a failed attempt
export const AUTO_BACKUP_KEEP = 7;
export const AUTO_BACKUP_WINDOW = { startH: 20, startM: 0, endH: 20, endM: 30 } as const;
export const AUTO_BACKUP_TASK = 'vjbilling-auto-backup';
export const BACKGROUND_LEASE_TTL_MINUTES = 15;

export const AB_KEYS = {
  // MMKV, device-local, never in a backup
  enabled: 'vjbilling_autobackup_enabled', // 'true' | 'false'
  enabledAt: 'vjbilling_autobackup_enabled_at', // ISO-8601, set when the toggle is switched ON (banner rule)
  lastFailAuditAt: 'vjbilling_autobackup_last_fail_audit_at',
  lastSuccessAt: 'vjbilling_autobackup_last_success_at', // ISO-8601
  lastAttemptAt: 'vjbilling_autobackup_last_attempt_at',
  lastStatus: 'vjbilling_autobackup_last_status', // AutoBackupStatus
  failCount: 'vjbilling_autobackup_fail_count',
  lastFailNotifiedAt: 'vjbilling_autobackup_last_fail_notified_at',
  reminderId: 'vjbilling_autobackup_reminder_id',
  lastFileName: 'vjbilling_autobackup_last_file',
  lastSizeBytes: 'vjbilling_autobackup_last_size',
  notifAsked: 'vjbilling_autobackup_notif_asked',
  lastSuccessDay: 'vjbilling_autobackup_last_success_day', // v7.47 FIX-V747-1: local date YYYY-MM-DD of the last success
  missedNotifiedDay: 'vjbilling_autobackup_missed_notified_day', // v7.47: local date a "Backup missed" notification was sent
  lastTrigger: 'vjbilling_autobackup_last_trigger', // v7.47: BackupTrigger of the last attempt
  lastMirror: 'vjbilling_autobackup_last_mirror', // v8.1 FIX-V81-2: 'OK', 'FAILED:NO_FOLDER', or 'FAILED:<error name>'
  lastNotify: 'vjbilling_autobackup_last_notify', // v8.1 FIX-V81-3: '<DONE|FAILED|MISSED>:<SENT|NO_PERMISSION|ERROR:<name>>|<ISO time>'
} as const;

export const AUTO_BACKUP_MMKV_KEYS: string[] = Object.values(AB_KEYS);

export type AutoBackupStatus = 'OK' | 'FAILED' | 'NEEDS_FOLDER' | 'SKIPPED_BUSY';
export type AutoBackupReason =
  | 'FOLDER_NOT_GRANTED'
  | 'FOLDER_ACCESS_REVOKED'
  | 'MIRROR_FAILED'
  | 'BACKUP_ERROR'
  | 'BACKGROUND_NOT_READY'; // v7.47 FIX-V747-4
export type BackupTrigger = 'BACKGROUND' | 'BOOT' | 'RESUME' | 'NOW'; // v7.47 FIX-V747-4
export type AutoBackupResult =
  | 'DISABLED'
  | 'NOT_READY'
  | 'NO_DATA'
  | 'NOT_DUE'
  | 'COOLDOWN'
  | 'RUNNING'
  | 'BUSY'
  | 'OK'
  | 'FAILED'
  | 'NEEDS_FOLDER';

export function isInBackupWindow(d = new Date()): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  return (
    m >= AUTO_BACKUP_WINDOW.startH * 60 + AUTO_BACKUP_WINDOW.startM &&
    m <= AUTO_BACKUP_WINDOW.endH * 60 + AUTO_BACKUP_WINDOW.endM
  );
}

export function localDay(d = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function nextOverdueAt(lastSuccess: Date): Date {
  const t = new Date(lastSuccess);
  t.setDate(t.getDate() + 1);
  t.setHours(20, 45, 0, 0);
  return t;
}
