// services/backupService.ts
// v2.8 FIX: Atomic snapshot inside transaction, BACKUP_CREATED audit OUTSIDE transaction (G41 exempt).
// SDK 54 FIX: expo-file-system/legacy required for all file writes.
// BACKUP_CREATED is one of 3 G41-exempt events — written without tx, outside transaction.

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
import { getDeviceId } from '../utils/deviceId';
import { SCHEMA_VERSION, APP_VERSION } from '../constants/appVersion';

export const BACKUP_DIR = FileSystem.documentDirectory + 'backups/';

export interface BackupResult { 
  checksum: string; 
  fileName: string; 
  filePath: string; 
  fileSizeBytes: number; 
}

export const backupService = {

  /**
   * Generates a full system backup and triggers the system Share Sheet.
   * Locked by 'BACKUP' lease. Deliberately exempt from Safe Mode checks —
   * backup must be possible even when Safe Mode is active (recovery path).
   *
   * BACKUP_CREATED audit is written OUTSIDE the transaction (G41 exempt + v7.4 known limitation).
   * If app crashes between file write and audit write, the backup file exists but BACKUP_CREATED
   * is not logged — accepted architectural gap (data is safe; traceability gap only).
   */
  async createBackup(): Promise<BackupResult> {
    await leaseService.assertNoActiveLease();
    const leaseId = await leaseService.acquire('BACKUP');

    try {
      const deviceId = await getDeviceId();

      // v7.16 FIX-V716-5: JSI driver requires synchronous tx callback — async removed
      const payload = db.transaction((tx) => {
        // v7.17 FIX-V717-1: Promise.all() is async — replaced with synchronous .all() calls
        const firmsRows = tx.select().from(firms).all();
        const financialYearsRows = tx.select().from(financialYears).all();
        const settingsRows = tx.select().from(appSettings).all();
        const auditLogsRows = tx.select().from(auditLogs).all();
        const safeModeStateRows = tx.select().from(safeModeState).all();
        const bisLogosRows = tx.select().from(bisLogos).all();
        
        // Phase 2 + Phase 3 + Phase 4 tables
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
        deviceId, 
        checksum: '', 
        payload 
      };

      const payloadStr = JSON.stringify(payload);
      
      // v7.16 FIX-V716-6: SDK 56 canonical pattern uses Web Crypto globally available via Hermes
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadStr));
      envelope.checksum = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      const timestamp = envelope.exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const fileName = `vjbilling_${timestamp}.vjb`;
      const filePath = BACKUP_DIR + fileName;

      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(envelope), {
        encoding: FileSystem.EncodingType.UTF8
      });

      const fileInfo = await FileSystem.getInfoAsync(filePath);
      const fileSizeBytes = (fileInfo.exists && 'size' in fileInfo) ? (fileInfo as any).size ?? 0 : 0;

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/octet-stream', // Prompt mentioned octet-stream for sharing, but vjb is application/json... wait, the prompt says "mimeType: 'application/octet-stream'".
          dialogTitle: 'Save VJ Billing Backup'
        });
      } else {
        throw new Error('System sharing is not available on this device.');
      }

      console.log('[Backup] Successfully created and shared:', fileName);

      // AUDIT WRITE — MUST be OUTSIDE the transaction (G41 exempt)
      await auditRepository.create({
        firmId: null,
        eventType: 'BACKUP_CREATED',
        payload: JSON.stringify({ exportedAt: envelope.exportedAt, fileName, fileSizeBytes }),
        deviceId,
      });

      return { checksum: envelope.checksum, fileName, filePath, fileSizeBytes };

    } catch (error) {
      console.error('[Backup] Error:', error);
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },
};