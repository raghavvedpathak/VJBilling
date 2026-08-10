// services/restoreService.ts — Phase 2 v2.11 Canonical Implementation

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
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
import { getDeviceId, getDeviceDerivedKeyMaterial, getCanonicalBackupKeyMaterial } from '../utils/deviceId';
import { useLeaseStore } from '../store/leaseStore';
import { storage } from '../utils/storage';
import { safeModeService } from './safeModeService';
import { now } from '../utils/now';
import { SCHEMA_VERSION } from '../constants';
import { ERR } from '../constants/errorCodes';
import type { BackupEnvelope } from './backupService';

async function decryptBackupEnvelope(parsedBlob: any, password?: string): Promise<BackupEnvelope> {
  if (parsedBlob.passwordProtected === true && !password) {
    throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');
  }

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

  const keySourceCandidates: Uint8Array[] = [];

  if (parsedBlob.passwordProtected === true) {
    keySourceCandidates.push(new TextEncoder().encode(password));
  } else {
    const canonicalKey = await getCanonicalBackupKeyMaterial();
    keySourceCandidates.push(canonicalKey);

    if (parsedBlob.deviceId && typeof parsedBlob.deviceId === 'string') {
      try {
        const envelopeDeviceKey = await getDeviceDerivedKeyMaterial(parsedBlob.deviceId);
        keySourceCandidates.push(envelopeDeviceKey);
      } catch {}
    }

    try {
      const currentDeviceKey = await getDeviceDerivedKeyMaterial();
      keySourceCandidates.push(currentDeviceKey);
    } catch {}
  }

  const salt = CryptoJS.enc.Base64.parse(parsedBlob.salt);
  const iv = CryptoJS.enc.Base64.parse(parsedBlob.iv);
  const iterations = parsedBlob.encryptionVersion === 2 ? 10000 : 100000;

  for (const candidateKeySource of keySourceCandidates) {
    try {
      const keyMaterial = toWordArray(candidateKeySource);
      const key = CryptoJS.PBKDF2(keyMaterial, salt, {
        keySize: 256 / 32,
        iterations: iterations,
        hasher: CryptoJS.algo.SHA256,
      });

      const decrypted = CryptoJS.AES.decrypt(parsedBlob.ciphertext, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      if (decryptedText) {
        const payload = JSON.parse(decryptedText);
        return {
          ...parsedBlob,
          payload
        } as unknown as BackupEnvelope;
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error(ERR.CHECKSUM_MISMATCH + ': Decryption failed — wrong password or tampered file');
}

export const restoreService = {
  async inspectBackupFile(password?: string): Promise<{ backup: BackupEnvelope; fileContent: string } | null> {
    await leaseService.assertNoActiveLease();

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return null;

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

    const backup = await decryptBackupEnvelope(parsedBlob, password);
    await this.validateBackupSchema(backup);

    if (!backup.payload || !Array.isArray(backup.payload.firms)) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
    }
    if (backup.payload.firms.length > 3) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + `: Backup contains ${backup.payload.firms.length} firms. Maximum capacity is 3.`);
    }

    return { backup, fileContent };
  },

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

    const backup = await decryptBackupEnvelope(parsedBlob, password);

    await this.validateBackupSchema(backup);

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

    await this.restore(fileContent, password);

    return isSafeModeBackedUp ? 'COMPLETED_WITH_ISSUES' : 'COMPLETED';
  },

  async restore(encryptedFileContent: string, password?: string): Promise<void> {
    await leaseService.assertNoActiveLease(); 
    const leaseId = await leaseService.acquire('RESTORE');

    try {
      const currentDeviceId = await getDeviceId();

      const parsedBlob = JSON.parse(encryptedFileContent);
      const backup = await decryptBackupEnvelope(parsedBlob, password);

      await this.validateBackupSchema(backup);

      if (!backup.payload || !Array.isArray(backup.payload.firms)) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
      }
      if (backup.payload.firms.length > 3) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + `: Backup contains ${backup.payload.firms.length} firms. Maximum capacity is 3.`);
      }

      db.transaction((tx) => {
        tx.update(auditDeleteGateTable).set({ gateOpen: 1 }).where(eq(auditDeleteGateTable.id, 1)).run();
        tx.delete(auditLogsTable).run();
        tx.update(auditDeleteGateTable).set({ gateOpen: 0 }).where(eq(auditDeleteGateTable.id, 1)).run();

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

        tx.delete(bisLogosTable).run();
        tx.delete(financialYearsTable).run();
        tx.delete(writerLeasesTable).run();
        tx.delete(firmsTable).run();
        tx.delete(appSettingsTable).run();
        tx.delete(safeModeStateTable).run();

        if (backup.payload.firms?.length) tx.insert(firmsTable).values(backup.payload.firms).run();
        if (backup.payload.financialYears?.length) tx.insert(financialYearsTable).values(backup.payload.financialYears).run();
        if (backup.payload.settings?.length) tx.insert(appSettingsTable).values(backup.payload.settings).run();
        if (backup.payload.auditLogs?.length) tx.insert(auditLogsTable).values(backup.payload.auditLogs).run();
        if (backup.payload.bisLogos?.length) tx.insert(bisLogosTable).values(backup.payload.bisLogos).run(); 
        
        if (backup.payload.safeModeState) {
          tx.insert(safeModeStateTable).values(backup.payload.safeModeState)
            .onConflictDoUpdate({ target: safeModeStateTable.id, set: backup.payload.safeModeState }).run();
        }

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

        auditRepository.log(tx, { 
          eventType: 'RESTORE_COMPLETED', 
          firmId: null, 
          deviceId: currentDeviceId,
          payload: { 
            backupSchema: backup.schemaVersion, 
            backupDate: backup.exportedAt, 
            firmCount: backup.payload.firms.length, 
            restoredAt: new Date().toISOString() 
          } 
        });
      });

      useLeaseStore.getState().setActiveLease(null);
      await safeModeService.clear();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

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
            payload: { reason: error.message },
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