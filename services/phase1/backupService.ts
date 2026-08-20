// services/phase1/backupService.ts
// Phase 1 v7.38 Canonical Implementation (AES-256-GCM WebCrypto Encryption + Optional Password + Logo Embedding + SAF Mirror)
// v7.28 FIX-V728-1: BackupEnvelope explicit declaration using Drizzle inferred types
// v7.33 FIX-V733-4 / FIX-V733-5 / FIX-V733-6 / FIX-V733-9: SAF public mirror + legacy import + BackupResult live interface
// v7.36 FIX-V736-1: Firm & BIS logo image binaries embedded in payload (logoAssets)
//
// CONSTITUTIONAL RULES:
//   - createBackup() does NOT call assertNotInSafeMode(). (Read operation exempt from Safe Mode).
//   - BACKUP_CREATED audit is written OUTSIDE the transaction (G41 exempt).
//   - BackupEnvelope payload is strictly typed.

import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import { storage } from '@/utils/storage';
import { db } from '@/db/client';
import { 
  firms, financialYears, auditLogs, safeModeState, appSettings, bisLogos,
  categories, designs, stones, hsnCodes, items, itemEvents,
  gemstoneLots, designCategoryMap, sequenceCounters, oldGoldLots, urdPurchases
} from '@/db/schema';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId, getDeviceDerivedKeyMaterial } from '@/utils/deviceId';
import { SCHEMA_VERSION, APP_VERSION } from '@/constants';

export const BACKUP_DIR = (FileSystem.documentDirectory ?? '') + 'backups/';

// v7.25 FIX-V725-10: checksum field removed (AES-GCM auth tag provides integrity)
// v7.33 FIX-V733-5: BackupResult live export interface including mirroredToPublicStorage
export interface BackupResult { 
  fileName: string; 
  filePath: string; 
  fileSizeBytes: number; 
  mirroredToPublicStorage: boolean;
}

// v7.28 FIX-V728-1 / v7.36 FIX-V736-1: Explicit typing for the decrypted payload format
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
    logoAssets?: {
      firmLogos: Array<{ firmId: string; base64: string }>;
      bisLogos: Array<{ bisLogoId: string; base64: string }>;
    };
    // Phase 2+ tables preserved for completeness
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

// v7.33 FIX-V733-6: SAF folder resolution helper
async function getOrCreateSafFolder(parentUri: string, name: string): Promise<string> {
  const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
  for (const childUri of children) {
    const decodedName = decodeURIComponent(childUri.split('/').pop() ?? '');
    if (decodedName === name || decodedName.endsWith(`:${name}`)) {
      return childUri;
    }
  }
  return await StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

export async function createBackup(password?: string): Promise<BackupResult> {
  await leaseService.assertNoActiveLease();
  const leaseId = await leaseService.acquire('BACKUP');

  try {
    // 1. Synchronous JSI transaction callback DB reads
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

    // 2. v7.36 FIX-V736-1: Read and base64-encode logo image binaries outside transaction
    const logoAssets: {
      firmLogos: Array<{ firmId: string; base64: string }>;
      bisLogos: Array<{ bisLogoId: string; base64: string }>;
    } = { firmLogos: [], bisLogos: [] };

    for (const firm of payload.firms) {
      if (!firm.firmLogoRef) continue;
      try {
        const base64 = await FileSystem.readAsStringAsync(firm.firmLogoRef, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoAssets.firmLogos.push({ firmId: firm.id, base64 });
      } catch {
        // Missing/unreadable file skipped silently per spec
      }
    }

    for (const logo of payload.bisLogos) {
      if (logo.isArchived !== 0 || !logo.fileRef) continue;
      try {
        const base64 = await FileSystem.readAsStringAsync(logo.fileRef, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoAssets.bisLogos.push({ bisLogoId: logo.id, base64 });
      } catch {
        // Missing/unreadable file skipped silently
      }
    }

    let deviceIdStr: string;
    try {
      deviceIdStr = getDeviceId();
    } catch {
      deviceIdStr = 'DEV-DEVICE-ID';
    }

    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId: deviceIdStr,
      encryptionVersion: 1 as const,
      passwordProtected: !!password,
    };

    const payloadStr = JSON.stringify({ ...payload, logoAssets });
    const enc = new TextEncoder();
    const keySourceMaterial = password ? enc.encode(password) : await getDeviceDerivedKeyMaterial();

    let saltBytes: Uint8Array;
    let ivBytes: Uint8Array;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      saltBytes = crypto.getRandomValues(new Uint8Array(16));
      ivBytes = crypto.getRandomValues(new Uint8Array(12));
    } else {
      saltBytes = Crypto.getRandomBytes(16);
      ivBytes = Crypto.getRandomBytes(12);
    }

    const toBase64 = (u8: Uint8Array) => {
      let binary = '';
      for (let i = 0; i < u8.length; i++) {
        binary += String.fromCharCode(u8[i]);
      }
      return btoa(binary);
    };

    let encryptedBlob = '';
    // v7.24 / v7.26 / v7.38: 100,000 iterations for both password and device-derived keys
    const iterations = 100000;

    if (typeof crypto !== 'undefined' && crypto?.subtle?.importKey) {
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        keySourceMaterial as any,
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes as any, iterations, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes as any },
        key,
        enc.encode(payloadStr)
      );

      encryptedBlob = JSON.stringify({
        ...envelope,
        iv: toBase64(ivBytes),
        salt: toBase64(saltBytes),
        ciphertext: toBase64(new Uint8Array(cipherBuffer)),
      });
    } else {
      const saltWA = CryptoJS.lib.WordArray.create(saltBytes as any);
      const ivWA = CryptoJS.lib.WordArray.create(ivBytes as any);
      const keyMaterialWA = CryptoJS.lib.WordArray.create(keySourceMaterial as any);

      const derivedKey = CryptoJS.PBKDF2(keyMaterialWA, saltWA, {
        keySize: 256 / 32,
        iterations,
        hasher: CryptoJS.algo.SHA256,
      });

      const encrypted = CryptoJS.AES.encrypt(payloadStr, derivedKey, {
        iv: ivWA,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      encryptedBlob = JSON.stringify({
        ...envelope,
        iv: toBase64(ivBytes),
        salt: toBase64(saltBytes),
        ciphertext: encrypted.toString(),
      });
    }

    const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const fileName = `vjbilling_${timestamp}.vjb`;
    const filePath = BACKUP_DIR + fileName;

    // 3. Primary write to internal application document directory
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(filePath, encryptedBlob, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const fileSizeBytes = (fileInfo.exists && 'size' in fileInfo)
      ? (fileInfo as any).size ?? 0
      : encryptedBlob.length;

    // 4. v7.33 FIX-V733-4 / FIX-V733-5: Best-effort public storage mirror (Android SAF)
    let mirroredToPublicStorage = false;
    try {
      const publicDirUri = storage.getString('vjbilling_public_backup_dir_uri');
      if (publicDirUri) {
        await StorageAccessFramework.readDirectoryAsync(publicDirUri);
        const appFolderUri = await getOrCreateSafFolder(publicDirUri, 'VJ Billing');
        const backupsFolderUri = await getOrCreateSafFolder(appFolderUri, 'backups');
        const mirrorUri = await StorageAccessFramework.createFileAsync(
          backupsFolderUri,
          fileName,
          'application/octet-stream'
        );
        await FileSystem.writeAsStringAsync(mirrorUri, encryptedBlob, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        mirroredToPublicStorage = true;
      }
    } catch {
      mirroredToPublicStorage = false;
    }

    // 5. Trigger sharing sheet if available
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Save VJ Billing Backup',
        });
      }
    } catch (shareErr) {
      console.warn('[Backup] Sharing sheet skipped/failed:', shareErr);
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    // 6. G41: Audit write OUTSIDE transaction
    await auditRepository.log(null, {
      eventType: 'BACKUP_CREATED',
      firmId: null,
      deviceId: envelope.deviceId,
      payload: JSON.stringify({ exportedAt: envelope.exportedAt, fileName, fileSizeBytes }),
    });

    return { fileName, filePath, fileSizeBytes, mirroredToPublicStorage };

  } catch (error) {
    console.error('[Backup] Error:', error);
    throw error;
  } finally {
    await leaseService.release(leaseId).catch(console.error);
  }
}

export const backupService = {
  createBackup,
};

export default backupService;