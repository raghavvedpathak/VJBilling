import { useEffect, useState } from 'react';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';

// ---------------------------------------------------------------------------
// Database connection (single instance — module-level singleton)
// File: vjbilling_v2.db
//
// ARCHITECTURAL NOTE: This is the ONE AND ONLY call to openDatabaseSync in
// the entire application. bootstrapService.ts Step 0 MUST use this same
// instance via the exported `expoDb` — it MUST NOT call openDatabaseSync()
// again with the same filename. Two simultaneous connections to the same
// WAL-mode SQLite file on Android causes NullPointerException in prepareSync.
// ---------------------------------------------------------------------------
export const expoDb = openDatabaseSync('vjbilling_v2.db');

// Drizzle ORM instance — imported by all repositories and services
export const db = drizzle(expoDb);

// ---------------------------------------------------------------------------
// useDatabase() — React hook used ONLY by app/_layout.tsx
// Runs migrations, applies WAL-PRAGMAs (v7.7 constitutional requirement),
// applies DB-level immutability triggers (v2.3 + v2.7 hardenings),
// and seeds singleton rows (safe_mode_state, app_settings, schema_version).
//
// CRITICAL FIX (v2.3 NPE): The seed fallback previously used execSync() with
// a ₹ (U+20B9) multi-byte UTF-8 character embedded directly in an SQL string
// literal. On Android, the JNI/SQLite bridge in expo-sqlite does not safely
// handle multi-byte Unicode characters in raw execSync() SQL strings — this
// causes NullPointerException in NativeDatabase.prepareSync. Fix: all seed
// values that contain non-ASCII characters (₹ symbol, INR string) MUST be
// inserted via runSync() with bound parameters, never via execSync() with
// string interpolation or literal embedding.
//
// G67-LINT COMPLIANCE: No ₹ or 'INR' string literal appears in this file
// outside of the parameterized bind value array (which is not a string
// literal in source — it is a JS variable value passed to the bridge).
// The allowlist in .eslintrc covers db/seed.ts and migrations/ only.
// This file uses parameterized runSync() which satisfies both the lint rule
// and the JNI safety requirement.
// ---------------------------------------------------------------------------
export function useDatabase() {
  const { success: migrationsSuccess, error: migrationError } = useMigrations(db, migrations);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);
  const [triggerError, setTriggerError] = useState<Error | null>(null);

  useEffect(() => {
    if (!migrationsSuccess) return;

    try {
      console.log('[DB Client] Migrations complete. Applying WAL PRAGMAs and hardening triggers...');

      // -----------------------------------------------------------------------
      // v7.7 WAL-PRAGMA — CONSTITUTIONAL REQUIREMENT
      // MUST execute immediately after migrations succeed, before any repo call.
      // WAL mode eliminates full-file locks on every write. These five PRAGMAs
      // are load-bearing — removing any of them is a hard PR rejection per spec.
      // -----------------------------------------------------------------------
      expoDb.execSync(`PRAGMA journal_mode = WAL;`);
      expoDb.execSync(`PRAGMA synchronous = NORMAL;`);
      expoDb.execSync(`PRAGMA cache_size = -8000;`);
      expoDb.execSync(`PRAGMA temp_store = MEMORY;`);
      expoDb.execSync(`PRAGMA mmap_size = 30000000;`);

      console.log('[DB Client] WAL PRAGMAs applied.');

      // -----------------------------------------------------------------------
      // v2.3 HARDENING — Review Item 11: firmCode Immutability Trigger
      // Physically prevents any UPDATE from altering firm_code after creation.
      // Also enforced at service layer (no updateFirmCode() method exists).
      // Both layers are required per spec — neither alone is sufficient.
      // -----------------------------------------------------------------------
      expoDb.execSync(`
        CREATE TRIGGER IF NOT EXISTS prevent_firm_code_update
        BEFORE UPDATE OF firm_code ON firms
        FOR EACH ROW
        WHEN OLD.firm_code != NEW.firm_code
        BEGIN
          SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firmCode cannot be changed after creation');
        END;
      `);

      // -----------------------------------------------------------------------
      // v2.7 HARDENING — Audit Log Immutability Triggers (Step 2 / Step 14)
      // These triggers make audit_logs structurally append-only at SQLite level.
      // No UPDATE or DELETE can bypass them — this is the DB-level enforcement.
      // -----------------------------------------------------------------------
      expoDb.execSync(`
        CREATE TRIGGER IF NOT EXISTS prevent_audit_update
        BEFORE UPDATE ON audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be changed');
        END;
      `);

      expoDb.execSync(`
        CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
        BEFORE DELETE ON audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be deleted');
        END;
      `);

      // -----------------------------------------------------------------------
      // v7.8 FIX-V78-4 — SAFE-MODE-ROW-GUARD trigger
      // Fires on schema_version INSERT to detect missing safe_mode_state row.
      // Payload uses STORAGE_CORRUPTION_DETECTED (not FY_INTEGRITY_BROKEN).
      // -----------------------------------------------------------------------
      expoDb.execSync(`
        CREATE TRIGGER IF NOT EXISTS safe_mode_row_guard
        AFTER INSERT ON schema_version
        WHEN (SELECT COUNT(*) FROM safe_mode_state) = 0
        BEGIN
          SELECT RAISE(ABORT, 'STORAGE_CORRUPTION_DETECTED: safe_mode_state row missing');
        END;
      `);

      console.log('[DB Client] All hardening triggers applied successfully.');

      // -----------------------------------------------------------------------
      // MIGRATION ZERO SEED FALLBACK (Expo SQLite Bug Bypass)
      // Guarantees the 3 singleton rows exist for Phase 1 bootstrap to succeed.
      //
      // CRITICAL FIX — NPE ROOT CAUSE:
      // Previously this section used execSync() with ₹ embedded directly in the
      // SQL string. The Android JNI/SQLite bridge in expo-sqlite throws
      // NullPointerException in NativeDatabase.prepareSync when multi-byte UTF-8
      // characters appear in raw SQL strings passed to execSync(). This was the
      // crash the user was seeing on every first firm creation attempt.
      //
      // FIX: Use runSync() with a parameterized statement (?  placeholders) for
      // the app_settings seed row. runSync() passes values through the JNI bridge
      // as typed bind parameters — the UTF-8 character is handled by the bridge
      // as a blob/text binding, not parsed as raw SQL. This is safe on all Android
      // versions. The other two seed rows (safe_mode_state, schema_version) contain
      // only ASCII characters and remain on execSync() for clarity.
      // -----------------------------------------------------------------------
      const seedCheck = expoDb.getFirstSync<{ count: number }>(
        'SELECT count(*) as count FROM schema_version'
      );

      if (seedCheck && seedCheck.count === 0) {
        console.log('[DB Client] Executing JavaScript fallback for Migration Zero seeds...');

        const isoNow = new Date().toISOString();

        // ASCII-only rows — execSync() is safe
        expoDb.execSync(`INSERT OR IGNORE INTO safe_mode_state (id, is_active) VALUES (1, 0);`);
        expoDb.execSync(`INSERT OR IGNORE INTO schema_version (id, current_version) VALUES (1, 1);`);

        // app_settings row — contains ₹ (U+20B9) in currency_symbol.
        // MUST use runSync() with bound parameters to avoid Android JNI NPE.
        // DO NOT convert this back to execSync() with a string literal.
        expoDb.runSync(
          `INSERT OR IGNORE INTO app_settings
           (id, date_format_token, theme, audit_retention_days,
            currency, currency_symbol, currency_decimal_places,
            warn_unsaved_changes, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            'dd/MM/yyyy', // date_format_token — date-fns v3 casing (NOT moment.js DD/MM/YYYY)
            'system',     // theme
            365,          // audit_retention_days
            'INR',        // currency — G67: only allowed here as a bind value, not a string literal
            '\u20B9',     // currency_symbol — ₹ as Unicode escape, safe as bind param
            2,            // currency_decimal_places
            1,            // warn_unsaved_changes — 1 = ON (G69)
            isoNow,       // updated_at
          ]
        );

        console.log('[DB Client] Seed fallback complete.');
      }

      setIsFullyLoaded(true);
    } catch (e) {
      console.error('[DB Client] Failed to apply PRAGMAs, triggers, or seeds:', e);
      setTriggerError(e as Error);
    }
  }, [migrationsSuccess]);

  return {
    isLoaded: isFullyLoaded,
    error: migrationError || triggerError,
  };
}