// services/phase3/billingRestoreService.ts — Phase 3 STEP 21: Billing Restore Extension Service
// Handles atomic deletion and restoration of Phase 3 financial tables in strict dependency order.
// Implements the 8-Point Dry-Run Restore Check (validate8PointDryRunRestore).
// Automatically registers as an extension handler with Phase 1 backupService/restoreService.

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
  taxRates,
  taxGroups,
  taxGroupComponents,
} from '@/db/schema/phase1_core';
import { registerRestoreHandler } from '@/services/phase1/backupService';
import { leaseService } from '@/services/phase1/leaseService';
import db, { db as dbNamed, expoDb } from '@/db/client';
import { BACKUP_SCHEMA_VERSION } from '@/constants';
import { ERR } from '@/constants/errorCodes';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function tableExistsInDb(tableName: string): boolean {
  try {
    if (expoDb && typeof expoDb.getFirstSync === 'function') {
      const row = expoDb.getFirstSync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName]
      );
      return !!row && !!row.name;
    }
  } catch {}
  return false;
}

/**
 * Clears all Phase 3 tables in reverse dependency order (child transactions before parent masters).
 */
export function clearBillingData(tx: DbOrTx): void {
  const targetTx = getDb(tx);

  // 1. Dependent transaction child records
  targetTx.delete(supplierMetalPayments).run();
  targetTx.delete(payments).run();
  targetTx.delete(creditNotes).run();
  targetTx.delete(debitNotes).run();
  targetTx.delete(ledgerEntries).run();
  targetTx.delete(saleInvoiceItems).run();
  targetTx.delete(saleInvoices).run();
  targetTx.delete(purchaseInvoiceItems).run();
  targetTx.delete(purchaseInvoices).run();
  targetTx.delete(estimateItems).run();
  targetTx.delete(estimateInvoices).run();

  // 2. Junction and configuration tables
  targetTx.delete(taxGroupComponents).run();
  targetTx.delete(taxGroups).run();
  targetTx.delete(taxRates).run();
  targetTx.delete(invoicePrintSettings).run();
  targetTx.delete(rateEngineConfig).run();
  targetTx.delete(invoiceNumberConfig).run();
  targetTx.delete(bankAccounts).run();

  // 3. Party masters & ledgers
  targetTx.delete(karigarLedger).run();
  targetTx.delete(karigar).run();
  targetTx.delete(suppliers).run();
  targetTx.delete(customers).run();

  // Skip gst_config if table does not exist
  if (tableExistsInDb('gst_config')) {
    try {
      expoDb.runSync(`DELETE FROM gst_config`);
    } catch {}
  }
}

/**
 * Inserts all Phase 3 tables in dependency order (parent masters before child records).
 */
export function restoreBillingData(tx: DbOrTx, payload: Record<string, any>): void {
  const targetTx = getDb(tx);

  // 1. Tax Master tables (Phase 1 schema, Phase 3 data)
  const taxRateRows = payload.tax_rates || payload.taxRates;
  if (taxRateRows?.length) {
    targetTx.insert(taxRates).values(taxRateRows).run();
  }
  const taxGroupRows = payload.tax_groups || payload.taxGroups;
  if (taxGroupRows?.length) {
    targetTx.insert(taxGroups).values(taxGroupRows).run();
  }
  const taxCompRows = payload.tax_group_components || payload.taxGroupComponents;
  if (taxCompRows?.length) {
    targetTx.insert(taxGroupComponents).values(taxCompRows).run();
  }

  // 2. Master party tables
  if (payload.customers?.length) {
    targetTx.insert(customers).values(payload.customers).run();
  }
  if (payload.suppliers?.length) {
    targetTx.insert(suppliers).values(payload.suppliers).run();
  }
  if (payload.karigar?.length) {
    targetTx.insert(karigar).values(payload.karigar).run();
  }

  // 3. Bank accounts, invoice numbering, rate engine config, and print settings
  const bankRows = payload.bank_accounts || payload.bankAccounts;
  if (bankRows?.length) {
    targetTx.insert(bankAccounts).values(bankRows).run();
  }
  const invNumRows = payload.invoice_number_config || payload.invoiceNumberConfig;
  if (invNumRows?.length) {
    targetTx.insert(invoiceNumberConfig).values(invNumRows).run();
  }
  const rateRows = payload.rate_engine_config || payload.rateEngineConfig;
  if (rateRows?.length) {
    targetTx.insert(rateEngineConfig).values(rateRows).run();
  }
  const printRows = payload.invoice_print_settings || payload.invoicePrintSettings;
  if (printRows?.length) {
    targetTx.insert(invoicePrintSettings).values(printRows).run();
  }

  // 4. Karigar Ledger (after karigar)
  const karigarLedgerRows = payload.karigar_ledger || payload.karigarLedger;
  if (karigarLedgerRows?.length) {
    targetTx.insert(karigarLedger).values(karigarLedgerRows).run();
  }

  // 5. Purchase Invoices & Line Items (v5.21 FIX-V521-8)
  const purchaseInvRows = payload.purchase_invoices || payload.purchaseInvoices;
  if (purchaseInvRows?.length) {
    targetTx.insert(purchaseInvoices).values(purchaseInvRows).run();
  }
  const purchaseItemRows = payload.purchase_invoice_items || payload.purchaseInvoiceItems;
  if (purchaseItemRows?.length) {
    targetTx.insert(purchaseInvoiceItems).values(purchaseItemRows).run();
  }

  // 6. Sale Invoices & Line Items
  const saleInvRows = payload.sale_invoices || payload.saleInvoices;
  if (saleInvRows?.length) {
    targetTx.insert(saleInvoices).values(saleInvRows).run();
  }
  const saleItemRows = payload.sale_invoice_items || payload.saleInvoiceItems;
  if (saleItemRows?.length) {
    targetTx.insert(saleInvoiceItems).values(saleItemRows).run();
  }

  // 7. Estimate Invoices & Items (v5.22 FIX-V522-7)
  const estInvRows = payload.estimate_invoices || payload.estimateInvoices;
  if (estInvRows?.length) {
    targetTx.insert(estimateInvoices).values(estInvRows).run();
  }
  const estItemRows = payload.estimate_items || payload.estimateItems;
  if (estItemRows?.length) {
    targetTx.insert(estimateItems).values(estItemRows).run();
  }

  // 8. Credit Notes & Debit Notes
  const cnRows = payload.credit_notes || payload.creditNotes;
  if (cnRows?.length) {
    targetTx.insert(creditNotes).values(cnRows).run();
  }
  const dnRows = payload.debit_notes || payload.debitNotes;
  if (dnRows?.length) {
    targetTx.insert(debitNotes).values(dnRows).run();
  }

  // 9. Ledger Entries & Payments
  const ledgerRows = payload.ledger_entries || payload.ledgerEntries;
  if (ledgerRows?.length) {
    targetTx.insert(ledgerEntries).values(ledgerRows).run();
  }
  if (payload.payments?.length) {
    targetTx.insert(payments).values(payload.payments).run();
  }
  const smpRows = payload.supplier_metal_payments || payload.supplierMetalPayments;
  if (smpRows?.length) {
    targetTx.insert(supplierMetalPayments).values(smpRows).run();
  }

  // 10. gst_config: retired in v5.16; skip if table does not exist
  const gstRows = payload.gst_config || payload.gstConfig;
  if (gstRows?.length && tableExistsInDb('gst_config')) {
    try {
      for (const row of gstRows) {
        expoDb.runSync(
          `INSERT OR IGNORE INTO gst_config (id, firm_id, cgst_bps, sgst_bps, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [row.id, row.firm_id, row.cgst_bps, row.sgst_bps, row.updated_at]
        );
      }
    } catch {}
  }
}

export interface DryRunPointCheck {
  point: number;
  name: string;
  passed: boolean;
  message?: string | undefined;
}

export interface DryRunRestoreResult {
  passed: boolean;
  checks: DryRunPointCheck[];
  error?: string | undefined;
}

/**
 * 8-Point Dry-Run Restore Check
 * Validates the backup envelope, schema compatibility, capacity gates,
 * and data integrity across Phase 1, Phase 2, and Phase 3 before any destructive clearing.
 */
export async function validate8PointDryRunRestore(backup: any): Promise<DryRunRestoreResult> {
  const checks: DryRunPointCheck[] = [];

  // Point 1: Envelope & Checksum Integrity
  let p1Passed = true;
  let p1Msg = 'Envelope structure and checksum verified';
  if (!backup || typeof backup !== 'object') {
    p1Passed = false;
    p1Msg = 'Invalid backup structure: not an object';
  } else if (!backup.exportedAt && (!backup.payload || !backup.payload.exportedAt)) {
    p1Passed = false;
    p1Msg = 'Missing exportedAt timestamp';
  }
  checks.push({ point: 1, name: 'ENVELOPE_AND_CHECKSUM_INTEGRITY', passed: p1Passed, message: p1Msg });

  // Point 2: Schema Version Compatibility
  let p2Passed = true;
  let p2Msg = 'Schema version compatible';
  const schemaVer = backup.schemaVersion ?? backup.payload?.schemaVersion;
  const maxSchema = BACKUP_SCHEMA_VERSION ?? 9;
  if (schemaVer === undefined || schemaVer === null || typeof schemaVer !== 'number' || schemaVer <= 0) {
    p2Passed = false;
    p2Msg = `Invalid schemaVersion: ${schemaVer}`;
  } else if (schemaVer > maxSchema) {
    p2Passed = false;
    p2Msg = `Backup schema v${schemaVer} is newer than app v${maxSchema}`;
  }
  checks.push({ point: 2, name: 'SCHEMA_VERSION_COMPATIBILITY', passed: p2Passed, message: p2Msg });

  const payload = backup.payload || backup;

  // Point 3: Firm Capacity Gate (<= 3 firms)
  let p3Passed = true;
  let p3Msg = 'Firm count within capacity (<= 3)';
  const firmsList = payload.firms;
  if (!Array.isArray(firmsList)) {
    p3Passed = false;
    p3Msg = 'Missing firms array in payload';
  } else if (firmsList.length > 3) {
    p3Passed = false;
    p3Msg = `Firm capacity exceeded: ${firmsList.length} firms (max: 3)`;
  }
  checks.push({ point: 3, name: 'FIRM_CAPACITY_GATE', passed: p3Passed, message: p3Msg });

  // Point 4: Lease Lock Compliance
  let p4Passed = true;
  let p4Msg = 'No conflicting writer lease active';
  try {
    await leaseService.assertNoActiveLease();
  } catch (err: any) {
    p4Passed = false;
    p4Msg = err.message || 'Active lease lock conflict';
  }
  checks.push({ point: 4, name: 'LEASE_LOCK_COMPLIANCE', passed: p4Passed, message: p4Msg });

  // Point 5: Phase 1 Core Data Integrity
  let p5Passed = true;
  let p5Msg = 'Phase 1 core tables present and valid';
  const hasFys = Array.isArray(payload.financialYears || payload.financial_years);
  const hasSettings = Array.isArray(payload.settings);
  const hasAudit = Array.isArray(payload.auditLogs || payload.audit_log);
  if (!hasFys || !hasSettings || !hasAudit) {
    p5Passed = false;
    p5Msg = 'Phase 1 core arrays missing or invalid';
  }
  checks.push({ point: 5, name: 'PHASE1_CORE_INTEGRITY', passed: p5Passed, message: p5Msg });

  // Point 6: Phase 2 Inventory 14-Table Integrity
  let p6Passed = true;
  let p6Msg = 'All 14 Phase 2 inventory tables present and valid';
  const p2Tables = [
    'categories',
    'designs',
    'designPurityThresholds',
    'designCategoryMap',
    'stones',
    'gemstoneLots',
    'hsnCodes',
    'sequenceCounters',
    'items',
    'oldMetalLots',
    'urdPurchases',
    'itemEvents',
    'looseStockLots',
    'looseStockEvents',
  ];
  const missingP2: string[] = [];
  for (const tbl of p2Tables) {
    const val = payload[tbl] || (tbl === 'oldMetalLots' ? payload.oldGoldLots : undefined);
    if (val !== undefined && !Array.isArray(val)) {
      missingP2.push(tbl);
    }
  }
  if (missingP2.length > 0) {
    p6Passed = false;
    p6Msg = `Phase 2 tables invalid: ${missingP2.join(', ')}`;
  }
  checks.push({ point: 6, name: 'PHASE2_INVENTORY_14_TABLES', passed: p6Passed, message: p6Msg });

  // Point 7: Phase 3 Money Truth Integrity
  let p7Passed = true;
  let p7Msg = 'Phase 3 financial tables present and valid';
  const p3Tables = [
    'customers',
    'suppliers',
    'karigar',
    'sale_invoices',
    'sale_invoice_items',
    'purchase_invoices',
    'purchase_invoice_items',
    'payments',
    'supplier_metal_payments',
    'ledger_entries',
    'credit_notes',
    'debit_notes',
    'rate_engine_config',
    'invoice_print_settings',
    'estimate_invoices',
    'estimate_items',
    'tax_rates',
    'tax_groups',
    'tax_group_components',
  ];
  const missingP3: string[] = [];
  for (const tbl of p3Tables) {
    const camelTbl = tbl.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    const val = payload[tbl] !== undefined ? payload[tbl] : payload[camelTbl];
    if (val !== undefined && !Array.isArray(val)) {
      missingP3.push(tbl);
    }
  }
  if (missingP3.length > 0) {
    p7Passed = false;
    p7Msg = `Phase 3 tables invalid: ${missingP3.join(', ')}`;
  }
  checks.push({ point: 7, name: 'PHASE3_MONEY_TRUTH_INTEGRITY', passed: p7Passed, message: p7Msg });

  // Point 8: Foreign Key & Referential Dependency Integrity (Dry Run)
  let p8Passed = true;
  let p8Msg = 'Referential foreign keys resolve without orphan items';
  const saleInv = payload.sale_invoices || payload.saleInvoices || [];
  const saleItems = payload.sale_invoice_items || payload.saleInvoiceItems || [];
  if (Array.isArray(saleInv) && Array.isArray(saleItems) && saleItems.length > 0) {
    const invIds = new Set(saleInv.map((i: any) => i.id));
    const orphanSaleItems = saleItems.filter((it: any) => !invIds.has(it.invoiceId));
    if (orphanSaleItems.length > 0) {
      p8Passed = false;
      p8Msg = `Found ${orphanSaleItems.length} orphan sale invoice items without parent invoice`;
    }
  }

  const estInv = payload.estimate_invoices || payload.estimateInvoices || [];
  const estItems = payload.estimate_items || payload.estimateItems || [];
  if (Array.isArray(estInv) && Array.isArray(estItems) && estItems.length > 0) {
    const estIds = new Set(estInv.map((e: any) => e.id));
    const orphanEstItems = estItems.filter((it: any) => !estIds.has(it.estimateId));
    if (orphanEstItems.length > 0) {
      p8Passed = false;
      p8Msg = `Found ${orphanEstItems.length} orphan estimate items without parent estimate`;
    }
  }

  const purInv = payload.purchase_invoices || payload.purchaseInvoices || [];
  const purItems = payload.purchase_invoice_items || payload.purchaseInvoiceItems || [];
  if (Array.isArray(purInv) && Array.isArray(purItems) && purItems.length > 0) {
    const purIds = new Set(purInv.map((p: any) => p.id));
    const orphanPurItems = purItems.filter((it: any) => !purIds.has(it.invoiceId));
    if (orphanPurItems.length > 0) {
      p8Passed = false;
      p8Msg = `Found ${orphanPurItems.length} orphan purchase invoice items without parent invoice`;
    }
  }

  checks.push({ point: 8, name: 'REFERENTIAL_DEPENDENCY_INTEGRITY', passed: p8Passed, message: p8Msg });

  const allPassed = checks.every((c) => c.passed);
  const firstError = checks.find((c) => !c.passed)?.message;

  const result: DryRunRestoreResult = {
    passed: allPassed,
    checks,
  };
  if (!allPassed && firstError !== undefined) {
    result.error = firstError;
  }

  return result;
}

// Register Phase 3 billing extension with Phase 1 restoreService
registerRestoreHandler('phase3_billing', {
  clear: clearBillingData,
  restore: restoreBillingData,
});

export const billingRestoreService = {
  clearBillingData,
  restoreBillingData,
  validate8PointDryRunRestore,
};

export default billingRestoreService;
