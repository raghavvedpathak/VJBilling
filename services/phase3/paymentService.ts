// services/phase3/paymentService.ts — Phase 3 Payment Engine Service
// Strictly implements STEP 11 — PAYMENT ENGINE & FIX-V523-4 Canonical Service Body
// Atomicity contract: Steps 1-9 execute inside a single db.transaction().

import * as Crypto from 'expo-crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { resolveTransactionFyId } from '@/services/phase1/fyService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { paymentRepository } from '@/repositories/phase3/paymentRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { saleInvoices } from '@/db/schema/phase3_money_truth';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import type {
  RecordPaymentInput,
  RecordPaymentResult,
  Payment,
  InvoicePaymentSummary,
  OutstandingInvoice,
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

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

export const paymentService = {
  /**
   * CANONICAL SERVICE BODY: FIX-V523-4 (v5.23)
   * Records an append-only payment and synchronizes ledger atomically.
   * All 9 steps execute inside a single db.transaction().
   */
  async recordPayment(
    input: RecordPaymentInput,
    customTx?: any
  ): Promise<RecordPaymentResult> {
    return executeTransaction(async (tx) => {
      // -----------------------------------------------------------------------
      // Step 1: DUAL GUARD
      // -----------------------------------------------------------------------
      await leaseService.assertNoActiveLease();
      await safeModeService.assertNotInSafeMode();

      // -----------------------------------------------------------------------
      // Step 2: FY RESOLUTION
      // Confirms FY ACTIVE at payment time. Throws ENTRY_DATE_IN_CLOSED_FY if closed.
      // Constitutional rule: never use getActiveFY() here.
      // -----------------------------------------------------------------------
      const fyId = await resolveTransactionFyId(input.firmId, input.paymentDate, tx);

      // -----------------------------------------------------------------------
      // Step 3: VALIDATION
      // -----------------------------------------------------------------------
      if (
        !input.amountPaise ||
        input.amountPaise <= 0 ||
        !Number.isFinite(input.amountPaise)
      ) {
        throw new Error(ERR.INVALID_PAYMENT_AMOUNT);
      }

      if (input.mode !== 'CASH' && input.mode !== 'BANK' && input.mode !== 'UPI') {
        throw new Error('INVALID_PAYMENT_MODE');
      }

      // v4.9 FIX — bankAccountId VALIDATION RULE
      if (input.mode === 'BANK' || input.mode === 'UPI') {
        if (!input.bankAccountId || !input.bankAccountId.trim()) {
          throw new Error(ERR.BANK_ACCOUNT_REQUIRED);
        }
      }

      if (input.mode === 'CASH') {
        if (input.bankAccountId !== null && input.bankAccountId !== undefined) {
          throw new Error(ERR.BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);
        }
      }

      // -----------------------------------------------------------------------
      // Step 4: BILL-LINKAGE VERIFICATION
      // -----------------------------------------------------------------------
      if (input.linkedInvoiceId) {
        const conn = getDb(tx);
        if (input.partyType === 'CUSTOMER') {
          let invoice: any = null;
          try {
            if (typeof conn.select === 'function') {
              const rows = conn
                .select()
                .from(saleInvoices)
                .where(eq(saleInvoices.id, input.linkedInvoiceId))
                .limit(1)
                .all();
              invoice = rows && rows.length > 0 ? rows[0] : null;
            } else if (typeof conn.all === 'function') {
              const rows = conn.all(
                sql`SELECT * FROM sale_invoices WHERE id = ${input.linkedInvoiceId} LIMIT 1`
              );
              invoice = rows && rows.length > 0 ? rows[0] : null;
            }
          } catch {
            invoice = await invoiceRepository.getById(input.linkedInvoiceId, tx);
          }

          if (
            !invoice ||
            invoice.firmId !== input.firmId ||
            invoice.customerId !== input.partyId
          ) {
            throw new Error(ERR.PAYMENT_INVOICE_MISMATCH);
          }
        } else if (input.partyType === 'SUPPLIER') {
          // Verify purchase invoice if purchase_invoices table exists
          try {
            const rows = conn.all
              ? conn.all(
                  sql`SELECT * FROM purchase_invoices WHERE id = ${input.linkedInvoiceId} LIMIT 1`
                )
              : [];
            const invoice = rows && rows.length > 0 ? rows[0] : null;
            if (
              !invoice ||
              invoice.firm_id !== input.firmId ||
              invoice.supplier_id !== input.partyId
            ) {
              throw new Error(ERR.PAYMENT_INVOICE_MISMATCH);
            }
          } catch (e: any) {
            if (e?.message === ERR.PAYMENT_INVOICE_MISMATCH) {
              throw e;
            }
            // If table doesn't exist yet, reject link to unknown purchase invoice
            throw new Error(ERR.PAYMENT_INVOICE_MISMATCH);
          }
        }
      }

      // -----------------------------------------------------------------------
      // Step 5: INSERT INTO payments
      // -----------------------------------------------------------------------
      const paymentType =
        input.type || (input.partyType === 'CUSTOMER' ? 'MONEY_IN' : 'MONEY_OUT');

      const payment = paymentRepository.insert(tx, {
        firmId: input.firmId,
        fyId,
        partyId: input.partyId,
        partyType: input.partyType,
        type: paymentType,
        amountPaise: Math.round(input.amountPaise),
        mode: input.mode,
        bankAccountId: input.bankAccountId ?? null,
        status: 'PAID',
        reason: input.reason ?? null,
        linkedInvoiceId: input.linkedInvoiceId ?? null,
        notes: input.notes ?? null,
      });

      // -----------------------------------------------------------------------
      // Step 6: INSERT INTO ledger_entries
      // CUSTOMER payment -> CREDIT (reduces receivable)
      // SUPPLIER payment -> DEBIT (reduces payable)
      // -----------------------------------------------------------------------
      const ledgerType = input.partyType === 'CUSTOMER' ? 'CREDIT' : 'DEBIT';
      const descText =
        input.reason ||
        (input.partyType === 'CUSTOMER'
          ? `Payment received via ${input.mode}`
          : `Payment made via ${input.mode}`);

      const ledgerEntry = ledgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId,
        partyId: input.partyId,
        partyType: input.partyType,
        type: ledgerType,
        amountPaise: Math.round(input.amountPaise),
        linkedEntityType: 'PAYMENT',
        linkedEntityId: payment.id,
        description: descText,
      });

      // -----------------------------------------------------------------------
      // Step 7: INVALIDATE MMKV BALANCE CACHE
      // FIX-V520-2 (v5.20): Required so deriveCustomerBalance() / deriveSupplierBalance()
      // reflects the new payment immediately.
      // -----------------------------------------------------------------------
      accountingTruthService.invalidatePartyBalanceCache(input.firmId, input.partyId);

      // -----------------------------------------------------------------------
      // Step 8: AUDIT REPO LOG
      // -----------------------------------------------------------------------
      const deviceId = getSafeDeviceId();
      auditRepository.log(tx, {
        eventType: 'PAYMENT_RECORDED',
        firmId: input.firmId,
        entityId: payment.id,
        deviceId,
        payload: {
          partyId: input.partyId,
          partyType: input.partyType,
          amountPaise: input.amountPaise,
          mode: input.mode,
          linkedInvoiceId: input.linkedInvoiceId ?? null,
        },
      });

      // -----------------------------------------------------------------------
      // Step 9: COMMIT & RETURN
      // -----------------------------------------------------------------------
      return { payment, ledgerEntry };
    }, customTx);
  },

  /**
   * Derives payment breakdown and remaining balance for an invoice.
   * To query all payments for a bill: SELECT * FROM payments WHERE linkedInvoiceId = ? AND firmId = ?
   */
  async getInvoicePaymentSummary(
    firmId: string,
    invoiceId: string,
    customTx?: any
  ): Promise<InvoicePaymentSummary> {
    const conn = getDb(customTx);
    let invoice: any = null;
    try {
      if (typeof conn.select === 'function') {
        const rows = conn
          .select()
          .from(saleInvoices)
          .where(and(eq(saleInvoices.firmId, firmId), eq(saleInvoices.id, invoiceId)))
          .limit(1)
          .all();
        invoice = rows && rows.length > 0 ? rows[0] : null;
      }
    } catch {
      invoice = await invoiceRepository.getById(invoiceId, conn);
    }

    const linkedPayments = paymentRepository.getByLinkedInvoice(conn, firmId, invoiceId);
    const invoiceTotalPaise = invoice?.netPayablePaise ?? 0;
    const paidPaise = linkedPayments.reduce((sum, p) => sum + p.amountPaise, 0);
    const remainingPaise = Math.max(0, invoiceTotalPaise - paidPaise);

    return {
      invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      invoiceTotalPaise,
      paidPaise,
      remainingPaise,
      paymentCount: linkedPayments.length,
      payments: linkedPayments,
    };
  },

  /**
   * Retrieves all payments linked to a specific bill.
   */
  getLinkedPayments(firmId: string, invoiceId: string, customTx?: any): Payment[] {
    const conn = getDb(customTx);
    return paymentRepository.getByLinkedInvoice(conn, firmId, invoiceId);
  },

  /**
   * Fetches outstanding (unpaid or partially paid) invoices for a customer or supplier.
   * Used by the "Link to bill" picker on the payment entry screen.
   */
  async getOutstandingInvoicesForParty(
    firmId: string,
    partyId: string,
    partyType: 'CUSTOMER' | 'SUPPLIER',
    customTx?: any
  ): Promise<OutstandingInvoice[]> {
    const conn = getDb(customTx);
    const results: OutstandingInvoice[] = [];

    if (partyType === 'CUSTOMER') {
      try {
        const rows = conn
          .select()
          .from(saleInvoices)
          .where(
            and(
              eq(saleInvoices.firmId, firmId),
              eq(saleInvoices.customerId, partyId),
              eq(saleInvoices.status, 'POSTED')
            )
          )
          .orderBy(desc(saleInvoices.createdAt))
          .all();

        for (const inv of rows) {
          const paymentsForInv = paymentRepository.getByLinkedInvoice(
            conn,
            firmId,
            inv.id
          );
          const paidPaise = paymentsForInv.reduce((acc, p) => acc + p.amountPaise, 0);
          const remainingPaise = (inv.netPayablePaise || 0) - paidPaise;

          results.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber || 'DRAFT',
            invoiceDate: inv.invoiceDate,
            netPayablePaise: inv.netPayablePaise || 0,
            paidPaise,
            remainingPaise,
          });
        }
      } catch (e) {
        console.warn('[PaymentService] Failed to query outstanding customer invoices:', e);
      }
    }

    return results;
  },

  /**
   * Delegates to supplierPaymentService.recordSupplierPayment() for Step 11A.
   */
  async recordSupplierPayment(input: any, customTx?: any) {
    const { supplierPaymentService } = require('@/services/phase3/supplierPaymentService');
    return supplierPaymentService.recordSupplierPayment(input, customTx);
  },
};
