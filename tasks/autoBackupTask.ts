// tasks/autoBackupTask.ts — Phase 1 v7.47 Canonical Background Task Definition
// Implements FIX-V746-1, FIX-V746-2, FIX-V747-2

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { storage } from '@/utils/storage';
import { assertCryptoAvailable } from '@/utils/backupCrypto';
import { openDatabase } from '@/db';
import { runAutoBackupIfDue } from '@/services/phase1/autoBackupService';
import { maybeNotifyMissed } from '@/services/phase1/backupNotificationService';
import {
  AB_KEYS,
  AUTO_BACKUP_TASK,
  isInBackupWindow,
  localDay,
} from '@/constants/autoBackup';

TaskManager.defineTask(AUTO_BACKUP_TASK, async () => {
  try {
    if (storage.getString(AB_KEYS.enabled) !== 'true') {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const now = new Date();
    if (!isInBackupWindow(now)) {
      await maybeNotifyMissed(now);
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    if (storage.getString(AB_KEYS.lastSuccessDay) === localDay(now)) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    await assertCryptoAvailable();
    await openDatabase(); // NO migrate(), NO full bootstrap
    // ensureHeadlessReady() is called inside runAutoBackupIfDue -> runInner() (v7.47 FIX-V747-2)
    await runAutoBackupIfDue('BACKGROUND');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
