// db/index.ts (v7.41 / FIX-V742-5) - the ONLY place the database is opened.
// NOTHING runs at module load except declarations. The database is opened by openDatabase(),
// which bootstrapDatabase() calls inside try/catch, so every failure is catchable and can render
// DatabaseErrorScreen (FIX-V741-1).
import * as SQLite from 'expo-sqlite';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { ERR } from '@/constants/errorCodes';
import { newDbKeyHex, readDbKeyHex, storeDbKeyHex } from './dbKey';

export type Db = ExpoSQLiteDatabase<typeof schema>;

let _sqlite: SQLite.SQLiteDatabase | null = null;
let _db: Db | null = null;
let _opening: Promise<Db> | null = null;

export function getSqlite(): SQLite.SQLiteDatabase {
  if (!_sqlite) throw new Error(ERR.DB_NOT_OPEN + ': openDatabase() has not completed');
  return _sqlite;
}

export function openDatabase(): Promise<Db> {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening; // concurrent callers share one attempt
  _opening = (async () => {
    const sqlite = SQLite.openDatabaseSync('vjbilling.db');
    try {
      // 1. Prove SQLCipher is linked (a plain SQLite build ignores PRAGMA key silently).
      const cv = sqlite.getFirstSync<{ cipher_version: string }>('PRAGMA cipher_version');
      if (!cv?.cipher_version) {
        throw new Error(
          ERR.SQLCIPHER_UNAVAILABLE +
            ': SQLCipher is not linked - check app.json useSQLCipher and rebuild'
        );
      }
      // 2. Key = first statement on the connection.
      const existing = await readDbKeyHex();
      const keyHex = existing ?? newDbKeyHex();
      sqlite.execSync('PRAGMA key = "x\'' + keyHex + '\'"');
      // 3. Verify the key opens the file. Never create a replacement key or delete the file here.
      try {
        sqlite.getFirstSync('SELECT count(*) AS n FROM sqlite_master');
      } catch (e) {
        throw new Error((existing ? ERR.DB_KEY_MISMATCH : ERR.DB_KEY_MISSING) + ': ' + String(e));
      }
      // 4. Persist a NEW key only after the verify passed.
      if (!existing) await storeDbKeyHex(keyHex);
      // 5. PRAGMAs (unchanged from v7.40), now after the key.
      sqlite.execSync('PRAGMA journal_mode = WAL');
      sqlite.execSync('PRAGMA foreign_keys = ON');
      sqlite.execSync('PRAGMA secure_delete = ON');
      sqlite.execSync('PRAGMA synchronous = NORMAL');
      sqlite.execSync('PRAGMA cache_size = -8000');
      sqlite.execSync('PRAGMA temp_store = MEMORY');
      sqlite.execSync('PRAGMA mmap_size = 30000000');
      const fk = sqlite.getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys');
      if (fk?.foreign_keys !== 1) {
        throw new Error(ERR.MIGRATION_FAILED + ': PRAGMA foreign_keys did not stick');
      }
      _sqlite = sqlite;
      _db = drizzle(sqlite, { schema });
      return _db;
    } catch (e) {
      try {
        sqlite.closeSync();
      } catch {
        /* ignore */
      }
      throw e;
    }
  })().finally(() => {
    _opening = null;
  });
  return _opening;
}

// Used by factory reset (FIX-V741-2) and by Detox helpers that re-run bootstrap.
export function closeDatabase(): void {
  try {
    _sqlite?.closeSync();
  } catch {
    /* ignore */
  }
  _sqlite = null;
  _db = null;
}

// Default export stays a drop-in for every existing `import db from '@/db'`.
// It is a lazy proxy: importing it does nothing; USING it before openDatabase() throws DB_NOT_OPEN.
export const db = new Proxy({} as Db, {
  get(_t, prop) {
    if (!_db) {
      throw new Error(
        ERR.DB_NOT_OPEN + ': db used before openDatabase() completed (property ' + String(prop) + ')'
      );
    }
    const v = (_db as any)[prop];
    return typeof v === 'function' ? v.bind(_db) : v;
  },
});

export default db;

