import { useEffect, useState } from 'react';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { STORAGE_PATHS } from '../constants';

// ---------------------------------------------------------------------------
// Database connection (single instance — module-level singleton)
// ---------------------------------------------------------------------------
export const expoDb = openDatabaseSync(STORAGE_PATHS.DB_FILENAME);

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

        // Self-healing schema check for designs.low_stock_threshold (Phase 2 preserved)
        try {
          const designCols = expoDb.getAllSync<{ name: string }>('PRAGMA table_info(designs)');
          if (designCols.length > 0 && !designCols.some(c => c.name === 'low_stock_threshold')) {
            console.log('[DB Client] Self-healing: Adding low_stock_threshold column to designs table...');
            expoDb.execSync('ALTER TABLE designs ADD COLUMN low_stock_threshold INTEGER;');
          }
        } catch (e) {
          console.warn('[DB Client] Self-healing designs.low_stock_threshold check:', e);
        }

        // -----------------------------------------------------------------------
        // MIGRATION ZERO SEED FALLBACK (NPE Safe & Complete)
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
          expoDb.execSync(`INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0);`);

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
              30,
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

export default db;