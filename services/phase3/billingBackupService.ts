// services/phase3/billingBackupService.ts — Phase 3 STEP 21: Billing Backup Extension Service
// Assembles all Phase 3 tables and Phase 2/Phase 1 tables into the canonical backupPayload.
// schemaVersion: 9 (v5.35: looseStockLots + looseStockEvents added — FIX-SCHEMAVERSYNC-1 v5.37)
// Registers extension provider with Phase 1 backupService.

import quickCrypto from 'react-native-quick-crypto';
import {
  rateEngineConfig,
  customers,
  suppliers,
  karigar,
  karigarLedger,
  invoiceNumberConfig,
  invoicePrintSettings,
  saleInvoices,
  saleInvoiceItems,
  estimateInvoices,
  estimateItems,
  ledgerEntries,
  payments,
  supplierMetalPayments,
  creditNotes,
  debitNotes,
  purchaseInvoices,
  purchaseInvoiceItems,
  bankAccounts,
} from '@/db/schema/phase3_money_truth';
import {
  firms,
  financialYears,
  appSettings,
  auditLogs,
  safeModeState,
  taxRates,
  taxGroups,
  taxGroupComponents,
} from '@/db/schema/phase1_core';
import {
  categories,
  designs,
  designPurityThresholds,
  designCategoryMap,
  stones,
  gemstoneLots,
  hsnCodes,
  sequenceCounters,
  items,
  oldMetalLots,
  urdPurchases,
  itemEvents,
  looseStockLots,
  looseStockEvents,
} from '@/db/schema/phase2_inventory';
import { registerBackupExporter } from '@/services/phase1/backupService';
import db, { db as dbNamed, expoDb } from '@/db/client';
import { BACKUP_SCHEMA_VERSION } from '@/constants';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function safeQueryTable(tableName: string): any[] {
  try {
    if (expoDb && typeof expoDb.getAllSync === 'function') {
      const tableCheck = expoDb.getFirstSync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName]
      );
      if (tableCheck && tableCheck.name) {
        return expoDb.getAllSync(`SELECT * FROM ${tableName}`) || [];
      }
    }
  } catch {}
  return [];
}

export interface BillingBackupPayload {
  customers: (typeof customers.$inferSelect)[];
  suppliers: (typeof suppliers.$inferSelect)[];
  karigar: (typeof karigar.$inferSelect)[];
  karigar_ledger: (typeof karigarLedger.$inferSelect)[];
  karigarLedger: (typeof karigarLedger.$inferSelect)[];
  bank_accounts: (typeof bankAccounts.$inferSelect)[];
  bankAccounts: (typeof bankAccounts.$inferSelect)[];
  gst_config: any[];
  gstConfig: any[];
  invoice_number_config: (typeof invoiceNumberConfig.$inferSelect)[];
  invoiceNumberConfig: (typeof invoiceNumberConfig.$inferSelect)[];
  sale_invoices: (typeof saleInvoices.$inferSelect)[];
  saleInvoices: (typeof saleInvoices.$inferSelect)[];
  sale_invoice_items: (typeof saleInvoiceItems.$inferSelect)[];
  saleInvoiceItems: (typeof saleInvoiceItems.$inferSelect)[];
  purchase_invoices: (typeof purchaseInvoices.$inferSelect)[];
  purchaseInvoices: (typeof purchaseInvoices.$inferSelect)[];
  purchase_invoice_items: (typeof purchaseInvoiceItems.$inferSelect)[];
  purchaseInvoiceItems: (typeof purchaseInvoiceItems.$inferSelect)[];
  payments: (typeof payments.$inferSelect)[];
  supplier_metal_payments: (typeof supplierMetalPayments.$inferSelect)[];
  supplierMetalPayments: (typeof supplierMetalPayments.$inferSelect)[];
  ledger_entries: (typeof ledgerEntries.$inferSelect)[];
  ledgerEntries: (typeof ledgerEntries.$inferSelect)[];
  credit_notes: (typeof creditNotes.$inferSelect)[];
  creditNotes: (typeof creditNotes.$inferSelect)[];
  debit_notes: (typeof debitNotes.$inferSelect)[];
  debitNotes: (typeof debitNotes.$inferSelect)[];
  migration_log: any[];
  migrationLog: any[];
  rate_engine_config: (typeof rateEngineConfig.$inferSelect)[];
  rateEngineConfig: (typeof rateEngineConfig.$inferSelect)[];
  invoice_print_settings: (typeof invoicePrintSettings.$inferSelect)[];
  invoicePrintSettings: (typeof invoicePrintSettings.$inferSelect)[];
  estimate_invoices: (typeof estimateInvoices.$inferSelect)[];
  estimateInvoices: (typeof estimateInvoices.$inferSelect)[];
  estimate_items: (typeof estimateItems.$inferSelect)[];
  estimateItems: (typeof estimateItems.$inferSelect)[];
  tax_rates: (typeof taxRates.$inferSelect)[];
  taxRates: (typeof taxRates.$inferSelect)[];
  tax_groups: (typeof taxGroups.$inferSelect)[];
  taxGroups: (typeof taxGroups.$inferSelect)[];
  tax_group_components: (typeof taxGroupComponents.$inferSelect)[];
  taxGroupComponents: (typeof taxGroupComponents.$inferSelect)[];
  [key: string]: any;
}

/**
 * Reads all Phase 3 billing tables synchronously inside the active backup transaction.
 */
export function exportBillingData(tx: DbOrTx): BillingBackupPayload {
  const targetTx = getDb(tx);

  const customersRows = targetTx.select().from(customers).all();
  const suppliersRows = targetTx.select().from(suppliers).all();
  const karigarRows = targetTx.select().from(karigar).all();
  const karigarLedgerRows = targetTx.select().from(karigarLedger).all();
  const bankAccountsRows = targetTx.select().from(bankAccounts).all();

  // FIX-BACKUP-GST-CONFIG-1 (v5.18): gst_config retired in v5.16; export empty array or table if present
  const gstConfigRows = safeQueryTable('gst_config');

  const invoiceNumberConfigRows = targetTx.select().from(invoiceNumberConfig).all();
  const saleInvoicesRows = targetTx.select().from(saleInvoices).all();
  const saleInvoiceItemsRows = targetTx.select().from(saleInvoiceItems).all();
  const purchaseInvoicesRows = targetTx.select().from(purchaseInvoices).all();
  const purchaseInvoiceItemsRows = targetTx.select().from(purchaseInvoiceItems).all();
  const paymentsRows = targetTx.select().from(payments).all();
  const supplierMetalPaymentsRows = targetTx.select().from(supplierMetalPayments).all();
  const ledgerEntriesRows = targetTx.select().from(ledgerEntries).all();
  const creditNotesRows = targetTx.select().from(creditNotes).all();
  const debitNotesRows = targetTx.select().from(debitNotes).all();

  // migration_log query if table exists
  const migrationLogRows = safeQueryTable('migration_log');

  const rateEngineConfigRows = targetTx.select().from(rateEngineConfig).all();
  const invoicePrintSettingsRows = targetTx.select().from(invoicePrintSettings).all();
  const estimateInvoicesRows = targetTx.select().from(estimateInvoices).all();
  const estimateItemsRows = targetTx.select().from(estimateItems).all();

  const taxRatesRows = targetTx.select().from(taxRates).all();
  const taxGroupsRows = targetTx.select().from(taxGroups).all();
  const taxGroupComponentsRows = targetTx.select().from(taxGroupComponents).all();

  return {
    customers: customersRows,
    suppliers: suppliersRows,
    karigar: karigarRows,
    karigar_ledger: karigarLedgerRows,
    karigarLedger: karigarLedgerRows,
    bank_accounts: bankAccountsRows,
    bankAccounts: bankAccountsRows,
    gst_config: gstConfigRows,
    gstConfig: gstConfigRows,
    invoice_number_config: invoiceNumberConfigRows,
    invoiceNumberConfig: invoiceNumberConfigRows,
    sale_invoices: saleInvoicesRows,
    saleInvoices: saleInvoicesRows,
    sale_invoice_items: saleInvoiceItemsRows,
    saleInvoiceItems: saleInvoiceItemsRows,
    purchase_invoices: purchaseInvoicesRows,
    purchaseInvoices: purchaseInvoicesRows,
    purchase_invoice_items: purchaseInvoiceItemsRows,
    purchaseInvoiceItems: purchaseInvoiceItemsRows,
    payments: paymentsRows,
    supplier_metal_payments: supplierMetalPaymentsRows,
    supplierMetalPayments: supplierMetalPaymentsRows,
    ledger_entries: ledgerEntriesRows,
    ledgerEntries: ledgerEntriesRows,
    credit_notes: creditNotesRows,
    creditNotes: creditNotesRows,
    debit_notes: debitNotesRows,
    debitNotes: debitNotesRows,
    migration_log: migrationLogRows,
    migrationLog: migrationLogRows,
    rate_engine_config: rateEngineConfigRows,
    rateEngineConfig: rateEngineConfigRows,
    invoice_print_settings: invoicePrintSettingsRows,
    invoicePrintSettings: invoicePrintSettingsRows,
    estimate_invoices: estimateInvoicesRows,
    estimateInvoices: estimateInvoicesRows,
    estimate_items: estimateItemsRows,
    estimateItems: estimateItemsRows,
    tax_rates: taxRatesRows,
    taxRates: taxRatesRows,
    tax_groups: taxGroupsRows,
    taxGroups: taxGroupsRows,
    tax_group_components: taxGroupComponentsRows,
    taxGroupComponents: taxGroupComponentsRows,
  };
}

/**
 * Assembles the complete canonical Step 21 backupPayload:
 * - schemaVersion: 9
 * - exportedAt: ISO 8601
 * - checksum: SHA-256
 * - All Phase 1, Phase 2, and Phase 3 tables
 */
export function assembleBackupPayload(tx?: DbOrTx): Record<string, any> {
  const targetTx = getDb(tx);
  const exportedAt = new Date().toISOString();

  // Phase 1 tables
  const firmsRows = targetTx.select().from(firms).all();
  const financialYearsRows = targetTx.select().from(financialYears).all();
  const settingsRows = targetTx.select().from(appSettings).all();
  const auditLogsRows = targetTx.select().from(auditLogs).all();
  const safeModeStateRows = targetTx.select().from(safeModeState).all();

  // Phase 2 tables — all 14 tables (v5.4 GAP 4 + v5.32 + v5.35)
  const categoriesRows = targetTx.select().from(categories).all();
  const designsRows = targetTx.select().from(designs).all();
  const designPurityThresholdsRows = targetTx.select().from(designPurityThresholds).all();
  const designCategoryMapRows = targetTx.select().from(designCategoryMap).all();
  const stonesRows = targetTx.select().from(stones).all();
  const gemstoneLotsRows = targetTx.select().from(gemstoneLots).all();
  const hsnCodesRows = targetTx.select().from(hsnCodes).all();
  const sequenceCountersRows = targetTx.select().from(sequenceCounters).all();
  const itemsRows = targetTx.select().from(items).all();
  const oldMetalLotsRows = targetTx.select().from(oldMetalLots).all();
  const urdPurchasesRows = targetTx.select().from(urdPurchases).all();
  const itemEventsRows = targetTx.select().from(itemEvents).all();
  const looseStockLotsRows = targetTx.select().from(looseStockLots).all();
  const looseStockEventsRows = targetTx.select().from(looseStockEvents).all();

  // Phase 3 tables
  const billingData = exportBillingData(targetTx);

  const payload: Record<string, any> = {
    schemaVersion: BACKUP_SCHEMA_VERSION ?? 9,
    exportedAt,
    // Phase 1
    firms: firmsRows,
    financial_years: financialYearsRows,
    financialYears: financialYearsRows,
    settings: settingsRows,
    audit_log: auditLogsRows,
    auditLogs: auditLogsRows,
    safe_mode_state: safeModeStateRows.length > 0 ? safeModeStateRows[0] : null,
    safeModeState: safeModeStateRows.length > 0 ? safeModeStateRows[0] : null,
    // Phase 2 — v5.4 GAP 4 FIX: correct Drizzle table names
    categories: categoriesRows,
    designs: designsRows,
    stones: stonesRows,
    items: itemsRows,
    itemEvents: itemEventsRows,
    looseStockLots: looseStockLotsRows,
    looseStockEvents: looseStockEventsRows,
    sequenceCounters: sequenceCountersRows,
    oldMetalLots: oldMetalLotsRows,
    oldGoldLots: oldMetalLotsRows,
    urdPurchases: urdPurchasesRows,
    designPurityThresholds: designPurityThresholdsRows,
    designCategoryMap: designCategoryMapRows,
    gemstoneLots: gemstoneLotsRows,
    hsnCodes: hsnCodesRows,
    // Phase 3
    ...billingData,
  };

  const payloadJson = JSON.stringify(payload);
  const checksum = quickCrypto.createHash('sha256').update(payloadJson).digest('hex');
  payload.checksum = checksum;

  return payload;
}

// Register Phase 3 billing extension with Phase 1 backupService
registerBackupExporter('phase3_billing', exportBillingData);

export const billingBackupService = {
  exportBillingData,
  assembleBackupPayload,
};

export default billingBackupService;
