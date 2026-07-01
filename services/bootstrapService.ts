// services/bootstrapService.ts
// Phase 1 Master Bootstrap Sequence — Steps 0–12
// v2.3 HARDENING: Pre-Migration Snapshot (Step 0)
// v2.4 G10: Purge ALL leases on restart (no WHERE clause — session-scoped)
// v2.7: Deferred audit for snapshot failure
// v2.8 G42: bootstrapComplete flag (MANDATORY — see Step 10 spec)
// v7.7 WAL-PRAGMA: Applied in db/client.ts useDatabase() — NOT duplicated here
// v7.7 VERIFY-BOOT-CACHE: Cache logic is internal to verifyService.runVerify()
// v7.8 FIX-V78-4: SAFE-MODE-ROW-GUARD uses STORAGE_CORRUPTION_DETECTED (not FY_INTEGRITY_BROKEN)
// v7.2 FIX-V72-4 / G62: Post-restore logo integrity check via MMKV flag
//
// CRITICAL FIX (dual-connection NPE): Step 0 previously called openDatabaseSync()
// directly to perform the pre-migration table check. This created a second
// simultaneous connection to the same WAL-mode SQLite file. On Android, two
// concurrent connections to a WAL-mode DB via expo-sqlite's JNI bridge can
// cause NullPointerException in NativeDatabase.prepareSync. Fix: Step 0 now
// uses the exported `expoDb` instance from db/client.ts (the singleton connection)
// instead of opening its own connection. This is safe because takePreMigrationSnapshot()
// runs synchronously in RootLayout BEFORE AppMigratorAndRunner mounts, so the
// Drizzle layer is not yet running transactions — raw sync reads are safe here.

import { safeModeService, bootstrapComplete } from './safeModeService';
import { getDeviceId, getOrGenerateDeviceId, auditDeviceIdIfNew } from '../utils/deviceId';
import { verifyService } from './verifyService';
import { useSafeModeStore } from '../store/safeModeStore';
import { db, expoDb } from '../db/client'; // FIX: import expoDb singleton — do NOT call openDatabaseSync() again
import { firms, writerLeases, bisLogos, safeModeState, schemaVersion } from '../db/schema';
import { auditRepository } from '../repositories/auditRepository';
import * as FileSystem from 'expo-file-system/legacy';
import { STORAGE_PATHS } from '../constants/storagePaths';
import { storage } from '../utils/storage';
import { eq, isNotNull } from 'drizzle-orm';
import { SafeModeTrigger } from '../store/safeModeStore';
import { differenceInDays, parseISO } from 'date-fns';
import { purgeExpiredAuditLogs } from './auditRetentionService';
// FIX: Import the strictly compliant store name
import { appSettingsStore } from '../store/appSettingsStore';

// In-memory flag: defers audit for Step 0 failure until DB is ready (v2.7)
let premigrationSnapshotFailed = false;

export const bootstrapService = {

  // ==========================================================================
  // STEP 0: PRE-MIGRATION SNAPSHOT (v2.3 HARDENING)
  // MUST run BEFORE migrations. DO NOT call auditRepository here.
  // Failure is non-blocking — logs console.warn only (Review Item 10 RULE 2).
  //
  // CRITICAL FIX: This method now uses the exported `expoDb` singleton from
  // db/client.ts instead of calling openDatabaseSync() locally. Opening a second
  // connection to 'vjbilling_v2.db' caused a NullPointerException in
  // NativeDatabase.prepareSync on Android when the WAL-mode file was already
  // held open. The singleton pattern is the spec-compliant approach — there is
  // exactly ONE database connection in the entire application lifetime.
  //
  // SAFETY: At the time takePreMigrationSnapshot() runs (_layout.tsx Step 0,
  // before AppMigratorAndRunner mounts), the useMigrations() hook has NOT yet
  // fired, so no Drizzle transactions are in flight. Raw synchronous reads via
  // expoDb.getFirstSync() and expoDb.getAllSync() are safe here.
  // ==========================================================================
  async takePreMigrationSnapshot(): Promise<void> {
    console.log('[Bootstrap] Step 0: Executing Pre-Migration Snapshot...');
    try {
      if (!STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT) {
        throw new Error('No writable file system available for snapshot.');
      }

      const dbFilePath = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      const dbInfo = await FileSystem.getInfoAsync(dbFilePath);

      if (!dbInfo.exists) {
        console.log('[Bootstrap] Clean install detected (No DB file). Skipping snapshot.');
        return;
      }

      // FIX: Use the exported singleton expoDb — do NOT open a second connection.
      // Previously: const expoDb = openDatabaseSync(STORAGE_PATHS.DB_FILENAME);
      // That second connection to the same WAL file was the dual-connection NPE source.
      const tableCheck = expoDb.getFirstSync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='firms'`
      );

      if (!tableCheck || tableCheck.count === 0) {
        console.log('[Bootstrap] Clean install detected (No tables). Skipping snapshot.');
        return;
      }

      const snapshot = {
        timestamp: new Date().toISOString(),
        version: 'v2.3_PRE_MIGRATION',
        firms: expoDb.getAllSync('SELECT * FROM firms'),
        financial_years: expoDb.getAllSync('SELECT * FROM financial_years'),
        audit_logs: expoDb.getAllSync('SELECT * FROM audit_logs'),
      };

      await FileSystem.writeAsStringAsync(
        STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT,
        JSON.stringify(snapshot)
      );
      console.log('[Bootstrap] Pre-Migration Snapshot secured at:', STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Bootstrap] SNAPSHOT FAILED (Non-blocking):', msg);
      premigrationSnapshotFailed = true;
    }
  },

  // ==========================================================================
  // MASTER INIT SEQUENCE — Steps 1–12
  // MANDATORY COMMENT: Steps 0–4 must NOT call any service method that invokes
  // assertNotInSafeMode(). Zustand is not yet loaded at this point.
  // NOTE: WAL PRAGMAs are applied in db/client.ts useDatabase() after migrations.
  //       They are NOT duplicated here.
  // ==========================================================================
  async initApp(): Promise<'DASHBOARD' | 'SETUP' | 'SAFE_MODE' | 'DATABASE_ERROR' | 'DASHBOARD_WARNING'> {
    console.log('[Bootstrap] Starting Phase 1 Sequence...');

    try {
      // Step 1: App opens → DB client runs migrations automatically via useDatabase() hook.
      // Step 2: WAL PRAGMAs already applied in db/client.ts useDatabase() — do not repeat here.

      // Step 3: v2.4 G10 — Purge ALL leases on restart (session-scoped, no WHERE clause)
      await db.transaction(async (tx) => {
        await tx.delete(writerLeases);
      });

      // Step 4: HARDENING 5 — Initialize device identity if missing (persists to MMKV, no DB touch).
      await getOrGenerateDeviceId();

      // -----------------------------------------------------------------------
      // Step 5: HARDENING 2 — Load Safe Mode state from DB.
      // bootstrapComplete.value is still false here. Do NOT set it yet.
      //
      // v7.7 SAFE-MODE-ROW-GUARD (v7.8 FIX-V78-4 corrected):
      // If safe_mode_state rows.length === 0 AND schema_version row exists
      // → storage corruption → activate STORAGE_CORRUPTION_DETECTED.
      // FY_INTEGRITY_BROKEN is reserved exclusively for firms with no active FY.
      // -----------------------------------------------------------------------
      // v7.14 FIX-V714-4: crash flag named vjbilling_boot_was_interrupted
      await storage.setItem('vjbilling_boot_was_interrupted', 'true');
      
      const safeModeRows = await db.select().from(safeModeState).limit(1);

      if (safeModeRows.length === 0) {
        const svRows = await db.select().from(schemaVersion).limit(1);
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
          await storage.setItem('vjbilling_boot_was_interrupted', 'false');
          return 'SAFE_MODE';
        } else {
          console.log(
            '[Bootstrap] Step 5: safe_mode_state absent + schema_version absent — ' +
            'pre-migration first boot. Proceeding.'
          );
        }
      } else {
        await safeModeService.loadState();
      }

      // Step 6: Load other Zustand stores from MMKV (auto-hydrated by persist middleware)

      // Step 7: Device ID Phase B — write DEVICE_ID_GENERATED audit event if not yet logged
      await auditDeviceIdIfNew();

      // v2.7 Fix: Deferred audit for Step 0 snapshot failure
      if (premigrationSnapshotFailed) {
        try {
          const deviceId = await getDeviceId();
          await db.transaction(async (tx) => {
            await auditRepository.create(
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

      // Step 7b: Set bootstrapComplete.value = true.
      // After this point, assertNotInSafeMode() will check the Zustand store
      // (which is now loaded from DB) instead of throwing BOOTSTRAP_INCOMPLETE.
      bootstrapComplete.value = true;
      await storage.setItem('vjbilling_boot_was_interrupted', 'false');

      // v7.10 AUDIT-RETENTION-MONTHLY: Bootstrap integration (fire-and-forget)
      // FIX: Use the compliant store name
      const last = appSettingsStore.getState().auditRetentionLastRunAt;
      if (!last || differenceInDays(new Date(), parseISO(last)) >= 30) {
        purgeExpiredAuditLogs().catch(console.error);
      }

      // If Safe Mode was already active from Step 5, route to Safe Mode UI
      if (useSafeModeStore.getState().isActive) {
        console.log('[Bootstrap] Safe Mode Detected from Persistence.');
        return 'SAFE_MODE';
      }

      // Step 8: Check if any firm exists
      const existingFirms = await db.select({ id: firms.id }).from(firms).limit(1);

      if (existingFirms.length === 0) {
        return 'SETUP';
      }

      // -----------------------------------------------------------------------
      // Step 9 (pre-verify): G62 Post-Restore Logo Integrity Check
      // Runs ONLY when vjbilling_post_restore_logo_check_pending MMKV flag is set.
      // Flag is SET by restoreService.restore() before Updates.reloadAsync().
      // Flag is CLEARED here after check completes (this is the CLEAR gate).
      // Normal boot: flag absent → skip this entire block entirely.
      // -----------------------------------------------------------------------
      const pendingLogoCheck = await storage.getItem('vjbilling_post_restore_logo_check_pending');
      let logosWereMissing = false;

      if (pendingLogoCheck === 'true') {
        console.log('[Bootstrap] Step 9: Running G62 Post-Restore Logo Integrity Check...');

        // Firm logos
        const firmRows = await db.select().from(firms).where(isNotNull(firms.firmLogoRef));
        for (const firm of firmRows) {
          if (firm.firmLogoRef) {
            const info = await FileSystem.getInfoAsync(firm.firmLogoRef);
            if (!info.exists) {
              const deviceId = await getDeviceId();
              await db.transaction(async (tx) => {
                await tx.update(firms).set({ firmLogoRef: null }).where(eq(firms.id, firm.id));
                await auditRepository.create(
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

        // BIS logos
        const bisRows = await db.select().from(bisLogos).where(eq(bisLogos.isArchived, 0));
        for (const logo of bisRows) {
          if (logo.fileRef) {
            const info = await FileSystem.getInfoAsync(logo.fileRef);
            if (!info.exists) {
              const deviceId = await getDeviceId();
              await db.transaction(async (tx) => {
                await tx
                  .update(bisLogos)
                  .set({
                    isArchived: 1,
                    archivedAt: new Date().toISOString(),
                    archivedReason: 'FILE_NOT_FOUND_ON_DEVICE',
                  })
                  .where(eq(bisLogos.id, logo.id));
                await auditRepository.create(
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

        // CLEAR the flag after check completes (G62 CLEAR gate)
        await storage.removeItem('vjbilling_post_restore_logo_check_pending');
        console.log('[Bootstrap] G62 complete. Logos missing:', logosWereMissing);
      }

      // -----------------------------------------------------------------------
      // Step 9: Run Verify My Data (silent).
      // v7.7 VERIFY-BOOT-CACHE: Cache logic is internal to verifyService.
      // If last verify was HEALTHY within 30 min, runVerify() returns cached
      // result without running the 9-query scan.
      // -----------------------------------------------------------------------
      const { status: verifyStatus } = await verifyService.runVerify();

      try {
        await FileSystem.deleteAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT, { idempotent: true });
        console.log('[Bootstrap] Cleaned up stale pre-migration snapshot.');
      } catch (cleanupError) {
        console.warn('[Bootstrap] Failed to clean up snapshot (non-fatal):', cleanupError);
      }

      // Step 10: CRITICAL → Safe Mode
      if (verifyStatus === 'CRITICAL') {
        console.log('[Bootstrap] Critical Integrity Issue Found. Safe Mode Triggered.');
        return 'SAFE_MODE';
      }

      // Step 11: WARNING or missing logos → Dashboard + persistent amber banner
      if (verifyStatus === 'WARNING' || logosWereMissing) {
        console.log('[Bootstrap] Warning or Missing Logos. Proceeding with warning flag.');
        return 'DASHBOARD_WARNING';
      }

      // Step 12: HEALTHY → Dashboard normally
      return 'DASHBOARD';

    } catch (e) {
      console.error('[Bootstrap] Critical Failure:', e);
      return 'DATABASE_ERROR';
    }
  },
};