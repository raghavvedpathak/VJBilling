// services/phase1/factoryResetService.ts — Phase 1 v7.47 Canonical Factory Reset Service
// Implements FIX-VSEC-12, FIX-V741-2, FIX-V743-5, FIX-V744-12, FIX-V745-8, FIX-V746-7, FIX-V747-4

import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import * as Updates from 'expo-updates';
import { closeDatabase } from '@/db';
import { resetDatabaseInitializationState } from '@/db/client';
import { deleteDbKey } from '@/db/dbKey';
import { safeTransaction } from '@/db/safeTransaction';
import { bootstrapComplete } from '@/services/phase1/safeModeService';
import { stopLeaseHeartbeat } from '@/services/phase1/leaseService';
import { unregisterAutoBackupTask } from '@/services/phase1/autoBackupService';
import { cancelAllBackupNotifications } from '@/services/phase1/backupNotificationService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { clearVerifyCache } from '@/utils/verifyCache';
import { getDeviceId } from '@/utils/deviceId';
import { storage } from '@/utils/storage';
import { STORAGE_PATHS, ERR, AUTO_BACKUP_MMKV_KEYS } from '@/constants';

const PIN_KEYS = [
  'vjbilling_pin_hash',
  'vjbilling_pin_salt',
  'vjbilling_pin_failed_attempts',
  'vjbilling_pin_lockout_until',
  'vjbilling_pin_length',
  'vjbilling_pin_setup_skipped',
];

const PERSISTED_STORE_KEYS = [
  'firm-store',
  'lease-store',
  'safe-mode-store',
  'app-settings-store',
];

/**
 * Canonical performFactoryResetFiles() (FIX-V744-12, FIX-V745-8, FIX-V746-7, FIX-V747-4).
 * Shared by Settings > Factory Reset and DatabaseErrorScreen OPTION 3.
 */
export async function performFactoryResetFiles(confirmedFirmCode?: string): Promise<void> {
  // 1. Optional FACTORY_RESET_EXECUTED audit event before closing DB (when invoked from Settings)
  if (confirmedFirmCode) {
    try {
      const deviceId = getDeviceId();
      safeTransaction((tx) => {
        auditRepository.log(tx, {
          eventType: 'FACTORY_RESET_EXECUTED',
          firmId: null,
          deviceId,
          payload: JSON.stringify({
            confirmedFirmCode,
            executedAt: new Date().toISOString(),
          }),
        });
      });
    } catch {
      /* DB may already be in an error state when called from DatabaseErrorScreen */
    }
  }

  // 2. Unregister background task and cancel all backup notifications (FIX-V746-7, FIX-V747-4)
  await unregisterAutoBackupTask().catch(() => {});
  await cancelAllBackupNotifications().catch(() => {});

  // 3. Stop lease heartbeat and mark bootstrap incomplete
  stopLeaseHeartbeat();
  bootstrapComplete.value = false;

  // 4. Close SQLite connection (FIX-V741-2)
  closeDatabase();
  resetDatabaseInitializationState();

  // 5. Delete SQLite database files (vjbilling.db, -wal, -shm, plus legacy filename)
  const dbNames = [STORAGE_PATHS.DB_FILENAME, STORAGE_PATHS.LEGACY_DB_FILENAME].filter(Boolean);
  for (const name of dbNames) {
    try {
      if (typeof (SQLite as any).deleteDatabaseAsync === 'function') {
        await (SQLite as any).deleteDatabaseAsync(name);
      }
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      await FileSystem.deleteAsync(`${STORAGE_PATHS.RAW_DB_DIR}${name}${suffix}`, {
        idempotent: true,
      }).catch(() => {});
    }
  }

  // Verify primary DB file was removed (FIX-V743-5)
  const mainDbInfo = await FileSystem.getInfoAsync(
    `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`
  ).catch(() => ({ exists: false }));
  if (mainDbInfo.exists) {
    throw new Error(
      ERR.FACTORY_RESET_INCOMPLETE + ': database file could not be deleted'
    );
  }

  // 6. Delete SQLCipher key from SecureStore (FIX-V740-13, FIX-V741-2)
  await deleteDbKey().catch(() => {});

  // 7. Delete internal logos/ and backups/ directories
  await FileSystem.deleteAsync(STORAGE_PATHS.LOGOS_DIR, { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(STORAGE_PATHS.BACKUP_DIR, { idempotent: true }).catch(() => {});

  // 8. Clear persisted Zustand stores, verify cache, PIN keys, and AUTO_BACKUP_MMKV_KEYS (FIX-V745-8, FIX-V747-4)
  for (const k of PERSISTED_STORE_KEYS) storage.delete(k);
  for (const k of PIN_KEYS) storage.delete(k);
  for (const k of AUTO_BACKUP_MMKV_KEYS) storage.delete(k);
  storage.delete('vjbilling_public_backup_dir_uri');
  storage.delete('vjbilling_post_restore_logo_check_pending');
  storage.delete('vjbilling_boot_was_interrupted');
  storage.delete('vjbilling_pending_audit_queue');
  clearVerifyCache();

  // 9. Reload JS runtime (FIX-V741-2)
  try {
    await Updates.reloadAsync();
  } catch (e) {
    console.warn('[FactoryReset] Updates.reloadAsync() skipped in dev/test:', e);
  }
}

export const factoryResetService = {
  performFactoryResetFiles,
};

export default factoryResetService;
