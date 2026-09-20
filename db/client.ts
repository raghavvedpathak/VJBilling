import { useEffect, useState } from 'react';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { STORAGE_PATHS, SCHEMA_VERSION } from '../constants';

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

        // 2. Synchronize schema_version to current active app schema (Phase 2 = v2)
        try {
          expoDb.execSync(`UPDATE schema_version SET current_version = ${SCHEMA_VERSION} WHERE id = 1 AND current_version < ${SCHEMA_VERSION};`);
        } catch (e) {
          console.warn('[DB Client] Updating schema_version to Phase 2:', e);
        }

        // 3. Self-healing schema check for design_purity_thresholds (v2.13 FIX-LOWSTOCK-PURITYGRAIN-1)
        try {
          expoDb.execSync(`
            CREATE TABLE IF NOT EXISTS design_purity_thresholds (
              design_id TEXT NOT NULL,
              purity_percent REAL NOT NULL,
              low_stock_threshold INTEGER NOT NULL,
              PRIMARY KEY (design_id, purity_percent),
              FOREIGN KEY (design_id) REFERENCES designs(id) ON UPDATE NO ACTION ON DELETE NO ACTION
            );
          `);

          const designCols = expoDb.getAllSync<{ name: string }>('PRAGMA table_info(designs)');
          if (designCols.some(c => c.name === 'low_stock_threshold')) {
            console.log('[DB Client] Self-healing: Dropping deprecated low_stock_threshold column from designs...');
            expoDb.execSync('ALTER TABLE designs DROP COLUMN low_stock_threshold;');
          }
        } catch (e) {
          console.warn('[DB Client] Self-healing design_purity_thresholds check:', e);
        }

        // 4. Self-healing schema check for rate_engine_config (Phase 3 Step RE)
        try {
          expoDb.execSync(`
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
          expoDb.execSync(`
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

          // FIX-CUSTOMER-URD-1 (v5.9): Check for aadhaar_number and pan_number columns
          const custCols = expoDb.getAllSync<{ name: string }>('PRAGMA table_info(customers)');
          if (!custCols.some(c => c.name === 'aadhaar_number')) {
            expoDb.execSync('ALTER TABLE customers ADD COLUMN aadhaar_number TEXT;');
          }
          if (!custCols.some(c => c.name === 'pan_number')) {
            expoDb.execSync('ALTER TABLE customers ADD COLUMN pan_number TEXT;');
          }
        } catch (e) {
          console.warn('[DB Client] Self-healing customers check:', e);
        }

        // 6. Self-healing schema check for suppliers (Phase 3 Step 2)
        try {
          expoDb.execSync(`
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
          expoDb.execSync(`
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

          // v5.14 FIX-LINKEDJOBWORK-COL-1: Check linked_job_work_id column
          const ledgerCols = expoDb.getAllSync<{ name: string }>('PRAGMA table_info(karigar_ledger)');
          if (!ledgerCols.some(c => c.name === 'linked_job_work_id')) {
            expoDb.execSync('ALTER TABLE karigar_ledger ADD COLUMN linked_job_work_id TEXT;');
          }
        } catch (e) {
          console.warn('[DB Client] Self-healing karigar check:', e);
        }

        // 8. Self-healing schema check for purchase_invoices & purchase_invoice_items (Phase 3 Step 15)
        try {
          expoDb.execSync(`
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

        // 8. Self-healing schema check for bank_accounts (Step 16)
        try {
          expoDb.execSync(`
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

        // 8b. Self-healing schema check for Phase 3 Billing & Invoicing (Steps 4, 5, 6, 7, 10, 11, 12, 13, 14)
        try {
          expoDb.execSync(`
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

        // 9. STEP M — MIGRATION & DEPLOYMENT ORDER (v4.7 / v5.4 / v5.20 / v5.42)
        try {
          const { stepMMigrationService } = require('@/services/phase3/stepMMigrationService');
          stepMMigrationService.runAllStepMMigrations(expoDb);
          console.log('[DB Client] Step M Migrations complete.');
        } catch (e) {
          console.warn('[DB Client] Step M Migrations check:', e);
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
          expoDb.execSync(`INSERT OR IGNORE INTO schema_version (id, current_version) VALUES (1, ${SCHEMA_VERSION});`);
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

    let isMounted = true;
    initPromise
      .then(() => {
        isDbInitialized = true;
        if (isMounted) {
          setIsLoaded(true);
        }
      })
      .catch((e) => {
        console.error('[DB Client] Failed to apply migrations or PRAGMAs:', e);
        if (isMounted) {
          setTriggerError(e as Error);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    isLoaded,
    error: triggerError,
  };
}

export default db;