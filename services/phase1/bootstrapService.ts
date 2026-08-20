// services/phase1/bootstrapService.ts
// Phase 1 Master Bootstrap Sequence — Steps 0–12
// v7.7 VERIFY-BOOT-CACHE / v7.14 FIX-V714-4: 30-minute verification cache + crash flag
// v7.24 FIX-VSEC-14: AES-256-GCM Encrypted Pre-Migration Snapshot (100,000 PBKDF2 iterations)
// v7.26 FIX-V726-6: Uses getDeviceDerivedKeyMaterial() from utils/deviceKey

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
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

export const PRE_MIGRATION_SNAPSHOT_PATH = STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT;

let premigrationSnapshotFailed = false;
let premigrationSnapshotCreated = false;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const bootstrapService = {

  // ==========================================================================
  // STEP 0: PRE-MIGRATION SNAPSHOT (AES-256-GCM Encrypted — 100,000 Iterations)
  // ==========================================================================
  async takePreMigrationSnapshot(): Promise<void> {
    console.log('[Bootstrap] Step 0: Executing Encrypted Pre-Migration Snapshot...');
    try {
      const dbFilePath = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      const dbInfo = await FileSystem.getInfoAsync(dbFilePath);

      if (!dbInfo.exists) {
        console.log('[Bootstrap] Clean install detected (No DB file). Skipping snapshot.');
        return;
      }

      const safeSelectAll = (tableName: string) => {
        try {
          const check = expoDb.getFirstSync<{ count: number }>(
            `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
          );
          if (check && check.count > 0) {
            return expoDb.getAllSync(`SELECT * FROM ${tableName}`);
          }
        } catch (e) {
          // Table doesn't exist yet
        }
        return [];
      };

      const firmsData = safeSelectAll('firms');
      if (firmsData.length === 0) {
        console.log('[Bootstrap] Clean install detected (No firm records). Skipping snapshot.');
        return;
      }

      const snapshot = {
        timestamp: new Date().toISOString(),
        version: 'v2.3_PRE_MIGRATION',
        firms: firmsData,
        financial_years: safeSelectAll('financial_years'),
        audit_logs: safeSelectAll('audit_logs'),
      };

      const payloadStr = JSON.stringify(snapshot);
      const keySourceMaterial = await getDeviceDerivedKeyMaterial();
      const saltBytes = Crypto.getRandomBytes(16);
      const ivBytes = Crypto.getRandomBytes(12);

      const toBase64 = (bytes: Uint8Array) => {
        try {
          if (typeof btoa === 'function') {
            return btoa(String.fromCharCode(...bytes));
          }
        } catch (e) {}
        const wa = CryptoJS.lib.WordArray.create(bytes as any);
        return CryptoJS.enc.Base64.stringify(wa);
      };

      let encryptedBlob = '';
      const iterations = 100000; // v7.24 FIX-VSEC-14: standard 100,000 PBKDF2 iterations

      if (typeof crypto !== 'undefined' && crypto?.subtle?.importKey) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          keySourceMaterial as unknown as BufferSource,
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
          iv: toBase64(ivBytes),
          salt: toBase64(saltBytes),
          ciphertext: toBase64(new Uint8Array(cipherBuffer)),
          iterations,
          timestamp: new Date().toISOString(),
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
          iv: toBase64(ivBytes),
          salt: toBase64(saltBytes),
          ciphertext: encrypted.toString(),
          iterations,
          timestamp: new Date().toISOString(),
        });
      }

      await FileSystem.makeDirectoryAsync(STORAGE_PATHS.BACKUP_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, encryptedBlob, { 
        encoding: FileSystem.EncodingType.UTF8 
      });

      console.log('[Bootstrap] Encrypted Pre-Migration Snapshot secured at:', PRE_MIGRATION_SNAPSHOT_PATH);
      premigrationSnapshotCreated = true;

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
    console.log('[Bootstrap] Starting Phase 1 Sequence...');

    // Inspect previous crash state before setting current boot interrupted flag
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
        } else {
          console.log(
            '[Bootstrap] Step 5: safe_mode_state absent + schema_version absent — ' +
            'pre-migration first boot. Proceeding.'
          );
        }
      } else {
        safeModeService.loadState();
      }

      // Step 7: Device ID Phase B — write DEVICE_ID_GENERATED audit event if not yet logged
      await auditDeviceIdIfNew();

      // Audit for Step 0 snapshot creation
      if (premigrationSnapshotCreated) {
        try {
          const deviceId = getSafeDeviceId();
          db.transaction((tx) => {
            auditRepository.create(
              {
                eventType: 'PRE_MIGRATION_SNAPSHOT_CREATED',
                firmId: null,
                deviceId,
                payload: JSON.stringify({ snapshotPath: PRE_MIGRATION_SNAPSHOT_PATH, timestamp: new Date().toISOString() }),
              },
              tx
            );
          });
          premigrationSnapshotCreated = false;
        } catch (auditError) {
          console.error('[Bootstrap] Failed to write pre-migration snapshot audit log:', auditError);
        }
      }

      // Deferred audit for Step 0 snapshot failure
      if (premigrationSnapshotFailed) {
        try {
          const deviceId = getSafeDeviceId();
          db.transaction((tx) => {
            auditRepository.create(
              {
                eventType: 'PRE_MIGRATION_SNAPSHOT_FAILED',
                firmId: null,
                deviceId,
                payload: JSON.stringify({ error: 'Snapshot failed during Step 0' }),
              },
              tx
            );
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
        console.log('[Bootstrap] Safe Mode Detected from Persistence.');
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
        console.log('[Bootstrap] Step 9: Running G62 Post-Restore Logo Integrity Check...');

        const firmRows = db.select().from(firms).where(isNotNull(firms.firmLogoRef)).all();
        for (const firm of firmRows) {
          if (firm.firmLogoRef) {
            const info = await FileSystem.getInfoAsync(firm.firmLogoRef);
            if (!info.exists) {
              const deviceId = getSafeDeviceId();
              db.transaction((tx) => {
                tx.update(firms).set({ firmLogoRef: null }).where(eq(firms.id, firm.id)).run();
                auditRepository.create(
                  {
                    firmId: firm.id,
                    eventType: 'FIRM_UPDATED',
                    deviceId,
                    payload: JSON.stringify({ changes: ['firmLogoRef'], reason: 'LOGO_NOT_FOUND_ON_DEVICE' }),
                  },
                  tx
                );
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
                auditRepository.create(
                  {
                    firmId: logo.firmId,
                    eventType: 'BIS_LOGO_ARCHIVED',
                    deviceId,
                    payload: JSON.stringify({ reason: 'FILE_NOT_FOUND_ON_DEVICE', fileRef: logo.fileRef }),
                  },
                  tx
                );
              });
              logosWereMissing = true;
            }
          }
        }

        storage.delete('vjbilling_post_restore_logo_check_pending');
        console.log('[Bootstrap] G62 complete. Logos missing:', logosWereMissing);
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
        console.log('[Bootstrap] Step 9: VERIFY-BOOT-CACHE hit. Bypassing 9-query full-table scan.');
        verifyStatus = 'HEALTHY';
      } else {
        console.log('[Bootstrap] Step 9: Running full Verify My Data integrity scan...');
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
          const deviceId = getSafeDeviceId();
          db.transaction((tx) => {
            auditRepository.create(
              {
                eventType: 'PRE_MIGRATION_SNAPSHOT_PURGED',
                firmId: null,
                deviceId,
                payload: JSON.stringify({ purgedAt: new Date().toISOString() }),
              },
              tx
            );
          });
          console.log('[Bootstrap] Cleaned up stale pre-migration snapshot and recorded purge audit event.');
        }
        if (STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY) {
          await FileSystem.deleteAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY, { idempotent: true }).catch(() => {});
        }
      } catch (cleanupError) {
        console.warn('[Bootstrap] Failed to clean up snapshot (non-fatal):', cleanupError);
      }

      if (verifyStatus === 'CRITICAL') {
        console.log('[Bootstrap] Critical Integrity Issue Found. Safe Mode Triggered.');
        return 'SAFE_MODE';
      }

      if (verifyStatus === 'WARNING' || logosWereMissing) {
        console.log('[Bootstrap] Warning or Missing Logos. Proceeding with warning flag.');
        return 'DASHBOARD_WARNING';
      }

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