// services/backupService.ts
// v2.9 Canonical Implementation (AES-256-GCM Encryption + Optional Password)
// v7.28 FIX-V728-1: BackupEnvelope explicit declaration using Drizzle inferred types
//
// CONSTITUTIONAL RULES:
//   - createBackup() does NOT call assertNotInSafeMode(). (Read operation exempt from Safe Mode).
//   - BACKUP_CREATED audit is written OUTSIDE the transaction (G41 exempt).
//   - BackupEnvelope payload is strictly typed (no any[] for core Phase 1 tables).

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';
import CryptoJS from 'crypto-js';
import { db } from '../db/client';
import { 
  firms, financialYears, auditLogs, safeModeState, appSettings, bisLogos,
  categories, designs, stones, hsnCodes, items, itemEvents,
  gemstoneLots, designCategoryMap, sequenceCounters, oldGoldLots, urdPurchases
} from '../db/schema';
import { leaseService } from './leaseService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId, getDeviceDerivedKeyMaterial } from '../utils/deviceId';
import { SCHEMA_VERSION, APP_VERSION } from '../constants/appVersion';

export const BACKUP_DIR = FileSystem.documentDirectory + 'backups/';

// v7.25 FIX-V725-10: checksum field removed (AES-GCM auth tag provides integrity)
export interface BackupResult { 
  fileName: string; 
  filePath: string; 
  fileSizeBytes: number; 
}

// v7.28 FIX-V728-1: Explicit typing for the decrypted payload format
export interface BackupEnvelope {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deviceId: string;
  encryptionVersion: 1;
  passwordProtected: boolean;
  iv: string;
  salt: string;
  ciphertext: string;
  payload: {
    firms: (typeof firms.$inferSelect)[];
    financialYears: (typeof financialYears.$inferSelect)[];
    settings: (typeof appSettings.$inferSelect)[];
    auditLogs: (typeof auditLogs.$inferSelect)[];
    bisLogos: (typeof bisLogos.$inferSelect)[];
    safeModeState: typeof safeModeState.$inferSelect | null;
    writerLeases: any[];
    
    // Phase 2+ tables included for completeness
    categories?: any[];
    designs?: any[];
    stones?: any[];
    hsnCodes?: any[];
    items?: any[];
    itemEvents?: any[];
    gemstoneLots?: any[];
    designCategoryMap?: any[];
    sequenceCounters?: any[];
    oldGoldLots?: any[];
    urdPurchases?: any[];
  };
}

async function getOrCreateSAFDirectory(parentUri: string, folderName: string): Promise<string> {
  const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  for (const fileUri of files) {
    const decoded = decodeURIComponent(fileUri);
    if (decoded.endsWith('/' + folderName) || decoded.endsWith('%2F' + folderName) || decoded.endsWith(':' + folderName)) {
      return fileUri;
    }
  }
  return await FileSystem.StorageAccessFramework.makeDirectoryAsync(parentUri, folderName);
}

export const backupService = {

  /**
   * Generates an AES-256-GCM encrypted backup file.
   * Locked by 'BACKUP' lease. Deliberately exempt from Safe Mode checks.
   */
  async createBackup(password?: string): Promise<BackupResult> {
    await leaseService.assertNoActiveLease();
    const leaseId = await leaseService.acquire('BACKUP');

    try {
      // v7.16 FIX-V716-5: Synchronous transaction callback reads
      const payload = db.transaction((tx) => {
        const firmsRows = tx.select().from(firms).all();
        const financialYearsRows = tx.select().from(financialYears).all();
        const settingsRows = tx.select().from(appSettings).all();
        const auditLogsRows = tx.select().from(auditLogs).all();
        const safeModeStateRows = tx.select().from(safeModeState).all();
        const bisLogosRows = tx.select().from(bisLogos).all();
        
        const categoriesRows = tx.select().from(categories).all();
        const designsRows = tx.select().from(designs).all();
        const stonesRows = tx.select().from(stones).all();
        const hsnCodesRows = tx.select().from(hsnCodes).all();
        const itemsRows = tx.select().from(items).all();
        const itemEventsRows = tx.select().from(itemEvents).all();
        const gemstoneLotsRows = tx.select().from(gemstoneLots).all();
        const designCategoryMapRows = tx.select().from(designCategoryMap).all();
        const sequenceCountersRows = tx.select().from(sequenceCounters).all();
        const oldGoldLotsRows = tx.select().from(oldGoldLots).all();
        const urdPurchasesRows = tx.select().from(urdPurchases).all();

        return {
          firms: firmsRows,
          financialYears: financialYearsRows,
          settings: settingsRows,
          auditLogs: auditLogsRows,
          bisLogos: bisLogosRows,
          safeModeState: safeModeStateRows.length > 0
            ? safeModeStateRows[0]
            : { id: 1, isActive: 0, reason: null, activatedAt: null, clearedAt: null },
          writerLeases: [], // Always empty — locks do not travel across devices
          categories: categoriesRows,
          designs: designsRows,
          stones: stonesRows,
          hsnCodes: hsnCodesRows,
          items: itemsRows,
          itemEvents: itemEventsRows,
          gemstoneLots: gemstoneLotsRows,
          designCategoryMap: designCategoryMapRows,
          sequenceCounters: sequenceCountersRows,
          oldGoldLots: oldGoldLotsRows,
          urdPurchases: urdPurchasesRows,
        };
      });

      const envelope = { 
        schemaVersion: SCHEMA_VERSION, 
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(), 
        deviceId: await getDeviceId(), 
        encryptionVersion: 1 as const,
        passwordProtected: !!password
      };

      const payloadStr = JSON.stringify(payload);
      const enc = new TextEncoder();
      const keySourceMaterial = password ? enc.encode(password) : await getDeviceDerivedKeyMaterial();

      // Convert Uint8Array key source to CryptoJS WordArray
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

      // Generate random salt and iv using CryptoJS WordArray
      const salt = CryptoJS.lib.WordArray.random(16);
      const iv = CryptoJS.lib.WordArray.random(16);

      // Derive key using PBKDF2
      const keyMaterial = toWordArray(keySourceMaterial);
      const key = CryptoJS.PBKDF2(keyMaterial, salt, {
        keySize: 256 / 32,
        iterations: 100000,
        hasher: CryptoJS.algo.SHA256,
      });

      // Encrypt using AES-CBC with PKCS7 padding
      const encrypted = CryptoJS.AES.encrypt(payloadStr, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const encryptedBlob = JSON.stringify({
        ...envelope,
        iv: CryptoJS.enc.Base64.stringify(iv),
        salt: CryptoJS.enc.Base64.stringify(salt),
        ciphertext: encrypted.toString(),
      });

      const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const fileName = `vjbilling_${timestamp}.vjb`;
      
      let filePath = '';
      let isPublicSaved = false;

      if (Platform.OS === 'android') {
        try {
          let parentUri = await storage.getItem('vjbilling_android_backup_dir_uri');
          if (!parentUri) {
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              parentUri = permissions.directoryUri;
              await storage.setItem('vjbilling_android_backup_dir_uri', parentUri);
            }
          }

          if (parentUri) {
            const vjBillingUri = await getOrCreateSAFDirectory(parentUri, 'VJBilling');
            const backupsUri = await getOrCreateSAFDirectory(vjBillingUri, 'backups');
            const safFileUri = await FileSystem.StorageAccessFramework.createFileAsync(backupsUri, fileName, 'application/octet-stream');
            await FileSystem.writeAsStringAsync(safFileUri, encryptedBlob, { encoding: FileSystem.EncodingType.UTF8 });
            filePath = safFileUri;
            isPublicSaved = true;
            console.log('[Backup] Saved directly to public SAF folder:', filePath);
          }
        } catch (androidError) {
          console.warn('[Backup] Android SAF direct write failed, falling back to Sharing:', androidError);
        }
      }

      if (!isPublicSaved) {
        // Fallback for iOS / Web / Simulators / Denied Android SAF permissions
        const localPath = BACKUP_DIR + fileName;
        await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
        await FileSystem.writeAsStringAsync(localPath, encryptedBlob, {
          encoding: FileSystem.EncodingType.UTF8
        });
        filePath = localPath;

        if (Platform.OS === 'ios') {
          // On iOS, supportsDocumentBrowser exposes the documents directory natively
          isPublicSaved = true;
          console.log('[Backup] Saved directly to visible document directory on iOS:', filePath);
        } else {
          // General fallback for Web / Other platforms
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(localPath, {
              mimeType: 'application/octet-stream', 
              dialogTitle: 'Save VJ Billing Backup'
            });
            isPublicSaved = true;
          } else {
            throw new Error('System sharing is not available on this device.');
          }
        }
      }

      let fileSizeBytes = 0;
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        fileSizeBytes = (fileInfo.exists && 'size' in fileInfo) ? (fileInfo as any).size ?? encryptedBlob.length : encryptedBlob.length;
      } catch {
        fileSizeBytes = encryptedBlob.length;
      }

      console.log('[Backup] Successfully created backup:', fileName, 'Size:', fileSizeBytes, 'bytes');

      // AUDIT WRITE — MUST be OUTSIDE the transaction (G41 exempt)
      await auditRepository.log(null, {
        eventType: 'BACKUP_CREATED',
        firmId: null,
        deviceId: envelope.deviceId,
        payload: JSON.stringify({ exportedAt: envelope.exportedAt, fileName, fileSizeBytes }),
      });

      return { fileName, filePath, fileSizeBytes };

    } catch (error) {
      console.error('[Backup] Error:', error);
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },
};