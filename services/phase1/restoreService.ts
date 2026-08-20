// services/phase1/restoreService.ts — Phase 1 & 2 Canonical Restore Service
// v7.24 FIX-V724-3: AES-256-GCM Decryption + CHECKSUM_MISMATCH on auth tag failure
// v7.26 FIX-V726-2 / FIX-V726-3 / FIX-V726-5: (encryptedFileContent, password) signature + optional password
// v7.27 FIX-V727-1: passwordProtected === true guard precision
// v7.36 FIX-V736-1 / FIX-V736-2: Embedded Logo Asset Restoration (logoAssets) + legacy FileSystem import
//
// CONSTITUTIONAL RULES:
//   - restore() MUST NOT call assertNotInSafeMode() (PATH 2 Safe Mode resolution).
//   - restore() MUST call assertNoActiveLease().
//   - audit_delete_gate must be opened/closed inside the restore transaction.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import quickCrypto from 'react-native-quick-crypto';
import { Alert } from 'react-native';
import { db } from '@/db/client';
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
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId, getDeviceDerivedKeyMaterial } from '@/utils/deviceId';
import { useLeaseStore } from '@/store/phase1/leaseStore';
import { storage } from '@/utils/storage';
import { safeModeService } from '@/services/phase1/safeModeService';
import { SCHEMA_VERSION } from '@/constants';
import { ERR } from '@/constants/errorCodes';
import type { BackupEnvelope } from '@/services/phase1/backupService';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

function decryptBackupEnvelope(parsedBlob: any, password?: string): BackupEnvelope {
  // v7.27 FIX-V727-1: password is required only when passwordProtected is explicitly true[cite: 1]
  if (parsedBlob.passwordProtected === true && !password) {
    throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');
  }

  if (!parsedBlob.salt || !parsedBlob.iv || !parsedBlob.ciphertext) {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': Corrupted backup envelope structure');
  }

  const saltBuffer = Buffer.from(parsedBlob.salt, 'base64');
  const ivBuffer = Buffer.from(parsedBlob.iv, 'base64');
  const combinedCipherBuffer = Buffer.from(parsedBlob.ciphertext, 'base64');

  if (combinedCipherBuffer.length < 16) {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': Invalid ciphertext payload');
  }

  // Suffix 16-byte GCM authentication tag
  const authTag = combinedCipherBuffer.subarray(combinedCipherBuffer.length - 16);
  const ciphertextBody = combinedCipherBuffer.subarray(0, combinedCipherBuffer.length - 16);

  const deviceId = parsedBlob.deviceId || getSafeDeviceId();
  const keySourceMaterial = parsedBlob.passwordProtected === true
    ? Buffer.from(password!, 'utf8')
    : Buffer.from(quickCrypto.createHash('sha256').update('vjbilling_device_key_v1:' + deviceId).digest());

  const iterations = parsedBlob.iterations ?? 100_000;

  try {
    // Native C++ PBKDF2 derivation (~20ms)
    const key = quickCrypto.pbkdf2Sync(
      keySourceMaterial as any,
      saltBuffer as any,
      iterations,
      32,
      'sha256'
    );

    // Native C++ AES-256-GCM authenticated decipher
    const decipher = quickCrypto.createDecipheriv('aes-256-gcm', key as any, ivBuffer as any);
    decipher.setAuthTag(authTag as any);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextBody as any),
      decipher.final(),
    ]);

    const payload = JSON.parse(decrypted.toString('utf8'));
    return {
      ...parsedBlob,
      payload,
    } as BackupEnvelope;
  } catch (e) {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': AES-GCM decryption failed — wrong password or tampered file');
  }
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
    } catch {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Could not read the selected file. Ensure it is a valid .vjb backup.');
    }

    let parsedBlob: any;
    try {
      parsedBlob = JSON.parse(fileContent);
    } catch {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': File is not valid JSON data.');
    }

    const backup = decryptBackupEnvelope(parsedBlob, password);
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
    } catch {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Could not read the selected file.');
    }

    let parsedBlob: any;
    try {
      parsedBlob = JSON.parse(fileContent);
    } catch {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': File is not valid JSON data.');
    }

    const backup = decryptBackupEnvelope(parsedBlob, password);
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

    const hasEmbeddedLogos = !!(backup.payload.logoAssets && (backup.payload.logoAssets.firmLogos.length > 0 || backup.payload.logoAssets.bisLogos.length > 0));

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
        (!hasEmbeddedLogos ? `\u26A0\uFE0F Logo images are not included in this backup and will need to be re-uploaded.\n\n` : '') +
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
    // G40: restore() does NOT call assertNotInSafeMode() (PATH 2 Safe Mode resolution)[cite: 1]
    await leaseService.assertNoActiveLease(); 
    const leaseId = await leaseService.acquire('RESTORE');

    try {
      const currentDeviceId = getSafeDeviceId();
      const parsedBlob = JSON.parse(encryptedFileContent);
      const backup = decryptBackupEnvelope(parsedBlob, password);

      await this.validateBackupSchema(backup);

      if (!backup.payload || !Array.isArray(backup.payload.firms)) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
      }
      if (backup.payload.firms.length > 3) {
        throw new Error(ERR.RESTORE_VALIDATION_FAILED + `: Backup contains ${backup.payload.firms.length} firms. Maximum capacity is 3.`);
      }

      // v7.36 FIX-V736-1: Write embedded logo binaries (logoAssets) to local storage BEFORE the tx runs[cite: 1]
      const logosDir = (FileSystem.documentDirectory ?? '') + 'logos/';
      await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true }).catch(() => {});
      
      const firmLogoUriMap = new Map<string, string>();
      for (const asset of backup.payload.logoAssets?.firmLogos ?? []) {
        try {
          const newUri = logosDir + Crypto.randomUUID() + '.jpg';
          await FileSystem.writeAsStringAsync(newUri, asset.base64, { encoding: FileSystem.EncodingType.Base64 });
          firmLogoUriMap.set(asset.firmId, newUri);
        } catch {}
      }

      const bisLogoUriMap = new Map<string, string>();
      for (const asset of backup.payload.logoAssets?.bisLogos ?? []) {
        try {
          const newUri = logosDir + Crypto.randomUUID() + '.jpg';
          await FileSystem.writeAsStringAsync(newUri, asset.base64, { encoding: FileSystem.EncodingType.Base64 });
          bisLogoUriMap.set(asset.bisLogoId, newUri);
        } catch {}
      }

      if (backup.payload.logoAssets) {
        backup.payload.firms = backup.payload.firms.map((f: any) => ({
          ...f,
          firmLogoRef: firmLogoUriMap.get(f.id) ?? null,
        }));
        backup.payload.bisLogos = (backup.payload.bisLogos ?? []).map((l: any) => ({
          ...l,
          fileRef: bisLogoUriMap.get(l.id) ?? null,
        }));
      }

      // Synchronous JSI Transaction Callback[cite: 1]
      db.transaction((tx) => {
        // v7.13 FIX-V713-1: Gated audit deletion[cite: 1]
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

        // RESTORE_COMPLETED written inside transaction after inserts[cite: 1]
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
      } catch {}

      storage.set('vjbilling_post_restore_logo_check_pending', 'true');

      try {
        await Updates.reloadAsync();
      } catch {
        console.warn('[Restore] Manual reload required in development environment.');
      }

    } catch (error: any) {
      try {
        const failDeviceId = getSafeDeviceId();
        db.transaction((tx) => {
          auditRepository.log(tx, {
            firmId: null,
            eventType: 'RESTORE_FAILED',
            payload: { reason: error.message },
            deviceId: failDeviceId,
          });
        });
      } catch (auditError) {
        console.error('[Restore] Failed to write RESTORE_FAILED audit:', auditError);
      }
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },

  async validateBackupSchema(backup: BackupEnvelope): Promise<{ warning?: string } | void> {
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
        `RESTORE_VALIDATION_FAILED: backup schema ${schemaVersion} is newer than app ${SCHEMA_VERSION}. Update the app first.`
      );
    }

    if (schemaVersion < SCHEMA_VERSION) {
      const deviceId = getSafeDeviceId();
      await auditRepository.log(null, {
        eventType: 'RESTORE_OLD_SCHEMA',
        firmId: null,
        deviceId,
        payload: JSON.stringify({ backupSchema: schemaVersion, currentSchema: SCHEMA_VERSION }),
      });
      console.warn(`[Restore] RESTORE_OLD_SCHEMA: Restoring backup v${schemaVersion} into app v${SCHEMA_VERSION}.`);
      return { warning: `RESTORE_OLD_SCHEMA: backup v${schemaVersion} < app ${SCHEMA_VERSION}. Proceed with user acknowledgement.` };
    }
  },
};

export const restore = restoreService.restore.bind(restoreService);
export const validateBackupSchema = restoreService.validateBackupSchema.bind(restoreService);
export default restoreService;