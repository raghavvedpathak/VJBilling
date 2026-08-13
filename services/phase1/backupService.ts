// services/phase1/backupService.ts
// v2.9 Canonical Implementation (AES-256-GCM WebCrypto Encryption + Optional Password)
// v7.28 FIX-V728-1: BackupEnvelope explicit declaration using Drizzle inferred types
// v7.33 FIX-V733-5: BackupResult includes mirroredToPublicStorage
//
// CONSTITUTIONAL RULES:
//   - createBackup() does NOT call assertNotInSafeMode(). (Read operation exempt from Safe Mode).
//   - BACKUP_CREATED audit is written OUTSIDE the transaction (G41 exempt).
//   - BackupEnvelope payload is strictly typed (no any[] for core Phase 1 tables).

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { storage } from '@/utils/storage';
import { db } from '@/db/client';
import { 
  firms, financialYears, auditLogs, safeModeState, appSettings, bisLogos,
  categories, designs, stones, hsnCodes, items, itemEvents,
  gemstoneLots, designCategoryMap, sequenceCounters, oldGoldLots, urdPurchases
} from '@/db/schema';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId, getCanonicalBackupKeyMaterial } from '@/utils/deviceId';
import { SCHEMA_VERSION, APP_VERSION } from '@/constants';

const fsAny = FileSystem as any;
export const BACKUP_DIR = (fsAny.documentDirectory ?? fsAny.cacheDirectory ?? '') + 'VJBilling/backups/';

// v7.25 FIX-V725-10: checksum field removed (AES-GCM auth tag provides integrity)
// v7.33 FIX-V733-5: mirroredToPublicStorage added for SAF/public storage status
export interface BackupResult { 
  fileName: string; 
  filePath: string; 
  fileSizeBytes: number; 
  mirroredToPublicStorage: boolean;
}

// v7.28 FIX-V728-1: Explicit typing for the decrypted payload format
export interface BackupEnvelope {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deviceId: string;
  encryptionVersion: 1 | 2;
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
  try {
    const files = await (FileSystem as any).StorageAccessFramework.readDirectoryAsync(parentUri);
    for (const fileUri of files) {
      const decoded = decodeURIComponent(fileUri);
      const clean = decoded.endsWith('/') ? decoded.slice(0, -1) : decoded;
      if (
        clean.endsWith('/' + folderName) ||
        clean.endsWith('%2F' + folderName) ||
        clean.endsWith(':' + folderName)
      ) {
        return fileUri;
      }
    }
  } catch (err) {
    console.warn(`[Backup SAF] Directory read failed for ${folderName}, creating fresh:`, err);
  }
  return await (FileSystem as any).StorageAccessFramework.makeDirectoryAsync(parentUri, folderName);
}

export const backupService = {

  /**
   * Generates an AES-256-GCM encrypted backup file using WebCrypto.
   * Locked by 'BACKUP' lease. Deliberately exempt from Safe Mode checks.
   */
  async createBackup(password?: string): Promise<BackupResult> {
    await leaseService.assertNoActiveLease();
    const leaseId = await leaseService.acquire('BACKUP');

    try {
      // Synchronous transaction callback reads
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
        encryptionVersion: 2 as const,
        passwordProtected: !!password
      };

      const payloadStr = JSON.stringify(payload);
      const enc = new TextEncoder();
      const keySourceMaterial = password ? enc.encode(password) : await getCanonicalBackupKeyMaterial();

      // WebCrypto AES-256-GCM Key Derivation & Encryption
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const ivBytes = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        keySourceMaterial as any,
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        enc.encode(payloadStr)
      );

      const toBase64 = (u8: Uint8Array) => {
        let binary = '';
        for (let i = 0; i < u8.length; i++) {
          binary += String.fromCharCode(u8[i]);
        }
        return btoa(binary);
      };

      const encryptedBlob = JSON.stringify({
        ...envelope,
        iv: toBase64(ivBytes),
        salt: toBase64(saltBytes),
        ciphertext: toBase64(new Uint8Array(cipherBuffer)),
      });

      const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const fileName = `vjbilling_${timestamp}.vjb`;
      
      let filePath = '';
      let isPublicSaved = false;

      if (Platform.OS === 'android') {
        try {
          let parentUri = storage.getString('vjbilling_android_backup_dir_uri');
          if (!parentUri) {
            const permissions = await (FileSystem as any).StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              parentUri = permissions.directoryUri;
              if (parentUri) {
                storage.set('vjbilling_android_backup_dir_uri', parentUri);
              }
            }
          }

          if (parentUri) {
            const vjBillingUri = await getOrCreateSAFDirectory(parentUri, 'VJBilling');
            const backupsUri = await getOrCreateSAFDirectory(vjBillingUri, 'backups');
            const safFileUri = await (FileSystem as any).StorageAccessFramework.createFileAsync(backupsUri, fileName, 'application/octet-stream');
            await FileSystem.writeAsStringAsync(safFileUri, encryptedBlob, { encoding: FileSystem.EncodingType?.UTF8 ?? ('utf8' as any) });
            filePath = safFileUri;
            isPublicSaved = true;
            console.log('[Backup] Saved directly to public SAF folder:', filePath);
          }
        } catch (androidError) {
          console.warn('[Backup] Android SAF direct write failed, falling back to Sharing:', androidError);
          try {
            storage.delete('vjbilling_android_backup_dir_uri');
          } catch {}
        }
      }

      if (!isPublicSaved) {
        // Fallback for iOS / Web / Simulators / Denied Android SAF permissions
        const localPath = BACKUP_DIR + fileName;
        if (typeof (FileSystem as any).makeDirectoryAsync === 'function') {
          await (FileSystem as any).makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
        }
        if (typeof (FileSystem as any).writeAsStringAsync === 'function') {
          await (FileSystem as any).writeAsStringAsync(localPath, encryptedBlob, {
            encoding: FileSystem.EncodingType?.UTF8 ?? ('utf8' as any)
          });
        }
        filePath = localPath;

        if (Platform.OS === 'ios') {
          isPublicSaved = true;
          console.log('[Backup] Saved directly to visible document directory on iOS:', filePath);
        } else {
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
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      // AUDIT WRITE — MUST be OUTSIDE the transaction (G41 exempt)
      await auditRepository.log(null, {
        eventType: 'BACKUP_CREATED',
        firmId: null,
        deviceId: envelope.deviceId,
        payload: JSON.stringify({ exportedAt: envelope.exportedAt, fileName, fileSizeBytes }),
      });

      return { fileName, filePath, fileSizeBytes, mirroredToPublicStorage: isPublicSaved };

    } catch (error) {
      console.error('[Backup] Error:', error);
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },
};