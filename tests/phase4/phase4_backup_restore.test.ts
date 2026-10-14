// tests/phase4/phase4_backup_restore.test.ts
// STEP 21 — BACKUP PAYLOAD EXTENSION (GAP-ERROR-REGISTRY, ALIGN-FIX-2, PAYLOAD-FIX-1, FIX-P4-BACKUP-1 v1.15, FIX-P4-BACKUP-2 v1.16)
// Verifies all 42 tables in payload, schemaVersion 10, reverse-FK delete order, FK-safe insert order,
// restore warning rules for schemaVersion 5 / <5, and end-to-end backup & restore.

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
      runSync: (query: string, params: any[] = []) => sqlite.prepare(query).run(...params),
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
}));

import { db } from '@/db/client';
import { BACKUP_SCHEMA_VERSION, APP_VERSION } from '@/constants';
import { backupService } from '@/services/phase1/backupService';
import { restoreService } from '@/services/phase1/restoreService';
import {
  goldIntelligenceBackupService,
  exportGoldIntelligenceData,
  getGoldIntelligenceRecordCounts,
  assembleGoldIntelligenceBackupPayload,
} from '@/services/phase4/goldIntelligenceBackupService';
import {
  goldIntelligenceRestoreService,
  clearGoldIntelligenceData,
  restoreGoldIntelligenceData,
  getPhase4RestoreWarning,
} from '@/services/phase4/goldIntelligenceRestoreService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import * as FileSystem from 'expo-file-system/legacy';

describe('STEP 21 — BACKUP PAYLOAD EXTENSION', () => {
  let sqlite: any;
  const firmId = 'firm-backup-test-1';

  beforeAll(() => {
    sqlite = (db as any).__rawClient.sqlite;

    // Create Phase 1 Tables
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

      CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT,
        event_type TEXT NOT NULL,
        entity_id TEXT,
        device_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_delete_gate (
        id INTEGER PRIMARY KEY DEFAULT 1,
        gate_open INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0);

      CREATE TABLE IF NOT EXISTS writer_leases (
        id TEXT PRIMARY KEY,
        lease_type TEXT NOT NULL,
        firm_id TEXT,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        device_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        theme TEXT NOT NULL DEFAULT 'saffron',
        audit_retention_days INTEGER NOT NULL DEFAULT 30,
        audit_retention_last_run_at TEXT,
        currency TEXT NOT NULL DEFAULT 'INR',
        currency_symbol TEXT NOT NULL DEFAULT '₹',
        currency_decimal_places INTEGER NOT NULL DEFAULT 2,
        date_format_token TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
        warn_unsaved_changes INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS safe_mode_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        activated_at TEXT,
        cleared_at TEXT
      );

      CREATE TABLE IF NOT EXISTS bis_logos (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        file_ref TEXT NOT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        archived_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_rates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        rate_bps INTEGER NOT NULL,
        cgst_bps INTEGER NOT NULL,
        sgst_bps INTEGER NOT NULL,
        igst_bps INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_groups (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_group_components (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL,
        rate_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Create Phase 2 Tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        description TEXT,
        default_hsn TEXT,
        metal TEXT NOT NULL,
        stock_type TEXT NOT NULL DEFAULT 'SERIALIZED',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS design_purity_thresholds (
        design_id TEXT NOT NULL,
        purity_percent REAL NOT NULL,
        low_stock_threshold INTEGER NOT NULL,
        PRIMARY KEY (design_id, purity_percent)
      );

      CREATE TABLE IF NOT EXISTS design_category_map (
        id TEXT PRIMARY KEY NOT NULL,
        design_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stones (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gemstone_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        stone_id TEXT NOT NULL,
        name TEXT NOT NULL,
        weight_carat_x100 INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_rate_paise_per_carat INTEGER,
        total_purchase_amount_paise INTEGER,
        supplier_name TEXT,
        certification_ref TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hsn_codes (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        chapter TEXT NOT NULL DEFAULT '71',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT NOT NULL,
        huid TEXT,
        design_id TEXT NOT NULL,
        category_id TEXT NOT NULL DEFAULT '',
        hsn_code TEXT NOT NULL DEFAULT '',
        metal TEXT NOT NULL,
        purity_percent REAL NOT NULL,
        purity_karat INTEGER NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        stone_weight_mg INTEGER NOT NULL DEFAULT 0,
        beads_weight_mg INTEGER NOT NULL DEFAULT 0,
        net_weight_mg INTEGER NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        wastage_percent REAL NOT NULL DEFAULT 0,
        fine_gold_charged_mg INTEGER,
        purchase_rate_paise INTEGER,
        making_charge_paise INTEGER,
        stone_cost_paise INTEGER,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        metal_source TEXT NOT NULL,
        primary_stone_id TEXT,
        location TEXT,
        sale_invoice_id TEXT,
        purchase_invoice_id TEXT,
        phantom_stock_id TEXT DEFAULT NULL,
        barcode_reprint_required INTEGER NOT NULL DEFAULT 0,
        size_value REAL,
        size_unit TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS loose_stock_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        design_id TEXT NOT NULL,
        purity_percent REAL NOT NULL,
        purity_karat REAL NOT NULL,
        metal TEXT NOT NULL,
        piece_count INTEGER NOT NULL DEFAULT 0,
        total_weight_mg INTEGER NOT NULL DEFAULT 0,
        hsn_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS loose_stock_events (
        id TEXT PRIMARY KEY NOT NULL,
        lot_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        piece_count_delta INTEGER NOT NULL,
        weight_mg_delta INTEGER NOT NULL,
        purchase_rate_paise INTEGER,
        wastage_percent REAL,
        sale_invoice_id TEXT,
        performed_by TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS item_events (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        performed_by TEXT NOT NULL,
        reason TEXT,
        old_value TEXT,
        new_value TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS old_metal_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        received_from TEXT NOT NULL,
        received_date TEXT NOT NULL,
        customer_id TEXT,
        sale_invoice_id TEXT,
        urd_purchase_id TEXT,
        gross_weight_mg INTEGER NOT NULL,
        metal TEXT NOT NULL DEFAULT 'GOLD',
        purity_percent REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        total_amount_paise INTEGER,
        metal_source TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sequence_counters (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        month TEXT NOT NULL,
        year TEXT NOT NULL,
        current_seq INTEGER NOT NULL,
        last_used_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS urd_purchases (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        urd_number TEXT,
        purchase_date TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT NOT NULL,
        customer_address TEXT,
        customer_mobile TEXT,
        customer_aadhaar TEXT,
        customer_pan TEXT,
        metal_type TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        purity_percent REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        rate_per_gram_paise INTEGER NOT NULL,
        total_value_paise INTEGER NOT NULL,
        payment_mode TEXT NOT NULL,
        bank_account_id TEXT,
        old_gold_lot_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Create Phase 3 Tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'SUPPLIER',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        allowed_wastage_pct REAL NOT NULL DEFAULT 0.0,
        wastage_type TEXT NOT NULL DEFAULT 'PERCENT',
        wastage_fixed_mg INTEGER,
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
        linked_entity_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        account_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        ifsc_code TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        branch TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_number_config (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT 'INV',
        separator TEXT NOT NULL DEFAULT '/',
        next_number INTEGER NOT NULL DEFAULT 1,
        padding INTEGER NOT NULL DEFAULT 4,
        include_fy INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_print_settings (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        paper_size TEXT NOT NULL DEFAULT 'A4',
        print_logo INTEGER NOT NULL DEFAULT 1,
        print_bank_details INTEGER NOT NULL DEFAULT 1,
        terms_and_conditions TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        customer_id TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        total_amount_paise INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_invoice_items (
        id TEXT PRIMARY KEY NOT NULL,
        invoice_id TEXT NOT NULL,
        item_id TEXT,
        description TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        net_weight_mg INTEGER NOT NULL,
        rate_per_gram_paise INTEGER NOT NULL,
        taxable_amount_paise INTEGER NOT NULL,
        cgst_paise INTEGER NOT NULL DEFAULT 0,
        sgst_paise INTEGER NOT NULL DEFAULT 0,
        total_amount_paise INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        total_amount_paise INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id TEXT PRIMARY KEY NOT NULL,
        invoice_id TEXT NOT NULL,
        description TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        net_weight_mg INTEGER NOT NULL,
        rate_per_gram_paise INTEGER NOT NULL,
        total_amount_paise INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        party_id TEXT NOT NULL,
        party_type TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        payment_mode TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        entry_type TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS credit_notes (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        credit_note_number TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS debit_notes (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        debit_note_number TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS estimate_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        estimate_number TEXT NOT NULL,
        estimate_date TEXT NOT NULL,
        total_amount_paise INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS estimate_items (
        id TEXT PRIMARY KEY NOT NULL,
        estimate_id TEXT NOT NULL,
        description TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        rate_per_gram_paise INTEGER NOT NULL,
        total_amount_paise INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS supplier_metal_payments (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        purity_percent REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS migration_log (
        id TEXT PRIMARY KEY NOT NULL,
        migration_name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Create Phase 4 Tables
    sqlite.exec(`
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
        output_fine_mg INTEGER,
        share_ratio REAL,
        settled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refinery_output_lots (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        purity_percent REAL NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        metal_source TEXT NOT NULL DEFAULT 'REFINERY_OUTPUT',
        received_date TEXT NOT NULL,
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
    `);

    // Seed test firm
    sqlite.prepare(`
      INSERT OR REPLACE INTO firms (id, name, firm_code, proprietor, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(firmId, 'VJBilling Test Firm', 'VJ01', 'Rohit', '2026-01-01', '2026-01-01');
  });

  // ---------------------------------------------------------------------------
  // 1. Schema Version and App Version Constants
  // ---------------------------------------------------------------------------
  test('BACKUP_SCHEMA_VERSION is 10 and APP_VERSION is 1.0.0', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(10);
    expect(APP_VERSION).toBe('1.0.0');
  });

  // ---------------------------------------------------------------------------
  // 2. Verified Backup Payload Structure (All 42 Tables, No Phantoms)
  // ---------------------------------------------------------------------------
  test('assembleGoldIntelligenceBackupPayload produces canonical payload with all 42 tables and no phantom tables', () => {
    const payload = assembleGoldIntelligenceBackupPayload(db as any, firmId);

    // Envelope header
    expect(payload.schemaVersion).toBe(10);
    expect(payload.appVersion).toBe('1.0.0');
    expect(payload.exportedAt).toBeDefined();
    expect(payload.firmId).toBe(firmId);
    expect(payload.checksum).toBeDefined();
    expect(typeof payload.checksum).toBe('string');

    // tables dictionary exists
    expect(payload.tables).toBeDefined();
    const tables = payload.tables;

    // Phase 1 tables (5 tables)
    expect(Array.isArray(tables.firms)).toBe(true);
    expect(Array.isArray(tables.financial_years)).toBe(true);
    expect(Array.isArray(tables.audit_log)).toBe(true);
    expect(Array.isArray(tables.safe_mode_state)).toBe(true);
    expect(Array.isArray(tables.settings)).toBe(true);

    // Phase 2 tables (14 tables)
    expect(Array.isArray(tables.categories)).toBe(true);
    expect(Array.isArray(tables.designs)).toBe(true);
    expect(Array.isArray(tables.stones)).toBe(true);
    expect(Array.isArray(tables.designPurityThresholds)).toBe(true);
    expect(Array.isArray(tables.designCategoryMap)).toBe(true);
    expect(Array.isArray(tables.gemstoneLots)).toBe(true);
    expect(Array.isArray(tables.hsnCodes)).toBe(true);
    expect(Array.isArray(tables.items)).toBe(true);
    expect(Array.isArray(tables.looseStockLots)).toBe(true);
    expect(Array.isArray(tables.looseStockEvents)).toBe(true);
    expect(Array.isArray(tables.itemEvents)).toBe(true);
    expect(Array.isArray(tables.oldMetalLots)).toBe(true);
    expect(Array.isArray(tables.sequenceCounters)).toBe(true);
    expect(Array.isArray(tables.bisLogos)).toBe(true);

    // Phase 3 tables (16 tables)
    expect(Array.isArray(tables.customers)).toBe(true);
    expect(Array.isArray(tables.suppliers)).toBe(true);
    expect(Array.isArray(tables.karigar)).toBe(true);
    expect(Array.isArray(tables.karigar_ledger)).toBe(true);
    expect(Array.isArray(tables.bank_accounts)).toBe(true);
    expect(Array.isArray(tables.invoice_number_config)).toBe(true);
    expect(Array.isArray(tables.tax_groups)).toBe(true);
    expect(Array.isArray(tables.tax_rates)).toBe(true);
    expect(Array.isArray(tables.tax_group_components)).toBe(true);
    expect(Array.isArray(tables.sale_invoices)).toBe(true);
    expect(Array.isArray(tables.sale_invoice_items)).toBe(true);
    expect(Array.isArray(tables.purchase_invoices)).toBe(true);
    expect(Array.isArray(tables.purchase_invoice_items)).toBe(true);
    expect(Array.isArray(tables.payments)).toBe(true);
    expect(Array.isArray(tables.ledger_entries)).toBe(true);
    expect(Array.isArray(tables.credit_notes)).toBe(true);
    expect(Array.isArray(tables.debit_notes)).toBe(true);
    expect(Array.isArray(tables.migration_log)).toBe(true);
    expect(Array.isArray(tables.invoice_print_settings)).toBe(true);
    expect(Array.isArray(tables.estimate_invoices)).toBe(true);
    expect(Array.isArray(tables.estimate_items)).toBe(true);
    expect(Array.isArray(tables.supplier_metal_payments)).toBe(true);

    // Phase 4 tables (7 tables)
    expect(Array.isArray(tables.refinery_batches)).toBe(true);
    expect(Array.isArray(tables.refinery_batch_lots)).toBe(true);
    expect(Array.isArray(tables.refinery_output_lots)).toBe(true);
    expect(Array.isArray(tables.melt_batches)).toBe(true);
    expect(Array.isArray(tables.melt_batch_inputs)).toBe(true);
    expect(Array.isArray(tables.karigar_issues)).toBe(true);
    expect(Array.isArray(tables.karigar_returns)).toBe(true);

    // VERIFY ZERO PHANTOM TABLES per ALIGN-FIX-2 and PAYLOAD-FIX-1
    expect(tables['devices']).toBeUndefined();
    expect(tables['item_instances']).toBeUndefined();
    expect(tables['gst_entries']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 3. Phase 4 Data Exporter & Record Counts
  // ---------------------------------------------------------------------------
  test('exportGoldIntelligenceData exports all 7 Phase 4 tables and getGoldIntelligenceRecordCounts returns accurate counts', () => {
    // Insert 1 row in each Phase 4 table
    sqlite.prepare(`
      INSERT INTO refinery_batches (id, firm_id, supplier_id, status, created_at, updated_at)
      VALUES ('rb-1', '${firmId}', 'sup-1', 'CREATED', '2026-10-10', '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO refinery_batch_lots (id, batch_id, lot_id, input_fine_mg, created_at)
      VALUES ('rbl-1', 'rb-1', 'lot-1', 10000, '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO refinery_output_lots (id, batch_id, fine_weight_mg, purity_percent, gross_weight_mg, received_date, created_at)
      VALUES ('rol-1', 'rb-1', 9900, 99.0, 10000, '2026-10-10', '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO melt_batches (id, firm_id, status, created_at, updated_at)
      VALUES ('mb-1', '${firmId}', 'CREATED', '2026-10-10', '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO melt_batch_inputs (id, batch_id, lot_id, input_fine_mg, created_at)
      VALUES ('mbi-1', 'mb-1', 'lot-2', 5000, '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO karigar_issues (id, firm_id, karigar_id, source_lot_id, issued_gross_weight_mg, issued_purity_pct, issued_fine_weight_mg, status, issue_date, created_at, updated_at)
      VALUES ('ki-1', '${firmId}', 'kar-1', 'lot-3', 5000, 91.6, 4580, 'ISSUED', '2026-10-10', '2026-10-10', '2026-10-10')
    `).run();

    sqlite.prepare(`
      INSERT INTO karigar_returns (id, issue_id, gross_weight_mg, purity_pct, fine_weight_mg, return_date, created_at)
      VALUES ('kr-1', 'ki-1', 5000, 91.6, 4580, '2026-10-10', '2026-10-10')
    `).run();

    const data = exportGoldIntelligenceData(db as any);
    expect(data.refinery_batches.length).toBeGreaterThanOrEqual(1);
    expect(data.refinery_batch_lots.length).toBeGreaterThanOrEqual(1);
    expect(data.refinery_output_lots.length).toBeGreaterThanOrEqual(1);
    expect(data.melt_batches.length).toBeGreaterThanOrEqual(1);
    expect(data.melt_batch_inputs.length).toBeGreaterThanOrEqual(1);
    expect(data.karigar_issues.length).toBeGreaterThanOrEqual(1);
    expect(data.karigar_returns.length).toBeGreaterThanOrEqual(1);

    const counts = getGoldIntelligenceRecordCounts(db as any);
    expect(counts.refinery_batches).toBeGreaterThanOrEqual(1);
    expect(counts.refinery_batch_lots).toBeGreaterThanOrEqual(1);
    expect(counts.refinery_output_lots).toBeGreaterThanOrEqual(1);
    expect(counts.melt_batches).toBeGreaterThanOrEqual(1);
    expect(counts.melt_batch_inputs).toBeGreaterThanOrEqual(1);
    expect(counts.karigar_issues).toBeGreaterThanOrEqual(1);
    expect(counts.karigar_returns).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Phase 4 Restore Order: Clear (Reverse FK) & Insert (FK-Safe)
  // ---------------------------------------------------------------------------
  test('clearGoldIntelligenceData deletes in reverse FK order and restoreGoldIntelligenceData restores in FK-safe order', () => {
    // Clear Phase 4 tables
    clearGoldIntelligenceData(db as any);

    const postClearCounts = getGoldIntelligenceRecordCounts(db as any);
    expect(postClearCounts.refinery_batches).toBe(0);
    expect(postClearCounts.refinery_batch_lots).toBe(0);
    expect(postClearCounts.refinery_output_lots).toBe(0);
    expect(postClearCounts.melt_batches).toBe(0);
    expect(postClearCounts.melt_batch_inputs).toBe(0);
    expect(postClearCounts.karigar_issues).toBe(0);
    expect(postClearCounts.karigar_returns).toBe(0);

    // Restore payload into cleared tables
    const restorePayload = {
      tables: {
        refinery_batches: [
          {
            id: 'rb-restored-1',
            firmId,
            supplierId: 'sup-1',
            status: 'CREATED',
            createdAt: '2026-10-10',
            updatedAt: '2026-10-10',
          },
        ],
        refinery_batch_lots: [
          {
            id: 'rbl-restored-1',
            batchId: 'rb-restored-1',
            lotId: 'lot-1',
            inputFineMg: 10000,
            settled: 0,
            createdAt: '2026-10-10',
          },
        ],
        refinery_output_lots: [
          {
            id: 'rol-restored-1',
            batchId: 'rb-restored-1',
            fineWeightMg: 9900,
            purityPercent: 99.0,
            grossWeightMg: 10000,
            metalSource: 'REFINERY_OUTPUT',
            receivedDate: '2026-10-10',
            createdAt: '2026-10-10',
          },
        ],
        melt_batches: [
          {
            id: 'mb-restored-1',
            firmId,
            status: 'CREATED',
            createdAt: '2026-10-10',
            updatedAt: '2026-10-10',
          },
        ],
        melt_batch_inputs: [
          {
            id: 'mbi-restored-1',
            batchId: 'mb-restored-1',
            lotId: 'lot-2',
            inputFineMg: 5000,
            createdAt: '2026-10-10',
          },
        ],
        karigar_issues: [
          {
            id: 'ki-restored-1',
            firmId,
            karigarId: 'kar-1',
            sourceLotId: 'lot-3',
            issuedGrossWeightMg: 5000,
            issuedPurityPct: 91.6,
            issuedFineWeightMg: 4580,
            status: 'ISSUED',
            issueDate: '2026-10-10',
            createdAt: '2026-10-10',
            updatedAt: '2026-10-10',
          },
        ],
        karigar_returns: [
          {
            id: 'kr-restored-1',
            issueId: 'ki-restored-1',
            grossWeightMg: 5000,
            purityPct: 91.6,
            fineWeightMg: 4580,
            returnDate: '2026-10-10',
            createdAt: '2026-10-10',
          },
        ],
      },
    };

    restoreGoldIntelligenceData(db as any, restorePayload);

    const postRestoreCounts = getGoldIntelligenceRecordCounts(db as any);
    expect(postRestoreCounts.refinery_batches).toBe(1);
    expect(postRestoreCounts.refinery_batch_lots).toBe(1);
    expect(postRestoreCounts.refinery_output_lots).toBe(1);
    expect(postRestoreCounts.melt_batches).toBe(1);
    expect(postRestoreCounts.melt_batch_inputs).toBe(1);
    expect(postRestoreCounts.karigar_issues).toBe(1);
    expect(postRestoreCounts.karigar_returns).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Schema Compatibility & Warning Rules
  // ---------------------------------------------------------------------------
  describe('Restore Warning Compatibility Rules', () => {
    test('schemaVersion 5 displays exact Phase 4 Gold Intelligence warning', () => {
      const warning = getPhase4RestoreWarning(5);
      expect(warning).toContain('This backup was created before Gold Intelligence features were available.');
      expect(warning).toContain('Refinery batches, melt batches, and karigar issue history will NOT be in this backup.');
      expect(warning).toContain('All current Phase 4 data will be permanently lost on restore.');
    });

    test('schemaVersion < 5 displays escalation warning mentioning earlier phases and absent Phase 4 data', () => {
      const warning = getPhase4RestoreWarning(4);
      expect(warning).toContain('schema v4 < 5');
      expect(warning).toContain('Earlier phase warning escalation applies');
      expect(warning).toContain('All current Phase 4 data will be permanently lost on restore.');
    });

    test('validateBackupSchema returns Gold Intelligence warning for schemaVersion 5', async () => {
      const backupEnvelope = {
        schemaVersion: 5,
        appVersion: '3.0.0',
        exportedAt: '2025-01-01T00:00:00.000Z',
        deviceId: 'DEV-TEST',
        encryptionVersion: 1 as const,
        passwordProtected: false,
        iv: 'iv',
        salt: 'salt',
        ciphertext: 'cipher',
        payload: { firms: [] } as any,
      };

      const result = await restoreService.validateBackupSchema(backupEnvelope);
      expect(result).toBeDefined();
      expect(result?.warning).toContain('This backup was created before Gold Intelligence features were available.');
      expect(result?.warning).toContain('Refinery batches, melt batches, and karigar issue history will NOT be in this backup.');
    });

    test('validateBackupSchema allows schemaVersion 10 without warning', async () => {
      const backupEnvelope = {
        schemaVersion: 10,
        appVersion: '4.0.0',
        exportedAt: '2026-10-10T00:00:00.000Z',
        deviceId: 'DEV-TEST',
        encryptionVersion: 1 as const,
        passwordProtected: false,
        iv: 'iv',
        salt: 'salt',
        ciphertext: 'cipher',
        payload: { firms: [] } as any,
      };

      const result = await restoreService.validateBackupSchema(backupEnvelope);
      expect(result).toBeUndefined();
    });

    test('validateBackupSchema rejects schemaVersion > 10', async () => {
      const backupEnvelope = {
        schemaVersion: 11,
        appVersion: '5.0.0',
        exportedAt: '2027-01-01T00:00:00.000Z',
        deviceId: 'DEV-TEST',
        encryptionVersion: 1 as const,
        passwordProtected: false,
        iv: 'iv',
        salt: 'salt',
        ciphertext: 'cipher',
        payload: { firms: [] } as any,
      };

      await expect(restoreService.validateBackupSchema(backupEnvelope)).rejects.toThrow(
        /backup schema 11 is newer than app 10/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. End-to-End Backup & Restore with Phase 4 Data
  // ---------------------------------------------------------------------------
  test('createBackup() encrypts and restore() restores Phase 4 data end-to-end', async () => {
    // 1. Create backup using Phase 1 backupService
    const result = await backupService.createBackup();
    expect(result.filePath).toBeDefined();
    expect(result.fileName).toMatch(/^vjbilling_.*\.vjb$/);

    // Read and verify outer envelope
    const fileContent = await FileSystem.readAsStringAsync(result.filePath, { encoding: 'utf8' as any });
    const envelope = JSON.parse(fileContent);
    expect(envelope.schemaVersion).toBe(10);
    expect(envelope.appVersion).toBe('1.0.0');

    // 2. Wipe Phase 4 tables
    clearGoldIntelligenceData(db as any);
    expect(getGoldIntelligenceRecordCounts(db as any).refinery_batches).toBe(0);

    // 3. Restore backup
    await restoreService.restore(fileContent);

    // 4. Verify Phase 4 tables were restored
    const counts = getGoldIntelligenceRecordCounts(db as any);
    expect(counts.refinery_batches).toBeGreaterThanOrEqual(1);
    expect(counts.melt_batches).toBeGreaterThanOrEqual(1);
    expect(counts.karigar_issues).toBeGreaterThanOrEqual(1);
  });
});
