// db/schema/phase3_money_truth.ts — Phase 3 Money Truth Layer Schema
// Strictly adheres to STEP RE specification & Phase 3 Contracts (v5.6 / v5.41)

import { sqliteTable, text, integer, real, index, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { firms, financialYears } from './phase1_core';
import { items } from './phase2_inventory';

// =============================================================================
// TABLE: rate_engine_config (Step RE)
// Format of ID: '{firmId}_rate_config' — fixed key per firm
// Pattern: Upsert (INSERT OR REPLACE). Exactly one row per firm at all times.
// All amounts stored in INTEGER PAISE. No floats. No rupees.
// =============================================================================

export const rateEngineConfig = sqliteTable('rate_engine_config', {
  id: text('id').primaryKey(), // '{firmId}_rate_config'
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  gold24BasePer10gPaise: integer('gold_24_base_per_10g_paise').notNull(),
  gold22BasePer10gPaise: integer('gold_22_base_per_10g_paise').notNull(),
  goldCashPer10gPaise: integer('gold_cash_per_10g_paise').notNull(),
  silverCashPerKgPaise: integer('silver_cash_per_kg_paise').notNull(),
  lastUpdatedAt: text('last_updated_at').notNull(), // ISO-8601
});

// =============================================================================
// TABLE: customers (Step 1 — Customer Master)
// Firm-scoped identity. Soft delete only.
// Balance is always derived at query time across all FYs.
// aadhaarNumber & panNumber are optional for URD pre-fill (FIX-CUSTOMER-URD-1 v5.9).
// =============================================================================

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  name: text('name').notNull(),
  mobile: text('mobile'),
  gstin: text('gstin'),
  address: text('address'),
  aadhaarNumber: text('aadhaar_number'),
  panNumber: text('pan_number'),
  isDeleted: integer('is_deleted').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  idxCustomersFirmName: index('idx_customers_firm_name').on(table.firmId, table.name).where(sql`is_deleted = 0`),
  idxCustomersFirmMobile: index('idx_customers_firm_mobile').on(table.firmId, table.mobile).where(sql`is_deleted = 0`),
}));

// =============================================================================
// TABLE: suppliers (Step 2 — Supplier Master)
// External purchase parties only. Bank details.
// CONSTITUTIONAL RULE: KARIGAR IS A SEPARATE ENTITY (Step 3).
// Types: SUPPLIER | REFINERY | VENDOR. Soft archive only.
// =============================================================================

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  name: text('name').notNull(),
  mobile: text('mobile'),
  gstin: text('gstin'),
  address: text('address'),
  type: text('type', { enum: ['SUPPLIER', 'REFINERY', 'VENDOR'] })
    .notNull()
    .default('SUPPLIER'),
  bankName: text('bank_name'),
  bankAccount: text('bank_account'),
  ifsc: text('ifsc'),
  isArchived: integer('is_archived').notNull().default(0),
  isDeleted: integer('is_deleted').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxSuppliersFirmName: index('idx_suppliers_firm_name').on(table.firmId, table.name).where(sql`is_deleted = 0`),
  idxSuppliersFirmMobile: index('idx_suppliers_firm_mobile').on(table.firmId, table.mobile).where(sql`is_deleted = 0`),
}));

// =============================================================================
// TABLE: karigar (Step 3 — Karigar Master)
// Job work party. Metal + Money dual ledger.
// CONSTITUTIONAL RULE: Independent party type — NOT a subtype of Supplier.
// Balances are NEVER stored — always dynamically derived from karigar_ledger.
// Soft archive and soft delete only.
// =============================================================================

export const karigar = sqliteTable('karigar', {
  id: text('id').primaryKey(),
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  name: text('name').notNull(),
  mobile: text('mobile'),
  address: text('address'),
  speciality: text('speciality'), // e.g. 'Gold Chains', 'Rings', 'Bangles'
  bankName: text('bank_name'),
  bankAccount: text('bank_account'),
  ifsc: text('ifsc'),
  isArchived: integer('is_archived').notNull().default(0),
  isDeleted: integer('is_deleted').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(), // v5.4 GAP 8 FIX: updatedAt added
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxKarigarFirmName: index('idx_karigar_firm_name').on(table.firmId, table.name).where(sql`is_deleted = 0`),
  idxKarigarFirmMobile: index('idx_karigar_firm_mobile').on(table.firmId, table.mobile).where(sql`is_deleted = 0`),
}));

// =============================================================================
// TABLE: karigar_ledger (Step 3 — Karigar Master Dual Ledger)
// APPEND-ONLY: No updates or deletes.
// Multi-FY Decision (v5.17 FIX-KARIGAR-CROSSFY-1): Balances are firm-wide lifetime aggregates.
// fy_id records entry creation FY for day-book/reporting only (NOT a balance scope filter).
// v4.7: METAL_SETTLED_AS_MONEY, ratePaisePerGram, isManualRate
// v5.14 FIX-LINKEDJOBWORK-COL-1: linkedJobWorkId dedicated column
// =============================================================================

export const karigarLedger = sqliteTable('karigar_ledger', {
  id: text('id').primaryKey(),
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id').references(() => financialYears.id),
  karigarId: text('karigar_id')
    .notNull()
    .references(() => karigar.id), // v5.28 FIX-KARIGAR-SCHEMA-STRICT-1: NOT NULL constraint
  type: text('type', {
    enum: [
      'METAL_OUT',
      'METAL_IN',
      'LABOUR_PAYABLE',
      'LABOUR_PAID',
      'METAL_SETTLED_AS_MONEY',
      'LABOUR_IN_GOLD',
    ],
  }).notNull(),
  weightMg: integer('weight_mg').notNull().default(0),
  purityPct: real('purity_pct').notNull().default(0),
  amountPaise: integer('amount_paise').notNull().default(0),
  ratePaisePerGram: integer('rate_paise_per_gram').notNull().default(0), // v4.7
  isManualRate: integer('is_manual_rate').notNull().default(0), // v4.7
  linkedEntityId: text('linked_entity_id'),
  linkedJobWorkId: text('linked_job_work_id'), // v5.14 FIX-LINKEDJOBWORK-COL-1
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  karigarFk: foreignKey({ columns: [table.karigarId], foreignColumns: [karigar.id] }),
  idxKarigarLedgerKarigar: index('idx_karigar_ledger_karigar').on(table.firmId, table.karigarId),
  idxKarigarLedgerFirmKarigar: index('idx_karigar_ledger_firm_karigar').on(table.firmId, table.karigarId, table.type),
  idxKarigarLedgerFirmType: index('idx_karigar_ledger_firm_type').on(table.firmId, table.type, table.karigarId),
  idxKarigarLedgerJobWork: index('idx_karigar_ledger_job_work')
    .on(table.linkedJobWorkId)
    .where(sql`linked_job_work_id IS NOT NULL`),
}));

// =============================================================================
// TABLE: invoice_number_config (Step 4 — Invoice Number Generation)
// Sequence store for Phase 3 documents: SALE, PURCHASE, CN, DN, EST.
// CONSTITUTIONAL RULE (v4.9 / v5.4 GAP 5): Phase 2 owns sequenceCounters (for SKU).
// Phase 3 uses invoice_number_config as the SOLE AND ONLY invoice sequence store.
// One row per (firmId, fyId, docType). Resets every FY. Never goes backward.
// v5.4 GAP 7 FIX: createdAt and updatedAt columns added for audit traceability.
// =============================================================================

export const invoiceNumberConfig = sqliteTable('invoice_number_config', {
  id: text('id').primaryKey(),
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  docType: text('doc_type', {
    enum: ['SALE', 'PURCHASE', 'CN', 'DN', 'EST'],
  }).notNull(),
  prefix: text('prefix').notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  allowManualOverride: integer('allow_manual_override').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  idxInvNumCfgUnique: index('idx_inv_num_cfg_unique').on(table.firmId, table.fyId, table.docType),
}));

// =============================================================================
// TABLE: invoice_print_settings (Step 4 — Settings > Invoice Print Settings)
// FIX-INVOICE-PRINT-1 (v5.19): Supports A4 / A5 in Portrait / Landscape.
// Terms & Conditions on/off toggle and custom freeform text.
// Pattern: INSERT OR REPLACE on every save. One row per firm at all times.
// ID format: '{firmId}_print_settings'.
// CONSTITUTIONAL RULE: Has ZERO effect on accounting data or Phase 1 app_settings.
// =============================================================================

export const invoicePrintSettings = sqliteTable('invoice_print_settings', {
  id: text('id').primaryKey(), // '{firmId}_print_settings'
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  paperSize: text('paper_size', {
    enum: ['A4', 'A5'],
  }).notNull().default('A5'),
  orientation: text('orientation', {
    enum: ['PORTRAIT', 'LANDSCAPE'],
  }).notNull().default('LANDSCAPE'),
  showTermsAndConditions: integer('show_terms_and_conditions').notNull().default(0),
  termsAndConditionsText: text('terms_and_conditions_text').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxPrintSettingsFirm: index('idx_invoice_print_settings_firm').on(table.firmId),
}));

// =============================================================================
// TABLE: sale_invoices (Step 6 — Sale Invoice Domain Model)
// State machine: DRAFT -> POSTED -> VOID.
// All amounts strictly stored in integer paise.
// Immutable after POST. Reversal via Credit Note only (VOID).
// Composite index: (firmId, status) — v4.3
// =============================================================================

export const saleInvoices = sqliteTable('sale_invoices', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  invoiceNumber: text('invoice_number'), // NULL during DRAFT, assigned at POST
  invoiceDate: text('invoice_date').notNull(), // ISO 8601
  status: text('status', {
    enum: ['DRAFT', 'POSTED', 'VOID'],
  }).notNull().default('DRAFT'),
  metalRatePaisePerGram: integer('metal_rate_paise_per_gram').notNull(),
  isManualRate: integer('is_manual_rate').notNull().default(0),
  makingChargesMode: text('making_charges_mode', {
    enum: ['FLAT', 'PER_GRAM'],
  }).notNull().default('FLAT'),
  makingChargesPaise: integer('making_charges_paise').notNull().default(0),
  taxableMetalAmtPaise: integer('taxable_metal_amt_paise').notNull().default(0),
  taxableMakingAmtPaise: integer('taxable_making_amt_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  stoneAmtPaise: integer('stone_amt_paise').notNull().default(0),
  oldMetalDeductionPaise: integer('old_metal_deduction_paise').notNull().default(0),
  discountPaise: integer('discount_paise').notNull().default(0),
  roundOffPaise: integer('round_off_paise').notNull().default(0),
  netPayablePaise: integer('net_payable_paise').notNull().default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull(), // ISO 8601
  postedAt: text('posted_at'), // ISO 8601, set at POST
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  customerFk: foreignKey({ columns: [table.customerId], foreignColumns: [customers.id] }),
  idxSaleInvoicesFirmStatus: index('idx_sale_invoices_firm_status').on(table.firmId, table.status),
  idxSaleInvoicesNum: index('idx_sale_invoices_num').on(table.firmId, table.invoiceNumber),
}));

// =============================================================================
// TABLE: sale_invoice_items (Step 6 — Sale Invoice Items & Snapshots)
// Snapshot fields written at POST, never re-read from Phase 2.
// Supports both SERIALIZED_ITEM and LOOSE_LOT lines (v5.35 FEAT-LOOSE-STOCK-SALE-1).
// =============================================================================

export const saleInvoiceItems = sqliteTable('sale_invoice_items', {
  id: text('id').primaryKey(), // UUID
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => saleInvoices.id, { onDelete: 'cascade' }),
  stockLotId: text('stock_lot_id').notNull(), // items.id for SERIALIZED_ITEM, loose_stock_lots.id for LOOSE_LOT
  // === SNAPSHOT — written at POST, never re-read from Phase 2 ===
  sku: text('sku'),
  itemName: text('item_name').notNull(),
  metal: text('metal').notNull(),
  purityPct: real('purity_pct').notNull(),
  grossWeightMg: integer('gross_weight_mg'),
  stoneWeightMg: integer('stone_weight_mg').default(0),
  netWeightMg: integer('net_weight_mg'),
  fineWeightMg: integer('fine_weight_mg'),
  hsnCode: text('hsn_code'),
  stoneAmountPaise: integer('stone_amount_paise').notNull().default(0),
  metalValuePaise: integer('metal_value_paise').notNull().default(0),
  makingChargesPaise: integer('making_charges_paise').notNull().default(0),
  lineGstPaise: integer('line_gst_paise').notNull().default(0),
  lineTotalPaise: integer('line_total_paise').notNull().default(0),
  metalTaxGroupId: text('metal_tax_group_id'), // FIX-V521-2 (v5.21)
  makingTaxGroupId: text('making_tax_group_id'), // FIX-V521-2 (v5.21)
  // FEAT-LOOSE-STOCK-SALE-1 (v5.35): loose-lot line support
  lineType: text('line_type', {
    enum: ['SERIALIZED_ITEM', 'LOOSE_LOT'],
  }).notNull().default('SERIALIZED_ITEM'),
  qtySold: integer('qty_sold'), // NULL for SERIALIZED_ITEM; required for LOOSE_LOT
  weightSoldMg: integer('weight_sold_mg'), // NULL for SERIALIZED_ITEM; required for LOOSE_LOT
}, (table) => ({
  invoiceFk: foreignKey({ columns: [table.invoiceId], foreignColumns: [saleInvoices.id] }),
  idxSaleInvoiceItemsInvoice: index('idx_sale_invoice_items_invoice').on(table.invoiceId),
  idxSaleInvoiceItemsStock: index('idx_sale_invoice_items_stock').on(table.stockLotId),
}));

// =============================================================================
// TABLE: estimate_invoices (Step 7B — Estimate Engine)
// Quotation before commitment. No stock movement. No ledger posting.
// Status lifecycle: DRAFT -> SAVED -> CONVERTED -> EXPIRED
// All amounts estimated only — NOT binding.
// =============================================================================

export const estimateInvoices = sqliteTable('estimate_invoices', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  customerId: text('customer_id')
    .references(() => customers.id), // nullable for walk-in / guest estimates
  estimateNumber: text('estimate_number'), // NULL until saved — format: EST/{fyLabel}/{seq}
  estimateDate: text('estimate_date').notNull(), // ISO 8601
  status: text('status', {
    enum: ['DRAFT', 'SAVED', 'CONVERTED', 'EXPIRED'],
  }).notNull().default('DRAFT'),
  metalRatePaisePerGram: integer('metal_rate_paise_per_gram').notNull(),
  isManualRate: integer('is_manual_rate').notNull().default(0),
  makingChargesMode: text('making_charges_mode', {
    enum: ['FLAT', 'PER_GRAM'],
  }).notNull().default('FLAT'),
  makingChargesPaise: integer('making_charges_paise').notNull().default(0),
  netPayablePaise: integer('net_payable_paise').notNull().default(0), // estimated only — NOT binding
  notes: text('notes'),
  convertedInvoiceId: text('converted_invoice_id')
    .references(() => saleInvoices.id), // FK -> sale_invoices.id (nullable)
  createdAt: text('created_at').notNull(), // ISO 8601
  updatedAt: text('updated_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  customerFk: foreignKey({ columns: [table.customerId], foreignColumns: [customers.id] }),
  convertedInvoiceFk: foreignKey({ columns: [table.convertedInvoiceId], foreignColumns: [saleInvoices.id] }),
  idxEstimateInvoicesFirmStatus: index('idx_estimate_invoices_firm_status').on(table.firmId, table.status),
  idxEstimateInvoicesNum: index('idx_estimate_invoices_num').on(table.firmId, table.estimateNumber),
}));

// =============================================================================
// TABLE: estimate_items (Step 7B — Estimate Items)
// Reference only — StockLot is NOT reserved. StockLot status NEVER changes.
// =============================================================================

export const estimateItems = sqliteTable('estimate_items', {
  id: text('id').primaryKey(), // UUID
  estimateId: text('estimate_id')
    .notNull()
    .references(() => estimateInvoices.id, { onDelete: 'cascade' }),
  stockLotId: text('stock_lot_id').notNull(), // reference only — NOT reserved
  sku: text('sku'),
  itemName: text('item_name').notNull(),
  metal: text('metal').notNull(),
  purityPct: real('purity_pct').notNull(),
  grossWeightMg: integer('gross_weight_mg'),
  stoneWeightMg: integer('stone_weight_mg').default(0),
  netWeightMg: integer('net_weight_mg'),
  fineWeightMg: integer('fine_weight_mg'),
  hsnCode: text('hsn_code'),
  metalValuePaise: integer('metal_value_paise').notNull().default(0),
  makingChargesPaise: integer('making_charges_paise').notNull().default(0),
  lineTotalPaise: integer('line_total_paise').notNull().default(0),
}, (table) => ({
  estimateFk: foreignKey({ columns: [table.estimateId], foreignColumns: [estimateInvoices.id] }),
  idxEstimateItemsEstimate: index('idx_estimate_items_estimate').on(table.estimateId),
  idxEstimateItemsStock: index('idx_estimate_items_stock').on(table.stockLotId),
}));
// =============================================================================
// TABLE: ledger_entries (Step 9 / Step 10 — Party Receivables & Payables Ledger)
// Single monetary ledger recording receivables and payables for customers and suppliers.
// Balances are never stored; always dynamically derived as SUM(debit) - SUM(credit).
// =============================================================================

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .references(() => financialYears.id),
  partyId: text('party_id').notNull(),
  partyType: text('party_type', {
    enum: ['CUSTOMER', 'SUPPLIER'],
  }).notNull(),
  type: text('type', {
    enum: ['DEBIT', 'CREDIT'],
  }).notNull().default('DEBIT'),
  amountPaise: integer('amount_paise').notNull().default(0),
  linkedEntityType: text('linked_entity_type'), // INVOICE | PAYMENT | CREDIT_NOTE | DEBIT_NOTE | SUPPLIER_METAL_PAYMENT | OLD_METAL
  linkedEntityId: text('linked_entity_id'),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  // Backward compatibility fields
  debitPaise: integer('debit_paise').notNull().default(0),
  creditPaise: integer('credit_paise').notNull().default(0),
  referenceType: text('reference_type'),
  referenceId: text('reference_id'),
  notes: text('notes'),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  idxLedgerEntriesParty: index('idx_ledger_entries_party').on(table.firmId, table.partyId, table.partyType),
  idxLedgerEntriesFirmParty: index('idx_ledger_entries_firm_party').on(table.firmId, table.partyId),
  idxLedgerEntriesLinked: index('idx_ledger_entries_linked').on(table.firmId, table.linkedEntityId, table.linkedEntityType),
}));

// =============================================================================
// TABLE: payments (Step 11 — Payment Engine)
// Append-only money movements. Money-only payments. Bill-linkable via linkedInvoiceId.
// Partial payments supported.
// =============================================================================

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .references(() => financialYears.id),
  partyId: text('party_id').notNull(),
  partyType: text('party_type', {
    enum: ['CUSTOMER', 'SUPPLIER'],
  }).notNull(),
  type: text('type', {
    enum: ['MONEY_IN', 'MONEY_OUT'],
  }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  mode: text('mode', {
    enum: ['CASH', 'BANK', 'UPI'],
  }).notNull(),
  bankAccountId: text('bank_account_id'), // nullable for CASH; REQUIRED for BANK and UPI
  status: text('status', {
    enum: ['PAID', 'PENDING'],
  }).notNull().default('PAID'),
  reason: text('reason'),
  linkedInvoiceId: text('linked_invoice_id'), // nullable FK -> sale_invoices.id or purchase_invoices.id
  notes: text('notes'),
  createdAt: text('created_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  idxPaymentsParty: index('idx_payments_party').on(table.firmId, table.partyId, table.partyType),
  idxPaymentsInvoice: index('idx_payments_invoice').on(table.firmId, table.linkedInvoiceId),
  idxPaymentsDate: index('idx_payments_date').on(table.firmId, table.createdAt),
}));

// =============================================================================
// TABLE: supplier_metal_payments (Step 11A — Supplier Metal Payment Engine)
// Supports paying supplier in metal, money, or mixed (metal + money).
// =============================================================================

export const supplierMetalPayments = sqliteTable('supplier_metal_payments', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  paymentDate: text('payment_date').notNull(), // ISO 8601
  // Metal Portion
  metalWeightMg: integer('metal_weight_mg').notNull().default(0),
  metalPurityPct: real('metal_purity_pct').notNull().default(0),
  metalFineWeightMg: integer('metal_fine_weight_mg').notNull().default(0),
  metalRatePaisePerGram: integer('metal_rate_paise_per_gram').notNull().default(0),
  metalValuePaise: integer('metal_value_paise').notNull().default(0),
  // Money Portion
  moneyAmountPaise: integer('money_amount_paise').notNull().default(0),
  moneyMode: text('money_mode', {
    enum: ['CASH', 'BANK', 'UPI'],
  }),
  bankAccountId: text('bank_account_id'),
  // Totals & Linkage
  totalValuePaise: integer('total_value_paise').notNull(),
  linkedPurchaseInvoiceId: text('linked_purchase_invoice_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  supplierFk: foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id] }),
  idxSmpFirmSupplier: index('idx_smp_firm_supplier').on(table.firmId, table.supplierId),
  idxSmpInvoice: index('idx_smp_invoice')
    .on(table.linkedPurchaseInvoiceId)
    .where(sql`linked_purchase_invoice_id IS NOT NULL`),
}));

// =============================================================================
// TABLE: credit_notes (Step 13 — Credit Note Domain Model)
// Invoice reversal & partial credit note support (v5.1 / v5.4 GAP 6 / v5.20).
// Status is POSTED upon creation.
// =============================================================================

export const creditNotes = sqliteTable('credit_notes', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  originalInvoiceId: text('original_invoice_id')
    .notNull()
    .references(() => saleInvoices.id),
  cnNumber: text('cn_number').notNull(),
  cnDate: text('cn_date').notNull(), // ISO 8601
  reason: text('reason').notNull(),
  returnedItemIds: text('returned_item_ids').notNull(), // JSON array of sale_invoice_item IDs
  creditAmountPaise: integer('credit_amount_paise').notNull(),
  isPartial: integer('is_partial').notNull().default(0),
  remainingOldMetalCreditPaise: integer('remaining_old_metal_credit_paise').notNull().default(0), // v4.6: UI MUST display when > 0
  status: text('status', {
    enum: ['POSTED'],
  }).notNull().default('POSTED'),
  createdAt: text('created_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  invoiceFk: foreignKey({ columns: [table.originalInvoiceId], foreignColumns: [saleInvoices.id] }),
  idxCreditNotesFirmStatus: index('idx_credit_notes_firm_status').on(table.firmId, table.status),
  idxCreditNotesNum: index('idx_credit_notes_num').on(table.firmId, table.cnNumber),
  idxCreditNotesInvoice: index('idx_credit_notes_invoice').on(table.originalInvoiceId),
}));

// =============================================================================
// TABLE: debit_notes (Step 14 — Debit Note Domain Model)
// Underbilling correction. Increases customer receivable.
// POSTED-only, single-operation created and posted.
// FIX-V523-1 (v5.23): entryDate / entry_date in SQL.
// =============================================================================

export const debitNotes = sqliteTable('debit_notes', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  originalInvoiceId: text('original_invoice_id')
    .notNull()
    .references(() => saleInvoices.id),
  dnNumber: text('dn_number').notNull(),
  entryDate: text('entry_date').notNull(), // ISO 8601 (FIX-V523-1)
  reason: text('reason').notNull(),
  additionalAmountPaise: integer('additional_amount_paise').notNull(),
  status: text('status', {
    enum: ['POSTED'],
  }).notNull().default('POSTED'),
  createdAt: text('created_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  customerFk: foreignKey({ columns: [table.customerId], foreignColumns: [customers.id] }),
  invoiceFk: foreignKey({ columns: [table.originalInvoiceId], foreignColumns: [saleInvoices.id] }),
  idxDebitNotesFirmStatus: index('idx_debit_notes_firm_status').on(table.firmId, table.status),
  idxDebitNotesNum: index('idx_debit_notes_num').on(table.firmId, table.dnNumber),
  idxDebitNotesInvoice: index('idx_debit_notes_invoice').on(table.originalInvoiceId),
  idxDebitNotesCustomer: index('idx_debit_notes_customer').on(table.firmId, table.customerId),
}));

// =============================================================================
// TABLE: purchase_invoices (Step 15 — Purchase Invoice Domain Model)
// Full service contract. Supplier payable ledger entry.
// POSTED-only scope in Phase 3. No DRAFT engine.
// Composite index: (firmId, status) — v5.0 ADDED
// =============================================================================

export const purchaseInvoices = sqliteTable('purchase_invoices', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  supplierInvoiceNumber: text('supplier_invoice_number'),
  supplierInvoiceDate: text('supplier_invoice_date').notNull(), // ISO 8601
  invoiceNumber: text('invoice_number').notNull(),
  status: text('status', {
    enum: ['POSTED', 'VOID'],
  }).notNull().default('POSTED'),
  taxableAmountPaise: integer('taxable_amount_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  totalAmountPaise: integer('total_amount_paise').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(), // ISO 8601
  postedAt: text('posted_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  fyFk: foreignKey({ columns: [table.fyId], foreignColumns: [financialYears.id] }),
  supplierFk: foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id] }),
  idxPurchaseInvoicesFirmStatus: index('idx_purchase_invoices_firm_status').on(table.firmId, table.status),
  idxPurchaseInvoicesNum: index('idx_purchase_invoices_num').on(table.firmId, table.invoiceNumber),
  idxPurchaseInvoicesSupplier: index('idx_purchase_invoices_supplier').on(table.firmId, table.supplierId),
}));

// =============================================================================
// TABLE: purchase_invoice_items (Step 15 — Purchase Invoice Line Items)
// FIX-V521-8 (v5.21) Option A: Line-item cost basis for Phase 7 WAC & audit traceability
// FEAT-PURCHASE-AUTOSTOCK-1 (v5.26): createdItemId backlink to auto-created Phase 2 items
// APPEND-ONLY: No update or delete methods
// =============================================================================

export const purchaseInvoiceItems = sqliteTable('purchase_invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => purchaseInvoices.id),
  itemDescription: text('item_description').notNull(),
  metalType: text('metal_type'), // GOLD | SILVER | OTHER
  grossWeightMg: integer('gross_weight_mg').notNull().default(0),
  purityPct: real('purity_pct').notNull().default(0),
  fineWeightMg: integer('fine_weight_mg').notNull().default(0),
  ratePerGramPaise: integer('rate_per_gram_paise').notNull().default(0),
  taxableAmountPaise: integer('taxable_amount_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  lineTotalPaise: integer('line_total_paise').notNull(),
  hsnCode: text('hsn_code'),
  createdItemId: text('created_item_id').references(() => items.id),
}, (table) => ({
  invoiceFk: foreignKey({ columns: [table.invoiceId], foreignColumns: [purchaseInvoices.id] }),
  itemFk: foreignKey({ columns: [table.createdItemId], foreignColumns: [items.id] }),
  idxPiiInvoice: index('idx_pii_invoice').on(table.invoiceId),
}));

// =============================================================================
// TABLE: bank_accounts (Step 16 — Bank Account Master)
// Firm bank accounts. One default per firm.
// =============================================================================

export const bankAccounts = sqliteTable('bank_accounts', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id),
  bankName: text('bank_name').notNull(),
  accountHolder: text('account_holder').notNull(),
  accountNumber: text('account_number').notNull(),
  ifsc: text('ifsc').notNull(),
  branch: text('branch'),
  upiIds: text('upi_ids'), // JSON array of string handles
  isDefault: integer('is_default').notNull().default(0), // 0 or 1. Maximum one default per firm
  isArchived: integer('is_archived').notNull().default(0), // 0 or 1
  createdAt: text('created_at').notNull(), // ISO 8601
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxBankAccountsFirmDefault: index('idx_bank_accounts_firm_default').on(table.firmId, table.isDefault),
  idxBankAccountsFirmArchived: index('idx_bank_accounts_firm_archived').on(table.firmId, table.isArchived),
  idxBankAccountsFirmAccNum: index('idx_bank_accounts_firm_acc_num').on(table.firmId, table.accountNumber),
}));

export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

// =============================================================================
// TABLE: migration_log (Step M — Migration & Deployment Order)
// Guard table for idempotent schema migrations and backfill steps.
// =============================================================================

export const migrationLog = sqliteTable('migration_log', {
  id: text('id').primaryKey(),
  stepKey: text('step_key').notNull().unique(),
  description: text('description'),
  appliedAt: text('applied_at').notNull(),
});

export type MigrationLog = typeof migrationLog.$inferSelect;
export type NewMigrationLog = typeof migrationLog.$inferInsert;

