// services/phase3/transactionShareService.ts — Phase 3 STEP 20: Transaction Share Service
// Adheres strictly to Step 20 Specification:
// • Step 1: Verify invoice.status === POSTED
// • Step 2: Call generateInvoicePDF() — always fresh, never cached (see Step 18 v4.8 rule)
// • Step 3: WHATSAPP: Share.share({ url: pdfUri })
// • Step 4: EMAIL: MailComposer.composeAsync with PDF
// • Step 5: PRINT: Print.printAsync({ uri: pdfUri })
// • Step 6: Audit: INVOICE_SHARED with shareMethod (eventType, deviceId)
// • PDF NOT stored permanently — generated fresh each time.

import { Share } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import { generateInvoicePDF } from '@/services/phase3/invoicePdfService';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { ERR } from '@/constants/errorCodes';
import db, { db as dbNamed } from '@/db/client';
import type {
  ShareMethod,
  ShareInvoiceOptions,
  ShareInvoiceResult,
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
 * STEP 20: shareInvoice()
 * Shares a posted invoice via WhatsApp, Email, or Print with fresh PDF generation
 * and transactional audit trail logging.
 */
export async function shareInvoice(
  invoiceId: string,
  shareMethod: ShareMethod,
  options?: ShareInvoiceOptions
): Promise<ShareInvoiceResult> {
  if (!invoiceId) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }

  const validMethods: ShareMethod[] = ['WHATSAPP', 'EMAIL', 'PRINT'];
  if (!validMethods.includes(shareMethod)) {
    throw new Error(ERR.INVALID_SHARE_METHOD);
  }

  // ===========================================================================
  // Step 1: Verify invoice.status === POSTED
  // ===========================================================================
  const invoice = await invoiceRepository.getById(invoiceId);
  if (!invoice) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }
  if (options?.firmId && invoice.firmId !== options.firmId) {
    throw new Error(ERR.FIRM_INVOICE_MISMATCH);
  }
  if (invoice.status !== 'POSTED') {
    throw new Error(ERR.INVOICE_NOT_POSTED);
  }

  // ===========================================================================
  // Step 2: Call generateInvoicePDF() — always fresh, never cached (v4.8 rule)
  // ===========================================================================
  const pdfOptions: GenerateInvoicePDFOptions = {};
  if (options?.isReprint !== undefined) {
    pdfOptions.isReprint = options.isReprint;
  }
  const pdfUri = await generateInvoicePDF(invoice.id, invoice.firmId, pdfOptions);

  let shareResult: any = null;

  // ===========================================================================
  // Step 3: WHATSAPP: Share.share({ url: pdfUri })
  // ===========================================================================
  if (shareMethod === 'WHATSAPP') {
    const shareContent: any = {
      url: pdfUri,
    };
    if (options?.message) shareContent.message = options.message;
    if (options?.title) shareContent.title = options.title;

    shareResult = await Share.share(shareContent);
  }

  // ===========================================================================
  // Step 4: EMAIL: MailComposer.composeAsync with PDF
  // ===========================================================================
  else if (shareMethod === 'EMAIL') {
    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      throw new Error(ERR.EMAIL_NOT_AVAILABLE);
    }

    let customerEmail: string | undefined;
    if (invoice.customerId) {
      try {
        const customer = customerRepository.findById(invoice.firmId, invoice.customerId);
        if (customer && (customer as any).email) {
          customerEmail = (customer as any).email;
        }
      } catch {}
    }

    const recipients = options?.recipientEmail
      ? [options.recipientEmail]
      : customerEmail
      ? [customerEmail]
      : [];

    const subject =
      options?.subject || `Tax Invoice ${invoice.invoiceNumber || invoice.id}`;
    const body =
      options?.body ||
      `Dear Customer,\n\nPlease find attached your tax invoice ${
        invoice.invoiceNumber || invoice.id
      }.\n\nThank you for your business!`;

    shareResult = await MailComposer.composeAsync({
      recipients,
      subject,
      body,
      attachments: [pdfUri],
    });
  }

  // ===========================================================================
  // Step 5: PRINT: Print.printAsync({ uri: pdfUri })
  // ===========================================================================
  else if (shareMethod === 'PRINT') {
    shareResult = await Print.printAsync({ uri: pdfUri });
  }

  // ===========================================================================
  // Step 6: Audit: INVOICE_SHARED with shareMethod (eventType, deviceId)
  // ===========================================================================
  try {
    const auditEntry = {
      firmId: invoice.firmId,
      eventType: 'INVOICE_SHARED' as const,
      entityId: invoice.id,
      deviceId: getSafeDeviceId(),
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        shareMethod,
        pdfUri,
        recipient: options?.recipientEmail || null,
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
    // Non-blocking for sharing success
    console.warn('[transactionShareService] Audit logging failed for INVOICE_SHARED:', auditErr);
  }

  return {
    success: true,
    shareMethod,
    pdfUri,
    shareResult,
  };
}

export const transactionShareService = {
  shareInvoice,
};

export default transactionShareService;
