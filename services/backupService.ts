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
      
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const ivBytes = crypto.getRandomValues(new Uint8Array(12));
      
      // FIX: Cast keySourceMaterial to `any` to bypass the DOM vs Hermes TS definitions clash on Uint8Array
      const keyMaterial = await crypto.subtle.importKey('raw', keySourceMaterial as any, 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
      );
      
      const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, enc.encode(payloadStr));
      const toBase64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
      
      const encryptedBlob = JSON.stringify({
        ...envelope,
        iv: toBase64(ivBytes.buffer),
        salt: toBase64(saltBytes.buffer),
        ciphertext: toBase64(cipherBuffer),
      });

      const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const fileName = `vjbilling_${timestamp}.vjb`;
      const filePath = BACKUP_DIR + fileName;

      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(filePath, encryptedBlob, {
        encoding: FileSystem.EncodingType.UTF8
      });

      const fileInfo = await FileSystem.getInfoAsync(filePath);
      const fileSizeBytes = (fileInfo.exists && 'size' in fileInfo) ? (fileInfo as any).size ?? 0 : 0;

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/octet-stream', 
          dialogTitle: 'Save VJ Billing Backup'
        });
      } else {
        throw new Error('System sharing is not available on this device.');
      }

      console.log('[Backup] Successfully created and shared:', fileName);

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