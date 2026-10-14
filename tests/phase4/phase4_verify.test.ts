// tests/phase4/phase4_verify.test.ts
// Test suite for Phase 4: Verify-My-Data (Step 12)
// Checks:
// - Check 1: OldMetalLot SENT_TO_REFINERY but not linked to open batch (CRITICAL)
// - Check 2: OldMetalLot with metalSource=MELT_OUTPUT in refinery (CRITICAL — P3-FIX-1)
// - Check 3: OldMetalLot SENT_TO_MELT in CLOSED meltBatch with no output lot (CRITICAL)
// - Check 4: OldMetalLot SENT_TO_MELT and meltBatch OPEN (HEALTHY — P3-FIX-1 non-orphan)
// - Check 5: Refinery batch SENT but no RECEIVED after 30 days (WARNING)
// - Check 6: Refinery batch RECEIVED but not CLOSED (WARNING)
// - Check 7: Karigar issue ISSUED but no return after 30 days (WARNING — REVIEW-4)
// - Check 8: Karigar metal balance negative (CRITICAL — impossibility)
// - Check 9: Melt batch CREATED but not CLOSED after 7 days (WARNING)
// - Check 10: Fine balance negative (CRITICAL)
// - Check 11: Refinery batch lot shares sum differs by > 1mg (WARNING — P3-FIX-4)
// - Check 12: KarigarIssue CLOSED but no LABOUR_IN_GOLD entry (WARNING)
// - Check 13: KarigarIssue linked to old_metal_lot where metalSource != 'MELT_OUTPUT' (CRITICAL — DOMAIN-FIX-1 v1.7)

jest.mock('@/db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const schema = require('@/db/schema');

  const sqlite = new Database(':memory:');
  const dbInstance = drizzle(sqlite, { schema });

  let spCounter = 0;
  dbInstance.transaction = (cb: any) => {
    const spName = `sp_${++spCounter}`;
    sqlite.exec(`SAVEPOINT ${spName};`);
    try {
      const res = cb(dbInstance);
      if (res && typeof res.then === 'function') {
        return res
          .then((val: any) => {
            sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
            return val;
          })
          .catch((err: any) => {
            sqlite.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
            sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
            throw err;
          });
      }
      sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
      return res;
    } catch (err) {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
      sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
      throw err;
    }
  };

  dbInstance.__rawClient = {
    execute: async (query: string) => sqlite.exec(query),
    sqlite,
  };

  return {
    db: dbInstance,
    default: dbInstance,
    expoDb: {
      execSync: (query: string) => sqlite.exec(query),
      runSync: (query: string) => sqlite.prepare(query).run(),
      getFirstSync: (query: string, params: any[] = []) => sqlite.prepare(query).get(...params),
      getAllSync: (query: string, params: any[] = []) => sqlite.prepare(query).all(...params),
      prepare: (query: string) => sqlite.prepare(query),
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

jest.mock('@/services/phase1/leaseService', () => ({
  leaseService: {
    assertNoActiveLease: jest.fn().mockResolvedValue(undefined),
    acquire: jest.fn().mockResolvedValue('test-lease-id'),
    release: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/phase1/safeModeService', () => ({
  safeModeService: {
    assertNotInSafeMode: jest.fn(),
    activate: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    isSafeModeActive: jest.fn().mockReturnValue(false),
  },
  bootstrapComplete: { value: true },
}));

import { db } from '@/db/client';
import { goldIntelligenceVerifyService } from '@/services/phase4/goldIntelligenceVerifyService';
import { ERR } from '@/constants/errorCodes';

describe('Phase 4: Verify-My-Data (Step 12)', () => {
  let sqlite: any;
  const firmId = 'firm-verify-p4';

  beforeAll(() => {
    sqlite = (db as any).__rawClient.sqlite;

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS firms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        firm_code TEXT NOT NULL,
        proprietor TEXT NOT NULL DEFAULT '',
        gstin TEXT,
        bis_licence TEXT,
        bis_logo_ref TEXT,
        firm_logo_ref TEXT,
        address_line1 TEXT NOT NULL DEFAULT '',
        address_line2 TEXT,
        city TEXT NOT NULL DEFAULT '',
        state_code TEXT NOT NULL DEFAULT '27',
        state_name TEXT NOT NULL DEFAULT 'Maharashtra',
        pincode TEXT NOT NULL DEFAULT '',
        phone1 TEXT NOT NULL DEFAULT '',
        phone2 TEXT,
        phone3 TEXT,
        is_archived INTEGER DEFAULT 0 NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT,
        event_type TEXT NOT NULL,
        entity_id TEXT,
        device_id TEXT NOT NULL,
        operator_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
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
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        customer_id TEXT,
        sale_invoice_id TEXT,
        urd_purchase_id TEXT,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        total_amount_paise INTEGER
      );

      CREATE TABLE IF NOT EXISTS refinery_batches (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        sent_date TEXT,
        received_date TEXT,
        total_input_fine_mg INTEGER,
        total_output_fine_mg INTEGER,
        gain_loss_mg INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refinery_batch_lots (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        input_fine_mg INTEGER NOT NULL,
        share_ratio REAL NOT NULL,
        output_fine_mg INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS melt_batches (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        output_gross_weight_mg INTEGER,
        output_purity_pct REAL,
        output_fine_weight_mg INTEGER,
        output_lot_id TEXT,
        closed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS melt_batch_inputs (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        input_fine_mg INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mobile TEXT,
        address TEXT,
        speciality TEXT,
        bank_name TEXT,
        bank_account TEXT,
        ifsc TEXT,
        allowed_wastage_pct REAL NOT NULL DEFAULT 0.0,
        wastage_type TEXT NOT NULL DEFAULT 'PERCENT',
        wastage_fixed_mg INTEGER,
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_issues (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT NOT NULL,
        source_lot_id TEXT NOT NULL,
        issued_gross_weight_mg INTEGER NOT NULL,
        issued_purity_pct REAL NOT NULL,
        issued_fine_weight_mg INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED',
        issue_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_returns (
        id TEXT PRIMARY KEY NOT NULL,
        issue_id TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        purity_pct REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        return_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_ledger (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT,
        karigar_id TEXT NOT NULL,
        type TEXT NOT NULL,
        weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_pct REAL NOT NULL DEFAULT 0,
        amount_paise INTEGER NOT NULL DEFAULT 0,
        rate_paise_per_gram INTEGER NOT NULL DEFAULT 0,
        is_manual_rate INTEGER NOT NULL DEFAULT 0,
        linked_entity_id TEXT,
        linked_job_work_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        category_id TEXT,
        design_id TEXT,
        sku TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL DEFAULT 0,
        net_weight_mg INTEGER NOT NULL DEFAULT 0,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_percent REAL NOT NULL DEFAULT 91.6,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        hsn_code TEXT NOT NULL DEFAULT '7113',
        metal_source TEXT NOT NULL DEFAULT 'SUPPLIER_PURCHASE',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
      );
    `);

    // Insert test firm
    sqlite.prepare(`
      INSERT OR REPLACE INTO firms (id, name, firm_code, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(firmId, 'Verify Jewellers', 'VJ');
  });

  beforeEach(() => {
    sqlite.prepare(`DELETE FROM old_metal_lots WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM refinery_batches WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM refinery_batch_lots`).run();
    sqlite.prepare(`DELETE FROM melt_batches WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM melt_batch_inputs`).run();
    sqlite.prepare(`DELETE FROM karigar WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM karigar_issues WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM karigar_returns`).run();
    sqlite.prepare(`DELETE FROM karigar_ledger WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM audit_logs WHERE firm_id = ?`).run(firmId);
    sqlite.prepare(`DELETE FROM items WHERE firm_id = ?`).run(firmId);
  });

  // ─── CHECK 1: OldMetalLot SENT_TO_REFINERY without open batch (CRITICAL) ────
  test('Check 1: flags OldMetalLot with status SENT_TO_REFINERY not linked to open batch as CRITICAL', async () => {
    // Unlinked SENT_TO_REFINERY lot
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, status, created_at, updated_at)
      VALUES ('lot-orphan-ref', ?, 'Customer', '2026-10-01', 10000, 91.6, 'SENT_TO_REFINERY', datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.OLD_METAL_SENT_TO_REFINERY_WITHOUT_OPEN_BATCH);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.detail).toContain('lot-orphan-ref');
  });

  test('Check 1: does NOT flag lot linked to an open (SENT) refinery batch', async () => {
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, status, created_at, updated_at)
      VALUES ('lot-valid-ref', ?, 'Customer', '2026-10-01', 10000, 91.6, 'SENT_TO_REFINERY', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, created_at, updated_at)
      VALUES ('rb-open', ?, 'sup-1', 'SENT', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO refinery_batch_lots (id, batch_id, lot_id, input_fine_mg, share_ratio, created_at)
      VALUES ('rbl-1', 'rb-open', 'lot-valid-ref', 9160, 1.0, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.OLD_METAL_SENT_TO_REFINERY_WITHOUT_OPEN_BATCH);
    expect(finding).toBeUndefined();
  });

  // ─── CHECK 2: MELT_OUTPUT lot in refinery batch (CRITICAL — P3-FIX-1) ────────
  test('Check 2: flags MELT_OUTPUT lot in refinery batch as CRITICAL', async () => {
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, metal_source, status, created_at, updated_at)
      VALUES ('lot-melt-out', ?, 'Melt', '2026-10-01', 10000, 99.5, 'MELT_OUTPUT', 'SENT_TO_REFINERY', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO refinery_batch_lots (id, batch_id, lot_id, input_fine_mg, share_ratio, created_at)
      VALUES ('rbl-2', 'rb-1', 'lot-melt-out', 9950, 1.0, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.MELT_OUTPUT_LOT_IN_REFINERY_BATCH);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.detail).toContain('lot-melt-out');
  });

  // ─── CHECK 3 & 4: SENT_TO_MELT in closed batch vs open batch (P3-FIX-1) ───────
  test('Check 3: flags SENT_TO_MELT lot in CLOSED batch without output lot as CRITICAL', async () => {
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, status, created_at, updated_at)
      VALUES ('lot-melt-broken', ?, 'Customer', '2026-10-01', 10000, 91.6, 'SENT_TO_MELT', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO melt_batches (id, firm_id, status, output_lot_id, created_at, updated_at)
      VALUES ('mb-closed-no-out', ?, 'CLOSED', NULL, datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO melt_batch_inputs (id, batch_id, lot_id, input_fine_mg, created_at)
      VALUES ('mbi-1', 'mb-closed-no-out', 'lot-melt-broken', 9160, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.MELT_BATCH_CLOSED_WITHOUT_OUTPUT_LOT);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
  });

  test('Check 4: SENT_TO_MELT lot in CREATED (open) batch is HEALTHY (not flagged as orphan)', async () => {
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, status, created_at, updated_at)
      VALUES ('lot-melt-open', ?, 'Customer', '2026-10-01', 10000, 91.6, 'SENT_TO_MELT', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO melt_batches (id, firm_id, status, created_at, updated_at)
      VALUES ('mb-open', ?, 'CREATED', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO melt_batch_inputs (id, batch_id, lot_id, input_fine_mg, created_at)
      VALUES ('mbi-2', 'mb-open', 'lot-melt-open', 9160, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.MELT_BATCH_CLOSED_WITHOUT_OUTPUT_LOT);
    expect(finding).toBeUndefined();
  });

  // ─── CHECK 5: Refinery batch SENT > 30 days without received (WARNING) ───────
  test('Check 5: flags refinery batch SENT > 30 days ago as WARNING', async () => {
    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, sent_date, created_at, updated_at)
      VALUES ('rb-stale-sent', ?, 'sup-1', 'SENT', date('now', '-35 days'), datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.REFINERY_BATCH_SENT_OVERDUE);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.detail).toContain('rb-stale-sent');
  });

  // ─── CHECK 6: Refinery batch RECEIVED not CLOSED (WARNING) ───────────────────
  test('Check 6: flags refinery batch with status RECEIVED as WARNING', async () => {
    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, created_at, updated_at)
      VALUES ('rb-received-unclosed', ?, 'sup-1', 'RECEIVED', datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.REFINERY_BATCH_RECEIVED_NOT_CLOSED);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.detail).toContain('rb-received-unclosed');
  });

  // ─── CHECK 7: Karigar issue ISSUED > 30 days (REVIEW-4: REVERSED excluded) ───
  test('Check 7: flags karigar issue ISSUED > 30 days ago as WARNING, but excludes REVERSED', async () => {
    // 1. Overdue ISSUED issue
    sqlite.prepare(`
      INSERT INTO karigar_issues (id, firm_id, karigar_id, source_lot_id, issued_gross_weight_mg, issued_purity_pct, issued_fine_weight_mg, status, issue_date, created_at, updated_at)
      VALUES ('ki-overdue', ?, 'k-1', 'lot-1', 10000, 91.6, 9160, 'ISSUED', date('now', '-35 days'), datetime('now'), datetime('now'))
    `).run(firmId);

    // 2. Overdue but REVERSED issue (REVIEW-4: must be excluded)
    sqlite.prepare(`
      INSERT INTO karigar_issues (id, firm_id, karigar_id, source_lot_id, issued_gross_weight_mg, issued_purity_pct, issued_fine_weight_mg, status, issue_date, created_at, updated_at)
      VALUES ('ki-reversed', ?, 'k-1', 'lot-2', 10000, 91.6, 9160, 'REVERSED', date('now', '-35 days'), datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const overdueFindings = findings.filter((f) => f.check === ERR.KARIGAR_ISSUE_OVERDUE);

    expect(overdueFindings.length).toBe(1);
    expect(overdueFindings[0].detail).toContain('ki-overdue');
    expect(overdueFindings[0].detail).not.toContain('ki-reversed');
  });

  // ─── CHECK 8: Karigar negative metal balance (CRITICAL) ─────────────────────
  test('Check 8: flags karigar with negative metal balance as CRITICAL', async () => {
    // Karigar returns metal without having been issued metal
    sqlite.prepare(`
      INSERT INTO karigar_ledger (id, firm_id, karigar_id, type, weight_mg, purity_pct, created_at)
      VALUES ('kl-neg', ?, 'k-negative', 'METAL_IN', 5000, 100, datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.KARIGAR_NEGATIVE_METAL_BALANCE);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.detail).toContain('k-negative');
  });

  // ─── CHECK 9: Melt batch CREATED > 7 days (WARNING) ─────────────────────────
  test('Check 9: flags melt batch in CREATED status > 7 days as WARNING', async () => {
    sqlite.prepare(`
      INSERT INTO melt_batches (id, firm_id, status, created_at, updated_at)
      VALUES ('mb-stale-7d', ?, 'CREATED', datetime('now', '-10 days'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.MELT_BATCH_CREATED_OVERDUE);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.detail).toContain('mb-stale-7d');
  });

  // ─── CHECK 10: Negative fine metal balance (CRITICAL) ───────────────────────
  test('Check 10: flags negative fine metal balance as CRITICAL', async () => {
    // Record sold item of 50,000 mg with zero purchases/opening
    sqlite.prepare(`
      INSERT INTO items (id, firm_id, sku, fine_weight_mg, status, created_at, updated_at)
      VALUES ('item-sold-neg', ?, 'SKU-NEG', 50000, 'SOLD', datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.NEGATIVE_FINE_BALANCE);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.detail).toContain('-50000');
  });

  // ─── CHECK 11: Refinery output lot shares discrepancy > 1mg (P3-FIX-4) ───────
  test('Check 11: flags discrepancy between totalOutputFineMg and lot shares sum > 1mg as WARNING', async () => {
    // Total output is 10,000 mg, but lot sum is 9,990 mg (delta = 10mg > 1mg)
    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_output_fine_mg, created_at, updated_at)
      VALUES ('rb-discrepancy', ?, 'sup-1', 'CLOSED', 10000, datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO refinery_batch_lots (id, batch_id, lot_id, input_fine_mg, share_ratio, output_fine_mg, created_at)
      VALUES ('rbl-disc-1', 'rb-discrepancy', 'lot-1', 5000, 0.5, 4995, datetime('now')),
             ('rbl-disc-2', 'rb-discrepancy', 'lot-2', 5000, 0.5, 4995, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.REFINERY_BATCH_LOT_SHARES_DISCREPANCY);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.detail).toContain('rb-discrepancy');
  });

  test('Check 11: does NOT flag when rounding delta is <= 1mg (P3-FIX-4 tolerance)', async () => {
    // Total output is 10,000 mg, lot sum is 9,999 mg (delta = 1mg <= 1mg)
    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_output_fine_mg, created_at, updated_at)
      VALUES ('rb-ok-tolerance', ?, 'sup-1', 'CLOSED', 10000, datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO refinery_batch_lots (id, batch_id, lot_id, input_fine_mg, share_ratio, output_fine_mg, created_at)
      VALUES ('rbl-ok-1', 'rb-ok-tolerance', 'lot-1', 5000, 0.5, 5000, datetime('now')),
             ('rbl-ok-2', 'rb-ok-tolerance', 'lot-2', 5000, 0.5, 4999, datetime('now'))
    `).run();

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.REFINERY_BATCH_LOT_SHARES_DISCREPANCY);
    expect(finding).toBeUndefined();
  });

  // ─── CHECK 12: CLOSED karigar issue without LABOUR_IN_GOLD (WARNING) ─────────
  test('Check 12: flags CLOSED karigar issue without LABOUR_IN_GOLD as WARNING', async () => {
    sqlite.prepare(`
      INSERT INTO karigar_issues (id, firm_id, karigar_id, source_lot_id, issued_gross_weight_mg, issued_purity_pct, issued_fine_weight_mg, status, issue_date, created_at, updated_at)
      VALUES ('ki-closed-no-labour', ?, 'k-gold-1', 'lot-1', 10000, 100, 10000, 'CLOSED', '2026-10-01', datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.KARIGAR_ISSUE_CLOSED_NO_LABOUR_IN_GOLD);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.detail).toContain('ki-closed-no-labour');
  });

  // ─── CHECK 13: Karigar issue linked to raw metal (CRITICAL — DOMAIN-FIX-1) ────
  test('Check 13: flags karigar issue linked to non-MELT_OUTPUT lot as CRITICAL', async () => {
    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, received_from, received_date, gross_weight_mg, purity_percent, metal_source, status, created_at, updated_at)
      VALUES ('lot-raw-customer', ?, 'Customer', '2026-10-01', 10000, 91.6, 'CUSTOMER', 'ISSUED_TO_KARIGAR', datetime('now'), datetime('now'))
    `).run(firmId);

    sqlite.prepare(`
      INSERT INTO karigar_issues (id, firm_id, karigar_id, source_lot_id, issued_gross_weight_mg, issued_purity_pct, issued_fine_weight_mg, status, issue_date, created_at, updated_at)
      VALUES ('ki-raw-issue', ?, 'k-1', 'lot-raw-customer', 10000, 91.6, 9160, 'ISSUED', '2026-10-01', datetime('now'), datetime('now'))
    `).run(firmId);

    const findings = await goldIntelligenceVerifyService.runGoldIntelligenceChecks(firmId);
    const finding = findings.find((f) => f.check === ERR.KARIGAR_ISSUE_INVALID_SOURCE_LOT);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.detail).toContain('CUSTOMER');
    expect(finding?.detail).toContain('ki-raw-issue');
  });
});
