// db/client.ts — Phase 1 v7.47 + Phase 2–4 Migration Runner & Backward-Compatible Re-Exports
// Delegates database opening exclusively to db/index.ts (FIX-V740-13, FIX-V741-1).
import { useEffect, useState } from 'react';
import type * as SQLite from 'expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { SCHEMA_VERSION } from '../constants';
import db, { openDatabase, getSqlite, closeDatabase as closeIndexDb } from './index';

// Lazy proxy for expoDb so nothing opens the database at module load (FIX-V741-1)
export const expoDb = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_t, prop) {
    const sqlite = getSqlite();
    const v = (sqlite as any)[prop];
    return typeof v === 'function' ? v.bind(sqlite) : v;
  },
});

export { db, openDatabase, getSqlite };

let isDbInitialized = false;
let initPromise: Promise<void> | null = null;

export function resetDatabaseInitializationState(): void {
  closeIndexDb();
  isDbInitialized = false;
  initPromise = null;
}

export async function runDatabaseMigrations(): Promise<void> {
  if (isDbInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 0. Ensure SQLCipher database is opened and PRAGMAs verified (FIX-V741-1)
    const openedDb = await openDatabase();
    const sqlite = getSqlite();

    // 1. Execute Drizzle migrations sequentially
    await migrate(openedDb, migrations);

    // 2. Synchronize schema_version to current active app schema
    try {
      sqlite.execSync(
        `UPDATE schema_version SET current_version = ${SCHEMA_VERSION} WHERE id = 1 AND current_version < ${SCHEMA_VERSION};`
      );
    } catch (e) {
      console.warn('[DB Client] Updating schema_version:', e);
    }

    // 3. Self-healing schema check for design_purity_thresholds (Phase 2 v2.13)
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS design_purity_thresholds (
          design_id TEXT NOT NULL,
          purity_percent REAL NOT NULL,
          low_stock_threshold INTEGER NOT NULL,
          PRIMARY KEY (design_id, purity_percent),
          FOREIGN KEY (design_id) REFERENCES designs(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
      `);

      const designCols = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(designs)');
      if (designCols.some((c) => c.name === 'low_stock_threshold')) {
        sqlite.execSync('ALTER TABLE designs DROP COLUMN low_stock_threshold;');
      }
    } catch (e) {
      console.warn('[DB Client] Self-healing design_purity_thresholds check:', e);
    }

    // 4. Self-healing schema check for rate_engine_config (Phase 3 Step RE)
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS rate_engine_config (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          gold_24_base_per_10g_paise INTEGER NOT NULL,
          gold_22_base_per_10g_paise INTEGER NOT NULL,
          gold_cash_per_10g_paise INTEGER NOT NULL,
          silver_cash_per_kg_paise INTEGER NOT NULL,
          last_updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
      `);
    } catch (e) {
      console.warn('[DB Client] Self-healing rate_engine_config check:', e);
    }

    // 5. Self-healing schema check for customers (Phase 3 Step 1)
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mobile TEXT,
          gstin TEXT,
          address TEXT,
          aadhaar_number TEXT,
          pan_number TEXT,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_customers_firm_name ON customers(firm_id, name) WHERE is_deleted = 0;
        CREATE INDEX IF NOT EXISTS idx_customers_firm_mobile ON customers(firm_id, mobile) WHERE is_deleted = 0;
      `);

      const custCols = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(customers)');
      if (!custCols.some((c) => c.name === 'aadhaar_number')) {
        sqlite.execSync('ALTER TABLE customers ADD COLUMN aadhaar_number TEXT;');
      }
      if (!custCols.some((c) => c.name === 'pan_number')) {
        sqlite.execSync('ALTER TABLE customers ADD COLUMN pan_number TEXT;');
      }
    } catch (e) {
      console.warn('[DB Client] Self-healing customers check:', e);
    }

    // 6. Self-healing schema check for suppliers (Phase 3 Step 2)
    try {
      sqlite.execSync(`
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_suppliers_firm_name ON suppliers(firm_id, name) WHERE is_deleted = 0;
        CREATE INDEX IF NOT EXISTS idx_suppliers_firm_mobile ON suppliers(firm_id, mobile) WHERE is_deleted = 0;
      `);
    } catch (e) {
      console.warn('[DB Client] Self-healing suppliers check:', e);
    }

    // 7. Self-healing schema check for karigar and karigar_ledger (Phase 3 Step 3)
    try {
      sqlite.execSync(`
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_karigar_firm_name ON karigar(firm_id, name) WHERE is_deleted = 0;
        CREATE INDEX IF NOT EXISTS idx_karigar_firm_mobile ON karigar(firm_id, mobile) WHERE is_deleted = 0;

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
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (karigar_id) REFERENCES karigar(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_karigar_ledger_karigar ON karigar_ledger(firm_id, karigar_id);
        CREATE INDEX IF NOT EXISTS idx_karigar_ledger_job_work ON karigar_ledger(linked_job_work_id) WHERE linked_job_work_id IS NOT NULL;
      `);

      const ledgerCols = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(karigar_ledger)');
      if (!ledgerCols.some((c) => c.name === 'linked_job_work_id')) {
        sqlite.execSync('ALTER TABLE karigar_ledger ADD COLUMN linked_job_work_id TEXT;');
      }
    } catch (e) {
      console.warn('[DB Client] Self-healing karigar check:', e);
    }

    // 8. Self-healing schema check for purchase_invoices & purchase_invoice_items (Phase 3 Step 15)
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS purchase_invoices (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          supplier_invoice_number TEXT,
          supplier_invoice_date TEXT NOT NULL,
          invoice_number TEXT NOT NULL,
          status TEXT DEFAULT 'POSTED' NOT NULL,
          taxable_amount_paise INTEGER NOT NULL,
          cgst_paise INTEGER DEFAULT 0 NOT NULL,
          sgst_paise INTEGER DEFAULT 0 NOT NULL,
          total_amount_paise INTEGER NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          posted_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_firm_status ON purchase_invoices (firm_id, status);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_num ON purchase_invoices (firm_id, invoice_number);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices (firm_id, supplier_id);

        CREATE TABLE IF NOT EXISTS purchase_invoice_items (
          id TEXT PRIMARY KEY NOT NULL,
          invoice_id TEXT NOT NULL,
          item_description TEXT NOT NULL,
          metal_type TEXT,
          gross_weight_mg INTEGER DEFAULT 0 NOT NULL,
          purity_pct REAL DEFAULT 0 NOT NULL,
          fine_weight_mg INTEGER DEFAULT 0 NOT NULL,
          rate_per_gram_paise INTEGER DEFAULT 0 NOT NULL,
          taxable_amount_paise INTEGER NOT NULL,
          cgst_paise INTEGER DEFAULT 0 NOT NULL,
          sgst_paise INTEGER DEFAULT 0 NOT NULL,
          line_total_paise INTEGER NOT NULL,
          hsn_code TEXT,
          created_item_id TEXT,
          FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (created_item_id) REFERENCES items(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_pii_invoice ON purchase_invoice_items (invoice_id);
      `);
    } catch (e) {
      console.warn('[DB Client] Self-healing purchase_invoices check:', e);
    }

    // 8a. Self-healing schema check for bank_accounts (Step 16)
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS bank_accounts (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          bank_name TEXT NOT NULL,
          account_holder TEXT NOT NULL,
          account_number TEXT NOT NULL,
          ifsc TEXT NOT NULL,
          branch TEXT,
          upi_ids TEXT,
          is_default INTEGER DEFAULT 0 NOT NULL,
          is_archived INTEGER DEFAULT 0 NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_bank_accounts_firm_default ON bank_accounts (firm_id, is_default);
        CREATE INDEX IF NOT EXISTS idx_bank_accounts_firm_archived ON bank_accounts (firm_id, is_archived);
        CREATE INDEX IF NOT EXISTS idx_bank_accounts_firm_acc_num ON bank_accounts (firm_id, account_number);
      `);
    } catch (e) {
      console.warn('[DB Client] Self-healing bank_accounts check:', e);
    }

    // 8b. Self-healing schema check for Phase 3 Billing & Invoicing
    try {
      sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS invoice_number_config (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          doc_type TEXT NOT NULL,
          prefix TEXT NOT NULL,
          last_sequence INTEGER DEFAULT 0 NOT NULL,
          allow_manual_override INTEGER DEFAULT 1 NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_inv_num_cfg_unique ON invoice_number_config (firm_id, fy_id, doc_type);

        CREATE TABLE IF NOT EXISTS invoice_print_settings (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          paper_size TEXT DEFAULT 'A5' NOT NULL,
          orientation TEXT DEFAULT 'LANDSCAPE' NOT NULL,
          show_terms_and_conditions INTEGER DEFAULT 0 NOT NULL,
          terms_and_conditions_text TEXT DEFAULT '' NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_invoice_print_settings_firm ON invoice_print_settings (firm_id);

        CREATE TABLE IF NOT EXISTS sale_invoices (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          invoice_number TEXT,
          invoice_date TEXT NOT NULL,
          status TEXT DEFAULT 'DRAFT' NOT NULL,
          metal_rate_paise_per_gram INTEGER NOT NULL,
          is_manual_rate INTEGER DEFAULT 0 NOT NULL,
          making_charges_mode TEXT DEFAULT 'FLAT' NOT NULL,
          making_charges_paise INTEGER DEFAULT 0 NOT NULL,
          taxable_metal_amt_paise INTEGER DEFAULT 0 NOT NULL,
          taxable_making_amt_paise INTEGER DEFAULT 0 NOT NULL,
          cgst_paise INTEGER DEFAULT 0 NOT NULL,
          sgst_paise INTEGER DEFAULT 0 NOT NULL,
          stone_amt_paise INTEGER DEFAULT 0 NOT NULL,
          old_metal_deduction_paise INTEGER DEFAULT 0 NOT NULL,
          discount_paise INTEGER DEFAULT 0 NOT NULL,
          round_off_paise INTEGER DEFAULT 0 NOT NULL,
          net_payable_paise INTEGER DEFAULT 0 NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          posted_at TEXT,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_sale_invoices_firm_status ON sale_invoices (firm_id, status);
        CREATE INDEX IF NOT EXISTS idx_sale_invoices_num ON sale_invoices (firm_id, invoice_number);

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
          stone_amount_paise INTEGER DEFAULT 0 NOT NULL,
          metal_value_paise INTEGER DEFAULT 0 NOT NULL,
          making_charges_paise INTEGER DEFAULT 0 NOT NULL,
          line_gst_paise INTEGER DEFAULT 0 NOT NULL,
          line_total_paise INTEGER DEFAULT 0 NOT NULL,
          metal_tax_group_id TEXT,
          making_tax_group_id TEXT,
          line_type TEXT DEFAULT 'SERIALIZED_ITEM' NOT NULL,
          qty_sold INTEGER,
          weight_sold_mg INTEGER,
          FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id) ON UPDATE NO ACTION ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoice ON sale_invoice_items (invoice_id);
        CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_stock ON sale_invoice_items (stock_lot_id);

        CREATE TABLE IF NOT EXISTS estimate_invoices (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          customer_id TEXT,
          estimate_number TEXT,
          estimate_date TEXT NOT NULL,
          status TEXT DEFAULT 'DRAFT' NOT NULL,
          metal_rate_paise_per_gram INTEGER NOT NULL,
          is_manual_rate INTEGER DEFAULT 0 NOT NULL,
          making_charges_mode TEXT DEFAULT 'FLAT' NOT NULL,
          making_charges_paise INTEGER DEFAULT 0 NOT NULL,
          net_payable_paise INTEGER DEFAULT 0 NOT NULL,
          notes TEXT,
          converted_invoice_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (converted_invoice_id) REFERENCES sale_invoices(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_estimate_invoices_firm_status ON estimate_invoices (firm_id, status);
        CREATE INDEX IF NOT EXISTS idx_estimate_invoices_num ON estimate_invoices (firm_id, estimate_number);

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
          metal_value_paise INTEGER DEFAULT 0 NOT NULL,
          making_charges_paise INTEGER DEFAULT 0 NOT NULL,
          line_total_paise INTEGER DEFAULT 0 NOT NULL,
          FOREIGN KEY (estimate_id) REFERENCES estimate_invoices(id) ON UPDATE NO ACTION ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items (estimate_id);
        CREATE INDEX IF NOT EXISTS idx_estimate_items_stock ON estimate_items (stock_lot_id);

        CREATE TABLE IF NOT EXISTS ledger_entries (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT,
          party_id TEXT NOT NULL,
          party_type TEXT NOT NULL,
          type TEXT DEFAULT 'DEBIT' NOT NULL,
          amount_paise INTEGER DEFAULT 0 NOT NULL,
          linked_entity_type TEXT,
          linked_entity_id TEXT,
          description TEXT,
          created_at TEXT NOT NULL,
          debit_paise INTEGER DEFAULT 0 NOT NULL,
          credit_paise INTEGER DEFAULT 0 NOT NULL,
          reference_type TEXT,
          reference_id TEXT,
          notes TEXT,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_party ON ledger_entries (firm_id, party_id, party_type);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_firm_party ON ledger_entries (firm_id, party_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_linked ON ledger_entries (firm_id, linked_entity_id, linked_entity_type);

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
          status TEXT DEFAULT 'PAID' NOT NULL,
          reason TEXT,
          linked_invoice_id TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_payments_party ON payments (firm_id, party_id, party_type);
        CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (firm_id, linked_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (firm_id, created_at);

        CREATE TABLE IF NOT EXISTS supplier_metal_payments (
          id TEXT PRIMARY KEY NOT NULL,
          firm_id TEXT NOT NULL,
          fy_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          payment_date TEXT NOT NULL,
          metal_weight_mg INTEGER DEFAULT 0 NOT NULL,
          metal_purity_pct REAL DEFAULT 0 NOT NULL,
          metal_fine_weight_mg INTEGER DEFAULT 0 NOT NULL,
          metal_rate_paise_per_gram INTEGER DEFAULT 0 NOT NULL,
          metal_value_paise INTEGER DEFAULT 0 NOT NULL,
          money_amount_paise INTEGER DEFAULT 0 NOT NULL,
          money_mode TEXT,
          bank_account_id TEXT,
          total_value_paise INTEGER NOT NULL,
          linked_purchase_invoice_id TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_smp_firm_supplier ON supplier_metal_payments (firm_id, supplier_id);
        CREATE INDEX IF NOT EXISTS idx_smp_invoice ON supplier_metal_payments (linked_purchase_invoice_id) WHERE linked_purchase_invoice_id IS NOT NULL;

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
          is_partial INTEGER DEFAULT 0 NOT NULL,
          remaining_old_metal_credit_paise INTEGER DEFAULT 0 NOT NULL,
          status TEXT DEFAULT 'POSTED' NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (original_invoice_id) REFERENCES sale_invoices(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_credit_notes_firm_status ON credit_notes (firm_id, status);
        CREATE INDEX IF NOT EXISTS idx_credit_notes_num ON credit_notes (firm_id, cn_number);
        CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes (original_invoice_id);

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
          status TEXT DEFAULT 'POSTED' NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (fy_id) REFERENCES financial_years(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
          FOREIGN KEY (original_invoice_id) REFERENCES sale_invoices(id) ON UPDATE NO ACTION ON DELETE NO ACTION
        );
        CREATE INDEX IF NOT EXISTS idx_debit_notes_firm_status ON debit_notes (firm_id, status);
        CREATE INDEX IF NOT EXISTS idx_debit_notes_num ON debit_notes (firm_id, dn_number);
        CREATE INDEX IF NOT EXISTS idx_debit_notes_invoice ON debit_notes (original_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_debit_notes_customer ON debit_notes (firm_id, customer_id);

        CREATE TABLE IF NOT EXISTS migration_log (
          id TEXT PRIMARY KEY NOT NULL,
          step_key TEXT NOT NULL UNIQUE,
          description TEXT,
          applied_at TEXT NOT NULL
        );
      `);
    } catch (e) {
      console.warn('[DB Client] Self-healing Phase 3 billing tables check:', e);
    }

    // 9. STEP M — Phase 3 Migrations
    try {
      const { stepMMigrationService } = require('@/services/phase3/stepMMigrationService');
      stepMMigrationService.runAllStepMMigrations(sqlite);
    } catch (e) {
      console.warn('[DB Client] Step M Migrations check:', e);
    }

    // 10. PHASE 4 STEP M — Migrations
    try {
      const { stepMMigrationPhase4Service } = require('@/services/phase4/stepMMigrationPhase4Service');
      stepMMigrationPhase4Service.runAllStepMMigrations(sqlite);
    } catch (e) {
      console.warn('[DB Client] Phase 4 Step M Migrations check:', e);
    }

    // 11. Migration Zero Seed Fallback
    const seedCheck = sqlite.getFirstSync<{ count: number }>(
      'SELECT count(*) as count FROM schema_version'
    );

    if (seedCheck && seedCheck.count === 0) {
      const isoNow = new Date().toISOString();

      sqlite.execSync(`INSERT OR IGNORE INTO safe_mode_state (id, is_active) VALUES (1, 0);`);
      sqlite.execSync(
        `INSERT OR IGNORE INTO schema_version (id, current_version) VALUES (1, ${SCHEMA_VERSION});`
      );
      sqlite.execSync(`INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0);`);

      sqlite.runSync(
        `INSERT OR IGNORE INTO app_settings
          (id, date_format_token, theme, audit_retention_days, audit_retention_last_run_at,
           currency, currency_symbol, currency_decimal_places,
           warn_unsaved_changes, updated_at)
          VALUES (1, ?, ?, ?, NULL, ?, ?, ?, ?, ?);`,
        ['dd/MM/yyyy', 'system', 30, 'INR', '\u20B9', 2, 1, isoNow]
      );
    }

    isDbInitialized = true;
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export function useDatabase(shouldStart: boolean = true) {
  const [isLoaded, setIsLoaded] = useState(isDbInitialized);
  const [triggerError, setTriggerError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shouldStart) return;
    if (isDbInitialized) {
      setIsLoaded(true);
      return;
    }

    let isMounted = true;
    runDatabaseMigrations()
      .then(() => {
        if (isMounted) setIsLoaded(true);
      })
      .catch((e) => {
        console.error('[DB Client] Failed to open DB, apply migrations or PRAGMAs:', e);
        if (isMounted) setTriggerError(e as Error);
      });

    return () => {
      isMounted = false;
    };
  }, [shouldStart]);

  return {
    isLoaded,
    error: triggerError,
  };
}

export default db;
