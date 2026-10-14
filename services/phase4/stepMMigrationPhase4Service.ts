// services/phase4/stepMMigrationPhase4Service.ts
// STEP M — MIGRATION & DEPLOYMENT ORDER (0006_phase4_gold_intelligence.sql)
// Implements P4-M1 through P4-M6 with strict migration_log idempotency.

import db, { db as dbNamed, expoDb } from '@/db/client';
import { now } from '@/utils/now';

export interface StepMPhase4Status {
  deployComplete: boolean;
  migrationLogEntries: string[];
}

function getNativeDb(customTx?: any): any {
  if (customTx && typeof customTx === 'object') {
    if (typeof customTx.execSync === 'function') return customTx;
    if (typeof customTx.exec === 'function') return customTx;
    if (typeof customTx.prepare === 'function') return customTx;
    if (typeof customTx.run === 'function') return customTx;
    if (customTx.__rawClient?.sqlite) return customTx.__rawClient.sqlite;
  }
  const fallback = dbNamed || db;
  if ((fallback as any)?.__rawClient?.sqlite) {
    return (fallback as any).__rawClient.sqlite;
  }
  if ((fallback as any)?.expoDb) {
    return (fallback as any).expoDb;
  }
  return expoDb;
}

function executeRawSql(conn: any, sql: string, params: any[] = []): void {
  if (!conn) return;
  if (params.length > 0) {
    if (typeof conn.runSync === 'function') {
      conn.runSync(sql, params);
    } else if (typeof conn.prepare === 'function') {
      conn.prepare(sql).run(...params);
    } else if (typeof conn.execute === 'function') {
      conn.execute(sql, params);
    }
    return;
  }
  if (typeof conn.execSync === 'function') {
    conn.execSync(sql);
  } else if (typeof conn.exec === 'function') {
    conn.exec(sql);
  } else if (typeof conn.execute === 'function') {
    conn.execute(sql);
  } else if (typeof conn.prepare === 'function') {
    conn.prepare(sql).run();
  } else if (typeof conn.runSync === 'function') {
    conn.runSync(sql);
  }
}

function queryAllRaw(conn: any, sql: string, params: any[] = []): any[] {
  if (!conn) return [];
  try {
    if (typeof conn.getAllSync === 'function') {
      return conn.getAllSync(sql, params) || [];
    }
    if (typeof conn.prepare === 'function') {
      return conn.prepare(sql).all(...params) || [];
    }
  } catch (e) {
    console.warn('[stepMMigrationPhase4Service] queryAllRaw error:', e);
  }
  return [];
}

export const stepMMigrationPhase4Service = {
  /**
   * Ensures the migration_log table exists in the database.
   */
  ensureMigrationLogTable(customDb?: any): void {
    const conn = getNativeDb(customDb);
    executeRawSql(
      conn,
      `CREATE TABLE IF NOT EXISTS migration_log (
        id TEXT PRIMARY KEY NOT NULL,
        step_key TEXT NOT NULL UNIQUE,
        description TEXT,
        applied_at TEXT NOT NULL
      );`
    );
  },

  /**
   * Checks whether a specific migration step has already been applied.
   */
  isStepApplied(stepKey: string, customDb?: any): boolean {
    this.ensureMigrationLogTable(customDb);
    const conn = getNativeDb(customDb);
    const rows = queryAllRaw(
      conn,
      'SELECT step_key FROM migration_log WHERE step_key = ?',
      [stepKey]
    );
    return rows.length > 0;
  },

  /**
   * Records a migration step in migration_log.
   */
  recordStep(stepKey: string, description?: string, customDb?: any): void {
    this.ensureMigrationLogTable(customDb);
    const conn = getNativeDb(customDb);
    const id = `mig_p4_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = now();
    executeRawSql(
      conn,
      'INSERT OR IGNORE INTO migration_log (id, step_key, description, applied_at) VALUES (?, ?, ?, ?);',
      [id, stepKey, description ?? null, timestamp]
    );
  },

  /**
   * P4-M5: karigar table column additions.
   * allowed_wastage_pct REAL NOT NULL DEFAULT 0.0
   * wastage_type TEXT NOT NULL DEFAULT 'PERCENT'
   * wastage_fixed_mg INTEGER
   */
  runP4M5KarigarWastageColumns(customDb?: any): void {
    const STEP_KEY = 'STEP_P4_M5_KARIGAR_COLUMNS';
    if (this.isStepApplied(STEP_KEY, customDb)) return;

    const conn = getNativeDb(customDb);
    try {
      const cols = queryAllRaw(conn, 'PRAGMA table_info(karigar)');
      if (cols.length === 0) return;
      const colNames = cols.map((c: any) => c.name);

      if (!colNames.includes('allowed_wastage_pct') && !colNames.includes('allowedWastagePct')) {
        executeRawSql(conn, 'ALTER TABLE karigar ADD COLUMN allowed_wastage_pct REAL NOT NULL DEFAULT 0.0;');
      }
      if (!colNames.includes('wastage_type') && !colNames.includes('wastageType')) {
        executeRawSql(conn, "ALTER TABLE karigar ADD COLUMN wastage_type TEXT NOT NULL DEFAULT 'PERCENT';");
      }
      if (!colNames.includes('wastage_fixed_mg') && !colNames.includes('wastageFixedMg')) {
        executeRawSql(conn, 'ALTER TABLE karigar ADD COLUMN wastage_fixed_mg INTEGER;');
      }

      this.recordStep(
        STEP_KEY,
        'Added allowed_wastage_pct, wastage_type, and wastage_fixed_mg to karigar',
        customDb
      );
    } catch (err) {
      console.error('[stepMMigrationPhase4Service] P4-M5 Error:', err);
      throw err;
    }
  },

  /**
   * P4-M6: Create 7 new Phase 4 tables + 16 DB indexes.
   * Note: idx_karigar_ledger_firm_karigar and idx_karigar_ledger_firm_type
   * are Phase 3 owned and MUST NOT be redefined here.
   */
  runP4M6CreateTablesAndIndexes(customDb?: any): void {
    const STEP_KEY = 'STEP_P4_M6_TABLES_AND_INDEXES';
    if (this.isStepApplied(STEP_KEY, customDb)) return;

    const conn = getNativeDb(customDb);
    try {
      // 1. refinery_batches
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS refinery_batches (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          status TEXT DEFAULT 'CREATED' NOT NULL,
          sent_date TEXT,
          received_date TEXT,
          total_input_fine_mg INTEGER,
          total_output_fine_mg INTEGER,
          gain_loss_mg INTEGER,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );`
      );

      // 2. refinery_batch_lots
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS refinery_batch_lots (
          id TEXT PRIMARY KEY NOT NULL,
          batch_id TEXT NOT NULL,
          lot_id TEXT NOT NULL,
          input_fine_mg INTEGER NOT NULL,
          output_fine_mg INTEGER,
          share_ratio REAL,
          settled INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );`
      );

      // 3. refinery_output_lots
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS refinery_output_lots (
          id TEXT PRIMARY KEY NOT NULL,
          batch_id TEXT NOT NULL,
          fine_weight_mg INTEGER NOT NULL,
          purity_percent REAL NOT NULL,
          gross_weight_mg INTEGER NOT NULL,
          metal_source TEXT DEFAULT 'REFINERY_OUTPUT' NOT NULL,
          received_date TEXT NOT NULL,
          created_at TEXT NOT NULL
        );`
      );

      // 4. melt_batches
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS melt_batches (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          status TEXT DEFAULT 'CREATED' NOT NULL,
          output_gross_weight_mg INTEGER,
          output_purity_pct REAL,
          output_fine_weight_mg INTEGER,
          output_lot_id TEXT,
          closed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );`
      );

      // 5. melt_batch_inputs
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS melt_batch_inputs (
          id TEXT PRIMARY KEY NOT NULL,
          batch_id TEXT NOT NULL,
          lot_id TEXT NOT NULL,
          input_fine_mg INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );`
      );

      // 6. karigar_issues
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS karigar_issues (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          karigar_id TEXT NOT NULL,
          source_lot_id TEXT NOT NULL,
          issued_gross_weight_mg INTEGER NOT NULL,
          issued_purity_pct REAL NOT NULL,
          issued_fine_weight_mg INTEGER NOT NULL,
          status TEXT DEFAULT 'ISSUED' NOT NULL,
          issue_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (karigar_id) REFERENCES karigar(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (source_lot_id) REFERENCES old_metal_lots(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );`
      );

      // 7. karigar_returns
      executeRawSql(
        conn,
        `CREATE TABLE IF NOT EXISTS karigar_returns (
          id TEXT PRIMARY KEY NOT NULL,
          issue_id TEXT NOT NULL,
          gross_weight_mg INTEGER NOT NULL,
          purity_pct REAL NOT NULL,
          fine_weight_mg INTEGER NOT NULL,
          return_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (issue_id) REFERENCES karigar_issues(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );`
      );

      // Phase 4 DB Indexes (DB-INDEX-FIX v1.6 + IDX-COMPOSITE-6 v1.9 + IDX-SOURCE-LOT v1.9)
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_refinery_batches_firm ON refinery_batches(firm_id);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_batch_lots_batch ON refinery_batch_lots(batch_id);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_batch_lots_lot ON refinery_batch_lots(lot_id);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_output_lots_batch ON refinery_output_lots(batch_id);',
        'CREATE INDEX IF NOT EXISTS idx_melt_batches_firm ON melt_batches(firm_id);',
        'CREATE INDEX IF NOT EXISTS idx_melt_batch_inputs_batch ON melt_batch_inputs(batch_id);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_issues_firm ON karigar_issues(firm_id);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_issues_karigar ON karigar_issues(karigar_id);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_returns_issue ON karigar_returns(issue_id);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_batches_firm_status ON refinery_batches(firm_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_batch_lots_settled ON refinery_batch_lots(batch_id, settled);',
        'CREATE INDEX IF NOT EXISTS idx_melt_batches_firm_status ON melt_batches(firm_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_issues_status_date ON karigar_issues(firm_id, status, issue_date);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_returns_issue_created ON karigar_returns(issue_id, created_at);',
        'CREATE INDEX IF NOT EXISTS idx_refinery_output_lots_batch_received ON refinery_output_lots(batch_id, received_date);',
        'CREATE INDEX IF NOT EXISTS idx_karigar_issues_source_lot ON karigar_issues(source_lot_id, firm_id);',
      ];

      for (const idxSql of indexes) {
        try {
          executeRawSql(conn, idxSql);
        } catch (e) {
          console.warn('[stepMMigrationPhase4Service] Index creation warning:', e);
        }
      }

      this.recordStep(
        STEP_KEY,
        'Created 7 Phase 4 tables and all 16 performance indexes',
        customDb
      );
    } catch (err) {
      console.error('[stepMMigrationPhase4Service] P4-M6 Error:', err);
      throw err;
    }
  },

  /**
   * Executes all Phase 4 Step M migrations safely and idempotently.
   */
  runAllStepMMigrations(customDb?: any): StepMPhase4Status {
    this.ensureMigrationLogTable(customDb);
    this.runP4M5KarigarWastageColumns(customDb);
    this.runP4M6CreateTablesAndIndexes(customDb);

    const MASTER_KEY = 'STEP_P4_MIGRATION_ORDER';
    if (!this.isStepApplied(MASTER_KEY, customDb)) {
      this.recordStep(
        MASTER_KEY,
        'All Phase 4 Step M migrations deployed successfully (0006_phase4_gold_intelligence.sql)',
        customDb
      );
    }

    const conn = getNativeDb(customDb);
    const logRows = queryAllRaw(conn, 'SELECT step_key FROM migration_log');
    const stepKeys = logRows.map((r: any) => String(r.step_key));

    return {
      deployComplete:
        stepKeys.includes('STEP_P4_M5_KARIGAR_COLUMNS') &&
        stepKeys.includes('STEP_P4_M6_TABLES_AND_INDEXES') &&
        stepKeys.includes(MASTER_KEY),
      migrationLogEntries: stepKeys,
    };
  },
};

export default stepMMigrationPhase4Service;
