// services/restoreService.ts
// 11-Step Restore Flow (v2.0)
// SDK 54 FIX: expo-file-system/legacy required for all file reads.
// v7.6 Step 13: Updates.reloadAsync() + MMKV logo check flag + safeModeService.clear()
// G41: RESTORE_OLD_SCHEMA and RESTORE_COMPLETED are exempt from tx requirement.
// RESTORE_COMPLETED written OUTSIDE transaction (mirror of BACKUP_CREATED pattern).

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';
import { db } from '../db/client';
import {
  firms,
  financialYears,
  auditLogs,
  safeModeState,
  writerLeases,
  appSettings,
  bisLogos,
} from '../db/schema';
import { leaseService } from './leaseService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { useLeaseStore } from '../store/leaseStore';
import { storage } from '../utils/storage';
import { safeModeService } from './safeModeService';
import { now } from '../utils/now';
import { SCHEMA_VERSION } from '../constants/appVersion';

export const restoreService = {

  async restoreFromFile(): Promise<'CANCELED' | 'COMPLETED' | 'COMPLETED_WITH_ISSUES'> {

    // STEP 0: assertNotInSafeMode() deliberately OMITTED — restore IS the recovery path.
    await leaseService.assertNoActiveLease();

    // STEP 1: FILE SELECTION
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return 'CANCELED';

    const fileUri = result.assets[0].uri;
    let fileContent = '';
    try {
      fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as any });
    } catch (e) {
      throw new Error('RESTORE_FAILED: Could not read the selected file. Ensure it is a valid .vjb backup.');
    }

    let backup: any;
    try {
      backup = JSON.parse(fileContent);
    } catch (e) {
      throw new Error('RESTORE_FAILED: File is not valid JSON data.');
    }

    // STEP 2: VERSION VALIDATION
    await this.validateBackupSchema(backup);

    // STEP 3: CHECKSUM VERIFICATION
    if (!backup.checksum || !backup.payload) {
      throw new Error('RESTORE_FAILED: Malformed backup envelope. Missing payload or checksum.');
    }

    const computedChecksum = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify(backup.payload)
    );

    if (computedChecksum !== backup.checksum) {
      throw new Error('CHECKSUM_MISMATCH: The backup file has been tampered with or corrupted. Restore blocked.');
    }

    // STEP 4 & 6: DRY-RUN & FIRM-COUNT VALIDATION
    const {
      firms:          backupFirms,
      financialYears: backupFYs,
      auditLogs:      backupLogs,
      safeModeState:  backupSmState,
      settings:       backupSettings,
      bisLogos:       backupBisLogos,
    } = backup.payload;

    if (!Array.isArray(backupFirms)) throw new Error('RESTORE_FAILED: Invalid payload structure.');
    if (backupFirms.length > 3) {
      throw new Error(`RESTORE_FAILED: Backup contains ${backupFirms.length} firms. Maximum capacity is 3.`);
    }

    // STEP 5 & 7: PREVIEW & USER CONFIRMATION
    const isSafeModeBackedUp = backupSmState && backupSmState.isActive === 1;

    const firmDetails = backupFirms
      .map((f: any) => {
        const fyCount = backupFYs?.filter((fy: any) => fy.firmId === f.id).length || 0;
        return `- ${f.name} (${f.firmCode}): ${fyCount} FYs`;
      })
      .join('\n');

    await new Promise<void>((resolve, reject) => {
      Alert.alert(
        'PREVIEW — NOT RESTORED YET',
        `BACKUP INFORMATION\n` +
        `Created: ${new Date(backup.exportedAt).toLocaleString()}\n` +
        `App Version: ${backup.appVersion}\n` +
        `Device ID: ${backup.deviceId.slice(-8)}\n` +
        `Schema: v${backup.schemaVersion}\n\n` +
        `FIRMS IN BACKUP\n${firmDetails || 'None'}\n\n` +
        `RECORD COUNTS\n` +
        `Audit Logs: ${backupLogs?.length || 0}\n` +
        `Settings: ${backupSettings?.length || 0}\n\n` +
        `\u26A0\uFE0F Logo images are not included in backups and will need to be re-uploaded.\n\n` +
        (isSafeModeBackedUp
          ? `\u26A0\uFE0F SAFE MODE ACTIVE IN BACKUP \u26A0\uFE0F\nRestoring it will re-activate Safe Mode.\n\n`
          : '') +
        `Restoring will permanently replace all current data.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('RESTORE_CANCELED')) },
          { text: 'I understand — Continue to Confirm', style: 'destructive', onPress: () => resolve() },
        ]
      );
    });

    // STEP 8: TRANSACTIONAL RESTORE
    const leaseId = await leaseService.acquire('RESTORE');
    let hasIssues = false;

    try {
      const currentDeviceId = await getDeviceId();

      await db.transaction(async (tx) => {
        // A. Wipe existing data — child tables first
        await tx.delete(writerLeases);
        await tx.delete(auditLogs);
        await tx.delete(bisLogos);
        await tx.delete(financialYears);
        await tx.delete(appSettings);
        await tx.delete(firms);
        await tx.delete(safeModeState);

        // B. Insert backup data
        if (backupFirms.length > 0) await tx.insert(firms).values(backupFirms);
        if (backupFYs?.length > 0) await tx.insert(financialYears).values(backupFYs);
        if (backupLogs?.length > 0) await tx.insert(auditLogs).values(backupLogs);
        if (backupBisLogos?.length > 0) await tx.insert(bisLogos).values(backupBisLogos);

        // Settings restore
        if (backupSettings?.length > 0) {
          await tx.insert(appSettings).values(backupSettings);
        } else {
          // Older backups missing settings — insert full default row.
          // G67-LINT: currency symbol as Unicode escape — NOT '₹' string literal.
          // now() used for updatedAt — consistent with centralized time utility.
          await tx.insert(appSettings).values({
            id: 1,
            theme: 'system',
            auditRetentionDays: 365,
            currency: 'INR',
            currencySymbol: '\u20B9', // ₹ — Unicode escape per G67-LINT
            currencyDecimalPlaces: 2,
            dateFormatToken: 'dd/MM/yyyy',
            warnUnsavedChanges: 1,
            updatedAt: now(),           // was new Date().toISOString()
          });
        }

        // C. Restore Safe Mode state
        if (backupSmState?.id) {
          await tx.insert(safeModeState).values(backupSmState);
          if (backupSmState.isActive === 1) hasIssues = true;
        } else {
          await tx.insert(safeModeState).values({
            id: 1, isActive: 0, reason: null, activatedAt: null, clearedAt: null,
          });
        }
      });

      // RESTORE_COMPLETED — separate new transaction (not inside main restore tx)
      // This mirrors BACKUP_CREATED pattern per v7.4 known limitation.
      await db.transaction(async (tx) => {
        await auditRepository.create(
          {
            firmId: null,
            eventType: 'RESTORE_COMPLETED',
            payload: JSON.stringify({ backupExportedAt: backup.exportedAt }),
            deviceId: currentDeviceId,
          },
          tx
        );
      });

      // STEP 9: INVALIDATE LEASES & CLEAR SAFE MODE
      useLeaseStore.getState().setActiveLease(null);
      await safeModeService.clear();

      // STEP 10: SET LOGO CHECK FLAG + RELOAD
      await storage.setItem('vjbilling_post_restore_logo_check_pending', 'true');

      try {
        await Updates.reloadAsync();
      } catch (e) {
        console.warn('[Restore] Manual reload required in development environment.');
        return hasIssues ? 'COMPLETED_WITH_ISSUES' : 'COMPLETED';
      }

      return hasIssues ? 'COMPLETED_WITH_ISSUES' : 'COMPLETED';

    } catch (error: any) {
      try {
        const failDeviceId = await getDeviceId();
        await db.transaction(async (tx) => {
          await auditRepository.create(
            {
              firmId: null,
              eventType: 'RESTORE_FAILED',
              payload: JSON.stringify({ reason: error.message }),
              deviceId: failDeviceId,
            },
            tx
          );
        });
      } catch (auditError) {
        console.error('[Restore] Failed to write RESTORE_FAILED audit (non-fatal):', auditError);
      }

      throw new Error(
        `Restore failed during database write. System rolled back safely. Error: ${error.message}`
      );
    } finally {
      await leaseService.release(leaseId);
    }
  },

  /**
   * HARDENING 4: Strict schema version validation.
   * RESTORE_OLD_SCHEMA is one of 3 G41-exempt events — written without tx.
   */
  async validateBackupSchema(backup: any): Promise<void> {
    const { schemaVersion } = backup;

    if (schemaVersion === undefined || schemaVersion === null) {
      throw new Error('RESTORE_FAILED: Backup has no schemaVersion field — may be corrupted.');
    }

    if (typeof schemaVersion !== 'number' || schemaVersion <= 0) {
      throw new Error(
        `RESTORE_FAILED: Invalid schemaVersion ${schemaVersion} — must be a positive integer.`
      );
    }

    if (schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        `RESTORE_FAILED: Backup is from a newer app version. Backup: v${schemaVersion}, App: v${SCHEMA_VERSION}. Please update your app first.`
      );
    }

    if (schemaVersion < SCHEMA_VERSION) {
      const deviceId = await getDeviceId();
      await auditRepository.create({
        firmId: null,
        eventType: 'RESTORE_OLD_SCHEMA',
        payload: JSON.stringify({ backupSchema: schemaVersion, appSchema: SCHEMA_VERSION }),
        deviceId,
      });
    }
  },
};