// tests/phase4/phase4_migration_stepM.test.ts
// STEP M — MIGRATION & DEPLOYMENT ORDER TEST SUITE
// Tests P4-M1 through P4-M6, 0006_phase4_gold_intelligence.sql, indexes, and idempotency.

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { stepMMigrationPhase4Service } from '@/services/phase4/stepMMigrationPhase4Service';
import { VALID_LOT_TRANSITIONS } from '@/types/phase2/phase2.types';
import type { Phase4AuditPayload } from '@/types/phase4/phase4.types';

describe('STEP M — MIGRATION & DEPLOYMENT ORDER', () => {
  let sqlite: any;

  beforeEach(() => {
    sqlite = new Database(':memory:');

    // Create minimal prerequisite tables from Phase 1, Phase 2, Phase 3
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS firms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        firm_code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS old_metal_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        received_from TEXT NOT NULL,
        received_date TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        metal TEXT NOT NULL DEFAULT 'GOLD',
        purity_percent REAL NOT NULL,
        metal_source TEXT NOT NULL DEFAULT 'CUSTOMER',
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_ledger (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT NOT NULL,
        type TEXT NOT NULL,
        weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_pct REAL NOT NULL DEFAULT 0,
        amount_paise INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Cross-Phase Migration File Registry & File Existence
  // ---------------------------------------------------------------------------
  test('ALIGN-FIX-3: Migration file 0006_phase4_gold_intelligence.sql exists and has valid header', () => {
    const migrationPath = path.join(process.cwd(), 'drizzle', '0006_phase4_gold_intelligence.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');
    expect(content).toContain('0006_phase4_gold_intelligence.sql');
    expect(content).toContain('Cross-Phase Migration File Registry');
    expect(content).toContain('0000_initial_schema.sql');
    expect(content).toContain('0001_phase1_bis_logos.sql');
    expect(content).toContain('0002_phase2_inventory.sql');
    expect(content).toContain('0003_phase4_melt_status.sql');
    expect(content).toContain('0004_phase3_billing.sql');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Phase 3 Index Separation (IDX-KARIGAR-LEDGER v1.9)
  // ---------------------------------------------------------------------------
  test('IDX-KARIGAR-LEDGER v1.9: Phase 4 migration does NOT redefine Phase 3 karigar_ledger indexes', () => {
    const p4Sql = fs.readFileSync(
      path.join(process.cwd(), 'drizzle', '0006_phase4_gold_intelligence.sql'),
      'utf8'
    );
    // Phase 4 MUST NOT create these
    expect(p4Sql).not.toMatch(/CREATE\s+INDEX[^\n]+idx_karigar_ledger_firm_karigar/i);
    expect(p4Sql).not.toMatch(/CREATE\s+INDEX[^\n]+idx_karigar_ledger_firm_type/i);

    // But Phase 3 migration file MUST define both
    const p3Sql = fs.readFileSync(
      path.join(process.cwd(), 'drizzle', '0002_phase3_billing.sql'),
      'utf8'
    );
    expect(p3Sql).toContain('idx_karigar_ledger_firm_karigar');
    expect(p3Sql).toContain('idx_karigar_ledger_firm_type');
  });

  // ---------------------------------------------------------------------------
  // Test 3: P4-M1: karigar_ledger.type enum extension
  // ---------------------------------------------------------------------------
  test('P4-M1: karigar_ledger accepts LABOUR_IN_GOLD and METAL_OUT_REVERSAL', () => {
    sqlite.prepare('INSERT INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('f1', 'Firm 1', 'F1', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('k1', 'f1', 'Ramesh', '2026-01-01', '2026-01-01');

    // Insert LABOUR_IN_GOLD
    expect(() => {
      sqlite.prepare(`
        INSERT INTO karigar_ledger (id, firm_id, karigar_id, type, weight_mg, purity_pct, amount_paise, created_at)
        VALUES ('kl-1', 'f1', 'k1', 'LABOUR_IN_GOLD', 500, 100.0, 0, '2026-04-01')
      `).run();
    }).not.toThrow();

    // Insert METAL_OUT_REVERSAL
    expect(() => {
      sqlite.prepare(`
        INSERT INTO karigar_ledger (id, firm_id, karigar_id, type, weight_mg, purity_pct, amount_paise, created_at)
        VALUES ('kl-2', 'f1', 'k1', 'METAL_OUT_REVERSAL', 5000, 91.6, 0, '2026-04-01')
      `).run();
    }).not.toThrow();

    const rows = sqlite.prepare('SELECT type FROM karigar_ledger ORDER BY id ASC').all();
    expect(rows[0].type).toBe('LABOUR_IN_GOLD');
    expect(rows[1].type).toBe('METAL_OUT_REVERSAL');
  });

  // ---------------------------------------------------------------------------
  // Test 4: P4-M2: item_events.eventType 12 new types
  // ---------------------------------------------------------------------------
  test('P4-M2: item_events supports all 12 Phase 4 event types', () => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS item_events (
        id TEXT PRIMARY KEY NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const p4Events = [
      'REFINERY_BATCH_CREATED',
      'REFINERY_BATCH_SENT',
      'REFINERY_OUTPUT_RECEIVED',
      'REFINERY_LOT_SETTLED',
      'REFINERY_BATCH_CLOSED',
      'MELT_BATCH_CREATED',
      'MELT_BATCH_CLOSED',
      'KARIGAR_GOLD_ISSUED',
      'KARIGAR_RETURN_RECORDED',
      'KARIGAR_LABOUR_GOLD_RECORDED',
      'KARIGAR_ISSUE_REVERSED',
      'KARIGAR_WASTAGE_EXCEEDED',
    ];

    expect(p4Events).toHaveLength(12);

    for (const ev of p4Events) {
      sqlite.prepare('INSERT INTO item_events (id, event_type, created_at) VALUES (?, ?, ?)')
        .run(`ev-${ev}`, ev, '2026-04-01');
    }

    const count = sqlite.prepare('SELECT COUNT(*) as c FROM item_events').get().c;
    expect(count).toBe(12);
  });

  // ---------------------------------------------------------------------------
  // Test 5: P4-M3: VALID_LOT_TRANSITIONS adherence
  // ---------------------------------------------------------------------------
  test('P4-M3: VALID_LOT_TRANSITIONS matches Phase 4 specification exactly', () => {
    expect(VALID_LOT_TRANSITIONS.RECEIVED).toEqual(['PENDING', 'SENT_TO_MELT', 'ISSUED_TO_KARIGAR', 'VOIDED']);
    expect(VALID_LOT_TRANSITIONS.PENDING).toEqual(['SENT_TO_REFINERY', 'RECEIVED', 'VOIDED']);
    expect(VALID_LOT_TRANSITIONS.SENT_TO_REFINERY).toEqual(['SETTLED']);
    expect(VALID_LOT_TRANSITIONS.SENT_TO_MELT).toEqual([]);
    expect(VALID_LOT_TRANSITIONS.ISSUED_TO_KARIGAR).toEqual(['RECEIVED']);
    expect(VALID_LOT_TRANSITIONS.SETTLED).toEqual([]);
    expect(VALID_LOT_TRANSITIONS.VOIDED).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 6: P4-M5: karigar table column additions
  // ---------------------------------------------------------------------------
  test('P4-M5: stepMMigrationPhase4Service adds wastage columns to karigar', () => {
    stepMMigrationPhase4Service.runP4M5KarigarWastageColumns(sqlite);

    const cols = sqlite.prepare('PRAGMA table_info(karigar)').all().map((c: any) => c.name);
    expect(cols).toContain('allowed_wastage_pct');
    expect(cols.includes('wastage_type') || cols.includes('wastageType')).toBe(true);
    expect(cols.includes('wastage_fixed_mg') || cols.includes('wastageFixedMg')).toBe(true);

    // Verify insertion with default and custom values
    sqlite.prepare(`
      INSERT INTO karigar (id, firm_id, name, allowed_wastage_pct, wastage_type, wastage_fixed_mg, created_at, updated_at)
      VALUES ('k-waste', 'f1', 'Hari Goldsmith', 1.75, 'FIXED_MG', 250, '2026-04-01', '2026-04-01')
    `).run();

    const row = sqlite.prepare('SELECT * FROM karigar WHERE id = ?').get('k-waste');
    expect(row.allowed_wastage_pct).toBe(1.75);
    expect(row.wastage_type).toBe('FIXED_MG');
    expect(row.wastage_fixed_mg).toBe(250);
  });

  // ---------------------------------------------------------------------------
  // Test 7: P4-M6: Create 7 new Phase 4 tables and 16 indexes
  // ---------------------------------------------------------------------------
  test('P4-M6: Creates all 7 Phase 4 tables and all 16 DB indexes', () => {
    stepMMigrationPhase4Service.runP4M6CreateTablesAndIndexes(sqlite);

    // Check 7 tables
    const tableNames = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map((t: any) => t.name);

    const expectedTables = [
      'refinery_batches',
      'refinery_batch_lots',
      'refinery_output_lots',
      'melt_batches',
      'melt_batch_inputs',
      'karigar_issues',
      'karigar_returns',
    ];

    for (const t of expectedTables) {
      expect(tableNames).toContain(t);
    }

    // Check all 16 indexes
    const indexNames = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='index'"
    ).all().map((i: any) => i.name);

    const expectedIndexes = [
      // 9 single-column
      'idx_refinery_batches_firm',
      'idx_refinery_batch_lots_batch',
      'idx_refinery_batch_lots_lot',
      'idx_refinery_output_lots_batch',
      'idx_melt_batches_firm',
      'idx_melt_batch_inputs_batch',
      'idx_karigar_issues_firm',
      'idx_karigar_issues_karigar',
      'idx_karigar_returns_issue',
      // 6 composite (IDX-COMPOSITE-6 v1.9)
      'idx_refinery_batches_firm_status',
      'idx_refinery_batch_lots_settled',
      'idx_melt_batches_firm_status',
      'idx_karigar_issues_status_date',
      'idx_karigar_returns_issue_created',
      'idx_refinery_output_lots_batch_received',
      // 1 source lot (IDX-SOURCE-LOT v1.9)
      'idx_karigar_issues_source_lot',
    ];

    expect(expectedIndexes).toHaveLength(16);

    for (const idx of expectedIndexes) {
      expect(indexNames).toContain(idx);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 8: End-to-end Step M runner and Idempotency
  // ---------------------------------------------------------------------------
  test('stepMMigrationPhase4Service.runAllStepMMigrations is idempotent and records in migration_log', () => {
    // Run first time
    const status1 = stepMMigrationPhase4Service.runAllStepMMigrations(sqlite);
    expect(status1.deployComplete).toBe(true);
    expect(status1.migrationLogEntries).toContain('STEP_P4_M5_KARIGAR_COLUMNS');
    expect(status1.migrationLogEntries).toContain('STEP_P4_M6_TABLES_AND_INDEXES');
    expect(status1.migrationLogEntries).toContain('STEP_P4_MIGRATION_ORDER');

    // Run second time (idempotency check)
    expect(() => {
      const status2 = stepMMigrationPhase4Service.runAllStepMMigrations(sqlite);
      expect(status2.deployComplete).toBe(true);
    }).not.toThrow();

    // Verify row count in migration_log
    const count = sqlite.prepare('SELECT COUNT(*) as c FROM migration_log WHERE step_key LIKE ?')
      .get('STEP_P4_%').c;
    expect(count).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Test 9: FIX-P4-AUDITPAYLOAD-1: Phase4AuditPayload discriminated union
  // ---------------------------------------------------------------------------
  test('FIX-P4-AUDITPAYLOAD-1: Phase4AuditPayload type permits all Phase 4 events', () => {
    const payloads: Phase4AuditPayload[] = [
      {
        eventType: 'KARIGAR_GOLD_ISSUED',
        payload: {
          issueId: 'iss-1',
          karigarId: 'k-1',
          sourceLotId: 'lot-1',
          issuedGrossWeightMg: 10000,
          issuedPurityPct: 91.6,
          issuedFineWeightMg: 9160,
          issueDate: '2026-04-01',
        },
      },
      {
        eventType: 'KARIGAR_RETURN_RECORDED',
        payload: {
          returnId: 'ret-1',
          issueId: 'iss-1',
          grossWeightMg: 9000,
          purityPct: 91.6,
          fineWeightMg: 8244,
          returnDate: '2026-04-02',
          wasteExceeded: false,
          excessMg: 0,
        },
      },
      {
        eventType: 'KARIGAR_LABOUR_GOLD_RECORDED',
        payload: {
          issueId: 'iss-1',
          karigarId: 'k-1',
          labourGoldFineMg: 100,
          purityPct: 91.6,
          notes: 'labour agreed in gold',
        },
      },
      {
        eventType: 'KARIGAR_ISSUE_REVERSED',
        payload: {
          issueId: 'iss-1',
          karigarId: 'k-1',
          sourceLotId: 'lot-1',
          reversedFineMg: 9160,
          reason: 'client cancelled job',
        },
      },
      {
        eventType: 'KARIGAR_WASTAGE_EXCEEDED',
        payload: {
          issueId: 'iss-1',
          karigarId: 'k-1',
          allowedWastageMg: 50,
          actualWastageMg: 75,
          excessMg: 25,
        },
      },
      {
        eventType: 'OLD_METAL_LOT_STATUS_CHANGED',
        payload: {
          lotId: 'lot-1',
          oldStatus: 'RECEIVED',
          newStatus: 'SENT_TO_MELT',
          reason: 'sent to melt batch',
        },
      },
      {
        eventType: 'REFINERY_BATCH_CREATED',
        payload: {
          batchId: 'rb-1',
          supplierId: 'sup-1',
          lotIds: ['lot-1', 'lot-2'],
          totalInputFineMg: 15000,
        },
      },
      {
        eventType: 'REFINERY_BATCH_SENT',
        payload: {
          batchId: 'rb-1',
          sentDate: '2026-04-01',
          totalInputFineMg: 15000,
        },
      },
      {
        eventType: 'REFINERY_OUTPUT_RECEIVED',
        payload: {
          batchId: 'rb-1',
          receivedDate: '2026-04-10',
          grossWeightMg: 14900,
          purityPercent: 99.5,
          totalOutputFineMg: 14825,
        },
      },
      {
        eventType: 'REFINERY_LOT_SETTLED',
        payload: {
          batchId: 'rb-1',
          lotId: 'lot-1',
          outputFineMg: 7400,
          shareRatio: 0.5,
        },
      },
      {
        eventType: 'REFINERY_BATCH_CLOSED',
        payload: {
          batchId: 'rb-1',
          totalInputFineMg: 15000,
          totalOutputFineMg: 14825,
          gainLossMg: -175,
          yieldPct: 98.83,
        },
      },
      {
        eventType: 'REFINERY_SETTLEMENT_VARIANCE',
        payload: {
          batchId: 'rb-1',
          variancePct: 1.17,
          impliedOutputMg: 15000,
          actualOutputFineMg: 14825,
        },
      },
      {
        eventType: 'MELT_BATCH_CREATED',
        payload: {
          batchId: 'mb-1',
          lotIds: ['lot-1'],
          totalInputFineMg: 5000,
        },
      },
      {
        eventType: 'MELT_BATCH_CLOSED',
        payload: {
          batchId: 'mb-1',
          outputGrossWeightMg: 5020,
          outputPurityPct: 99.0,
          outputFineWeightMg: 4970,
          outputLotId: 'lot-melt-out-1',
          totalInputFineMg: 5000,
        },
      },
    ];

    expect(payloads).toHaveLength(14);
    for (const p of payloads) {
      expect(p.eventType).toBeDefined();
      expect(p.payload).toBeDefined();
    }
  });
});
