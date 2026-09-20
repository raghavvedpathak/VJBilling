// tests/phase3/phase3_stepT_part2.test.ts
// STEP T — TEST SUITE — Part 2: T22 to T42
// Covers:
// - T22: searchCustomers firm isolation, soft delete, length guard
// - T23: searchSuppliers firm isolation, soft delete, length guard
// - T24: Item selection call-site & race conditions
// - T25: Cross-FY backdated entry tests (active, closed, purchase, payment)
// - T26: Old metal customerId propagation
// - T42: Old metal type + purity-rounding parity
// - T27: Phantom billing happy path
// - T28: Phantom return via credit note
// - T29: Phantom race condition guards
// - T30: Supplier payment modes (MONEY, METAL, MIXED, validations)
// - T31: Karigar mixed payment & settlement
// - T32: Payment bill-linkage verification
// - T33: Invoice print settings
// - T34: Terms & Conditions toggle guard
// - T35: Estimates lifecycle (DRAFT -> SAVED -> CONVERTED, expiry, sold block)
// - T36: purchase_invoice_items 2-line post & atomic rollback
// - T37: FEAT-PURCHASE-AUTOSTOCK-1 auto stock item creation
// - T37b: taxGroupStore TTL cache & invalidation
// - T38: metal/making tax group snapshot & TAX_GROUP_IN_USE guard
// - T39: item_events.karigarId backfill & idempotency
// - T40: Loose-lot sale end-to-end stock decrement & event logging
// - T41: Loose-lot sale stock exhaustion guards & full rollback

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
  },
}));

jest.mock('@/services/phase1/safeModeService', () => ({
  safeModeService: {
    assertNotInSafeMode: jest.fn(),
  },
}));

const bootstrapComplete = { value: true };
jest.mock('@/services/phase1/bootstrapService', () => ({
  bootstrapService: {
    isBootstrapComplete: jest.fn(() => bootstrapComplete.value),
  },
}));

jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: () => `uuid-${Date.now()}-${++counter}`,
  };
});

import { db } from '@/db/client';
import { customerService } from '@/services/phase3/customerService';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { supplierService } from '@/services/phase3/supplierService';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { draftInvoiceService } from '@/services/phase3/draftInvoiceService';
import { invoicePostService, createOldMetalInSale } from '@/services/phase3/invoicePostService';
import { creditNoteService } from '@/services/phase3/creditNoteService';
import { paymentService } from '@/services/phase3/paymentService';
import { supplierPaymentService } from '@/services/phase3/supplierPaymentService';
import { karigarMasterService } from '@/services/phase3/karigarMasterService';
import { invoicePrintSettingsService } from '@/services/phase3/invoicePrintSettingsService';
import { estimateService } from '@/services/phase3/estimateService';
import { purchaseInvoiceService } from '@/services/phase3/purchaseInvoiceService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { taxGroupStore, TAX_GROUP_TTL_MS } from '@/store/phase3/taxGroupStore';
import { stepMMigrationService } from '@/services/phase3/stepMMigrationService';
import { createPhantomItem, reconcilePhantomItem, sellFromLooseLot } from '@/services/phase2/itemService';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { resolveFineWeightMg } from '@/utils/purity.constants';
import { ERR } from '@/constants/errorCodes';

describe('STEP T — TEST SUITE — Part 2 (T22–T42)', () => {
  let sqlite: any;

  beforeAll(async () => {
    const rawClient = (db as any).__rawClient || (db as any).db?.__rawClient;
    sqlite = rawClient.sqlite;

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
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT NOT NULL,
        closed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_engine_config (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        gold_24_base_per_10g_paise INTEGER NOT NULL,
        gold_22_base_per_10g_paise INTEGER NOT NULL,
        gold_cash_per_10g_paise INTEGER NOT NULL,
        silver_cash_per_kg_paise INTEGER NOT NULL,
        last_updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT,
        event_type TEXT NOT NULL,
        entity_id TEXT,
        device_id TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        metal TEXT DEFAULT 'GOLD' NOT NULL,
        default_hsn TEXT DEFAULT '7113',
        stock_type TEXT DEFAULT 'SERIALIZED' NOT NULL,
        item_type TEXT DEFAULT 'SERIALIZED' NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS design_category_map (
        id TEXT PRIMARY KEY NOT NULL,
        design_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        design_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT NOT NULL UNIQUE,
        barcode_reprint_required INTEGER NOT NULL DEFAULT 0,
        huid TEXT UNIQUE,
        primary_stone_id TEXT,
        metal TEXT NOT NULL,
        purity_percent REAL NOT NULL,
        purity_karat REAL,
        gross_weight_mg INTEGER NOT NULL,
        stone_weight_mg INTEGER NOT NULL DEFAULT 0,
        beads_weight_mg INTEGER NOT NULL DEFAULT 0,
        net_weight_mg INTEGER NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        wastage_percent REAL NOT NULL DEFAULT 0,
        fine_gold_charged_mg INTEGER,
        purchase_rate_paise INTEGER,
        making_charge_paise INTEGER,
        stone_cost_paise INTEGER,
        location TEXT,
        sale_invoice_id TEXT,
        purchase_invoice_id TEXT,
        phantom_stock_id TEXT,
        hsn_code TEXT NOT NULL DEFAULT '7113',
        size_value REAL,
        size_unit TEXT,
        metal_source TEXT DEFAULT 'SUPPLIER_PURCHASE',
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        is_phantom INTEGER NOT NULL DEFAULT 0,
        reconciled_with_item_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        entry_date TEXT NOT NULL DEFAULT '2026-01-01',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT '2026-01-01'
      );

      CREATE TABLE IF NOT EXISTS item_events (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'INFO',
        performed_by TEXT,
        reason TEXT,
        old_value TEXT,
        new_value TEXT,
        old_status TEXT,
        new_status TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL DEFAULT 'fy-default',
        name TEXT NOT NULL,
        mobile TEXT,
        gstin TEXT,
        address TEXT,
        aadhaar_number TEXT,
        pan_number TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '2026-01-01',
        updated_at TEXT NOT NULL DEFAULT '2026-01-01'
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mobile TEXT,
        gstin TEXT,
        address TEXT,
        type TEXT NOT NULL DEFAULT 'SUPPLIER',
        bank_name TEXT,
        bank_account TEXT,
        ifsc TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '2026-01-01',
        updated_at TEXT NOT NULL DEFAULT '2026-01-01'
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
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '2026-01-01',
        updated_at TEXT NOT NULL DEFAULT '2026-01-01'
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
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_number_config (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        prefix TEXT NOT NULL,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        allow_manual_override INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_print_settings (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        paper_size TEXT NOT NULL DEFAULT 'A5',
        orientation TEXT NOT NULL DEFAULT 'LANDSCAPE',
        show_terms_and_conditions INTEGER NOT NULL DEFAULT 0,
        terms_and_conditions_text TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_rates (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        tax_name TEXT NOT NULL,
        rate_bps INTEGER NOT NULL,
        tax_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_groups (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tax_group_components (
        id TEXT PRIMARY KEY NOT NULL,
        tax_group_id TEXT NOT NULL,
        tax_rate_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        invoice_number TEXT,
        invoice_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        metal_rate_paise_per_gram INTEGER NOT NULL,
        is_manual_rate INTEGER NOT NULL DEFAULT 0,
        making_charges_mode TEXT NOT NULL DEFAULT 'FLAT',
        making_charges_paise INTEGER NOT NULL DEFAULT 0,
        taxable_metal_amt_paise INTEGER NOT NULL DEFAULT 0,
        taxable_making_amt_paise INTEGER NOT NULL DEFAULT 0,
        cgst_paise INTEGER NOT NULL DEFAULT 0,
        sgst_paise INTEGER NOT NULL DEFAULT 0,
        stone_amt_paise INTEGER NOT NULL DEFAULT 0,
        old_metal_deduction_paise INTEGER NOT NULL DEFAULT 0,
        discount_paise INTEGER NOT NULL DEFAULT 0,
        round_off_paise INTEGER NOT NULL DEFAULT 0,
        net_payable_paise INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        posted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sale_invoice_items (
        id TEXT PRIMARY KEY NOT NULL,
        invoice_id TEXT NOT NULL,
        stock_lot_id TEXT NOT NULL,
        sku TEXT,
        item_name TEXT NOT NULL,
        metal TEXT NOT NULL,
        purity_pct REAL NOT NULL,
        gross_weight_mg INTEGER,
        stone_weight_mg INTEGER DEFAULT 0,
        net_weight_mg INTEGER,
        fine_weight_mg INTEGER,
        hsn_code TEXT,
        stone_amount_paise INTEGER NOT NULL DEFAULT 0,
        metal_value_paise INTEGER NOT NULL DEFAULT 0,
        making_charges_paise INTEGER NOT NULL DEFAULT 0,
        line_gst_paise INTEGER NOT NULL DEFAULT 0,
        line_total_paise INTEGER NOT NULL DEFAULT 0,
        metal_tax_group_id TEXT,
        making_tax_group_id TEXT,
        line_type TEXT NOT NULL DEFAULT 'SERIALIZED_ITEM',
        qty_sold INTEGER,
        weight_sold_mg INTEGER
      );

      CREATE TABLE IF NOT EXISTS credit_notes (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        original_invoice_id TEXT NOT NULL,
        cn_number TEXT NOT NULL,
        cn_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        returned_item_ids TEXT NOT NULL,
        credit_amount_paise INTEGER NOT NULL,
        is_partial INTEGER NOT NULL DEFAULT 0,
        remaining_old_metal_credit_paise INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'POSTED',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS debit_notes (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        original_invoice_id TEXT NOT NULL,
        dn_number TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        additional_amount_paise INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'POSTED',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT,
        party_id TEXT NOT NULL,
        party_type TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'DEBIT',
        amount_paise INTEGER NOT NULL DEFAULT 0,
        linked_entity_type TEXT,
        linked_entity_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        debit_paise INTEGER NOT NULL DEFAULT 0,
        credit_paise INTEGER NOT NULL DEFAULT 0,
        reference_type TEXT,
        reference_id TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT,
        party_id TEXT NOT NULL,
        party_type TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        mode TEXT NOT NULL,
        bank_account_id TEXT,
        status TEXT NOT NULL DEFAULT 'PAID',
        reason TEXT,
        linked_invoice_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        account_number TEXT NOT NULL,
        ifsc TEXT NOT NULL,
        branch TEXT,
        upi_ids TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS old_metal_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        received_from TEXT NOT NULL DEFAULT 'CUSTOMER',
        received_date TEXT NOT NULL DEFAULT '2026-01-01',
        gross_weight_mg INTEGER NOT NULL DEFAULT 0,
        metal TEXT NOT NULL DEFAULT 'GOLD',
        purity_percent REAL NOT NULL DEFAULT 91.6,
        metal_source TEXT NOT NULL DEFAULT 'CUSTOMER',
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        customer_id TEXT,
        sale_invoice_id TEXT,
        urd_purchase_id TEXT,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        total_amount_paise INTEGER,
        created_at TEXT NOT NULL DEFAULT '2026-01-01',
        updated_at TEXT NOT NULL DEFAULT '2026-01-01'
      );

      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        supplier_invoice_number TEXT,
        supplier_invoice_date TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'POSTED',
        taxable_amount_paise INTEGER NOT NULL,
        cgst_paise INTEGER NOT NULL DEFAULT 0,
        sgst_paise INTEGER NOT NULL DEFAULT 0,
        total_amount_paise INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        posted_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id TEXT PRIMARY KEY NOT NULL,
        invoice_id TEXT NOT NULL,
        item_description TEXT NOT NULL,
        metal_type TEXT,
        gross_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_pct REAL NOT NULL DEFAULT 0,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        rate_per_gram_paise INTEGER NOT NULL DEFAULT 0,
        taxable_amount_paise INTEGER NOT NULL,
        cgst_paise INTEGER NOT NULL DEFAULT 0,
        sgst_paise INTEGER NOT NULL DEFAULT 0,
        line_total_paise INTEGER NOT NULL,
        hsn_code TEXT,
        created_item_id TEXT
      );

      CREATE TABLE IF NOT EXISTS supplier_metal_payments (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        payment_date TEXT NOT NULL,
        metal_weight_mg INTEGER NOT NULL DEFAULT 0,
        metal_purity_pct REAL NOT NULL DEFAULT 0,
        metal_fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        metal_rate_paise_per_gram INTEGER NOT NULL DEFAULT 0,
        metal_value_paise INTEGER NOT NULL DEFAULT 0,
        money_amount_paise INTEGER NOT NULL DEFAULT 0,
        money_mode TEXT,
        bank_account_id TEXT,
        total_value_paise INTEGER NOT NULL,
        linked_purchase_invoice_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS estimate_invoices (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        customer_id TEXT,
        estimate_number TEXT,
        estimate_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        metal_rate_paise_per_gram INTEGER NOT NULL,
        is_manual_rate INTEGER NOT NULL DEFAULT 0,
        making_charges_mode TEXT NOT NULL DEFAULT 'FLAT',
        making_charges_paise INTEGER NOT NULL DEFAULT 0,
        net_payable_paise INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        converted_invoice_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS estimate_items (
        id TEXT PRIMARY KEY NOT NULL,
        estimate_id TEXT NOT NULL,
        stock_lot_id TEXT NOT NULL,
        sku TEXT,
        item_name TEXT NOT NULL,
        metal TEXT NOT NULL,
        purity_pct REAL NOT NULL,
        gross_weight_mg INTEGER,
        stone_weight_mg INTEGER DEFAULT 0,
        net_weight_mg INTEGER,
        fine_weight_mg INTEGER,
        hsn_code TEXT,
        metal_value_paise INTEGER NOT NULL DEFAULT 0,
        making_charges_paise INTEGER NOT NULL DEFAULT 0,
        line_total_paise INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS loose_stock_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        design_id TEXT NOT NULL,
        purity_percent REAL NOT NULL,
        purity_karat REAL NOT NULL,
        metal TEXT NOT NULL,
        piece_count INTEGER NOT NULL,
        total_weight_mg INTEGER NOT NULL,
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
        severity TEXT NOT NULL DEFAULT 'INFO',
        performed_by TEXT,
        reason TEXT,
        quantity INTEGER,
        weight_mg INTEGER,
        piece_count_delta INTEGER NOT NULL DEFAULT 0,
        weight_mg_delta INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        wastage_percent REAL,
        sale_invoice_id TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sequence_counters (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        month TEXT NOT NULL,
        year TEXT NOT NULL,
        current_seq INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS migration_log (
        id TEXT PRIMARY KEY NOT NULL,
        step_key TEXT NOT NULL UNIQUE,
        description TEXT,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hsn_codes (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        chapter TEXT NOT NULL DEFAULT '71',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO hsn_codes (id, code, description, chapter, is_active, created_at)
      VALUES ('hsn-7113', '7113', 'Articles of jewellery and parts thereof', '71', 1, '2026-01-01');
    `);
  });

  // ---------------------------------------------------------------------------
  // T22: searchCustomers() firm isolation, soft delete, length guard
  // ---------------------------------------------------------------------------
  test('T22: searchCustomers() firm isolation: firm A != firm B, is_deleted=1 excluded, query < 2 chars throws CUSTOMER_SEARCH_QUERY_TOO_SHORT', async () => {
    const firmA = 'firm-T22-A';
    const firmB = 'firm-T22-B';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmA, 'Firm 22A', 'F22A', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmB, 'Firm 22B', 'F22B', '2026-01-01', '2026-01-01');

    sqlite.prepare('INSERT INTO customers (id, firm_id, name, mobile, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('c1-A', firmA, 'Rohan Verma', '9876543210', 0, '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT INTO customers (id, firm_id, name, mobile, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('c2-A-del', firmA, 'Rohan Sharma', '9876543211', 1, '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT INTO customers (id, firm_id, name, mobile, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('c3-B', firmB, 'Rohan Gupta', '9876543212', 0, '2026-01-01', '2026-01-01');

    // Query < 2 chars throws error
    await expect(customerService.searchCustomers(firmA, 'R')).rejects.toThrow(ERR.CUSTOMER_SEARCH_QUERY_TOO_SHORT);
    await expect(customerService.searchCustomers(firmA, ' ')).rejects.toThrow(ERR.CUSTOMER_SEARCH_QUERY_TOO_SHORT);

    // Firm A search returns only active Rohan Verma
    const resA = await customerService.searchCustomers(firmA, 'Rohan');
    expect(resA.length).toBe(1);
    expect(resA[0].id).toBe('c1-A');
    expect(resA[0].name).toBe('Rohan Verma');

    // Firm B search returns only Rohan Gupta
    const resB = await customerService.searchCustomers(firmB, 'Rohan');
    expect(resB.length).toBe(1);
    expect(resB[0].id).toBe('c3-B');

    // Mobile search match
    const resMobile = await customerService.searchCustomers(firmA, '43210');
    expect(resMobile.length).toBe(1);
    expect(resMobile[0].id).toBe('c1-A');
  });

  // ---------------------------------------------------------------------------
  // T23: searchSuppliers() firm isolation, soft delete, length guard
  // ---------------------------------------------------------------------------
  test('T23: searchSuppliers() firm isolation: firm A != firm B, is_deleted=1 excluded, query < 2 chars throws SUPPLIER_SEARCH_QUERY_TOO_SHORT', async () => {
    const firmA = 'firm-T23-A';
    const firmB = 'firm-T23-B';

    sqlite.prepare('INSERT INTO suppliers (id, firm_id, name, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s1-A', firmA, 'Apex Bullion', 0, '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT INTO suppliers (id, firm_id, name, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s2-A-del', firmA, 'Apex Refinery', 1, '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT INTO suppliers (id, firm_id, name, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s3-B', firmB, 'Apex Jewels', 0, '2026-01-01', '2026-01-01');

    await expect(supplierService.searchSuppliers(firmA, 'A')).rejects.toThrow(ERR.SUPPLIER_SEARCH_QUERY_TOO_SHORT);

    const resA = await supplierService.searchSuppliers(firmA, 'Apex');
    expect(resA.length).toBe(1);
    expect(resA[0].id).toBe('s1-A');

    const resB = await supplierService.searchSuppliers(firmB, 'Apex');
    expect(resB.length).toBe(1);
    expect(resB[0].id).toBe('s3-B');
  });

  // ---------------------------------------------------------------------------
  // T24: Item selection call-site: searchItems() -> addItemToDraft() & race condition
  // ---------------------------------------------------------------------------
  test('T24: Item selection call-site: searchItems() -> addItemToDraft() happy path; item sold between search & add -> ITEM_NOT_AVAILABLE', async () => {
    const firmId = 'firm-T24';
    const customerId = 'cust-T24';
    const draftId = 'draft-T24';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 24', 'F24', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T24', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'Customer 24', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO categories (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cat-T24', firmId, 'Ring Cat', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO designs (id, firm_id, category_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('des-T24', firmId, 'cat-T24', 'Gold Ring Des', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, gross_weight_mg, net_weight_mg, fine_weight_mg, status, entry_date, created_at, updated_at)
      VALUES 
        ('item-T24-avail', ?, 'des-T24', 'cat-T24', 'SKU-T24-1', 'BAR-T24-1', 'GOLD', 91.6, 5000, 5000, 4580, 'AVAILABLE', '2026-04-15', '2026-04-15', '2026-04-15'),
        ('item-T24-sold', ?, 'des-T24', 'cat-T24', 'SKU-T24-2', 'BAR-T24-2', 'GOLD', 91.6, 6000, 6000, 5496, 'SOLD', '2026-04-15', '2026-04-15', '2026-04-15')
    `).run(firmId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_date, status, metal_rate_paise_per_gram, created_at)
      VALUES (?, ?, 'fy-T24', ?, '2026-04-15', 'DRAFT', 600000, '2026-04-15')
    `).run(draftId, firmId, customerId);

    // Adding AVAILABLE item succeeds
    const lineItem = await draftInvoiceService.addItemToDraft({
      invoiceId: draftId,
      stockLotId: 'item-T24-avail',
      makingChargesPaise: 50000,
    });
    expect(lineItem).toBeDefined();
    expect(lineItem.stockLotId).toBe('item-T24-avail');

    // Adding item that became SOLD throws ITEM_NOT_AVAILABLE
    await expect(
      draftInvoiceService.addItemToDraft({
        invoiceId: draftId,
        stockLotId: 'item-T24-sold',
        makingChargesPaise: 50000,
      })
    ).rejects.toThrow(ERR.ITEM_NOT_AVAILABLE);
  });

  // ---------------------------------------------------------------------------
  // T25: Cross-FY backdated entry tests (active, closed, purchase, payment)
  // ---------------------------------------------------------------------------
  test('T25: Cross-FY backdated entry tests: active FY backdate succeeds, closed FY backdate throws ENTRY_DATE_IN_CLOSED_FY', async () => {
    const firmId = 'firm-T25';
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 25', 'F25', '2024-01-01', '2024-01-01');

    // FY 24-25 is CLOSED
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('fy-24-25', firmId, '2024-25', '2024-04-01', '2025-03-31', 'CLOSED', '2024-04-01', '2025-04-01');
    // FY 25-26 is ACTIVE
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-25-26', firmId, '2025-26', '2025-04-01', '2026-03-31', 'ACTIVE', '2025-04-01');

    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cust-T25', firmId, 'Customer 25', '2024-04-01', '2024-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('supp-T25', firmId, 'Supplier 25', '2024-04-01', '2024-04-01');

    // (a) Payment in CLOSED FY throws ENTRY_DATE_IN_CLOSED_FY
    await expect(
      paymentService.recordPayment({
        firmId,
        partyId: 'cust-T25',
        partyType: 'CUSTOMER',
        type: 'MONEY_IN',
        mode: 'CASH',
        amountPaise: 10000,
        paymentDate: '2024-10-15', // In closed FY
      })
    ).rejects.toThrow(ERR.ENTRY_DATE_IN_CLOSED_FY);

    // (b) Payment backdated in ACTIVE FY succeeds
    const { payment } = await paymentService.recordPayment({
      firmId,
      partyId: 'cust-T25',
      partyType: 'CUSTOMER',
      type: 'MONEY_IN',
      mode: 'CASH',
      amountPaise: 15000,
      paymentDate: '2025-06-15', // In active FY
    });
    expect(payment.fyId).toBe('fy-25-26');

    // (c) Purchase Invoice in CLOSED FY throws ENTRY_DATE_IN_CLOSED_FY
    await expect(
      purchaseInvoiceService.postPurchaseInvoice({
        firmId,
        supplierId: 'supp-T25',
        supplierInvoiceDate: '2024-11-20', // In closed FY
        taxableAmountPaise: 100000,
        items: [{ itemDescription: 'Silver Bar', taxableAmountPaise: 100000, lineTotalPaise: 100000 }],
      })
    ).rejects.toThrow(ERR.ENTRY_DATE_IN_CLOSED_FY);
  });

  // ---------------------------------------------------------------------------
  // T26: Old metal customerId propagation
  // ---------------------------------------------------------------------------
  test('T26: Old metal customerId propagation: createOldMetalInSale() stores customerId; null customerId for walk-in', async () => {
    const firmId = 'firm-T26';
    const tx = db;

    const lotWithCust = createOldMetalInSale(tx, {
      firmId,
      customerId: 'cust-T26-known',
      metal: 'GOLD',
      grossWeightMg: 5000,
      purityPct: 91.6,
      valuePaise: 300000,
    });
    expect(lotWithCust.customerId).toBe('cust-T26-known');

    const lotWalkIn = createOldMetalInSale(tx, {
      firmId,
      customerId: null,
      metal: 'GOLD',
      grossWeightMg: 4000,
      purityPct: 75.0,
      valuePaise: 200000,
    });
    expect(lotWalkIn.customerId).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // T42: Old metal type + purity-rounding parity
  // ---------------------------------------------------------------------------
  test('T42: Old metal type + purity-rounding parity: SILVER succeeds, invalid metal throws, 99.9 purity parity', async () => {
    const firmId = 'firm-T42';
    const tx = db;

    // SILVER succeeds
    const silverLot = createOldMetalInSale(tx, {
      firmId,
      metal: 'SILVER',
      grossWeightMg: 10000,
      purityPct: 99.9,
      valuePaise: 80000,
    });
    expect(silverLot.metal).toBe('SILVER');

    // Invalid metal throws OLD_METAL_TYPE_INVALID
    expect(() => {
      createOldMetalInSale(tx, {
        firmId,
        metal: 'PLATINUM' as any,
        grossWeightMg: 5000,
        purityPct: 95.0,
      });
    }).toThrow(ERR.OLD_METAL_TYPE_INVALID);

    // Purity rounding parity via resolveFineWeightMg
    const gold999 = resolveFineWeightMg(10000, 99.9, 'GOLD');
    expect(gold999.fineWeightMg).toBe(10000);
    expect(gold999.purityRoundingDeltaMg).toBe(10);

    const silver999 = resolveFineWeightMg(10000, 99.9, 'SILVER');
    expect(silver999.fineWeightMg).toBe(10000);
    expect(silver999.purityRoundingDeltaMg).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // T27: Phantom billing happy path
  // ---------------------------------------------------------------------------
  test('T27: Phantom billing happy path: createPhantomItem() -> PHANTOM_AVAILABLE; postInvoice() -> PHANTOM_SOLD', async () => {
    const firmId = 'firm-T27';
    const customerId = 'cust-T27';
    const draftId = 'draft-T27';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 27', 'F27', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T27', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'Customer 27', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO categories (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cat-T27', firmId, 'Ring Cat', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO designs (id, firm_id, category_id, name, metal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('des-T27', firmId, 'cat-T27', 'Gold Ring', 'GOLD', '2026-01-01', '2026-01-01');

    const phantom = await createPhantomItem(
      {
        designId: 'des-T27',
        categoryId: 'cat-T27',
        grossWeightMg: 5000,
        purityPercent: 91.6,
        hsnCode: '7113',
      },
      firmId
    );
    expect(phantom.status).toBe('PHANTOM_AVAILABLE');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_date, status, metal_rate_paise_per_gram, created_at)
      VALUES (?, ?, 'fy-T27', ?, '2026-04-15', 'DRAFT', 600000, '2026-04-15')
    `).run(draftId, firmId, customerId);

    await draftInvoiceService.addItemToDraft({
      invoiceId: draftId,
      stockLotId: phantom.id,
      makingChargesPaise: 20000,
    });

    const posted = await invoicePostService.postInvoice({
      firmId,
      draftInvoiceId: draftId,
    });
    expect(posted.status).toBe('POSTED');

    const itemAfter = sqlite.prepare('SELECT status FROM items WHERE id = ?').get(phantom.id);
    expect(itemAfter.status).toBe('PHANTOM_SOLD');
  });

  // ---------------------------------------------------------------------------
  // T28: Phantom return via credit note: PHANTOM_SOLD -> PHANTOM_AVAILABLE (NOT RETURNED)
  // ---------------------------------------------------------------------------
  test('T28: Phantom return via credit note: transitions PHANTOM_SOLD -> PHANTOM_AVAILABLE (NOT RETURNED)', async () => {
    const firmId = 'firm-T28';
    const saleInvoiceId = 'inv-T28';
    const phantomId = 'phantom-T28';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 28', 'F28', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T28', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cust-T28', firmId, 'Customer 28', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, gross_weight_mg, net_weight_mg, fine_weight_mg, status, is_phantom, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-dummy', 'cat-dummy', 'SKU-T28', 'BAR-T28', 'GOLD', 91.6, 5000, 5000, 4580, 'PHANTOM_SOLD', 1, '2026-04-15', '2026-04-15', '2026-04-15')
    `).run(phantomId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, net_payable_paise, created_at)
      VALUES (?, ?, 'fy-T28', 'cust-T28', 'VJ/26-27/0028', '2026-04-15', 'POSTED', 600000, 300000, 300000, '2026-04-15')
    `).run(saleInvoiceId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, gross_weight_mg, net_weight_mg, fine_weight_mg, line_total_paise)
      VALUES ('sii-T28', ?, ?, 'SERIALIZED_ITEM', 'Phantom Ring', 'GOLD', 91.6, 5000, 5000, 4580, 300000)
    `).run(saleInvoiceId, phantomId);

    await creditNoteService.createCreditNote({
      firmId,
      originalInvoiceId: saleInvoiceId,
      returnedItemIds: ['sii-T28'],
      reason: 'Return phantom item',
    });

    const itemAfter = sqlite.prepare('SELECT status FROM items WHERE id = ?').get(phantomId);
    expect(itemAfter.status).toBe('PHANTOM_AVAILABLE');
  });

  // ---------------------------------------------------------------------------
  // T29: Phantom race condition guards
  // ---------------------------------------------------------------------------
  test('T29: Phantom race condition guards: reconcile before sold throws error, already reconciled item cannot reconcile', async () => {
    const firmId = 'firm-T29';
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 29', 'F29', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, gross_weight_mg, net_weight_mg, fine_weight_mg, status, is_phantom, entry_date, created_at, updated_at)
      VALUES 
        ('phantom-unsold', ?, 'd', 'c', 'SKU-P-UNSOLD', 'BAR-P-1', 'GOLD', 91.6, 5000, 5000, 4580, 'PHANTOM_AVAILABLE', 1, '2026-04-15', '2026-04-15', '2026-04-15'),
        ('physical-1', ?, 'd', 'c', 'SKU-PHYS-1', 'BAR-PH-1', 'GOLD', 91.6, 5000, 5000, 4580, 'AVAILABLE', 0, '2026-04-15', '2026-04-15', '2026-04-15')
    `).run(firmId, firmId);

    // Attempting to reconcile a phantom item that was NOT sold yet throws error
    await expect(
      reconcilePhantomItem(firmId, 'phantom-unsold', 'physical-1')
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // T30: Supplier payment modes (Step 11A)
  // ---------------------------------------------------------------------------
  test('T30: Supplier payment modes: MONEY ONLY, METAL ONLY, MIXED, and error validations', async () => {
    const firmId = 'firm-T30';
    const supplierId = 'supp-T30';
    const bankId = 'bank-T30';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 30', 'F30', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T30', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(supplierId, firmId, 'Supplier 30', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO bank_accounts (id, firm_id, bank_name, account_holder, account_number, ifsc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(bankId, firmId, 'HDFC Bank', 'Bullion Store', '123456789', 'HDFC0001234', '2026-01-01');

    // (a) Nothing to pay throws SUPPLIER_PAYMENT_NOTHING_TO_PAY
    await expect(
      supplierPaymentService.recordSupplierPayment({
        firmId,
        supplierId,
        paymentDate: '2026-04-15',
        moneyAmountPaise: 0,
        metalWeightMg: 0,
      })
    ).rejects.toThrow(ERR.SUPPLIER_PAYMENT_NOTHING_TO_PAY);

    // (b) Invalid purity on metal throws SUPPLIER_METAL_PAYMENT_INVALID
    await expect(
      supplierPaymentService.recordSupplierPayment({
        firmId,
        supplierId,
        paymentDate: '2026-04-15',
        metalWeightMg: 10000,
        metalPurityPct: 0,
        metalRatePaisePerGram: 600000,
      })
    ).rejects.toThrow(ERR.SUPPLIER_METAL_PAYMENT_INVALID);

    // (c) MONEY ONLY (BANK)
    const { payment: moneyPay } = await supplierPaymentService.recordSupplierPayment({
      firmId,
      supplierId,
      paymentDate: '2026-04-15',
      moneyAmountPaise: 50000,
      moneyMode: 'BANK',
      bankAccountId: bankId,
    });
    expect(moneyPay.moneyAmountPaise).toBe(50000);
    expect(moneyPay.metalWeightMg).toBe(0);
    expect(moneyPay.totalValuePaise).toBe(50000);

    // (d) METAL ONLY
    const { payment: metalPay } = await supplierPaymentService.recordSupplierPayment({
      firmId,
      supplierId,
      paymentDate: '2026-04-15',
      metalWeightMg: 10000,
      metalPurityPct: 99.5,
      metalRatePaisePerGram: 600000,
    });
    expect(metalPay.metalWeightMg).toBe(10000);
    expect(metalPay.moneyAmountPaise).toBe(0);
    expect(metalPay.totalValuePaise).toBe(5970000);

    // (e) MIXED
    const { payment: mixedPay } = await supplierPaymentService.recordSupplierPayment({
      firmId,
      supplierId,
      paymentDate: '2026-04-15',
      metalWeightMg: 10000,
      metalPurityPct: 99.5,
      metalRatePaisePerGram: 600000,
      moneyAmountPaise: 50000,
      moneyMode: 'CASH',
    });
    expect(mixedPay.totalValuePaise).toBe(6020000);
    expect(mixedPay.moneyAmountPaise).toBe(50000);
    expect(mixedPay.metalWeightMg).toBe(10000);
  });

  // ---------------------------------------------------------------------------
  // T31: Karigar mixed payment / settlement
  // ---------------------------------------------------------------------------
  test('T31: Karigar payment: payLabourToKarigar() reduces money balance, settlement reduces metal balance', async () => {
    const firmId = 'firm-T31';
    const karigarId = 'karigar-T31';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 31', 'F31', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T31', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Master Karigar 31', '2026-01-01', '2026-01-01');

    // Labour accrual 50,000 paise (payable to karigar)
    sqlite.prepare(`
      INSERT INTO karigar_ledger (id, firm_id, fy_id, karigar_id, type, amount_paise, created_at)
      VALUES ('kl-31-1', ?, 'fy-T31', ?, 'LABOUR_PAYABLE', 50000, '2026-04-10')
    `).run(firmId, karigarId);

    const balBefore = await karigarMasterService.getKarigarBalances(firmId, karigarId);
    expect(balBefore.moneyBalancePaise).toBe(50000);

    // Pay labour 20,000 paise
    await karigarMasterService.payLabourToKarigar({
      firmId,
      karigarId,
      amountPaise: 20000,
      paymentMode: 'CASH',
      paymentDate: '2026-04-15',
    });

    const balAfter = await karigarMasterService.getKarigarBalances(firmId, karigarId);
    expect(balAfter.moneyBalancePaise).toBe(30000);
  });

  // ---------------------------------------------------------------------------
  // T32: Payment bill-linkage verification
  // ---------------------------------------------------------------------------
  test('T32: Payment bill-linkage: linkedInvoiceId verified, customer mismatch throws PAYMENT_INVOICE_MISMATCH', async () => {
    const firmId = 'firm-T32';
    const saleInvoiceId = 'inv-T32';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 32', 'F32', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T32', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cust-T32-real', firmId, 'Real Customer', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cust-T32-fake', firmId, 'Fake Customer', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, net_payable_paise, created_at)
      VALUES (?, ?, 'fy-T32', 'cust-T32-real', 'VJ/26-27/0032', '2026-04-15', 'POSTED', 600000, 100000, '2026-04-15')
    `).run(saleInvoiceId, firmId);

    // Mismatched customer throws PAYMENT_INVOICE_MISMATCH
    await expect(
      paymentService.recordPayment({
        firmId,
        partyId: 'cust-T32-fake',
        partyType: 'CUSTOMER',
        type: 'MONEY_IN',
        mode: 'CASH',
        amountPaise: 20000,
        paymentDate: '2026-04-15',
        linkedInvoiceId: saleInvoiceId,
      })
    ).rejects.toThrow(ERR.PAYMENT_INVOICE_MISMATCH);

    // Correct customer succeeds
    const { payment } = await paymentService.recordPayment({
      firmId,
      partyId: 'cust-T32-real',
      partyType: 'CUSTOMER',
      type: 'MONEY_IN',
      mode: 'CASH',
      amountPaise: 20000,
      paymentDate: '2026-04-15',
      linkedInvoiceId: saleInvoiceId,
    });
    expect(payment.linkedInvoiceId).toBe(saleInvoiceId);
  });

  // ---------------------------------------------------------------------------
  // T33: Invoice print settings
  // ---------------------------------------------------------------------------
  test('T33: Invoice print settings: default A5 landscape, save A4 portrait, accounting data completely untouched', async () => {
    const firmId = 'firm-T33';
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 33', 'F33', '2026-01-01', '2026-01-01');

    const def = await invoicePrintSettingsService.getPrintSettings(firmId);
    expect(def.paperSize).toBe('A5');
    expect(def.orientation).toBe('LANDSCAPE');

    const saved = await invoicePrintSettingsService.savePrintSettings(
      {
        paperSize: 'A4',
        orientation: 'PORTRAIT',
        showTermsAndConditions: false,
      },
      firmId
    );
    expect(saved.paperSize).toBe('A4');
    expect(saved.orientation).toBe('PORTRAIT');
  });

  // ---------------------------------------------------------------------------
  // T34: Terms & Conditions toggle guard
  // ---------------------------------------------------------------------------
  test('T34: Terms & Conditions toggle: toggle ON with text succeeds, empty text forces false, OFF preserves text', async () => {
    const firmId = 'firm-T34';
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 34', 'F34', '2026-01-01', '2026-01-01');

    // Toggle ON with text
    const onSettings = await invoicePrintSettingsService.savePrintSettings(
      {
        paperSize: 'A5',
        orientation: 'LANDSCAPE',
        showTermsAndConditions: true,
        termsAndConditionsText: 'All sales are final subject to hallmarking rules.',
      },
      firmId
    );
    expect(onSettings.showTermsAndConditions).toBe(true);

    // Toggle ON with empty text forces false
    const emptySettings = await invoicePrintSettingsService.savePrintSettings(
      {
        paperSize: 'A5',
        orientation: 'LANDSCAPE',
        showTermsAndConditions: true,
        termsAndConditionsText: '   ',
      },
      firmId
    );
    expect(emptySettings.showTermsAndConditions).toBe(false);

    // Toggle OFF preserves previously saved text
    const offSettings = await invoicePrintSettingsService.savePrintSettings(
      {
        paperSize: 'A5',
        orientation: 'LANDSCAPE',
        showTermsAndConditions: false,
        termsAndConditionsText: 'Saved terms text',
      },
      firmId
    );
    expect(offSettings.showTermsAndConditions).toBe(false);
    expect(offSettings.termsAndConditionsText).toBe('Saved terms text');
  });

  // ---------------------------------------------------------------------------
  // T35: Estimates lifecycle (DRAFT -> SAVED -> CONVERTED, expiry, sold block)
  // ---------------------------------------------------------------------------
  test('T35: Estimates lifecycle: DRAFT -> SAVED allocates estimateNumber, CONVERTED sets convertedInvoiceId, expired throws ESTIMATE_EXPIRED', async () => {
    const firmId = 'firm-T35';
    const customerId = 'cust-T35';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 35', 'F35', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T35', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'Customer 35', '2026-01-01', '2026-01-01');
    sqlite.prepare(`
      INSERT OR IGNORE INTO rate_engine_config (id, firm_id, gold_24_base_per_10g_paise, gold_22_base_per_10g_paise, gold_cash_per_10g_paise, silver_cash_per_kg_paise, last_updated_at)
      VALUES (?, ?, 6000000, 5500000, 6000000, 75000000, '2026-04-01')
    `).run(`${firmId}_rate_config`, firmId);

    sqlite.prepare(`
      INSERT INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, gross_weight_mg, net_weight_mg, fine_weight_mg, status, entry_date, created_at, updated_at)
      VALUES ('item-T35', ?, 'd', 'c', 'SKU-T35', 'BAR-T35', 'GOLD', 91.6, 5000, 5000, 4580, 'AVAILABLE', '2026-04-01', '2026-04-01', '2026-04-01')
    `).run(firmId);

    // Create DRAFT estimate
    const draftEst = await estimateService.createDraftEstimate({
      firmId,
      customerId,
      metalRatePaisePerGram: 600000,
      estimateDate: '2026-04-01',
    });
    expect(draftEst.status).toBe('DRAFT');

    // Add item
    await estimateService.addItemToEstimate({
      estimateId: draftEst.id,
      stockLotId: 'item-T35',
      makingChargesPaise: 0,
    });

    // Save estimate -> allocates estimateNumber
    const savedEst = await estimateService.saveEstimate(draftEst.id, firmId);
    expect(savedEst.status).toBe('SAVED');
    expect(savedEst.estimateNumber).toBeDefined();

    // 7-day expiry test: conversion with entryDate 10 days later throws ESTIMATE_EXPIRED
    await expect(
      estimateService.convertEstimate({
        firmId,
        estimateId: savedEst.id,
        entryDate: '2026-04-20', // 19 days after 2026-04-01
      })
    ).rejects.toThrow(ERR.ESTIMATE_EXPIRED);

    // Conversion within 7 days succeeds
    const convResult = await estimateService.convertEstimate({
      firmId,
      estimateId: savedEst.id,
      entryDate: '2026-04-05',
    });
    expect(convResult.draftInvoice).toBeDefined();
    const estAfter = sqlite.prepare('SELECT status, converted_invoice_id FROM estimate_invoices WHERE id = ?').get(savedEst.id);
    expect(estAfter.status).toBe('CONVERTED');
    expect(estAfter.converted_invoice_id).toBe(convResult.draftInvoice.id);
  });

  // ---------------------------------------------------------------------------
  // T36: purchase_invoice_items 2-line post & atomic rollback
  // ---------------------------------------------------------------------------
  test('T36: purchase_invoice_items: 2 line items posted, all rows exist, failure rolls back atomically', async () => {
    const firmId = 'firm-T36';
    const supplierId = 'supp-T36';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 36', 'F36', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T36', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(supplierId, firmId, 'Supplier 36', '2026-01-01', '2026-01-01');

    const posted = await purchaseInvoiceService.postPurchaseInvoice({
      firmId,
      supplierId,
      supplierInvoiceDate: '2026-04-15',
      taxableAmountPaise: 300000,
      items: [
        { itemDescription: 'Gold Raw 24K', taxableAmountPaise: 200000, lineTotalPaise: 200000 },
        { itemDescription: 'Silver Ingot', taxableAmountPaise: 100000, lineTotalPaise: 100000 },
      ],
    });

    const items = sqlite.prepare('SELECT * FROM purchase_invoice_items WHERE invoice_id = ?').all(posted.invoice.id);
    expect(items.length).toBe(2);

    // Rollback test: invalid supplier throws and inserts zero rows
    const beforeCount = sqlite.prepare('SELECT count(*) as count FROM purchase_invoices WHERE firm_id = ?').get(firmId).count;
    await expect(
      purchaseInvoiceService.postPurchaseInvoice({
        firmId,
        supplierId: 'non-existent',
        supplierInvoiceDate: '2026-04-15',
        taxableAmountPaise: 100000,
        items: [{ itemDescription: 'Rollback item', taxableAmountPaise: 100000, lineTotalPaise: 100000 }],
      })
    ).rejects.toThrow();

    const afterCount = sqlite.prepare('SELECT count(*) as count FROM purchase_invoices WHERE firm_id = ?').get(firmId).count;
    expect(afterCount).toBe(beforeCount);
  });

  // ---------------------------------------------------------------------------
  // T37: FEAT-PURCHASE-AUTOSTOCK-1 auto stock item creation
  // ---------------------------------------------------------------------------
  test('T37: FEAT-PURCHASE-AUTOSTOCK-1: stock line creates items row with status DRAFT, backlinks createdItemId; incomplete line throws', async () => {
    const firmId = 'firm-T37';
    const supplierId = 'supp-T37';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 37', 'F37', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T37', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(supplierId, firmId, 'Supplier 37', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO categories (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cat-T37', firmId, 'Chain Cat', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO designs (id, firm_id, category_id, name, metal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('des-T37', firmId, 'cat-T37', 'Gold Chain', 'GOLD', '2026-01-01', '2026-01-01');

    // Incomplete stock line (designId without categoryId) throws PURCHASE_STOCK_LINE_INCOMPLETE
    await expect(
      purchaseInvoiceService.postPurchaseInvoice({
        firmId,
        supplierId,
        supplierInvoiceDate: '2026-04-15',
        taxableAmountPaise: 100000,
        items: [
          {
            itemDescription: 'Incomplete line',
            designId: 'des-T37',
            taxableAmountPaise: 100000,
            lineTotalPaise: 100000,
          },
        ],
      })
    ).rejects.toThrow(ERR.PURCHASE_STOCK_LINE_INCOMPLETE);

    // Complete stock line auto-creates items row in status DRAFT
    const posted = await purchaseInvoiceService.postPurchaseInvoice({
      firmId,
      supplierId,
      supplierInvoiceDate: '2026-04-15',
      taxableAmountPaise: 250000,
      items: [
        {
          itemDescription: 'Gold Chain 22K',
          designId: 'des-T37',
          categoryId: 'cat-T37',
          grossWeightMg: 10000,
          purityPct: 91.6,
          ratePerGramPaise: 600000,
          taxableAmountPaise: 250000,
          lineTotalPaise: 250000,
        },
      ],
    });

    const createdItemIds = posted.createdStockItemIds;
    expect(createdItemIds.length).toBe(1);
    const createdItem = sqlite.prepare('SELECT * FROM items WHERE id = ?').get(createdItemIds[0]);
    expect(createdItem).toBeDefined();
    expect(createdItem.status).toBe('DRAFT');
    expect(createdItem.purchase_invoice_id).toBe(posted.invoice.id);
  });

  // ---------------------------------------------------------------------------
  // T37b: taxGroupStore TTL cache & invalidation
  // ---------------------------------------------------------------------------
  test('T37b: taxGroupStore TTL cache: fresh before TTL, stale after TTL, invalidate clears cache', async () => {
    const firmId = 'firm-T37b';

    taxGroupStore.getState().setGroups(firmId, [
      { id: 'tg-1', firmId, groupName: 'GST 3%', isActive: 1, rates: [] } as any,
    ]);

    expect(taxGroupStore.getState().isFresh(firmId)).toBe(true);

    // Different firm is not fresh
    expect(taxGroupStore.getState().isFresh('other-firm')).toBe(false);

    // Invalidation
    taxGroupStore.getState().invalidate();
    expect(taxGroupStore.getState().groups).toBeNull();
    expect(taxGroupStore.getState().isFresh(firmId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // T38: metal/making tax group snapshot & TAX_GROUP_IN_USE guard
  // ---------------------------------------------------------------------------
  test('T38: Tax group snapshot & TAX_GROUP_IN_USE: deactivating referenced tax group throws TAX_GROUP_IN_USE', async () => {
    const firmId = 'firm-T38';
    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 38', 'F38', '2026-01-01', '2026-01-01');

    await taxMasterService.seedDefaults(firmId);
    const groups = await taxMasterService.getActiveTaxGroups(firmId);
    const g3 = groups.find((g) => g.groupName === 'GST 3%')!;

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, item_name, metal, purity_pct, metal_tax_group_id, line_total_paise)
      VALUES ('sii-T38', 'inv-T38', 'item-T38', 'Ring', 'GOLD', 91.6, ?, 100000)
    `).run(g3.id);

    // Deactivating referenced tax group throws TAX_GROUP_IN_USE
    await expect(
      taxMasterService.deactivateTaxGroup(g3.id, firmId)
    ).rejects.toThrow(ERR.TAX_GROUP_IN_USE);
  });

  // ---------------------------------------------------------------------------
  // T39: item_events.karigarId backfill & idempotency
  // ---------------------------------------------------------------------------
  test('T39: item_events.karigarId backfill: resolvable karigar backfilled, unresolvable preserved as null, idempotent', async () => {
    const firmId = 'firm-T39';
    const karigarId = 'karigar-T39';

    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Ramesh Goldsmith', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO item_events (id, item_id, firm_id, karigar_id, event_type, timestamp)
      VALUES 
        ('ie-resolvable', 'item-1', ?, NULL, 'ITEM_SENT_TO_KARIGAR', '2026-04-01'),
        ('ie-unresolvable', 'item-2', ?, NULL, 'ITEM_SENT_TO_KARIGAR', '2026-04-01')
    `).run(firmId, firmId);

    sqlite.prepare(`
      INSERT INTO audit_logs (id, firm_id, entity_id, event_type, device_id, payload, created_at)
      VALUES 
        ('al-1', ?, 'item-1', 'ITEM_SENT_TO_KARIGAR', 'DEV', '{"karigarName":"Ramesh Goldsmith"}', '2026-04-01'),
        ('al-2', ?, 'item-2', 'ITEM_SENT_TO_KARIGAR', 'DEV', '{"karigarName":"Unknown Nonexistent"}', '2026-04-01')
    `).run(firmId, firmId);

    // Run backfill
    stepMMigrationService.runStep1eKarigarBackfill();

    const ev1 = sqlite.prepare('SELECT karigar_id FROM item_events WHERE id = ?').get('ie-resolvable');
    expect(ev1.karigar_id).toBe(karigarId);

    const ev2 = sqlite.prepare('SELECT karigar_id FROM item_events WHERE id = ?').get('ie-unresolvable');
    expect(ev2.karigar_id).toBeNull();

    // Idempotency: second run executes safely
    expect(() => stepMMigrationService.runStep1eKarigarBackfill()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // T40: Loose-lot sale end-to-end: stock decrement & event logging
  // ---------------------------------------------------------------------------
  test('T40: Loose-lot sale end-to-end: postInvoice decrements loose_stock_lots pieceCount and weight, logs STOCK_SOLD', async () => {
    const firmId = 'firm-T40';
    const draftId = 'draft-T40';
    const lotId = 'lot-T40';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Firm 40', 'F40', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T40', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('cust-T40', firmId, 'Customer 40', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO loose_stock_lots (id, firm_id, design_id, purity_percent, purity_karat, metal, piece_count, total_weight_mg, hsn_code, status, created_at, updated_at)
      VALUES (?, ?, 'des-T40', 91.6, 22.0, 'GOLD', 10, 50000, '7113', 'ACTIVE', '2026-04-01', '2026-04-01')
    `).run(lotId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_date, status, metal_rate_paise_per_gram, created_at)
      VALUES (?, ?, 'fy-T40', 'cust-T40', '2026-04-15', 'DRAFT', 600000, '2026-04-15')
    `).run(draftId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, qty_sold, weight_sold_mg, metal_value_paise, line_total_paise)
      VALUES ('sii-T40', ?, ?, 'LOOSE_LOT', 'Loose Gold Chains', 'GOLD', 91.6, 3, 15000, 900000, 900000)
    `).run(draftId, lotId);

    const posted = await invoicePostService.postInvoice({
      firmId,
      draftInvoiceId: draftId,
    });
    expect(posted.status).toBe('POSTED');

    const lotAfter = sqlite.prepare('SELECT piece_count, total_weight_mg, status FROM loose_stock_lots WHERE id = ?').get(lotId);
    expect(lotAfter.piece_count).toBe(7); // 10 - 3
    expect(lotAfter.total_weight_mg).toBe(35000); // 50000 - 15000
    expect(lotAfter.status).toBe('ACTIVE');

    const event = sqlite.prepare('SELECT * FROM loose_stock_events WHERE lot_id = ?').get(lotId);
    expect(event).toBeDefined();
    expect(event.event_type).toBe('STOCK_SOLD');
  });

  // ---------------------------------------------------------------------------
  // T41: Loose-lot sale insufficient stock: exhaustion guards & full rollback
  // ---------------------------------------------------------------------------
  test('T41: Loose-lot sale exhaustion guards: selling more than available quantity or weight throws and rolls back', async () => {
    const firmId = 'firm-T41';
    const tx = db;

    sqlite.prepare(`
      INSERT INTO loose_stock_lots (id, firm_id, design_id, purity_percent, purity_karat, metal, piece_count, total_weight_mg, hsn_code, status, created_at, updated_at)
      VALUES ('lot-T41', ?, 'des-T41', 91.6, 22.0, 'GOLD', 2, 10000, '7113', 'ACTIVE', '2026-04-01', '2026-04-01')
    `).run(firmId);

    // Quantity exhaustion
    expect(() => {
      sellFromLooseLot(tx as any, 'lot-T41', firmId, 5, 5000, 'inv-fake');
    }).toThrow(ERR.LOOSE_LOT_INSUFFICIENT_QUANTITY);

    // Weight exhaustion
    expect(() => {
      sellFromLooseLot(tx as any, 'lot-T41', firmId, 1, 20000, 'inv-fake');
    }).toThrow(ERR.LOOSE_LOT_INSUFFICIENT_WEIGHT);

    // Lot state remains unchanged
    const lot = sqlite.prepare('SELECT piece_count, total_weight_mg FROM loose_stock_lots WHERE id = ?').get('lot-T41');
    expect(lot.piece_count).toBe(2);
    expect(lot.total_weight_mg).toBe(10000);
  });
});
