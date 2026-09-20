// services/phase3/invoicePdfService.ts — Phase 3 STEP 18 & 18A: PDF Invoice Generation Engine
// Adheres strictly to Step 18 & 18A Specification:
// • Step 1: Verify invoice.status === POSTED
// • Step 2: Load invoice snapshot from DB (NEVER re-read Phase 2 items)
// • Step 3: Load firm + customer details, payments, and old metal lot
// • Step 4: Build HTML from snapshot data only using Vedpathak Jewellers Tax Invoice layout (all 11 locked sections)
// • Step 4b: Call amountToWords(invoice.netPayablePaise) from utils/currency.ts (G67-AMOUNTTOWORDS)
//   + FIX-V520-8: validate non-empty and non-whitespace, throw AMOUNT_WORDS_EMPTY if empty
// • Step 5: Print.printToFileAsync({ html }) -> PDF URI in cacheDirectory (surface 'Unable to generate PDF. Please try again.' on failure)
// • Step 6: Return URI — PDF NOT stored permanently (v4.8 cache retention rule)
// • Reprint -> add 'DUPLICATE' watermark. Audit: PDF_GENERATED event (eventType, deviceId).

import * as Print from 'expo-print';
import { ERR } from '@/constants/errorCodes';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { bankAccountRepository } from '@/repositories/phase3/bankAccountRepository';
import { invoicePrintSettingsService } from '@/services/phase3/invoicePrintSettingsService';
import { paymentRepository } from '@/repositories/phase3/paymentRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { amountToWords } from '@/utils/currency';
import { getDeviceId } from '@/utils/deviceId';
import { renderVedpathakInvoiceTemplate } from '@/templates/invoice';
import type { InvoiceTemplateParams } from '@/templates/invoice';
import db, { db as dbNamed } from '@/db/client';
import type {
  GenerateInvoicePDFOptions,
} from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

/**
 * Builds standard Vedpathak Jewellers Tax Invoice HTML strictly from snapshot data.
 * Adheres to all 11 locked sections specified in Step 18A.
 */
export function buildInvoiceHTML(params: InvoiceTemplateParams): string {
  return renderVedpathakInvoiceTemplate(params);
}

/**
 * STEP 18: generateInvoicePDF()
 * Generates fresh PDF using expo-print strictly for POSTED invoices.
 * Returns file URI located in cacheDirectory. NEVER persisted to database or MMKV.
 */
export async function generateInvoicePDF(
  invoiceId: string,
  firmIdOrOptions?: string | GenerateInvoicePDFOptions,
  maybeOptions?: GenerateInvoicePDFOptions
): Promise<string> {
  let firmId: string | undefined;
  let options: GenerateInvoicePDFOptions | undefined;

  if (typeof firmIdOrOptions === 'string') {
    firmId = firmIdOrOptions;
    options = maybeOptions;
  } else if (typeof firmIdOrOptions === 'object') {
    options = firmIdOrOptions;
  }

  if (!invoiceId) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }

  // Step 1: Verify invoice.status === POSTED
  const invoice = await invoiceRepository.getById(invoiceId);
  if (!invoice) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }
  if (firmId && invoice.firmId !== firmId) {
    throw new Error(ERR.FIRM_INVOICE_MISMATCH || 'FIRM_INVOICE_MISMATCH');
  }
  if (invoice.status !== 'POSTED') {
    throw new Error(ERR.INVOICE_NOT_POSTED);
  }

  // Step 2: Load invoice snapshot from DB (NEVER re-read Phase 2 items)
  const items = await invoiceRepository.getItemsByInvoiceId(invoiceId);

  // Step 3: Load firm + customer details
  const firm = await firmRepository.getById(invoice.firmId);
  if (!firm) {
    throw new Error(ERR.FIRM_NOT_FOUND);
  }

  const customer = invoice.customerId
    ? customerRepository.findById(invoice.firmId, invoice.customerId)
    : null;

  const defaultBank = await bankAccountRepository.getDefault(invoice.firmId);
  const printSettings = await invoicePrintSettingsService.getPrintSettings(invoice.firmId);

  // Load payment records linked to this invoice
  let payments: any[] = [];
  try {
    payments = paymentRepository.getByLinkedInvoice(null, invoice.firmId, invoice.id);
  } catch {
    payments = [];
  }

  // Load old metal lot linked to this invoice (if exchange was performed)
  let oldMetalLot: any = null;
  if ((invoice.oldMetalDeductionPaise || 0) > 0) {
    try {
      oldMetalLot = await oldMetalLotRepository.findBySaleInvoiceId(invoice.firmId, invoice.id);
    } catch {
      oldMetalLot = null;
    }
  }

  // Step 4b: Call amountToWords(invoice.netPayablePaise) from utils/currency.ts (G67-AMOUNTTOWORDS)
  const amountWords = amountToWords(invoice.netPayablePaise);
  // FIX-V520-8 (v5.20): validate non-empty and non-whitespace
  if (!amountWords || !amountWords.trim()) {
    throw new Error(ERR.AMOUNT_WORDS_EMPTY);
  }

  // Step 4: Build HTML from snapshot data only
  const html = buildInvoiceHTML({
    invoice,
    items,
    firm,
    customer,
    amountWords,
    payments,
    oldMetalLot,
    options,
    printSettings,
    defaultBank,
  });

  // Step 5: Print.printToFileAsync({ html }) -> PDF URI in cacheDirectory
  let pdfResult: { uri: string };
  try {
    pdfResult = await Print.printToFileAsync({ html });
  } catch (printErr: any) {
    // If Print.printToFileAsync() fails because cacheDirectory is full or other print error
    throw new Error('Unable to generate PDF. Please try again.');
  }

  // Audit: PDF_GENERATED event (eventType, deviceId)
  try {
    const auditEntry = {
      firmId: invoice.firmId,
      eventType: 'PDF_GENERATED' as const,
      entityId: invoice.id,
      deviceId: getSafeDeviceId(),
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        isReprint: Boolean(options?.isReprint),
        netPayablePaise: invoice.netPayablePaise,
      },
    };

    const targetDb = dbNamed || db;
    if (typeof (targetDb as any).transaction === 'function') {
      await (targetDb as any).transaction((tx: any) => {
        auditRepository.log(tx, auditEntry);
      });
    } else {
      auditRepository.log(targetDb, auditEntry);
    }
  } catch (auditErr) {
    // Non-blocking for PDF return
    console.warn('[invoicePdfService] Audit logging failed for PDF_GENERATED:', auditErr);
  }

  // Step 6: Return URI — PDF NOT stored permanently (v4.8 cache retention rule)
  return pdfResult.uri;
}

export const invoicePdfService = {
  generateInvoicePDF,
  buildInvoiceHTML,
};
