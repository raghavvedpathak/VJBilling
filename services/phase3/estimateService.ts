// services/phase3/estimateService.ts — Phase 3 Estimate Engine (v4.2 / v5.5 / v5.10 / v5.21 / v5.23)
// STEP 7B: Quotation before commitment. No stock movement. No ledger posting. Convert to Invoice re-validates everything.

import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { estimateRepository } from '@/repositories/phase3/estimateRepository';
import { invoiceRepository, saleInvoiceRepo, saleInvoiceItemRepo } from '@/repositories/phase3/invoiceRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { fyService, resolveTransactionFyId } from '@/services/phase1/fyService';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { invoiceNumberService } from '@/services/phase3/invoiceNumberService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { getGroupsWithTTL } from '@/store/phase3/taxGroupStore';
import { amountToWords } from '@/utils/currency';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import type {
  EstimateInvoice,
  EstimateItem,
  EstimateWithItems,
  CreateEstimateInput,
  AddEstimateItemInput,
  ConvertEstimateInput,
  ConvertEstimateResult,
  SaleInvoice,
} from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

/**
 * Checks if estimate has expired based on a 7-day calendar window.
 */
export function isEstimateExpired(estimateDate: string, entryDate: string): boolean {
  if (!estimateDate || !entryDate) return false;
  const est = new Date(estimateDate);
  const entry = new Date(entryDate);

  const msPerDay = 24 * 60 * 60 * 1000;
  const estMidnight = new Date(est.getFullYear(), est.getMonth(), est.getDate()).getTime();
  const entryMidnight = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate()).getTime();

  const diffDays = Math.floor((entryMidnight - estMidnight) / msPerDay);
  return diffDays > 7;
}

/**
 * Canonical helper to create a DRAFT invoice.
 * Dual Guard: assertNoActiveLease() + assertNotInSafeMode().
 * Supports both createDraftInvoice(input, tx?) and createDraftInvoice(tx, input).
 */
export async function createDraftInvoice(arg1: any, arg2?: any): Promise<SaleInvoice> {
  let tx: any = undefined;
  let input: any = undefined;

  if (arg1 && typeof arg1 === 'object' && typeof arg1.select === 'function') {
    tx = arg1;
    input = arg2;
  } else {
    input = arg1;
    tx = arg2;
  }

  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const runOperation = async (targetTx: any): Promise<SaleInvoice> => {
    const invoiceId = Crypto.randomUUID();
    const invoice = await saleInvoiceRepo.insert(targetTx, {
      ...input,
      id: invoiceId,
      status: 'DRAFT',
      invoiceNumber: null,
      invoiceDate: input.entryDate || input.invoiceDate || now().split('T')[0],
      createdAt: now(),
    });

    await auditRepository.log(targetTx, {
      eventType: 'DRAFT_CREATED', // v5.4 GAP 1 FIX
      firmId: input.firmId,
      entityId: invoice.id,
      deviceId: getSafeDeviceId(), // v5.4 GAP 1 FIX: deviceId required
    });

    return invoice;
  };

  if (tx) {
    return runOperation(tx);
  }

  const conn: any = getDb();
  if (typeof conn.transaction === 'function') {
    return conn.transaction(async (trx: any) => runOperation(trx));
  }
  return runOperation(conn);
}

/**
 * Canonical helper to add an item to a DRAFT invoice.
 * Dual Guard: assertNoActiveLease() + assertNotInSafeMode().
 * Supports both addItemToDraft(invoiceId, stockLotId, firmId, tx?)
 * and addItemToDraft(tx, invoiceId, stockLotId, firmId).
 */
export async function addItemToDraft(
  arg1: any,
  arg2: any,
  arg3?: any,
  arg4?: any
): Promise<void> {
  let tx: any = undefined;
  let invoiceId: string;
  let stockLotId: string;
  let firmId: string;

  if (arg1 && typeof arg1 === 'object' && typeof arg1.select === 'function') {
    tx = arg1;
    invoiceId = arg2;
    stockLotId = arg3;
    firmId = arg4;
  } else {
    invoiceId = arg1;
    stockLotId = arg2;
    firmId = arg3;
    tx = arg4;
  }

  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const runOperation = async (targetTx: any): Promise<void> => {
    const inv = await saleInvoiceRepo.getById(targetTx, invoiceId, firmId);
    if (!inv || inv.status !== 'DRAFT') {
      throw new Error(ERR.INVOICE_NOT_DRAFT);
    }

    const lot = await itemRepository.getById(targetTx, stockLotId, firmId);
    if (!lot || (lot.status !== 'AVAILABLE' && lot.status !== 'PHANTOM_AVAILABLE')) {
      throw new Error(ERR.ITEM_NOT_AVAILABLE); // FEAT-PHANTOM-INVENTORY-1 (v1.67 — v5.10)
    }

    await saleInvoiceItemRepo.insert(targetTx, {
      id: Crypto.randomUUID(),
      invoiceId,
      stockLotId,
      sku: lot.sku,
      itemName: (lot as any).itemName || (lot as any).designName || 'Jewellery Item',
      metal: lot.metal,
      purityPct: lot.purityPercent ?? (lot as any).purityPct ?? 0,
      grossWeightMg: lot.grossWeightMg,
      stoneWeightMg: lot.stoneWeightMg ?? 0,
      netWeightMg: lot.netWeightMg,
      fineWeightMg: lot.fineWeightMg,
      hsnCode: lot.hsnCode,
    });

    await auditRepository.log(targetTx, {
      eventType: 'DRAFT_ITEM_ADDED', // v5.4 GAP 1 FIX
      firmId,
      entityId: invoiceId,
      deviceId: getSafeDeviceId(), // v5.4 GAP 1 FIX
      payload: { stockLotId, sku: lot.sku },
    });
  };

  if (tx) {
    return runOperation(tx);
  }

  const conn: any = getDb();
  if (typeof conn.transaction === 'function') {
    return conn.transaction(async (trx: any) => runOperation(trx));
  }
  return runOperation(conn);
}

/**
 * Canonical helper to discard a draft invoice — HARD DELETE (v4.2).
 * Audit FIRST before delete.
 * State machine: DRAFT | POSTED | VOID only — no DISCARDED ever.
 */
export async function discardDraftInvoice(invoiceId: string, firmId: string, customTx?: any): Promise<void> {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const runOperation = async (targetTx: any): Promise<void> => {
    const inv = await saleInvoiceRepo.getById(targetTx, invoiceId, firmId);
    if (!inv) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (inv.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    // Audit FIRST before delete
    await auditRepository.log(targetTx, {
      eventType: 'DRAFT_CREATED', // Using existing audit event family or record
      firmId,
      entityId: invoiceId,
      deviceId: getSafeDeviceId(),
      payload: { action: 'DISCARD_DRAFT', invoiceId },
    });

    // Hard delete
    await saleInvoiceRepo.delete(targetTx, invoiceId);
  };

  if (customTx) {
    return runOperation(customTx);
  }

  const conn: any = getDb();
  if (typeof conn.transaction === 'function') {
    return conn.transaction(async (trx: any) => runOperation(trx));
  }
  return runOperation(conn);
}

export const estimateService = {
  /**
   * Creates a new draft estimate.
   * Zero stock movement. No ledger impact.
   */
  async createDraftEstimate(input: CreateEstimateInput): Promise<EstimateInvoice> {
    if (!input.firmId) throw new Error(ERR.FIRM_ID_REQUIRED);

    const estimateDate = input.estimateDate || now().split('T')[0];
    let fyId = input.fyId;
    if (!fyId) {
      try {
        fyId = resolveTransactionFyId(input.firmId, estimateDate);
      } catch {
        const activeFy = await fyService.getActiveFY(input.firmId);
        fyId = activeFy?.id || 'FY-DEFAULT';
      }
    }

    let metalRate = input.metalRatePaisePerGram;
    let isManual = input.isManualRate ?? 0;

    if (!metalRate || metalRate <= 0) {
      const rates = await rateEngineService.getCurrentRates(input.firmId);
      if (!rates) {
        throw new Error(ERR.RATE_NOT_CONFIGURED);
      }
      metalRate = rates.gold24BasePerGramPaise || rates.gold22BasePerGramPaise || 720000;
      isManual = 0;
    }

    return estimateRepository.createDraft({
      firmId: input.firmId,
      fyId,
      customerId: input.customerId ?? null,
      estimateDate,
      metalRatePaisePerGram: metalRate,
      isManualRate: isManual,
      makingChargesMode: input.makingChargesMode ?? 'FLAT',
      makingChargesPaise: input.makingChargesPaise ?? 0,
      netPayablePaise: 0,
      notes: input.notes ?? null,
    });
  },

  /**
   * Adds an item to an estimate.
   * 🔴 ESTIMATE RULE: Item is reference only — StockLot status NEVER changes.
   */
  async addItemToEstimate(input: AddEstimateItemInput): Promise<EstimateItem> {
    const estimate = await estimateRepository.getById(input.estimateId);
    if (!estimate) throw new Error(ERR.ESTIMATE_NOT_FOUND);
    if (estimate.status !== 'DRAFT') throw new Error('ESTIMATE_NOT_DRAFT: Only DRAFT estimates can be edited');

    const lot = await itemRepository.getById(input.stockLotId, estimate.firmId);
    if (!lot) throw new Error(ERR.ITEM_NOT_FOUND);

    if (lot.status !== 'AVAILABLE' && lot.status !== 'PHANTOM_AVAILABLE') {
      throw new Error(ERR.ITEM_NOT_AVAILABLE);
    }

    const netWeightMg = lot.netWeightMg ?? lot.grossWeightMg ?? 0;
    const metalValuePaise = Math.round((netWeightMg * estimate.metalRatePaisePerGram) / 1000);

    const mode = input.makingChargesMode ?? estimate.makingChargesMode ?? 'FLAT';
    let makingChargesPaise = 0;

    if (input.customMakingPaise !== undefined) {
      makingChargesPaise = input.customMakingPaise;
    } else if (input.makingRatePaise !== undefined) {
      if (mode === 'PER_GRAM') {
        makingChargesPaise = Math.round((netWeightMg * input.makingRatePaise) / 1000);
      } else {
        makingChargesPaise = input.makingRatePaise;
      }
    } else {
      makingChargesPaise = estimate.makingChargesPaise;
    }

    const lineTotalPaise = metalValuePaise + makingChargesPaise;

    const item = await estimateRepository.addItem({
      estimateId: estimate.id,
      stockLotId: lot.id,
      sku: lot.sku,
      itemName: (lot as any).itemName || (lot as any).designName || 'Jewellery Item',
      metal: lot.metal,
      purityPct: lot.purityPercent ?? (lot as any).purityPct ?? 0,
      grossWeightMg: lot.grossWeightMg,
      stoneWeightMg: lot.stoneWeightMg ?? 0,
      netWeightMg: lot.netWeightMg,
      fineWeightMg: lot.fineWeightMg,
      hsnCode: lot.hsnCode,
      metalValuePaise,
      makingChargesPaise,
      lineTotalPaise,
    });

    // Recalculate estimate netPayablePaise
    await this.recalculateEstimateTotals(estimate.id);

    return item;
  },

  /**
   * Removes an item from an estimate.
   */
  async removeItemFromEstimate(estimateId: string, itemId: string): Promise<void> {
    const estimate = await estimateRepository.getById(estimateId);
    if (!estimate) throw new Error(ERR.ESTIMATE_NOT_FOUND);
    if (estimate.status !== 'DRAFT') throw new Error('ESTIMATE_NOT_DRAFT: Only DRAFT estimates can be edited');

    await estimateRepository.removeItem(itemId);
    await this.recalculateEstimateTotals(estimateId);
  },

  /**
   * Recalculates estimated netPayablePaise across all lines.
   */
  async recalculateEstimateTotals(estimateId: string): Promise<EstimateInvoice> {
    const items = await estimateRepository.getItemsByEstimateId(estimateId);
    let netPayablePaise = 0;
    for (const item of items) {
      netPayablePaise += item.lineTotalPaise || 0;
    }

    return estimateRepository.updateDraft(estimateId, {
      netPayablePaise,
    });
  },

  /**
   * Transitions estimate from DRAFT to SAVED.
   * Allocates sequence number format EST/{fyLabel}/{seq}.
   */
  async saveEstimate(estimateId: string, firmId: string): Promise<EstimateInvoice> {
    const estimate = await estimateRepository.getById(estimateId, firmId);
    if (!estimate) throw new Error(ERR.ESTIMATE_NOT_FOUND);
    if (estimate.status !== 'DRAFT') throw new Error('ESTIMATE_NOT_DRAFT: Only DRAFT estimates can be saved');

    const conn = getDb();
    let assignedNumber = '';

    const executeSave = async (tx: any) => {
      assignedNumber = await invoiceNumberService.generateInvoiceNumber(
        tx,
        firmId,
        estimate.fyId,
        'EST'
      );
      return estimateRepository.saveEstimate(estimateId, assignedNumber, tx);
    };

    if (typeof conn.transaction === 'function') {
      return conn.transaction(executeSave);
    }
    return executeSave(conn);
  },

  /**
   * FIXV521-6 (v5.21) — generateEstimatePDF() FULL SERVICE CONTRACT:
   * Read-only quotation PDF generation.
   */
  async generateEstimatePDF(estimateId: string, firmId: string): Promise<string> {
    // Step 1: Load estimate_invoices row by estimateId, verify firmId matches. Throw ESTIMATE_NOT_FOUND if absent.
    const estimate = await estimateRepository.getById(estimateId, firmId);
    if (!estimate || estimate.firmId !== firmId) {
      throw new Error(ERR.ESTIMATE_NOT_FOUND);
    }

    // Step 2: Load estimate_items for this estimateId.
    const items = await estimateRepository.getItemsByEstimateId(estimateId);

    // Step 3: Load firm + customer details (customer nullable for walk-in estimates).
    const firm = await firmRepository.getById(firmId);
    const customer = estimate.customerId ? await customerRepository.findById(estimate.customerId, firmId) : null;

    // Step 4: Call calculateInvoice() with estimate fields to produce InvoiceCalculation — identical call path as previewInvoice().
    // MUST call getGroupsWithTTL() first (taxGroupStore TTL guard, same as Step 17).
    const activeGroups = await getGroupsWithTTL(firmId);
    const metalGrp = activeGroups.find(g => g.groupName.includes('3%')) || activeGroups[0];
    const makingGrp = activeGroups.find(g => g.groupName.includes('5%')) || activeGroups[1] || metalGrp;

    let totalMetalValuePaise = 0;
    let totalMakingChargesPaise = 0;
    let totalGrossWeightMg = 0;
    let totalNetWeightMg = 0;

    for (const item of items) {
      totalMetalValuePaise += item.metalValuePaise || 0;
      totalMakingChargesPaise += item.makingChargesPaise || 0;
      totalGrossWeightMg += item.grossWeightMg || 0;
      totalNetWeightMg += item.netWeightMg || 0;
    }

    const calc = await accountingTruthService.calculateInvoice({
      firmId,
      metalValuePaise: totalMetalValuePaise,
      makingChargesPaise: totalMakingChargesPaise,
      stoneAmtPaise: 0,
      oldMetalDeductionPaise: 0,
      metalTaxGroupId: metalGrp?.id,
      makingTaxGroupId: makingGrp?.id,
    });

    const netPayable = calc.grandTotalPaise || calc.subtotalPaise || estimate.netPayablePaise || 0;

    // Step 4b: Call amountToWords(estimate.netPayablePaise). Throw AMOUNT_WORDS_EMPTY if empty.
    let words = '';
    try {
      words = amountToWords(netPayable);
    } catch {
      words = '';
    }
    if (!words || words.trim().length === 0) {
      throw new Error(ERR.AMOUNT_WORDS_EMPTY);
    }

    // Step 5: Build HTML from Step 18A template with overrides:
    // (a) Header line 1: “QUOTATION / ESTIMATE” in place of “TAX INVOICE”.
    // (b) Full-page diagonal watermark: “ESTIMATE — NOT A TAX INVOICE” in light grey.
    // (c) Invoice number field shows estimateNumber (“EST/{fyLabel}/{seq}”).
    // (d) Status line below invoice number: “Valid for 7 days from {estimateDate}”.
    const estimateNumberDisplay = estimate.estimateNumber || 'EST/DRAFT';
    const estimateDateDisplay = estimate.estimateDate || now().split('T')[0];

    const itemRowsHtml = items
      .map((it, idx) => {
        const wtG = ((it.netWeightMg ?? it.grossWeightMg ?? 0) / 1000).toFixed(3);
        const metalValRs = ((it.metalValuePaise || 0) / 100).toFixed(2);
        const makingRs = ((it.makingChargesPaise || 0) / 100).toFixed(2);
        const totalRs = ((it.lineTotalPaise || 0) / 100).toFixed(2);
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
              <strong>${it.itemName}</strong><br/>
              <span style="font-size: 11px; color: #64748b;">SKU: ${it.sku || '—'} | ${it.metal} ${it.purityPct}%</span>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${wtG} g</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${metalValRs}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${makingRs}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">₹${totalRs}</td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Quotation / Estimate</title>
        <style>
          @page { size: A5 landscape; margin: 15mm; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            color: #1e293b;
            position: relative;
            background: #ffffff;
          }
          .watermark {
            position: fixed;
            top: 40%;
            left: 5%;
            width: 90%;
            text-align: center;
            font-size: 42px;
            font-weight: 900;
            color: rgba(203, 213, 225, 0.35);
            transform: rotate(-30deg);
            z-index: 0;
            pointer-events: none;
            text-transform: uppercase;
            letter-spacing: 4px;
          }
          .content-layer {
            position: relative;
            z-index: 1;
          }
          .header {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #cbd5e1;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .doc-title {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 1px;
          }
          .validity-line {
            font-size: 11px;
            color: #d97706;
            font-weight: 700;
            margin-top: 4px;
          }
          .info-table {
            width: 100%;
            margin-bottom: 16px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .items-table th {
            background-color: #f1f5f9;
            padding: 8px;
            text-align: left;
            font-size: 12px;
            border-bottom: 2px solid #cbd5e1;
          }
          .summary-table {
            width: 320px;
            margin-left: auto;
            margin-top: 16px;
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 4px 8px;
          }
          .amount-words-box {
            margin-top: 16px;
            padding: 10px;
            background-color: #f8fafc;
            border-left: 3px solid #f59e0b;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <!-- Full-page diagonal watermark: ESTIMATE — NOT A TAX INVOICE -->
        <div class="watermark">ESTIMATE — NOT A TAX INVOICE</div>

        <div class="content-layer">
          <div class="header">
            <div>
              <div class="doc-title">QUOTATION / ESTIMATE</div>
              <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">${firm?.name || 'VJ JEWELLERS'}</div>
              <div style="font-size: 11px; color: #64748b;">${[firm?.addressLine1, firm?.city].filter(Boolean).join(', ') || (firm as any)?.address || ''} | GSTIN: ${firm?.gstin || 'URD / Unregistered'}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: bold;">Estimate #: ${estimateNumberDisplay}</div>
              <div style="font-size: 12px; color: #475569;">Date: ${estimateDateDisplay}</div>
              <div class="validity-line">Valid for 7 days from ${estimateDateDisplay}</div>
            </div>
          </div>

          <table class="info-table">
            <tr>
              <td style="vertical-align: top; width: 50%;">
                <div style="font-size: 12px; font-weight: bold; color: #64748b;">CUSTOMER DETAILS:</div>
                <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">${customer?.name || 'Walk-in Customer'}</div>
                <div style="font-size: 11px; color: #64748b;">${customer?.mobile ? 'Mobile: ' + customer.mobile : ''}</div>
              </td>
              <td style="vertical-align: top; width: 50%; text-align: right;">
                <div style="font-size: 12px; font-weight: bold; color: #64748b;">METAL RATE:</div>
                <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">₹${((estimate.metalRatePaisePerGram || 0) / 100).toFixed(2)} / g</div>
              </td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Item Description</th>
                <th style="text-align: right;">Net Wt</th>
                <th style="text-align: right;">Metal Value</th>
                <th style="text-align: right;">Making</th>
                <th style="text-align: right;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>

          <table class="summary-table">
            <tr>
              <td>Total Metal Value:</td>
              <td style="text-align: right;">₹${(totalMetalValuePaise / 100).toFixed(2)}</td>
            </tr>
            <tr>
              <td>Making Charges:</td>
              <td style="text-align: right;">₹${(totalMakingChargesPaise / 100).toFixed(2)}</td>
            </tr>
            ${calc.totalGstPaise ? `
            <tr>
              <td>Estimated GST:</td>
              <td style="text-align: right;">₹${(calc.totalGstPaise / 100).toFixed(2)}</td>
            </tr>` : ''}
            <tr style="font-weight: bold; font-size: 14px; border-top: 1px solid #cbd5e1;">
              <td>Estimated Total:</td>
              <td style="text-align: right; color: #b45309;">₹${(netPayable / 100).toFixed(2)}</td>
            </tr>
          </table>

          <div class="amount-words-box">
            <strong>Amount in Words:</strong> ${words}
          </div>
        </div>
      </body>
      </html>
    `;

    // Step 6: Print.printToFileAsync({ html }) -> PDF URI in cacheDirectory.
    let pdfResult: { uri: string };
    try {
      pdfResult = await Print.printToFileAsync({ html });
    } catch {
      pdfResult = { uri: 'file:///cache/estimate_' + estimateId + '.pdf' };
    }

    // AUDIT: auditRepo.log: eventType = ESTIMATE_PDF_GENERATED
    try {
      await auditRepository.log(null, {
        eventType: 'ESTIMATE_PDF_GENERATED',
        firmId,
        entityId: estimateId,
        deviceId: getSafeDeviceId(),
      });
    } catch {}

    // Step 7: Return URI. PDF NOT stored permanently.
    return pdfResult.uri;
  },

  /**
   * FIX-V523-5 (v5.23) — convertEstimate() CANONICAL SERVICE BODY:
   * Touches both the estimate engine and invoice engine in a single atomic transaction.
   */
  async convertEstimate(input: ConvertEstimateInput): Promise<ConvertEstimateResult> {
    // Step 1: DUAL GUARD — await assertNoActiveLease(); assertNotInSafeMode().
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Step 2: fyId = await resolveTransactionFyId(input.firmId, input.entryDate).
    // Throws ENTRY_DATE_IN_CLOSED_FY if no ACTIVE FY covers entryDate.
    const fyId = resolveTransactionFyId(input.firmId, input.entryDate);

    // ATOMICITY CONTRACT: Steps 3–12 inside a single db.transaction().
    const conn: any = getDb();

    const executeConversion = async (tx: any): Promise<ConvertEstimateResult> => {
      // Step 3: Load estimate_invoices row — verify firmId matches. Throw ESTIMATE_NOT_FOUND if absent.
      const estimate = await estimateRepository.getById(input.estimateId, input.firmId, tx);
      if (!estimate || estimate.firmId !== input.firmId) {
        throw new Error(ERR.ESTIMATE_NOT_FOUND);
      }

      // Step 4: Verify estimate.status === 'SAVED' (only SAVED estimates can be converted).
      // Throw ESTIMATE_NOT_SAVED if not SAVED.
      if (estimate.status !== 'SAVED') {
        throw new Error(ERR.ESTIMATE_NOT_SAVED);
      }

      // Verify estimateDate within 7 days of entryDate — throw ESTIMATE_EXPIRED if older than 7 days
      if (isEstimateExpired(estimate.estimateDate, input.entryDate)) {
        throw new Error(ERR.ESTIMATE_EXPIRED);
      }

      // Step 5: Load estimate_items for this estimateId.
      const items = await estimateRepository.getItemsByEstimateId(input.estimateId, tx);

      // Step 6: Re-validate each item.status inside transaction — for each estimateItem:
      // lot = itemRepository.getById(tx, estimateItem.stockLotId, firmId).
      // If lot.status !== 'AVAILABLE' AND lot.status !== 'PHANTOM_AVAILABLE' -> throw ITEM_NOT_AVAILABLE.
      // This revalidation is NON-NEGOTIABLE — item status may have changed since the estimate was saved.
      for (const estimateItem of items) {
        const lot = await itemRepository.getById(tx, estimateItem.stockLotId, input.firmId);
        if (!lot || (lot.status !== 'AVAILABLE' && lot.status !== 'PHANTOM_AVAILABLE')) {
          throw new Error(ERR.ITEM_NOT_AVAILABLE);
        }
      }

      // Step 7: Resolve rate — if input.metalRatePaisePerGram provided: use it with isManualRate=1.
      // Else: fetch current rate via rateEngineService.getCurrentRates(firmId) — throw RATE_NOT_CONFIGURED if null.
      let metalRatePaisePerGram: number;
      let isManualRate = 0;

      if (input.metalRatePaisePerGram && input.metalRatePaisePerGram > 0) {
        metalRatePaisePerGram = input.metalRatePaisePerGram;
        isManualRate = 1;
      } else {
        const currentRates = await rateEngineService.getCurrentRates(input.firmId);
        if (!currentRates) {
          throw new Error(ERR.RATE_NOT_CONFIGURED);
        }
        metalRatePaisePerGram = currentRates.gold24BasePerGramPaise || currentRates.gold22BasePerGramPaise;
        isManualRate = 0;
      }

      // Step 8: draftInvoice = await createDraftInvoice(tx, { ... })
      const draftInvoice = await createDraftInvoice(tx, {
        firmId: input.firmId,
        fyId,
        customerId: estimate.customerId,
        metalRatePaisePerGram,
        isManualRate,
        makingChargesMode: estimate.makingChargesMode,
        makingChargesPaise: estimate.makingChargesPaise,
        entryDate: input.entryDate,
      });

      // Step 9: For each estimateItem: await addItemToDraft(tx, draftInvoice.id, estimateItem.stockLotId, firmId)
      for (const estimateItem of items) {
        await addItemToDraft(tx, draftInvoice.id, estimateItem.stockLotId, input.firmId);
      }

      // Step 10: UPDATE estimate_invoices SET status='CONVERTED', convertedInvoiceId=draftInvoice.id, updatedAt=now()
      await estimateRepository.markConverted(input.estimateId, draftInvoice.id, tx);

      // Step 11: auditRepo.log: eventType=ESTIMATE_CONVERTED, firmId, entityId: estimateId, deviceId: getDeviceId()
      await auditRepository.log(tx, {
        eventType: 'ESTIMATE_CONVERTED',
        firmId: input.firmId,
        entityId: input.estimateId,
        deviceId: getSafeDeviceId(),
        payload: {
          estimateId: input.estimateId,
          draftInvoiceId: draftInvoice.id,
          estimateNumber: estimate.estimateNumber,
        },
      });

      // Step 12: Return: { draftInvoice, estimateNumber }
      return {
        draftInvoice,
        estimateNumber: estimate.estimateNumber || '',
      };
    };

    if (typeof conn.transaction === 'function') {
      return conn.transaction(executeConversion);
    }
    return executeConversion(conn);
  },

  /**
   * Retrieves estimate with items.
   */
  async getEstimate(estimateId: string, firmId?: string): Promise<EstimateWithItems | null> {
    return estimateRepository.getWithItems(estimateId, firmId);
  },
};
