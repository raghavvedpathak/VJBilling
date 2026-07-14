// services/restoreService.ts
// 11-Step Restore Flow (v2.9 Canonical Skeleton + Legacy UI Wrapper)
// SDK 54 FIX: expo-file-system/legacy required for all file reads.
// v7.6 Step 13: Updates.reloadAsync() + MMKV logo check flag + safeModeService.clear()
// G41: RESTORE_OLD_SCHEMA and RESTORE_COMPLETED are exempt from tx requirement.
//
// CONSTITUTIONAL RULES:
//   - MUST NOT call assertNotInSafeMode(). Restore is the recovery path.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Updates from 'expo-updates';
import CryptoJS from 'crypto-js';
import { Alert } from 'react-native';
import { db } from '../db/client';
import {
  firms as firmsTable,
  financialYears as financialYearsTable,
  auditLogs as auditLogsTable,
  safeModeState as safeModeStateTable,
  writerLeases as writerLeasesTable,
  appSettings as appSettingsTable,
  bisLogos as bisLogosTable,
  categories, designs, stones, hsnCodes, items, itemEvents,
  gemstoneLots, designCategoryMap, sequenceCounters, oldGoldLots, urdPurchases,
  auditDeleteGate as auditDeleteGateTable
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from './leaseService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId, getDeviceDerivedKeyMaterial } from '../utils/deviceId';
import { useLeaseStore } from '../store/leaseStore';
import { storage } from '../utils/storage';
import { safeModeService } from './safeModeService';
import { now } from '../utils/now';
import { SCHEMA_VERSION } from '../constants/appVersion';
import { ERR } from '../constants/errorCodes';
import type { BackupEnvelope } from './backupService';

export const restoreService = {

  async restoreFromFile(password?: string): Promise<'CANCELED' | 'COMPLETED' | 'COMPLETED_WITH_ISSUES'> {
    await leaseService.assertNoActiveLease();

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
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Could not read the selected file. Ensure it is a valid .vjb backup.');
    }

    let parsedBlob: any;
    try {
      parsedBlob = JSON.parse(fileContent);
    } catch (e) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': File is not valid JSON data.');
    }

    // Step 3: Decrypt for Preview
    if (parsedBlob.passwordProtected === true && !password) {
      throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');
    }

    const keySourceMaterial = parsedBlob.passwordProtected === true 
      ? new TextEncoder().encode(password) 
      : await getDeviceDerivedKeyMaterial();

    const toWordArray = (u8: Uint8Array) => {
      const words: number[] = [];
      for (let i = 0; i < u8.length; i += 4) {
        words.push(
          (u8[i] << 24) |
          ((u8[i + 1] ?? 0) << 16) |
          ((u8[i + 2] ?? 0) << 8) |
          (u8[i + 3] ?? 0)
        );
      }
      return CryptoJS.lib.WordArray.create(words, u8.length);
    };

    let backup: BackupEnvelope;
    try {
      const salt = CryptoJS.enc.Base64.parse(parsedBlob.salt);
      const iv = CryptoJS.enc.Base64.parse(parsedBlob.iv);

      const keyMaterial = toWordArray(keySourceMaterial);
      const key = CryptoJS.PBKDF2(keyMaterial, salt, {
        keySize: 256 / 32,
        iterations: 100000,
        hasher: CryptoJS.algo.SHA256,
      });

      const decrypted = CryptoJS.AES.decrypt(parsedBlob.ciphertext, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedText) {
        throw new Error('Empty decryption result');
      }
      backup = JSON.parse(decryptedText) as BackupEnvelope;
    } catch (e) {
      throw new Error(ERR.CHECKSUM_MISMATCH + ': Decryption failed — wrong password or tampered file');
    }

    // Step 4: Validate
    await this.validateBackupSchema(backup);

    // Step 6: Dry Run Payload Checks
    const {
      firms: backupFirms,
      financialYears: backupFYs,
      auditLogs: backupLogs,
      safeModeState: backupSmState,
      settings: backupSettings,
    } = backup.payload;

    if (!Array.isArray(backupFirms)) throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
    if (backupFirms.length > 3) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + `: Backup contains ${backupFirms.length} firms. Maximum capacity is 3.`);
    }

    // Step 5: Preview Alert
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

    // Step 8-11: Handoff to Canonical Engine
    await this.restore(fileContent, password);

    return isSafeModeBackedUp ? 'COMPLETED_WITH_ISSUES' : 'COMPLETED';
  },

  async restore(encryptedFileContent: string, password?: string): Promise<void> {
    
    await leaseService.assertNoActiveLease(); 
    const leaseId = await leaseService.acquire('RESTORE');

    try {
      const currentDeviceId = await getDeviceId();

      const parsedBlob = JSON.parse(encryptedFileContent) as { 
        iv: string; salt: string; ciphertext: string; passwordProtected?: boolean 
      };

      if (parsedBlob.passwordProtected === true && !password) {
        throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');
      }

      const keySourceMaterial = parsedBlob.passwordProtected === true 
        ? new TextEncoder().encode(password) 
        : await getDeviceDerivedKeyMaterial();

      const toWordArray = (u8: Uint8Array) => {
        const words: number[] = [];
        for (let i = 0; i < u8.length; i += 4) {
          words.push(
            (u8[i] << 24) |
            ((u8[i + 1] ?? 0) << 16) |
            ((u8[i + 2] ?? 0) << 8) |
            (u8[i + 3] ?? 0)
          );
        }
        return CryptoJS.lib.WordArray.create(words, u8.length);
      };

      let backup: BackupEnvelope;
      try {
        const salt = CryptoJS.enc.Base64.parse(parsedBlob.salt);
        const iv = CryptoJS.enc.Base64.parse(parsedBlob.iv);

        const keyMaterial = toWordArray(keySourceMaterial);
        const key = CryptoJS.PBKDF2(keyMaterial, salt, {
          keySize: 256 / 32,
          iterations: 100000,
          hasher: CryptoJS.algo.SHA256,
        });

        const decrypted = CryptoJS.AES.decrypt(parsedBlob.ciphertext, key, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        });

        const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
        if (!decryptedText) {
          throw new Error('Empty decryption result');
        }
        backup = JSON.parse(decryptedText) as BackupEnvelope;
      } catch (e) {
        throw new Error(ERR.CHECKSUM_MISMATCH + ': Decryption failed — wrong password or tampered file');
      }

      await this.validateBackupSchema(backup);

      if (!backup.payload || !Array.isArray(backup.payload.firms)) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
      }
      if (backup.payload.firms.length > 3) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + `: Backup contains ${backup.payload.firms.length} firms. Maximum capacity is 3.`);
      }

      db.transaction((tx) => {
        // v7.13 FIX-V713-1: gate MUST be opened before this delete
        tx.update(auditDeleteGateTable).set({ gateOpen: 1 }).where(eq(auditDeleteGateTable.id, 1)).run();
        tx.delete(auditLogsTable).run();
        tx.update(auditDeleteGateTable).set({ gateOpen: 0 }).where(eq(auditDeleteGateTable.id, 1)).run();

        // Phase 1 Wipe (Reverse FK dependency)
        tx.delete(bisLogosTable).run();
        tx.delete(financialYearsTable).run();
        tx.delete(writerLeasesTable).run();
        tx.delete(firmsTable).run();
        tx.delete(appSettingsTable).run();
        tx.delete(safeModeStateTable).run();

        // Phase 2 Wipe (Reverse FK dependency per STEP 12.12B)
        tx.delete(urdPurchases).run();
        tx.delete(oldGoldLots).run();
        tx.delete(sequenceCounters).run();
        tx.delete(designCategoryMap).run();
        tx.delete(gemstoneLots).run();
        tx.delete(itemEvents).run();
        tx.delete(items).run();
        tx.delete(hsnCodes).run();
        tx.delete(designs).run();
        tx.delete(stones).run();
        tx.delete(categories).run();

        // INSERT Phase 1 core backup data
        if (backup.payload.firms?.length) tx.insert(firmsTable).values(backup.payload.firms).run();
        if (backup.payload.financialYears?.length) tx.insert(financialYearsTable).values(backup.payload.financialYears).run();
        if (backup.payload.settings?.length) tx.insert(appSettingsTable).values(backup.payload.settings).run();
        if (backup.payload.auditLogs?.length) tx.insert(auditLogsTable).values(backup.payload.auditLogs).run();
        if (backup.payload.bisLogos?.length) tx.insert(bisLogosTable).values(backup.payload.bisLogos).run(); 
        
        if (backup.payload.safeModeState) {
          tx.insert(safeModeStateTable).values(backup.payload.safeModeState)
            .onConflictDoUpdate({ target: safeModeStateTable.id, set: backup.payload.safeModeState }).run();
        }

        // INSERT Phase 2 tables (Forward FK dependency per STEP 12.12B)
        if (backup.payload.categories?.length) tx.insert(categories).values(backup.payload.categories).run();
        if (backup.payload.designs?.length) tx.insert(designs).values(backup.payload.designs).run();
        if (backup.payload.stones?.length) tx.insert(stones).values(backup.payload.stones).run();
        if (backup.payload.hsnCodes?.length) tx.insert(hsnCodes).values(backup.payload.hsnCodes).run();
        if (backup.payload.items?.length) tx.insert(items).values(backup.payload.items).run();
        if (backup.payload.itemEvents?.length) tx.insert(itemEvents).values(backup.payload.itemEvents).run();
        if (backup.payload.gemstoneLots?.length) tx.insert(gemstoneLots).values(backup.payload.gemstoneLots).run();
        if (backup.payload.designCategoryMap?.length) tx.insert(designCategoryMap).values(backup.payload.designCategoryMap).run();
        if (backup.payload.sequenceCounters?.length) tx.insert(sequenceCounters).values(backup.payload.sequenceCounters).run();
        if (backup.payload.oldGoldLots?.length) tx.insert(oldGoldLots).values(backup.payload.oldGoldLots).run();
        if (backup.payload.urdPurchases?.length) tx.insert(urdPurchases).values(backup.payload.urdPurchases).run();

        // RESTORE_COMPLETED written here — AFTER all data inserted
        auditRepository.log(tx, { 
          eventType: 'RESTORE_COMPLETED', 
          firmId: null, 
          deviceId: currentDeviceId,
          payload: JSON.stringify({ 
            backupSchema: backup.schemaVersion, 
            backupDate: backup.exportedAt, 
            firmCount: backup.payload.firms.length, 
            restoredAt: new Date().toISOString() 
          }) 
        });
      });

      // INVALIDATE LEASES & CLEAR SAFE MODE
      useLeaseStore.getState().setActiveLease(null);
      await safeModeService.clear();

      // SET LOGO CHECK FLAG + RELOAD
      await storage.setItem('vjbilling_post_restore_logo_check_pending', 'true');

      try {
        await Updates.reloadAsync();
      } catch (e) {
        console.warn('[Restore] Manual reload required in development environment.');
      }

    } catch (error: any) {
      try {
        const failDeviceId = await getDeviceId();
        db.transaction((tx) => {
          auditRepository.log(tx, {
            firmId: null,
            eventType: 'RESTORE_FAILED',
            payload: JSON.stringify({ reason: error.message }),
            deviceId: failDeviceId,
          });
        });
      } catch (auditError) {
        console.error('[Restore] Failed to write RESTORE_FAILED audit (non-fatal):', auditError);
      }
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },

  async validateBackupSchema(backup: BackupEnvelope): Promise<void> {
    const { schemaVersion } = backup;

    if (schemaVersion === undefined || schemaVersion === null) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Backup has no schemaVersion field — may be corrupted.');
    }

    if (typeof schemaVersion !== 'number' || schemaVersion <= 0) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED + `: Invalid schemaVersion ${schemaVersion} — must be a positive integer.`
      );
    }

    if (schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED + `: Backup is from a newer app version. Backup: v${schemaVersion}, App: v${SCHEMA_VERSION}. Please update your app first.`
      );
    }

    if (schemaVersion < SCHEMA_VERSION) {
      const deviceId = await getDeviceId();
      // FIX-V718-1: Use global async DB execution directly since this is G41-exempt
      await db.insert(auditLogsTable).values({
        id: Crypto.randomUUID(),
        eventType: 'RESTORE_OLD_SCHEMA',
        firmId: null,
        entityId: null,
        deviceId,
        payload: JSON.stringify({ backupSchema: schemaVersion, appSchema: SCHEMA_VERSION }),
        createdAt: now(),
      });
      console.warn(`[Restore] RESTORE_OLD_SCHEMA: Restoring backup v${schemaVersion} into app v${SCHEMA_VERSION}.`);
    }
  },
};