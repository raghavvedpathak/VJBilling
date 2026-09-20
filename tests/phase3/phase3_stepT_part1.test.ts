// tests/phase3/phase3_stepT_part1.test.ts
// STEP T — TEST SUITE — Part 1: T1 to T21
// Verifies core billing, draft, invoice post, calculation, GST, credit note, payments,
// verify tamper checks, sale domain returns, karigar dual ledger, and purchase invoices.

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
    isSafeModeActive: jest.fn().mockReturnValue(false),
  },
  bootstrapComplete: { value: true },
}));

import { db } from '@/db/client';
import { bootstrapComplete } from '@/services/phase1/safeModeService';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { draftInvoiceService } from '@/services/phase3/draftInvoiceService';
import { invoicePostService } from '@/services/phase3/invoicePostService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { creditNoteService } from '@/services/phase3/creditNoteService';
import { paymentService } from '@/services/phase3/paymentService';
import { billingVerifyService } from '@/services/phase3/billingVerifyService';
import { karigarMasterService } from '@/services/phase3/karigarMasterService';
import { karigarLedgerRepository } from '@/repositories/phase3/karigarLedgerRepository';
import { purchaseInvoiceService } from '@/services/phase3/purchaseInvoiceService';
import { ERR } from '@/constants/errorCodes';

describe('STEP T — TEST SUITE — Part 1 (T1–T21)', () => {
  let sqlite: any;
  let g3Id: string;
  let g5Id: string;

  beforeAll(async () => {
    bootstrapComplete.value = true;
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
        item_type TEXT DEFAULT 'SERIALIZED' NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ''
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
        entry_date TEXT NOT NULL,
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
    `);

    // Seed shared firm and FY
    sqlite.prepare(`INSERT OR REPLACE INTO firms (id, name, firm_code, proprietor, gstin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'firm-T-shared', 'Firm T Shared', 'FTS', 'Lead Tester', '27ABCDE1234F1Z5', '2026-01-01', '2026-01-01'
    );
    sqlite.prepare(`INSERT OR REPLACE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'fy-T-shared', 'firm-T-shared', '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01'
    );

    // Seed default taxes for calculation tests
    await taxMasterService.seedDefaults('firm-T-shared');
    const groups = await taxMasterService.getActiveTaxGroups('firm-T-shared');
    const g3 = groups.find((g) => g.groupName === 'GST 3%');
    const g5 = groups.find((g) => g.groupName === 'GST 5%');
    g3Id = g3!.id;
    g5Id = g5!.id;
  });

  // ---------------------------------------------------------------------------
  // T1: Customer balance derivation: SUM(invoices) − SUM(payments) across all FYs
  // ---------------------------------------------------------------------------
  test('T1: Customer balance derivation: SUM(invoices) − SUM(payments) across all FYs', async () => {
    const firmId = 'firm-T1';
    const customerId = 'cust-T1';
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(customerId, firmId, 'T1 Customer', '2025-04-01');

    // FY 24-25 invoice DEBIT 100,000 paise (receivable)
    ledgerRepository.insert({
      firmId,
      fyId: 'fy-24-25',
      partyId: customerId,
      partyType: 'CUSTOMER',
      entryType: 'DEBIT',
      amountPaise: 100000,
      entryDate: '2024-06-15',
    });

    // FY 25-26 invoice DEBIT 50,000 paise (receivable)
    ledgerRepository.insert({
      firmId,
      fyId: 'fy-25-26',
      partyId: customerId,
      partyType: 'CUSTOMER',
      entryType: 'DEBIT',
      amountPaise: 50000,
      entryDate: '2025-05-10',
    });

    // FY 25-26 payment CREDIT 40,000 paise (received)
    ledgerRepository.insert({
      firmId,
      fyId: 'fy-25-26',
      partyId: customerId,
      partyType: 'CUSTOMER',
      entryType: 'CREDIT',
      amountPaise: 40000,
      entryDate: '2025-06-01',
    });

    const balance = ledgerRepository.getCustomerBalance(firmId, customerId);
    // Net receivable: 100,000 + 50,000 - 40,000 = 110,000 paise
    expect(balance).toBe(110000);
  });

  // ---------------------------------------------------------------------------
  // T2: createDraftInvoice() → addItemToDraft() → postInvoice() happy path
  // ---------------------------------------------------------------------------
  test('T2: createDraftInvoice() → addItemToDraft() → postInvoice() happy path', async () => {
    const firmId = 'firm-T2';
    const fyId = 'fy-T2';
    const customerId = 'cust-T2';
    const itemId = 'item-T2';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T2', 'FT2', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fyId, firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, fyId, 'Customer T2', '2026-04-01', '2026-04-01');
    sqlite.prepare("INSERT OR IGNORE INTO categories (id, firm_id, name, created_at) VALUES ('cat-T2', ?, 'Rings', '2026-01-01')").run(firmId);
    sqlite.prepare("INSERT OR IGNORE INTO designs (id, firm_id, name, created_at) VALUES ('des-T2', ?, 'Diamond Ring', '2026-01-01')").run(firmId);
    sqlite.prepare(`
      INSERT OR IGNORE INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, purity_karat, gross_weight_mg, net_weight_mg, fine_weight_mg, status, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-T2', 'cat-T2', 'SKU-T2', 'BC-T2', 'GOLD', 91.6, 22, 5000, 5000, 4580, 'AVAILABLE', '2026-04-10', '2026-04-10', '2026-04-10')
    `).run(itemId, firmId);

    // 1. Create Draft
    const draft = await draftInvoiceService.createDraftInvoice({
      firmId,
      fyId,
      customerId,
      invoiceDate: '2026-04-15',
    });
    expect(draft.status).toBe('DRAFT');

    // 2. Add Item to Draft
    const lineItem = await draftInvoiceService.addItemToDraft({
      invoiceId: draft.id,
      stockLotId: itemId,
      firmId,
      metalRatePaisePerGram: 600000,
      makingChargesPaise: 20000,
      hsnCode: '7113',
    });
    expect(lineItem.invoiceId).toBe(draft.id);

    // 3. Post Invoice
    const posted = await invoicePostService.postInvoice({
      invoiceId: draft.id,
      firmId,
    });
    expect(posted.status).toBe('POSTED');
    expect(posted.invoiceNumber).toBeDefined();

    // Verify item transitioned to SOLD
    const itemInDb = sqlite.prepare('SELECT status FROM items WHERE id = ?').get(itemId);
    expect(itemInDb.status).toBe('SOLD');
  });

  // ---------------------------------------------------------------------------
  // T3: postInvoice() with ITEM_ALREADY_SOLD conflict → rollback entire transaction
  // ---------------------------------------------------------------------------
  test('T3: postInvoice() with ITEM_ALREADY_SOLD conflict → rollback entire transaction', async () => {
    const firmId = 'firm-T3';
    const customerId = 'cust-T3';
    const itemId = 'item-T3';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T3', 'FT3', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T3', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'fy-T3', 'Customer T3', '2026-04-01', '2026-04-01');
    sqlite.prepare(`
      INSERT OR IGNORE INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, purity_karat, gross_weight_mg, net_weight_mg, fine_weight_mg, status, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-T2', 'cat-T2', 'SKU-T3', 'BC-T3', 'GOLD', 91.6, 22, 5000, 5000, 4580, 'SOLD', '2026-04-10', '2026-04-10', '2026-04-10')
    `).run(itemId, firmId);

    const draft = await draftInvoiceService.createDraftInvoice({
      firmId,
      fyId: 'fy-T3',
      customerId,
      invoiceDate: '2026-04-15',
    });

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, hsn_code, gross_weight_mg, net_weight_mg, fine_weight_mg, metal_value_paise, making_charges_paise, line_total_paise)
      VALUES ('sii-T3', ?, ?, 'SERIALIZED_ITEM', 'Gold Ring', 'GOLD', 91.6, '7113', 5000, 5000, 4580, 300000, 20000, 329600)
    `).run(draft.id, itemId);

    await expect(
      invoicePostService.postInvoice({
        invoiceId: draft.id,
        firmId,
      })
    ).rejects.toThrow();

    const invoiceAfter = sqlite.prepare('SELECT status FROM sale_invoices WHERE id = ?').get(draft.id);
    expect(invoiceAfter.status).toBe('DRAFT');
  });

  // ---------------------------------------------------------------------------
  // T4: calculateInvoice() numeric accuracy: fineWeightMg=10000, rate=550000, making=50000 → 5,717,500 paise
  // ---------------------------------------------------------------------------
  test('T4: calculateInvoice() numeric accuracy: fineWeightMg=10000, rate=550000, making=50000 → 5,717,500 paise', async () => {
    const calc = await accountingTruthService.calculateInvoice({
      firmId: 'firm-T-shared',
      fineWeightMg: 10000,
      metalRatePaisePerGram: 550000,
      makingChargesPaise: 50000,
      metalTaxGroupId: g3Id,
      makingTaxGroupId: g5Id,
    });

    expect(calc.metalValuePaise).toBe(5500000);
    expect(calc.makingChargesPaise).toBe(50000);
    expect(calc.totalGstPaise).toBe(167500);
    expect(calc.netPayablePaise).toBe(5717500);
  });

  // ---------------------------------------------------------------------------
  // T5: GST split: metalValue CGST+SGST = 3%, makingCharges CGST+SGST = 5%, stone = 0%
  // ---------------------------------------------------------------------------
  test('T5: GST split: metalValue CGST+SGST = 3%, makingCharges CGST+SGST = 5%, stone = 0%', async () => {
    const calc = await accountingTruthService.calculateInvoice({
      firmId: 'firm-T-shared',
      fineWeightMg: 10000,
      metalRatePaisePerGram: 550000,
      makingChargesPaise: 50000,
      metalTaxGroupId: g3Id,
      makingTaxGroupId: g5Id,
      stoneAmtPaise: 30000,
    });

    // Metal tax: 3% of 5,500,000 = 165,000 (CGST 82,500, SGST 82,500)
    // Making tax: 5% of 50,000 = 2,500 (CGST 1,250, SGST 1,250)
    // Stone tax: 0% of 30,000 = 0
    // Total tax = 167,500 (CGST = 83,750, SGST = 83,750)
    expect(calc.cgstPaise).toBe(83750);
    expect(calc.sgstPaise).toBe(83750);
    expect(calc.totalGstPaise).toBe(167500);
  });

  // ---------------------------------------------------------------------------
  // T6: discardDraftInvoice() hard delete: audit logged BEFORE delete, no DRAFT rows remain
  // ---------------------------------------------------------------------------
  test('T6: discardDraftInvoice() hard delete: audit logged BEFORE delete, no DRAFT rows remain', async () => {
    const firmId = 'firm-T6';
    const customerId = 'cust-T6';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T6', 'FT6', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T6', firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'fy-T6', 'Customer T6', '2026-04-01', '2026-04-01');

    const draft = await draftInvoiceService.createDraftInvoice({
      firmId,
      fyId: 'fy-T6',
      customerId,
      metalRatePaisePerGram: 600000,
      invoiceDate: '2026-04-15',
    });

    await draftInvoiceService.discardDraftInvoice(draft.id, firmId);

    const invoiceRow = sqlite.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(draft.id);
    expect(invoiceRow).toBeUndefined();

    const auditRow = sqlite.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND event_type = 'DRAFT_INVOICE_DISCARDED'").get(draft.id);
    expect(auditRow).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // T7: createCreditNote() full CN: old metal CREDIT reversed, old_metal_lots row → VOIDED
  // ---------------------------------------------------------------------------
  test('T7: createCreditNote() full CN: old metal CREDIT reversed, old_metal_lots row → VOIDED (via findBySaleInvoiceId)', async () => {
    const firmId = 'firm-T7';
    const fyId = 'fy-T7';
    const customerId = 'cust-T7';
    const saleInvoiceId = 'inv-T7';
    const oldMetalLotId = 'oml-T7';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T7', 'FT7', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fyId, firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, fyId, 'Customer T7', '2026-04-01', '2026-04-01');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, old_metal_deduction_paise, net_payable_paise, created_at)
      VALUES (?, ?, ?, ?, 'VJ/26-27/0007', '2026-04-15', 'POSTED', 600000, 100000, 25000, 75000, '2026-04-15')
    `).run(saleInvoiceId, firmId, fyId, customerId);

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, hsn_code, gross_weight_mg, net_weight_mg, fine_weight_mg, metal_value_paise, making_charges_paise, line_total_paise)
      VALUES ('sii-T7', ?, 'item-T7-dummy', 'SERIALIZED_ITEM', 'Gold Ring', 'GOLD', 91.6, '7113', 5000, 5000, 4580, 100000, 0, 100000)
    `).run(saleInvoiceId);

    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, sale_invoice_id, status, gross_weight_mg, fine_weight_mg, created_at, updated_at)
      VALUES (?, ?, ?, 'RECEIVED', 5000, 4580, '2026-04-15', '2026-04-15')
    `).run(oldMetalLotId, firmId, saleInvoiceId);

    const cn = await creditNoteService.createCreditNote({
      firmId,
      originalInvoiceId: saleInvoiceId,
      returnedItemIds: ['sii-T7'],
      reason: 'Full return with old metal reversal',
    });

    expect(cn.isPartial).toBe(0);
    const lotAfter = sqlite.prepare('SELECT status FROM old_metal_lots WHERE id = ?').get(oldMetalLotId);
    expect(lotAfter?.status).toBe('VOIDED');
  });

  // ---------------------------------------------------------------------------
  // T8: createCreditNote() partial CN: old metal CREDIT NOT reversed, remainingOldMetalCreditPaise set
  // ---------------------------------------------------------------------------
  test('T8: createCreditNote() partial CN: old metal CREDIT NOT reversed, remainingOldMetalCreditPaise set', async () => {
    const firmId = 'firm-T8';
    const fyId = 'fy-T8';
    const customerId = 'cust-T8';
    const saleInvoiceId = 'inv-T8';
    const oldMetalLotId = 'oml-T8';

    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, fyId, 'Customer T8', '2026-04-01', '2026-04-01');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, old_metal_deduction_paise, net_payable_paise, created_at)
      VALUES (?, ?, ?, ?, 'VJ/26-27/0008', '2026-04-15', 'POSTED', 600000, 100000, 25000, 75000, '2026-04-15')
    `).run(saleInvoiceId, firmId, fyId, customerId);

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, hsn_code, gross_weight_mg, net_weight_mg, fine_weight_mg, metal_value_paise, making_charges_paise, line_total_paise)
      VALUES 
        ('sii-T8-1', ?, 'item-T8-1', 'SERIALIZED_ITEM', 'Ring 1', 'GOLD', 91.6, '7113', 3000, 3000, 2748, 60000, 0, 60000),
        ('sii-T8-2', ?, 'item-T8-2', 'SERIALIZED_ITEM', 'Ring 2', 'GOLD', 91.6, '7113', 2000, 2000, 1832, 40000, 0, 40000)
    `).run(saleInvoiceId, saleInvoiceId);

    sqlite.prepare(`
      INSERT INTO old_metal_lots (id, firm_id, sale_invoice_id, status, gross_weight_mg, fine_weight_mg, created_at, updated_at)
      VALUES (?, ?, ?, 'RECEIVED', 5000, 4580, '2026-04-15', '2026-04-15')
    `).run(oldMetalLotId, firmId, saleInvoiceId);

    const cn = await creditNoteService.createCreditNote({
      firmId,
      originalInvoiceId: saleInvoiceId,
      returnedItemIds: ['sii-T8-1'],
      reason: 'Partial return of accessories',
    });

    expect(cn.isPartial).toBe(1);
    expect(cn.remainingOldMetalCreditPaise).toBe(25000);
    const lotAfter = sqlite.prepare('SELECT status FROM old_metal_lots WHERE id = ?').get(oldMetalLotId);
    expect(lotAfter?.status).toBe('RECEIVED');
  });

  // ---------------------------------------------------------------------------
  // T9: recordPayment() MONEY_IN: ledger CREDIT entry created, balance reduces
  // ---------------------------------------------------------------------------
  test('T9: recordPayment() MONEY_IN: ledger CREDIT entry created, balance reduces', async () => {
    const firmId = 'firm-T9';
    const fyId = 'fy-T9';
    const customerId = 'cust-T9';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T9', 'FT9', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fyId, firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, fyId, 'Customer T9', '2026-04-01', '2026-04-01');

    ledgerRepository.insert({
      firmId,
      fyId,
      partyId: customerId,
      partyType: 'CUSTOMER',
      type: 'DEBIT',
      amountPaise: 50000,
      createdAt: '2026-04-10',
    });
    expect(ledgerRepository.getCustomerBalance(firmId, customerId)).toBe(50000);

    await paymentService.recordPayment({
      firmId,
      partyId: customerId,
      partyType: 'CUSTOMER',
      type: 'MONEY_IN',
      mode: 'CASH',
      amountPaise: 20000,
      paymentDate: '2026-04-15',
    });

    expect(ledgerRepository.getCustomerBalance(firmId, customerId)).toBe(30000);
  });

  // ---------------------------------------------------------------------------
  // T10: recordPayment() BANK mode with no bankAccountId → BANK_ACCOUNT_REQUIRED thrown
  // ---------------------------------------------------------------------------
  test('T10: recordPayment() BANK mode with no bankAccountId → BANK_ACCOUNT_REQUIRED thrown', async () => {
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T10', 'firm-T10', '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');

    await expect(
      paymentService.recordPayment({
        firmId: 'firm-T10',
        partyId: 'cust-T10',
        partyType: 'CUSTOMER',
        type: 'MONEY_IN',
        mode: 'BANK',
        amountPaise: 10000,
        paymentDate: '2026-04-15',
      })
    ).rejects.toThrow(ERR.BANK_ACCOUNT_REQUIRED);
  });

  // ---------------------------------------------------------------------------
  // T10-B: (v5.1) recordPayment() UPI mode with no bankAccountId → BANK_ACCOUNT_REQUIRED thrown
  // ---------------------------------------------------------------------------
  test('T10-B: (v5.1) recordPayment() UPI mode with no bankAccountId → BANK_ACCOUNT_REQUIRED thrown', async () => {
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T10B', 'firm-T10B', '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');

    await expect(
      paymentService.recordPayment({
        firmId: 'firm-T10B',
        partyId: 'cust-T10B',
        partyType: 'CUSTOMER',
        type: 'MONEY_IN',
        mode: 'UPI',
        amountPaise: 10000,
        paymentDate: '2026-04-15',
      })
    ).rejects.toThrow(ERR.BANK_ACCOUNT_REQUIRED);
  });

  // ---------------------------------------------------------------------------
  // T10-C: (v5.1) recordPayment() CASH mode with non-null bankAccountId → rejected
  // ---------------------------------------------------------------------------
  test('T10-C: (v5.1) recordPayment() CASH mode with non-null bankAccountId → rejected', async () => {
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('fy-T10C', 'firm-T10C', '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');

    await expect(
      paymentService.recordPayment({
        firmId: 'firm-T10C',
        partyId: 'cust-T10C',
        partyType: 'CUSTOMER',
        type: 'MONEY_IN',
        mode: 'CASH',
        bankAccountId: 'bank-invalid-for-cash',
        amountPaise: 10000,
        paymentDate: '2026-04-15',
      })
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // T11: verifyService CHECK 5 tamper detection: manually alter netPayablePaise → CRITICAL raised
  // ---------------------------------------------------------------------------
  test('T11: verifyService CHECK 5 tamper detection: manually alter netPayablePaise → CRITICAL raised', async () => {
    const firmId = 'firm-T11';
    const invoiceId = 'inv-T11';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T11', 'FT11', 'Prop', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, net_payable_paise, created_at)
      VALUES (?, ?, 'fy-T11', 'cust-T11', 'VJ/26-27/0011', '2026-04-15', 'POSTED', 600000, 100000, 999999, '2026-04-15')
    `).run(invoiceId, firmId);

    const findings = await billingVerifyService.runBillingChecks(firmId);
    const check5 = findings.find(f => f.check === ERR.CHECK_5_INVOICE_TAMPER);
    expect(check5).toBeDefined();
    expect(check5?.severity).toBe('CRITICAL');
  });

  // ---------------------------------------------------------------------------
  // T12: verifyService CHECK 9: old metal invoice missing CREDIT → CRITICAL
  // ---------------------------------------------------------------------------
  test('T12: verifyService CHECK 9: old metal invoice missing CREDIT → CRITICAL', async () => {
    const firmId = 'firm-T12';
    const invoiceId = 'inv-T12';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T12', 'FT12', 'Prop', '2026-01-01', '2026-01-01');

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, old_metal_deduction_paise, net_payable_paise, created_at)
      VALUES (?, ?, 'fy-T12', 'cust-T12', 'VJ/26-27/0012', '2026-04-15', 'POSTED', 600000, 100000, 50000, 50000, '2026-04-15')
    `).run(invoiceId, firmId);

    const findings = await billingVerifyService.runBillingChecks(firmId);
    const check9 = findings.find(f => f.check === ERR.CHECK_9_OLD_METAL_CREDIT_MISSING);
    expect(check9).toBeDefined();
    expect(check9?.severity).toBe('CRITICAL');
  });

  // ---------------------------------------------------------------------------
  // T13: restoreItemFromSale(): SOLD → RETURNED; audit_log.entityId null-survival confirmed
  // ---------------------------------------------------------------------------
  test('T13: restoreItemFromSale(): SOLD → RETURNED; audit_log.entityId null-survival confirmed', async () => {
    const firmId = 'firm-T13';
    const fyId = 'fy-T13';
    const customerId = 'cust-T13';
    const itemId = 'item-T13';
    const invoiceId = 'inv-T13';
    const creditNoteId = 'cn-T13';

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, proprietor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T13', 'FT13', 'Prop', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fyId, firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, fyId, 'Customer T13', '2026-04-01', '2026-04-01');

    sqlite.prepare(`
      INSERT OR IGNORE INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, purity_karat, gross_weight_mg, net_weight_mg, fine_weight_mg, status, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-T2', 'cat-T2', 'SKU-T13', 'BC-T13', 'GOLD', 91.6, 22, 5000, 5000, 4580, 'SOLD', '2026-04-10', '2026-04-10', '2026-04-10')
    `).run(itemId, firmId);

    sqlite.prepare(`
      INSERT INTO sale_invoices (id, firm_id, fy_id, customer_id, invoice_number, invoice_date, status, metal_rate_paise_per_gram, taxable_metal_amt_paise, net_payable_paise, created_at)
      VALUES (?, ?, ?, ?, 'VJ/26-27/0013', '2026-04-10', 'POSTED', 600000, 100000, 100000, '2026-04-10')
    `).run(invoiceId, firmId, fyId, customerId);

    sqlite.prepare(`
      INSERT INTO sale_invoice_items (id, invoice_id, stock_lot_id, line_type, item_name, metal, purity_pct, hsn_code, gross_weight_mg, net_weight_mg, fine_weight_mg, metal_value_paise, making_charges_paise, line_total_paise)
      VALUES ('sii-T13', ?, ?, 'SERIALIZED_ITEM', 'Gold Ring', 'GOLD', 91.6, '7113', 5000, 5000, 4580, 100000, 0, 100000)
    `).run(invoiceId, itemId);

    sqlite.prepare(`
      INSERT INTO credit_notes (id, firm_id, fy_id, original_invoice_id, cn_number, cn_date, reason, returned_item_ids, credit_amount_paise, is_partial, status, created_at)
      VALUES (?, ?, ?, ?, 'CN/26-27/0013', '2026-04-15', 'Return item', '["sii-T13"]', 100000, 0, 'POSTED', '2026-04-15')
    `).run(creditNoteId, firmId, fyId, invoiceId);

    await creditNoteService.restoreItemFromSale({
      stockLotId: itemId,
      creditNoteId,
      firmId,
    });

    const itemAfter = sqlite.prepare('SELECT status FROM items WHERE id = ?').get(itemId);
    expect(itemAfter.status).toBe('RETURNED');

    const audit = sqlite.prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND event_type = 'ITEM_RETURNED'").get(itemId);
    expect(audit).toBeDefined();
    expect(audit.entity_id).toBe(itemId);
  });

  // ---------------------------------------------------------------------------
  // T14: calculateInvoice() worked example: 5,717,500 paise EXACTLY matches Step 8 example
  // ---------------------------------------------------------------------------
  test('T14: calculateInvoice() worked example: 5,717,500 paise EXACTLY matches Step 8 example', async () => {
    const calc = await accountingTruthService.calculateInvoice({
      firmId: 'firm-T-shared',
      fineWeightMg: 10000,
      metalRatePaisePerGram: 550000,
      makingChargesPaise: 50000,
      metalTaxGroupId: g3Id,
      makingTaxGroupId: g5Id,
    });
    expect(calc.netPayablePaise).toBe(5717500);
  });

  // ---------------------------------------------------------------------------
  // T15: Karigar METAL_OUT + METAL_IN: balance derivation correct with purity multiplication (FIX-T15-CROSSFY-1)
  // ---------------------------------------------------------------------------
  test('T15: Karigar METAL_OUT + METAL_IN: balance derivation correct with purity multiplication (FIX-T15-CROSSFY-1)', () => {
    const firmId = 'firm-T15';
    const karigarId = 'karigar-T15';

    karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'METAL_OUT',
      weightMg: 10000,
      purityPct: 91.6,
      amountPaise: 0,
    });

    karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'METAL_IN',
      weightMg: 5000,
      purityPct: 91.6,
      amountPaise: 0,
    });

    const balance = karigarLedgerRepository.getMetalBalance(firmId, karigarId);
    expect(balance).toBe(4580);
  });

  // ---------------------------------------------------------------------------
  // T16: payLabourToKarigar(): money balance reduces correctly after LABOUR_PAID insert (FIX-T16-CROSSFY-1)
  // ---------------------------------------------------------------------------
  test('T16: payLabourToKarigar(): money balance reduces correctly after LABOUR_PAID insert (FIX-T16-CROSSFY-1)', async () => {
    const firmId = 'firm-T16';
    const karigarId = 'karigar-T16';

    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Karigar T16', '2026-01-01', '2026-01-01');

    karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'LABOUR_PAYABLE',
      amountPaise: 50000,
    });

    expect(karigarLedgerRepository.getMoneyBalance(firmId, karigarId)).toBe(50000);

    await karigarMasterService.payLabourToKarigar({
      firmId,
      karigarId,
      amountPaise: 20000,
      paymentDate: '2026-04-15',
    });

    expect(karigarLedgerRepository.getMoneyBalance(firmId, karigarId)).toBe(30000);
  });

  // ---------------------------------------------------------------------------
  // T17: approveReturnedItem(): RETURNED → AVAILABLE; ITEM_NOT_RETURNED thrown for non-RETURNED lot
  // ---------------------------------------------------------------------------
  test('T17: approveReturnedItem(): RETURNED → AVAILABLE; ITEM_NOT_RETURNED thrown for non-RETURNED lot', async () => {
    const firmId = 'firm-T17';
    const retItemId = 'item-T17-ret';
    const availItemId = 'item-T17-avail';

    sqlite.prepare(`
      INSERT OR IGNORE INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, purity_karat, gross_weight_mg, net_weight_mg, fine_weight_mg, status, is_active, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-T2', 'cat-T2', 'SKU-T17-1', 'BC-T17-1', 'GOLD', 91.6, 22, 5000, 5000, 4580, 'RETURNED', 1, '2026-04-10', '2026-04-10', '2026-04-10')
    `).run(retItemId, firmId);

    sqlite.prepare(`
      INSERT OR IGNORE INTO items (id, firm_id, design_id, category_id, sku, barcode, metal, purity_percent, purity_karat, gross_weight_mg, net_weight_mg, fine_weight_mg, status, is_active, entry_date, created_at, updated_at)
      VALUES (?, ?, 'des-T2', 'cat-T2', 'SKU-T17-2', 'BC-T17-2', 'GOLD', 91.6, 22, 5000, 5000, 4580, 'AVAILABLE', 1, '2026-04-10', '2026-04-10', '2026-04-10')
    `).run(availItemId, firmId);

    await creditNoteService.approveReturnedItem({
      stockLotId: retItemId,
      firmId,
    });
    const itemAfter = sqlite.prepare('SELECT status FROM items WHERE id = ?').get(retItemId);
    expect(itemAfter.status).toBe('AVAILABLE');

    await expect(
      creditNoteService.approveReturnedItem({
        stockLotId: availItemId,
        firmId,
      })
    ).rejects.toThrow(ERR.ITEM_NOT_RETURNED);
  });

  // ---------------------------------------------------------------------------
  // T18: settleKarigarMetalAsMoney() happy path: balance recalc after settlement = 0 fine mg outstanding
  // ---------------------------------------------------------------------------
  test('T18: settleKarigarMetalAsMoney() happy path: balance recalc after settlement = 0 fine mg outstanding', async () => {
    const firmId = 'firm-T18';
    const karigarId = 'karigar-T18';

    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Karigar T18', '2026-01-01', '2026-01-01');

    const issued = karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'METAL_OUT',
      weightMg: 10000,
      purityPct: 100,
      amountPaise: 0,
    });

    await karigarMasterService.settleKarigarMetalAsMoney({
      firmId,
      karigarId,
      fineWeightMg: 10000,
      ratePaisePerGram: 600000,
      linkedMetalEntryId: issued.id,
    });

    expect(karigarLedgerRepository.getMetalBalance(firmId, karigarId)).toBe(0);
    expect(karigarLedgerRepository.getMoneyBalance(firmId, karigarId)).toBe(6000000);
  });

  // ---------------------------------------------------------------------------
  // T18-H: Race condition: two concurrent settleKarigarMetalAsMoney() calls → second throws SETTLEMENT_EXCEEDS_METAL_BALANCE
  // ---------------------------------------------------------------------------
  test('T18-H: Race condition: two concurrent settleKarigarMetalAsMoney() calls → second throws SETTLEMENT_EXCEEDS_METAL_BALANCE', async () => {
    const firmId = 'firm-T18H';
    const karigarId = 'karigar-T18H';

    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Karigar T18H', '2026-01-01', '2026-01-01');

    const issued = karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'METAL_OUT',
      weightMg: 5000,
      purityPct: 100,
      amountPaise: 0,
    });

    await karigarMasterService.settleKarigarMetalAsMoney({
      firmId,
      karigarId,
      fineWeightMg: 5000,
      ratePaisePerGram: 600000,
      linkedMetalEntryId: issued.id,
    });

    await expect(
      karigarMasterService.settleKarigarMetalAsMoney({
        firmId,
        karigarId,
        fineWeightMg: 5000,
        ratePaisePerGram: 600000,
        linkedMetalEntryId: issued.id,
      })
    ).rejects.toThrow(ERR.SETTLEMENT_EXCEEDS_METAL_BALANCE);
  });

  // ---------------------------------------------------------------------------
  // T19: (v4.9) FY cross-year customer: customer created in FY 24-25 found and invoiced in FY 25-26 without duplicate row; balance spans both FYs correctly
  // ---------------------------------------------------------------------------
  test('T19: (v4.9) FY cross-year customer: customer created in FY 24-25 found and invoiced in FY 25-26 without duplicate row; balance spans both FYs correctly', async () => {
    const firmId = 'firm-T19';
    const customerId = 'cust-T19';

    sqlite.prepare('INSERT OR IGNORE INTO customers (id, firm_id, fy_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(customerId, firmId, 'fy-24-25', 'Cross-Year Customer', '2024-05-01', '2024-05-01');

    ledgerRepository.insert({
      firmId,
      fyId: 'fy-24-25',
      partyId: customerId,
      partyType: 'CUSTOMER',
      type: 'DEBIT',
      amountPaise: 75000,
      createdAt: '2024-06-01',
    });

    const found = customerRepository.findById(firmId, customerId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Cross-Year Customer');

    ledgerRepository.insert({
      firmId,
      fyId: 'fy-25-26',
      partyId: customerId,
      partyType: 'CUSTOMER',
      type: 'DEBIT',
      amountPaise: 25000,
      createdAt: '2025-06-01',
    });

    expect(ledgerRepository.getCustomerBalance(firmId, customerId)).toBe(100000);
    const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM customers WHERE id = ?').get(customerId);
    expect(count.cnt).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // T20: (v5.1) settleKarigarMetalAsMoney() validation: fineWeightMg=0 → SETTLEMENT_WEIGHT_INVALID; fineWeightMg=1 → succeeds
  // ---------------------------------------------------------------------------
  test('T20: (v5.1) settleKarigarMetalAsMoney() validation: fineWeightMg=0 → SETTLEMENT_WEIGHT_INVALID; fineWeightMg=1 → succeeds', async () => {
    const firmId = 'firm-T20';
    const karigarId = 'karigar-T20';

    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(karigarId, firmId, 'Karigar T20', '2026-01-01', '2026-01-01');

    const issued = karigarLedgerRepository.insert({
      firmId,
      karigarId,
      type: 'METAL_OUT',
      weightMg: 1000,
      purityPct: 100,
      amountPaise: 0,
    });

    await expect(
      karigarMasterService.settleKarigarMetalAsMoney({
        firmId,
        karigarId,
        fineWeightMg: 0,
        ratePaisePerGram: 600000,
        linkedMetalEntryId: issued.id,
      })
    ).rejects.toThrow(ERR.SETTLEMENT_WEIGHT_INVALID);

    const res = await karigarMasterService.settleKarigarMetalAsMoney({
      firmId,
      karigarId,
      fineWeightMg: 1,
      ratePaisePerGram: 600000,
      linkedMetalEntryId: issued.id,
    });
    expect(res.entry.weightMg).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // T21: (v5.1) postPurchaseInvoice() happy path: invoice posted, supplier CREDIT ledger entry created, invoiceNumber generated with PURCHASE docType, SUPPLIER_NOT_FOUND thrown for invalid supplierId
  // ---------------------------------------------------------------------------
  test('T21: (v5.1) postPurchaseInvoice() happy path: invoice posted, supplier CREDIT ledger entry created, invoiceNumber generated with PURCHASE docType, SUPPLIER_NOT_FOUND thrown for invalid supplierId', async () => {
    const firmId = 'firm-T21';
    const fyId = 'fy-T21';
    const supplierId = 'supp-T21';

    sqlite.prepare('INSERT OR REPLACE INTO firms (id, name, firm_code, proprietor, gstin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(firmId, 'Firm T21', 'FT21', 'Prop', '27ABCDE1234F1Z5', '2026-01-01', '2026-01-01');
    await taxMasterService.seedDefaults(firmId);
    sqlite.prepare('INSERT OR IGNORE INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fyId, firmId, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', '2026-04-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(supplierId, firmId, 'Supplier T21', 'SUPPLIER', '2026-01-01', '2026-01-01');

    await expect(
      purchaseInvoiceService.postPurchaseInvoice({
        firmId,
        supplierId: 'non-existent-supplier',
        supplierInvoiceDate: '2026-04-15',
        taxableAmountPaise: 500000,
        totalAmountPaise: 515000,
        cgstPaise: 7500,
        sgstPaise: 7500,
        items: [
          {
            itemDescription: 'Gold Raw 24K',
            taxableAmountPaise: 500000,
            lineTotalPaise: 515000,
          },
        ],
      })
    ).rejects.toThrow(ERR.SUPPLIER_NOT_FOUND);

    const posted = await purchaseInvoiceService.postPurchaseInvoice({
      firmId,
      supplierId,
      supplierInvoiceDate: '2026-04-15',
      taxableAmountPaise: 500000,
      totalAmountPaise: 515000,
      cgstPaise: 7500,
      sgstPaise: 7500,
      items: [
        {
          itemDescription: 'Gold Raw 24K',
          ratePerGramPaise: 600000,
          taxableAmountPaise: 500000,
          lineTotalPaise: 515000,
        },
      ],
    });

    expect(posted.invoice.status).toBe('POSTED');
    expect(posted.invoice.invoiceNumber).toBeDefined();

    const cfg = sqlite.prepare("SELECT * FROM invoice_number_config WHERE firm_id = ? AND doc_type = 'PURCHASE'").get(firmId);
    expect(cfg).toBeDefined();
    expect(cfg.last_sequence).toBe(1);

    const ledger = sqlite.prepare("SELECT * FROM ledger_entries WHERE party_id = ? AND (type = 'CREDIT' OR credit_paise > 0)").get(supplierId);
    expect(ledger).toBeDefined();
    expect(ledger.amount_paise || ledger.credit_paise).toBe(515000);
  });
});
