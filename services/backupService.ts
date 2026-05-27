// services/backupService.ts
// v2.8 FIX: Atomic snapshot inside transaction, BACKUP_CREATED audit OUTSIDE transaction (G41 exempt).
// SDK 54 FIX: expo-file-system/legacy required for all file writes.
// BACKUP_CREATED is one of 3 G41-exempt events — written without tx, outside transaction.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { db } from '../db/client';
import { firms, financialYears, auditLogs, safeModeState, appSettings, bisLogos } from '../db/schema';
import { leaseService } from './leaseService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { SCHEMA_VERSION, APP_VERSION } from '../constants/appVersion';

/**
 * HELPER: Safe access to FileSystem writable directory.
 * Fixes TS Error 2339 in Expo SDK 52+ — properties exist at runtime but
 * are missing from recent type defs.
 */
const getFileSystemDirectory = (): string => {
  const fs = FileSystem as any;
  const dir = fs.documentDirectory || fs.cacheDirectory;

  if (!dir) {
    throw new Error('CRITICAL: No writable file system directory available on this device.');
  }
  return dir.endsWith('/') ? dir : `${dir}/`;
};

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
  async createBackup() {
    await leaseService.assertNoActiveLease();
    const leaseId = await leaseService.acquire('BACKUP');

    try {
      const deviceId = await getDeviceId();

      // FIX: use now() — consistent with centralized time utility
      const timestamp = now();
      const fileName = `VJBilling_Backup_${timestamp.replace(/[:.]/g, '-')}.vjb`;
      let backupEnvelope: any = null;

      // ATOMIC SNAPSHOT — all reads in one transaction to prevent data shifts mid-export
      await db.transaction(async (tx) => {
        const smStateRows  = await tx.select().from(safeModeState);
        const settingsRows = await tx.select().from(appSettings);

        const dataSnapshot = {
          firms:          await tx.select().from(firms),
          financialYears: await tx.select().from(financialYears),
          settings:       settingsRows,
          auditLogs:      await tx.select().from(auditLogs),
          bisLogos:       await tx.select().from(bisLogos),
          safeModeState:  smStateRows.length > 0
            ? smStateRows[0]
            : { id: 1, isActive: 0, reason: null, activatedAt: null, clearedAt: null },
          writerLeases: [], // Always empty — locks do not travel across devices
        };

        const payloadString = JSON.stringify(dataSnapshot);
        const checksum = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          payloadString
        );

        backupEnvelope = {
          schemaVersion: SCHEMA_VERSION,
          appVersion:    APP_VERSION,
          exportedAt:    timestamp,  // FIX: was new Date().toISOString()
          deviceId,
          checksum,
          payload:       dataSnapshot,
        };
      });

      if (!backupEnvelope) throw new Error('Failed to construct backup payload.');

      // WRITE TO DISK
      const dir = getFileSystemDirectory();
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const filePath = `${dir}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backupEnvelope), {
        encoding: 'utf8' as any,
      });

      // TRIGGER SHARE SHEET
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Save VJ Billing Backup',
          UTI: 'public.json',
        });
      } else {
        throw new Error('System sharing is not available on this device.');
      }

      console.log('[Backup] Successfully created and shared:', fileName);

      // AUDIT WRITE — MUST be OUTSIDE the transaction (G41 exempt)
      await auditRepository.create({
        firmId: null,
        eventType: 'BACKUP_CREATED',
        payload: JSON.stringify({ fileName, checksum: backupEnvelope.checksum }),
        deviceId,
      });

      return backupEnvelope.checksum;

    } catch (error) {
      console.error('[Backup] Error:', error);
      throw error;
    } finally {
      await leaseService.release(leaseId);
    }
  },
};