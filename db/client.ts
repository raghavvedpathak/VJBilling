// db/client.ts
import { useEffect, useState } from 'react';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';

// ---------------------------------------------------------------------------
// Database connection (single instance — module-level singleton)
// ---------------------------------------------------------------------------
export const expoDb = openDatabaseSync('vjbilling_v2.db');

// CRITICAL FIX 1: Apply WAL PRAGMAs IMMEDIATELY upon opening the connection,
// synchronously, BEFORE Drizzle is initialized and BEFORE any pre-migration
// snapshots attempt to read the database. This prevents SQLite locking.
expoDb.execSync(`PRAGMA journal_mode = WAL;`);
expoDb.execSync(`PRAGMA synchronous = NORMAL;`);
expoDb.execSync(`PRAGMA cache_size = -8000;`);
expoDb.execSync(`PRAGMA temp_store = MEMORY;`);
expoDb.execSync(`PRAGMA mmap_size = 30000000;`);
console.log('[DB Client] SQLite WAL PRAGMAs applied synchronously.');

export const db = drizzle(expoDb);

// CRITICAL FIX 2: Module-level initialization tracker to defeat Strict Mode
// A useRef dies if the component unmounts. A global variable survives forever.
let isDbInitialized = false;
let initPromise: Promise<void> | null = null;

export function useDatabase() {
  const [isLoaded, setIsLoaded] = useState(isDbInitialized);
  const [triggerError, setTriggerError] = useState<Error | null>(null);

  useEffect(() => {
    // If already initialized by a previous mount, exit immediately.
    if (isDbInitialized) return;

    // Only spin up the setup process if it hasn't been started yet.
    if (!initPromise) {
      initPromise = (async () => {
        console.log('[DB Client] Starting safe manual migrations...');
        
        // 1. Execute migrations sequentially
        await migrate(db, migrations);
        console.log('[DB Client] Migrations complete.');

        // -----------------------------------------------------------------------
        // HARDENING TRIGGERS
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

        expoDb.execSync(`
          CREATE TRIGGER IF NOT EXISTS safe_mode_row_guard
          AFTER INSERT ON schema_version
          WHEN (SELECT COUNT(*) FROM safe_mode_state) = 0
          BEGIN
            SELECT RAISE(ABORT, 'STORAGE_CORRUPTION_DETECTED: safe_mode_state row missing');
          END;
        `);

        // PHASE 2 RED-LINE: Phantom Reconciliations are permanent
        expoDb.execSync(`
          CREATE TRIGGER IF NOT EXISTS prevent_phantom_stock_id_update
          BEFORE UPDATE OF phantom_stock_id ON items
          FOR EACH ROW
          WHEN OLD.phantom_stock_id IS NOT NULL AND OLD.phantom_stock_id != NEW.phantom_stock_id
          BEGIN
            SELECT RAISE(ABORT, 'PHANTOM_STOCK_IMMUTABLE: phantom_stock_id cannot be changed once reconciled');
          END;
        `);

        console.log('[DB Client] All hardening triggers applied successfully.');

        // -----------------------------------------------------------------------
        // MIGRATION ZERO SEED FALLBACK (NPE Safe)
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

          // app_settings row — parameterized runSync() for ₹ symbol to prevent JNI crash
          expoDb.runSync(
            `INSERT OR IGNORE INTO app_settings
             (id, date_format_token, theme, audit_retention_days,
              currency, currency_symbol, currency_decimal_places,
              warn_unsaved_changes, updated_at)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              'dd/MM/yyyy',
              'system',
              365,
              'INR',
              '\u20B9',
              2,
              1,
              isoNow,
            ]
          );

          console.log('[DB Client] Seed fallback complete.');
        }
      })();
    }

    // Wait for the global promise to resolve, then update React state
    initPromise
      .then(() => {
        isDbInitialized = true;
        setIsLoaded(true);
      })
      .catch((e) => {
        console.error('[DB Client] Failed to apply migrations or PRAGMAs:', e);
        setTriggerError(e as Error);
      });
      
  }, []);

  return {
    isLoaded,
    error: triggerError,
  };
}