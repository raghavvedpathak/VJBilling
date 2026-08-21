// services/phase1/backupService.ts
// Phase 1 v7.38 Canonical Implementation — Native Accelerated (v7.38)
// Fast Native PBKDF2 + AES-256-GCM via react-native-quick-crypto (<40ms)
// Full backward/forward compatibility with WebCrypto AES-GCM envelopes

import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import quickCrypto, { Buffer } from 'react-native-quick-crypto';
import { storage } from '@/utils/storage';
import { db } from '@/db/client';
import { 
  firms, financialYears, auditLogs, safeModeState, appSettings, bisLogos,
  categories, designs, stones, hsnCodes, items, itemEvents,
  gemstoneLots, designCategoryMap, sequenceCounters, oldGoldLots, urdPurchases
} from '@/db/schema';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';
import { SCHEMA_VERSION, APP_VERSION } from '@/constants';

export const BACKUP_DIR = (FileSystem.documentDirectory ?? '') + 'backups/';

export interface BackupResult { 
  fileName: string; 
  filePath: string; 
  fileSizeBytes: number; 
  mirroredToPublicStorage: boolean;
}

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
  // G40: createBackup() does NOT call assertNotInSafeMode()
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
        writerLeases: [],
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

    // 2. v7.36 FIX-V736-1: Read logo binaries outside transaction
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
      } catch {}
    }

    for (const logo of payload.bisLogos) {
      if (logo.isArchived !== 0 || !logo.fileRef) continue;
      try {
        const base64 = await FileSystem.readAsStringAsync(logo.fileRef, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoAssets.bisLogos.push({ bisLogoId: logo.id, base64 });
      } catch {}
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
    const keySourceMaterial = password 
      ? Buffer.from(password, 'utf8') 
      : Buffer.from(await getDeviceDerivedKeyMaterial());

    const saltBytes = quickCrypto.randomBytes(16);
    const ivBytes = quickCrypto.randomBytes(12);

    // Native C++ PBKDF2 (100,000 iterations in ~20ms)
    const key = quickCrypto.pbkdf2Sync(
      keySourceMaterial,
      saltBytes,
      100_000,
      32,
      'sha256'
    );

    // Native C++ AES-256-GCM
    const cipher = quickCrypto.createCipheriv('aes-256-gcm', key, ivBytes);
    const encryptedBody = Buffer.concat([
      cipher.update(Buffer.from(payloadStr, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Standard WebCrypto concatenation: [Ciphertext (N bytes)][AuthTag (16 bytes)]
    const combinedCiphertext = Buffer.concat([encryptedBody, authTag]);

    const encryptedBlob = JSON.stringify({
      ...envelope,
      iv: ivBytes.toString('base64'),
      salt: saltBytes.toString('base64'),
      ciphertext: combinedCiphertext.toString('base64'),
    });

    const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const fileName = `vjbilling_${timestamp}.vjb`;
    const filePath = BACKUP_DIR + fileName;

    // 3. Primary write to app document directory
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

    // 6. G41: Audit write OUTSIDE transaction (Call Site 3)
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