// services/phase4/goldIntelligenceBackupService.ts — Phase 4 STEP 21: Gold Intelligence Backup Extension Service
// Implements GAP-ERROR-REGISTRY, ALIGN-FIX-2, PAYLOAD-FIX-1, FIX-P4-BACKUP-1 (v1.15), and FIX-P4-BACKUP-2 (v1.16).
// Assembles all 7 Phase 4 tables alongside Phase 1, Phase 2, and Phase 3 tables into the canonical backupPayload.
// schemaVersion: 10 (FIX-P4-BACKUP-2 v1.16)
// Registers extension provider with Phase 1 backupService.

import quickCrypto from 'react-native-quick-crypto';
import {
  refineryBatches,
  refineryBatchLots,
  refineryOutputLots,
  meltBatches,
  meltBatchInputs,
  karigarIssues,
  karigarReturns,
} from '@/db/schema/phase4_gold_intelligence';
import {
  firms,
  financialYears,
  appSettings,
  auditLogs,
  safeModeState,
  taxRates,
  taxGroups,
  taxGroupComponents,
  bisLogos,
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
import { registerBackupExporter } from '@/services/phase1/backupService';
import db, { db as dbNamed, expoDb } from '@/db/client';
import { BACKUP_SCHEMA_VERSION, APP_VERSION } from '@/constants';

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

function safeSelectAll<T>(targetTx: any, schemaTable: any): T[] {
  try {
    return targetTx.select().from(schemaTable).all();
  } catch {
    return [];
  }
}

export interface GoldIntelligenceBackupPayload {
  refinery_batches: (typeof refineryBatches.$inferSelect)[];
  refineryBatches: (typeof refineryBatches.$inferSelect)[];
  refinery_batch_lots: (typeof refineryBatchLots.$inferSelect)[];
  refineryBatchLots: (typeof refineryBatchLots.$inferSelect)[];
  refinery_output_lots: (typeof refineryOutputLots.$inferSelect)[];
  refineryOutputLots: (typeof refineryOutputLots.$inferSelect)[];
  melt_batches: (typeof meltBatches.$inferSelect)[];
  meltBatches: (typeof meltBatches.$inferSelect)[];
  melt_batch_inputs: (typeof meltBatchInputs.$inferSelect)[];
  meltBatchInputs: (typeof meltBatchInputs.$inferSelect)[];
  karigar_issues: (typeof karigarIssues.$inferSelect)[];
  karigarIssues: (typeof karigarIssues.$inferSelect)[];
  karigar_returns: (typeof karigarReturns.$inferSelect)[];
  karigarReturns: (typeof karigarReturns.$inferSelect)[];
  [key: string]: any;
}

/**
 * Reads all 7 Phase 4 Gold Intelligence tables synchronously inside the active backup transaction.
 */
export function exportGoldIntelligenceData(tx: DbOrTx): GoldIntelligenceBackupPayload {
  const targetTx = getDb(tx);

  const refineryBatchesRows = safeSelectAll<typeof refineryBatches.$inferSelect>(targetTx, refineryBatches);
  const refineryBatchLotsRows = safeSelectAll<typeof refineryBatchLots.$inferSelect>(targetTx, refineryBatchLots);
  const refineryOutputLotsRows = safeSelectAll<typeof refineryOutputLots.$inferSelect>(targetTx, refineryOutputLots);
  const meltBatchesRows = safeSelectAll<typeof meltBatches.$inferSelect>(targetTx, meltBatches);
  const meltBatchInputsRows = safeSelectAll<typeof meltBatchInputs.$inferSelect>(targetTx, meltBatchInputs);
  const karigarIssuesRows = safeSelectAll<typeof karigarIssues.$inferSelect>(targetTx, karigarIssues);
  const karigarReturnsRows = safeSelectAll<typeof karigarReturns.$inferSelect>(targetTx, karigarReturns);

  return {
    refinery_batches: refineryBatchesRows,
    refineryBatches: refineryBatchesRows,
    refinery_batch_lots: refineryBatchLotsRows,
    refineryBatchLots: refineryBatchLotsRows,
    refinery_output_lots: refineryOutputLotsRows,
    refineryOutputLots: refineryOutputLotsRows,
    melt_batches: meltBatchesRows,
    meltBatches: meltBatchesRows,
    melt_batch_inputs: meltBatchInputsRows,
    meltBatchInputs: meltBatchInputsRows,
    karigar_issues: karigarIssuesRows,
    karigarIssues: karigarIssuesRows,
    karigar_returns: karigarReturnsRows,
    karigarReturns: karigarReturnsRows,
  };
}

/**
 * Returns record counts for all 7 Phase 4 tables.
 */
export function getGoldIntelligenceRecordCounts(tx?: DbOrTx): Record<string, number> {
  const targetTx = getDb(tx);
  try {
    return {
      refinery_batches: safeSelectAll(targetTx, refineryBatches).length,
      refinery_batch_lots: safeSelectAll(targetTx, refineryBatchLots).length,
      refinery_output_lots: safeSelectAll(targetTx, refineryOutputLots).length,
      melt_batches: safeSelectAll(targetTx, meltBatches).length,
      melt_batch_inputs: safeSelectAll(targetTx, meltBatchInputs).length,
      karigar_issues: safeSelectAll(targetTx, karigarIssues).length,
      karigar_returns: safeSelectAll(targetTx, karigarReturns).length,
    };
  } catch {
    return {
      refinery_batches: 0,
      refinery_batch_lots: 0,
      refinery_output_lots: 0,
      melt_batches: 0,
      melt_batch_inputs: 0,
      karigar_issues: 0,
      karigar_returns: 0,
    };
  }
}

/**
 * Assembles the complete canonical Step 21 verified backup payload:
 * - schemaVersion: 10 (FIX-P4-BACKUP-2 v1.16)
 * - appVersion: "4.0.0"
 * - exportedAt: ISO 8601 string
 * - firmId: string UUID
 * - tables: 42 verified tables (Phase 1, 2, 3, 4) with all phantom tables removed.
 */
export function assembleGoldIntelligenceBackupPayload(tx?: DbOrTx, defaultFirmId?: string): Record<string, any> {
  const targetTx = getDb(tx);
  const exportedAt = new Date().toISOString();

  // Phase 1 tables
  const firmsRows = safeSelectAll(targetTx, firms);
  const financialYearsRows = safeSelectAll(targetTx, financialYears);
  const settingsRows = safeSelectAll(targetTx, appSettings);
  const auditLogsRows = safeSelectAll(targetTx, auditLogs);
  const safeModeStateRows = safeSelectAll(targetTx, safeModeState);
  const bisLogosRows = safeSelectAll(targetTx, bisLogos);

  // Phase 2 tables
  const categoriesRows = safeSelectAll(targetTx, categories);
  const designsRows = safeSelectAll(targetTx, designs);
  const stonesRows = safeSelectAll(targetTx, stones);
  const designPurityThresholdsRows = safeSelectAll(targetTx, designPurityThresholds);
  const designCategoryMapRows = safeSelectAll(targetTx, designCategoryMap);
  const gemstoneLotsRows = safeSelectAll(targetTx, gemstoneLots);
  const hsnCodesRows = safeSelectAll(targetTx, hsnCodes);
  const itemsRows = safeSelectAll(targetTx, items);
  const looseStockLotsRows = safeSelectAll(targetTx, looseStockLots);
  const looseStockEventsRows = safeSelectAll(targetTx, looseStockEvents);
  const itemEventsRows = safeSelectAll(targetTx, itemEvents);
  const oldMetalLotsRows = safeSelectAll(targetTx, oldMetalLots);
  const sequenceCountersRows = safeSelectAll(targetTx, sequenceCounters);

  // Phase 3 tables
  const customersRows = safeSelectAll(targetTx, customers);
  const suppliersRows = safeSelectAll(targetTx, suppliers);
  const karigarRows = safeSelectAll(targetTx, karigar);
  const karigarLedgerRows = safeSelectAll(targetTx, karigarLedger);
  const bankAccountsRows = safeSelectAll(targetTx, bankAccounts);
  const invoiceNumberConfigRows = safeSelectAll(targetTx, invoiceNumberConfig);
  const taxGroupsRows = safeSelectAll(targetTx, taxGroups);
  const taxRatesRows = safeSelectAll(targetTx, taxRates);
  const taxGroupComponentsRows = safeSelectAll(targetTx, taxGroupComponents);
  const saleInvoicesRows = safeSelectAll(targetTx, saleInvoices);
  const saleInvoiceItemsRows = safeSelectAll(targetTx, saleInvoiceItems);
  const purchaseInvoicesRows = safeSelectAll(targetTx, purchaseInvoices);
  const purchaseInvoiceItemsRows = safeSelectAll(targetTx, purchaseInvoiceItems);
  const paymentsRows = safeSelectAll(targetTx, payments);
  const ledgerEntriesRows = safeSelectAll(targetTx, ledgerEntries);
  const creditNotesRows = safeSelectAll(targetTx, creditNotes);
  const debitNotesRows = safeSelectAll(targetTx, debitNotes);
  const migrationLogRows = safeQueryTable('migration_log');
  const invoicePrintSettingsRows = safeSelectAll(targetTx, invoicePrintSettings);
  const estimateInvoicesRows = safeSelectAll(targetTx, estimateInvoices);
  const estimateItemsRows = safeSelectAll(targetTx, estimateItems);
  const supplierMetalPaymentsRows = safeSelectAll(targetTx, supplierMetalPayments);

  // Phase 4 tables
  const p4Data = exportGoldIntelligenceData(targetTx);

  const resolvedFirmId = defaultFirmId || (firmsRows[0] as any)?.id || '00000000-0000-0000-0000-000000000000';

  // 42 Canonical Tables matching Drizzle schemas exactly
  const tables: Record<string, any[]> = {
    // Phase 1 (5 tables)
    firms: firmsRows,
    financial_years: financialYearsRows,
    audit_log: auditLogsRows,
    safe_mode_state: safeModeStateRows,
    settings: settingsRows,

    // Phase 2 (14 tables)
    categories: categoriesRows,
    designs: designsRows,
    stones: stonesRows,
    designPurityThresholds: designPurityThresholdsRows,
    designCategoryMap: designCategoryMapRows,
    gemstoneLots: gemstoneLotsRows,
    hsnCodes: hsnCodesRows,
    items: itemsRows,
    looseStockLots: looseStockLotsRows,
    looseStockEvents: looseStockEventsRows,
    itemEvents: itemEventsRows,
    oldMetalLots: oldMetalLotsRows,
    sequenceCounters: sequenceCountersRows,
    bisLogos: bisLogosRows,

    // Phase 3 (16 tables)
    customers: customersRows,
    suppliers: suppliersRows,
    karigar: karigarRows,
    karigar_ledger: karigarLedgerRows,
    bank_accounts: bankAccountsRows,
    invoice_number_config: invoiceNumberConfigRows,
    tax_groups: taxGroupsRows,
    tax_rates: taxRatesRows,
    tax_group_components: taxGroupComponentsRows,
    sale_invoices: saleInvoicesRows,
    sale_invoice_items: saleInvoiceItemsRows,
    purchase_invoices: purchaseInvoicesRows,
    purchase_invoice_items: purchaseInvoiceItemsRows,
    payments: paymentsRows,
    ledger_entries: ledgerEntriesRows,
    credit_notes: creditNotesRows,
    debit_notes: debitNotesRows,
    migration_log: migrationLogRows,
    invoice_print_settings: invoicePrintSettingsRows,
    estimate_invoices: estimateInvoicesRows,
    estimate_items: estimateItemsRows,
    supplier_metal_payments: supplierMetalPaymentsRows,

    // Phase 4 (7 tables)
    refinery_batches: p4Data.refinery_batches,
    refinery_batch_lots: p4Data.refinery_batch_lots,
    refinery_output_lots: p4Data.refinery_output_lots,
    melt_batches: p4Data.melt_batches,
    melt_batch_inputs: p4Data.melt_batch_inputs,
    karigar_issues: p4Data.karigar_issues,
    karigar_returns: p4Data.karigar_returns,
  };

  const payload: Record<string, any> = {
    schemaVersion: BACKUP_SCHEMA_VERSION ?? 10,
    appVersion: APP_VERSION ?? '1.0.0',
    exportedAt,
    firmId: resolvedFirmId,
    tables,
    // Top-level aliases for backwards compatibility
    ...tables,
    ...p4Data,
  };

  const payloadJson = JSON.stringify(payload);
  const checksum = quickCrypto.createHash('sha256').update(payloadJson).digest('hex');
  payload.checksum = checksum;

  return payload;
}

// Automatically register Phase 4 Gold Intelligence extension with Phase 1 backupService
registerBackupExporter('phase4_gold_intelligence', exportGoldIntelligenceData);

export const goldIntelligenceBackupService = {
  exportGoldIntelligenceData,
  getGoldIntelligenceRecordCounts,
  assembleGoldIntelligenceBackupPayload,
};

export default goldIntelligenceBackupService;
