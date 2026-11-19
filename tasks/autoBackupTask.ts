// tasks/autoBackupTask.ts — Phase 1 v8.0 Canonical Background Task Definition
// Implements FIX-V746-1, FIX-V746-2, FIX-V747-2
// Registers Phase 2–4 backup/restore handlers at module load so headless 8 PM,
// Dashboard catch-up, FY-close, and Safe Mode backups always export all phases.

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import '@/services/phase2/inventoryBackupService';
import '@/services/phase2/inventoryRestoreService';
import '@/services/phase3/billingBackupService';
import '@/services/phase3/billingRestoreService';
import '@/services/phase4/goldIntelligenceBackupService';
import '@/services/phase4/goldIntelligenceRestoreService';
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
    const result = await runAutoBackupIfDue('BACKGROUND');
    if (result === 'FAILED') {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
