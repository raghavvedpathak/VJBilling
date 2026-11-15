// services/phase1/bootstrapService.ts
// Phase 1 Master Bootstrap Sequence — Steps 0–12 (v7.47 Canonical)
// Implements FIX-VSEC-2, FIX-VSEC-8, FIX-VSEC-14, FIX-V740-8, FIX-V741-1, FIX-V7411-3, FIX-V743-4, FIX-V744-2, FIX-V744-3

import { safeModeService, bootstrapComplete } from '@/services/phase1/safeModeService';
import { getDeviceId, getOrGenerateDeviceId, auditDeviceIdIfNew } from '@/utils/deviceId';
import { encryptSnapshot } from '@/utils/backupCrypto';
import { isHealthyVerifyCacheValid, writeVerifyCache } from '@/utils/verifyCache';
import { verifyService } from '@/services/phase1/verifyService';
import { safeModeStore, SafeModeTrigger } from '@/store/phase1/safeModeStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { firmStore } from '@/store/phase1/useFirmStore';
import db, { expoDb, openDatabase } from '@/db/client';
import { safeTransaction } from '@/db/safeTransaction';
import {
  firms,
  writerLeases,
  bisLogos,
  safeModeState,
  schemaVersion,
  appSettings,
  auditLogs,
} from '@/db/schema';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { queuePendingAudit, flushPendingAudit } from '@/services/phase1/auditService';
import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_PATHS } from '@/constants';
import { storage } from '@/utils/storage';
import { desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { differenceInDays, parseISO } from 'date-fns';
import { purgeExpiredAuditLogs } from '@/services/phase1/auditRetentionService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { registerPhase4FYCloseHook } from '@/services/phase4/bootstrapPhase4';

export const PRE_MIGRATION_SNAPSHOT_PATH = STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const bootstrapService = {
  // ==========================================================================
  // STEP 0: PRE-MIGRATION SNAPSHOT (AES-256-GCM Encrypted — FIX-VSEC-14, FIX-V7411-3)
  // ==========================================================================
  async takePreMigrationSnapshot(): Promise<void> {
    try {
      const dbFilePath = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      const dbInfo = await FileSystem.getInfoAsync(dbFilePath);

      if (!dbInfo.exists) return;

      await openDatabase();

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
        version: 'v7.47_PRE_MIGRATION',
        firms: firmsData,
        financial_years: safeSelectAll('financial_years'),
        audit_logs: safeSelectAll('audit_logs'),
      };

      const encryptedBlob = await encryptSnapshot(JSON.stringify(snapshot));

      await FileSystem.makeDirectoryAsync(STORAGE_PATHS.BACKUP_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, encryptedBlob, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Bootstrap] SNAPSHOT FAILED (Non-blocking):', msg);
      // v7.44 FIX-V744-3: Queue pre-DB snapshot failure in MMKV to flush after Step 7b
      queuePendingAudit('PRE_MIGRATION_SNAPSHOT_FAILED', {
        error: msg || 'Snapshot failed during Step 0',
      });
    }
  },

  // ==========================================================================
  // MASTER INIT SEQUENCE — Steps 1–12
  // ==========================================================================
  async initApp(): Promise<
    'DASHBOARD' | 'SETUP' | 'SAFE_MODE' | 'DATABASE_ERROR' | 'DASHBOARD_WARNING'
  > {
    const previousBootWasInterrupted =
      storage.getString('vjbilling_boot_was_interrupted') === 'true';
    storage.set('vjbilling_boot_was_interrupted', 'true');

    try {
      // Step 1b: Ensure SQLCipher DB is open inside try/catch (FIX-V741-1)
      await openDatabase();

      // Step 3: Purge ALL leases on restart (FIX-V740-8: safeTransaction)
      safeTransaction((tx) => {
        tx.delete(writerLeases).run();
      });

      // Step 4: Initialize device identity if missing (Phase A)
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

      // Step 6: Hydrate appSettingsStore & reconcile activeFirmId (BLOCKER A, FIX-V743-4, FIX-V744-2)
      const settingsRows = db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1).all();
      if (settingsRows.length > 0) {
        appSettingsStore.setState(settingsRows[0]);
      }

      const allFirms = db.select().from(firms).all();
      if (allFirms.length > 0) {
        let activeRow = allFirms.find((f) => f.isActive === 1 && f.isArchived === 0);
        if (!activeRow) {
          // FIX-V744-2: Fallback when firms exist in DB but none is isActive
          const fallbackFirm = allFirms.find((f) => f.isArchived === 0) ?? allFirms[0];
          if (fallbackFirm) {
            safeTransaction((tx) => {
              tx.update(firms).set({ isActive: 0 }).run();
              tx.update(firms)
                .set({ isActive: 1, isArchived: 0 })
                .where(eq(firms.id, fallbackFirm.id))
                .run();
            });
            activeRow = { ...fallbackFirm, isActive: 1, isArchived: 0 };
          }
        }
        if (activeRow) {
          firmStore.setState({ activeFirmId: activeRow.id, firms: allFirms });
        }
      } else {
        firmStore.setState({ activeFirmId: null, firms: [] });
      }

      // Step 7: Device ID Phase B — write DEVICE_ID_GENERATED if not yet logged,
      // or DEVICE_ID_CHANGED if restored onto a new install/device (FIX-VSEC-8, FIX-V744-3)
      await auditDeviceIdIfNew();
      try {
        const currentDeviceId = getSafeDeviceId();
        const latestIdentityRows = db
          .select()
          .from(auditLogs)
          .where(
            inArray(auditLogs.eventType, ['DEVICE_ID_GENERATED', 'DEVICE_ID_CHANGED'])
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(1)
          .all();

        if (latestIdentityRows.length > 0) {
          const latest = latestIdentityRows[0];
          let recordedDeviceId = latest.deviceId;
          try {
            const parsed = latest.payload ? JSON.parse(latest.payload) : {};
            recordedDeviceId = parsed.newDeviceId || parsed.deviceId || latest.deviceId;
          } catch {}

          if (
            recordedDeviceId &&
            recordedDeviceId !== currentDeviceId &&
            currentDeviceId !== 'DEV-DEVICE-ID'
          ) {
            safeTransaction((tx) => {
              auditRepository.log(tx, {
                eventType: 'DEVICE_ID_CHANGED',
                firmId: null,
                deviceId: currentDeviceId,
                payload: JSON.stringify({
                  oldDeviceId: recordedDeviceId,
                  newDeviceId: currentDeviceId,
                  reason: 'reinstall_or_new_device',
                }),
              });
            });
          }
        }
      } catch (e) {
        console.warn('[Bootstrap] DEVICE_ID_CHANGED check non-fatal error:', e);
      }

      // Step 7b: Mark bootstrap complete, flush pre-DB audit queue (FIX-V744-3), & clear crash flag
      bootstrapComplete.value = true;
      try {
        flushPendingAudit();
      } catch (flushErr) {
        console.warn('[Bootstrap] flushPendingAudit non-fatal error:', flushErr);
      }
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
      if (allFirms.length === 0) {
        return 'SETUP';
      }

      // Step 9 (pre-verify): Phase 3 Tax Master Seed Defaults
      try {
        const activeFirmId = firmStore.getState().activeFirmId ?? allFirms[0].id;
        const taxCountCheck = expoDb.getFirstSync<{ count: number }>(
          'SELECT count(*) as count FROM tax_rates WHERE firm_id = ?',
          [activeFirmId]
        );
        if (taxCountCheck && taxCountCheck.count === 0) {
          await taxMasterService.seedDefaults(activeFirmId);
        }
      } catch (e) {
        console.warn('[Bootstrap] Tax Master seedDefaults check:', e);
      }

      // Step 9b: Phase 4 FY Close Hook Registration
      registerPhase4FYCloseHook();

      // Step 11 (pre-verify): G62 Post-Restore Logo Integrity Check (FIX-V72-4)
      const pendingLogoCheck = storage.getString('vjbilling_post_restore_logo_check_pending');
      let logosWereMissing = false;

      if (pendingLogoCheck === 'true') {
        const firmRows = db.select().from(firms).where(isNotNull(firms.firmLogoRef)).all();
        for (const firm of firmRows) {
          if (firm.firmLogoRef) {
            const info = await FileSystem.getInfoAsync(firm.firmLogoRef);
            if (!info.exists) {
              const deviceId = getSafeDeviceId();
              safeTransaction((tx) => {
                tx.update(firms).set({ firmLogoRef: null }).where(eq(firms.id, firm.id)).run();
                auditRepository.log(tx, {
                  firmId: firm.id,
                  eventType: 'FIRM_UPDATED',
                  deviceId,
                  payload: JSON.stringify({
                    changes: ['firmLogoRef'],
                    reason: 'LOGO_NOT_FOUND_ON_DEVICE',
                  }),
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
              safeTransaction((tx) => {
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
                  payload: JSON.stringify({
                    reason: 'FILE_NOT_FOUND_ON_DEVICE',
                    fileRef: logo.fileRef,
                  }),
                });
              });
              logosWereMissing = true;
            }
          }
        }

        storage.delete('vjbilling_post_restore_logo_check_pending');
      }

      // Step 9/10: Run Verify My Data with HMAC-verified 30-minute boot cache (FIX-VSEC-2)
      let verifyStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
      const cacheValid = await isHealthyVerifyCacheValid(previousBootWasInterrupted);

      if (cacheValid) {
        verifyStatus = 'HEALTHY';
      } else {
        const result = await verifyService.runVerify();
        verifyStatus = result.status;
        await writeVerifyCache(verifyStatus);
      }

      // Clean up emergency pre-migration snapshots upon successful bootstrap
      try {
        const snapshotInfo = await FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH);
        if (snapshotInfo.exists) {
          await FileSystem.deleteAsync(PRE_MIGRATION_SNAPSHOT_PATH, { idempotent: true });
        }
        if (STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY) {
          await FileSystem.deleteAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT_LEGACY, {
            idempotent: true,
          }).catch(() => {});
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

export async function bootstrapDatabase(): Promise<
  'DASHBOARD' | 'SETUP' | 'SAFE_MODE' | 'DATABASE_ERROR' | 'DASHBOARD_WARNING'
> {
  return bootstrapService.initApp();
}

export default bootstrapService; 