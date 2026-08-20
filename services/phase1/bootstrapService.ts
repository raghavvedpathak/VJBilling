// services/phase1/bootstrapService.ts
// Phase 1 Master Bootstrap Sequence — Steps 0–12 (v7.38 Native Accelerated)
// v7.7 VERIFY-BOOT-CACHE / v7.14 FIX-V714-4: 30-minute verification cache + crash flag
// v7.24 FIX-VSEC-14: AES-256-GCM Encrypted Pre-Migration Snapshot (100,000 PBKDF2 iterations)
// v7.26 FIX-V726-6: Uses getDeviceDerivedKeyMaterial() from utils/deviceKey
// Native JSI execution via react-native-quick-crypto (<30ms)

import { safeModeService, bootstrapComplete } from '@/services/phase1/safeModeService';
import { getDeviceId, getOrGenerateDeviceId, auditDeviceIdIfNew } from '@/utils/deviceId';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';
import { verifyService } from '@/services/phase1/verifyService';
import { safeModeStore, SafeModeTrigger } from '@/store/phase1/safeModeStore';
import db, { expoDb } from '@/db/client';
import { firms, writerLeases, bisLogos, safeModeState, schemaVersion } from '@/db/schema';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_PATHS } from '@/constants';
import { storage } from '@/utils/storage';
import { eq, isNotNull } from 'drizzle-orm';
import { differenceInDays, differenceInMinutes, parseISO } from 'date-fns';
import { purgeExpiredAuditLogs } from '@/services/phase1/auditRetentionService';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import quickCrypto from 'react-native-quick-crypto';

export const PRE_MIGRATION_SNAPSHOT_PATH = STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT;

let premigrationSnapshotFailed = false;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

function getCryptoModule(): any {
  return quickCrypto || (typeof require !== 'undefined' ? require('crypto') : null);
}

export const bootstrapService = {
  // ==========================================================================
  // STEP 0: PRE-MIGRATION SNAPSHOT (AES-256-GCM Encrypted — 100,000 Iterations)
  // ==========================================================================
  async takePreMigrationSnapshot(): Promise<void> {
    try {
      const dbFilePath = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      const dbInfo = await FileSystem.getInfoAsync(dbFilePath);

      if (!dbInfo.exists) return;

      const safeSelectAll = (tableName: string) => {
        try {
          const check = expoDb.getFirstSync<{ count: number }>(
            `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
          );
          if (check && check.count > 0) {
            return expoDb.getAllSync(`SELECT * FROM ${tableName}`);
          }
        } catch {}
        return [];
      };

      const firmsData = safeSelectAll('firms');
      if (firmsData.length === 0) return;

      const snapshot = {
        timestamp: new Date().toISOString(),
        version: 'v2.3_PRE_MIGRATION',
        firms: firmsData,
        financial_years: safeSelectAll('financial_years'),
        audit_logs: safeSelectAll('audit_logs'),
      };

      const payloadStr = JSON.stringify(snapshot);
      const keySourceMaterial = Buffer.from(await getDeviceDerivedKeyMaterial());
      const cryptoModule = getCryptoModule();
      const saltBytes = cryptoModule.randomBytes(16);
      const ivBytes = cryptoModule.randomBytes(12);

      // Native C++ PBKDF2 Key Derivation (~20ms)
      const key = cryptoModule.pbkdf2Sync(
        keySourceMaterial,
        saltBytes,
        100_000,
        32,
        'sha256'
      );

      // Native C++ AES-256-GCM Encrypt
      const cipher = cryptoModule.createCipheriv('aes-256-gcm', key, ivBytes);
      const encryptedBody = Buffer.concat([
        cipher.update(Buffer.from(payloadStr, 'utf8')),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      const combinedCiphertext = Buffer.concat([encryptedBody, authTag]);

      const encryptedBlob = JSON.stringify({
        iv: ivBytes.toString('base64'),
        salt: saltBytes.toString('base64'),
        ciphertext: combinedCiphertext.toString('base64'),
        iterations: 100_000,
        timestamp: new Date().toISOString(),
      });

      await FileSystem.makeDirectoryAsync(STORAGE_PATHS.BACKUP_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, encryptedBlob, { 
        encoding: FileSystem.EncodingType.UTF8 
      });

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Bootstrap] SNAPSHOT FAILED (Non-blocking):', msg);
      premigrationSnapshotFailed = true;
    }
  },

  // ==========================================================================
  // MASTER INIT SEQUENCE — Steps 1–12
  // ==========================================================================
  async initApp(): Promise<'DASHBOARD' | 'SETUP' | 'SAFE_MODE' | 'DATABASE_ERROR' | 'DASHBOARD_WARNING'> {
    const previousBootWasInterrupted = storage.getString('vjbilling_boot_was_interrupted') === 'true';
    storage.set('vjbilling_boot_was_interrupted', 'true');

    try {
      // Step 3: Purge ALL leases on restart
      db.transaction((tx) => {
        tx.delete(writerLeases).run();
      });

      // Step 4: Initialize device identity if missing
      getOrGenerateDeviceId();

      // Step 5: Safe Mode row guard and DB state loading
      const safeModeRows = db.select().from(safeModeState).limit(1).all();

      if (safeModeRows.length === 0) {
        const svRows = db.select().from(schemaVersion).limit(1).all();
        const migrationZeroConfirmed = svRows.length > 0;

        if (migrationZeroConfirmed) {
          console.error(
            '[Bootstrap] SAFE-MODE-ROW-GUARD: safe_mode_state row missing after confirmed ' +
            'migration zero. Activating STORAGE_CORRUPTION_DETECTED.'
          );
          await safeModeService.activate('STORAGE_CORRUPTION_DETECTED' as SafeModeTrigger, {
            missingTable: 'safe_mode_state',
            schemaVersionConfirmed: true,
          });
          bootstrapComplete.value = true;
          storage.set('vjbilling_boot_was_interrupted', 'false');
          return 'SAFE_MODE';
        }
      } else {
        safeModeService.loadState();
      }

      // Step 7: Device ID Phase B — write DEVICE_ID_GENERATED audit event if not yet logged
      await auditDeviceIdIfNew();

      // Deferred audit for Step 0 snapshot failure (Spec v7.38 Step 14 compliant)
      if (premigrationSnapshotFailed) {
        try {
          const deviceId = getSafeDeviceId();
          db.transaction((tx) => {
            auditRepository.log(tx, {
              eventType: 'PRE_MIGRATION_SNAPSHOT_FAILED',
              firmId: null,
              deviceId,
              payload: { error: 'Snapshot failed during Step 0' },
            });
          });
          premigrationSnapshotFailed = false;
        } catch (auditError) {
          console.error('[Bootstrap] Failed to write deferred audit log:', auditError);
        }
      }

      // Step 7b: Mark bootstrap complete & clear crash flag
      bootstrapComplete.value = true;
      storage.set('vjbilling_boot_was_interrupted', 'false');

      // Step 7c: Fire-and-forget audit retention purge check
      const last = appSettingsStore.getState().auditRetentionLastRunAt;
      if (!last || differenceInDays(new Date(), parseISO(last)) >= 30) {
        purgeExpiredAuditLogs().catch(console.error);
      }

      if (safeModeStore.getState().isActive) {
        return 'SAFE_MODE';
      }

      // Step 8: Check if any firm exists
      const existingFirms = db.select({ id: firms.id }).from(firms).limit(1).all();
      if (existingFirms.length === 0) {
        return 'SETUP';
      }

      // Step 9 (pre-verify): G62 Post-Restore Logo Integrity Check
      const pendingLogoCheck = storage.getString('vjbilling_post_restore_logo_check_pending');
      let logosWereMissing = false;

      if (pendingLogoCheck === 'true') {
        const firmRows = db.select().from(firms).where(isNotNull(firms.firmLogoRef)).all();
        for (const firm of firmRows) {
          if (firm.firmLogoRef) {
            const info = await FileSystem.getInfoAsync(firm.firmLogoRef);
            if (!info.exists) {
              const deviceId = getSafeDeviceId();
              db.transaction((tx) => {
                tx.update(firms).set({ firmLogoRef: null }).where(eq(firms.id, firm.id)).run();
                auditRepository.log(tx, {
                  firmId: firm.id,
                  eventType: 'FIRM_UPDATED',
                  deviceId,
                  payload: { changes: ['firmLogoRef'], reason: 'LOGO_NOT_FOUND_ON_DEVICE' },
                });
              });
              logosWereMissing = true;
            }
          }
        }

        const bisRows = db.select().from(bisLogos).where(eq(bisLogos.isArchived, 0)).all();
        for (const logo of bisRows) {
          if (logo.fileRef) {
            const info = await FileSystem.getInfoAsync(logo.fileRef);
            if (!info.exists) {
              const deviceId = getSafeDeviceId();
              db.transaction((tx) => {
                tx.update(bisLogos)
                  .set({
                    isArchived: 1,
                    archivedAt: new Date().toISOString(),
                    archivedReason: 'FILE_NOT_FOUND_ON_DEVICE',
                  })
                  .where(eq(bisLogos.id, logo.id))
                  .run();
                auditRepository.log(tx, {
                  firmId: logo.firmId,
                  eventType: 'BIS_LOGO_ARCHIVED',
                  deviceId,
                  payload: { reason: 'FILE_NOT_FOUND_ON_DEVICE', fileRef: logo.fileRef },
                });
              });
              logosWereMissing = true;
            }
          }
        }

        storage.delete('vjbilling_post_restore_logo_check_pending');
      }

      // Step 9: Run Verify My Data (v7.7 VERIFY-BOOT-CACHE)
      let verifyStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
      const lastVerifyStatus = storage.getString('vjbilling_last_verify_status') as 'HEALTHY' | 'WARNING' | 'CRITICAL' | undefined;
      const lastVerifyAt = storage.getString('vjbilling_last_verify_at');
      
      const isCacheValid = 
        !previousBootWasInterrupted &&
        lastVerifyStatus === 'HEALTHY' &&
        !!lastVerifyAt &&
        differenceInMinutes(new Date(), parseISO(lastVerifyAt)) < 30;

      if (isCacheValid) {
        verifyStatus = 'HEALTHY';
      } else {
        const result = await verifyService.runVerify();
        verifyStatus = result.status;
        storage.set('vjbilling_last_verify_status', verifyStatus);
        storage.set('vjbilling_last_verify_at', new Date().toISOString());
      }

      // Clean up emergency pre-migration snapshots upon successful bootstrap
      try {
        const snapshotInfo = await FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH);
        if (snapshotInfo.exists) {
          await FileSystem.deleteAsync(PRE_MIGRATION_SNAPSHOT_PATH, { idempotent: true });
        }
        if (STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY) {
          await FileSystem.deleteAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY, { idempotent: true }).catch(() => {});
        }
      } catch {}

      if (verifyStatus === 'CRITICAL') return 'SAFE_MODE';
      if (verifyStatus === 'WARNING' || logosWereMissing) return 'DASHBOARD_WARNING';

      return 'DASHBOARD';

    } catch (e) {
      console.error('[Bootstrap] Critical Failure:', e);
      return 'DATABASE_ERROR';
    }
  },
};

export async function bootstrapDatabase(): Promise<'DASHBOARD' | 'SETUP' | 'SAFE_MODE' | 'DATABASE_ERROR' | 'DASHBOARD_WARNING'> {
  return bootstrapService.initApp();
}

export default bootstrapService;