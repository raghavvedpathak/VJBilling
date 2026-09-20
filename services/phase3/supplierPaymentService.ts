// services/phase3/supplierPaymentService.ts — Phase 3 Supplier Metal Payment Engine
// Implements STEP 11A (v5.13 / v5.14) & FIX-SMP-INDEXES-1
// Pay supplier in metal, money, or mixed (metal + money) at shop-owner-entered rate.
// Atomic all-or-nothing transaction.

import * as Crypto from 'expo-crypto';
import { sql } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { resolveTransactionFyId } from '@/services/phase1/fyService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { supplierMetalPaymentRepository } from '@/repositories/phase3/supplierMetalPaymentRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import type {
  RecordSupplierPaymentInput,
  RecordSupplierPaymentResult,
  SupplierMetalPayment,
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

export const supplierPaymentService = {
  /**
   * CANONICAL SERVICE BODY: STEP 11A — recordSupplierPayment()
   * Routes MONEY ONLY, METAL ONLY, and MIXED (metal + money) modes atomically.
   */
  async recordSupplierPayment(
    input: RecordSupplierPaymentInput,
    customTx?: any
  ): Promise<RecordSupplierPaymentResult> {
    return executeTransaction(async (tx) => {
      // -----------------------------------------------------------------------
      // Step 1: DUAL GUARD
      // -----------------------------------------------------------------------
      await leaseService.assertNoActiveLease();
      safeModeService.assertNotInSafeMode();

      // -----------------------------------------------------------------------
      // Step 2: SUPPLIER VALIDATION
      // supplierId must exist and belong to firmId -> throw SUPPLIER_NOT_FOUND
      // -----------------------------------------------------------------------
      const supplier = supplierRepository.findById(input.firmId, input.supplierId, tx);
      if (!supplier) {
        throw new Error(ERR.SUPPLIER_NOT_FOUND);
      }

      // -----------------------------------------------------------------------
      // Step 3: VALUE & PORTION VALIDATIONS
      // -----------------------------------------------------------------------
      const metalWeightMg = Math.round(input.metalWeightMg || 0);
      const metalPurityPct = input.metalPurityPct || 0;
      const metalRatePaisePerGram = Math.round(input.metalRatePaisePerGram || 0);
      const moneyAmountPaise = Math.round(input.moneyAmountPaise || 0);

      if (metalWeightMg < 0 || moneyAmountPaise < 0) {
        throw new Error(ERR.AMOUNT_NEGATIVE);
      }

      // metalWeightMg = 0 AND moneyAmountPaise = 0 -> throw SUPPLIER_PAYMENT_NOTHING_TO_PAY
      if (metalWeightMg === 0 && moneyAmountPaise === 0) {
        throw new Error(ERR.SUPPLIER_PAYMENT_NOTHING_TO_PAY);
      }

      // If metalWeightMg > 0: metalPurityPct must be > 0 AND metalRatePaisePerGram must be > 0
      if (metalWeightMg > 0) {
        if (metalPurityPct <= 0 || metalRatePaisePerGram <= 0) {
          throw new Error(ERR.SUPPLIER_METAL_PAYMENT_INVALID);
        }
      }

      // Money portion validations
      if (moneyAmountPaise > 0) {
        if (!input.moneyMode || !['CASH', 'BANK', 'UPI'].includes(input.moneyMode)) {
          throw new Error('INVALID_PAYMENT_MODE');
        }

        // If moneyAmountPaise > 0 AND moneyMode = BANK or UPI: bankAccountId must be non-null
        if (input.moneyMode === 'BANK' || input.moneyMode === 'UPI') {
          if (!input.bankAccountId || !input.bankAccountId.trim()) {
            throw new Error(ERR.BANK_ACCOUNT_REQUIRED);
          }
        }

        // If mode = CASH: bankAccountId must be null
        if (input.moneyMode === 'CASH') {
          if (input.bankAccountId !== null && input.bankAccountId !== undefined) {
            throw new Error(ERR.BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);
          }
        }
      }

      // -----------------------------------------------------------------------
      // Step 4: BILL-LINKAGE VALIDATION
      // If linkedPurchaseInvoiceId is provided: invoice must exist, belong to firmId, and supplierId must match
      // -----------------------------------------------------------------------
      if (input.linkedPurchaseInvoiceId) {
        const conn = getDb(tx);
        try {
          const rows = conn.all
            ? conn.all(
                sql`SELECT * FROM purchase_invoices WHERE id = ${input.linkedPurchaseInvoiceId} LIMIT 1`
              )
            : [];
          const invoice = rows && rows.length > 0 ? rows[0] : null;

          if (
            !invoice ||
            invoice.firm_id !== input.firmId ||
            invoice.supplier_id !== input.supplierId
          ) {
            throw new Error(ERR.PAYMENT_INVOICE_MISMATCH);
          }
        } catch (e: any) {
          if (e?.message === ERR.PAYMENT_INVOICE_MISMATCH) {
            throw e;
          }
          // If purchase_invoices table doesn't exist yet, reject linkage to unknown invoice
          throw new Error(ERR.PAYMENT_INVOICE_MISMATCH);
        }
      }

      // -----------------------------------------------------------------------
      // Step 5: FY RESOLUTION
      // fyId = await resolveTransactionFyId(firmId, paymentDate) -> throw ENTRY_DATE_IN_CLOSED_FY if closed
      // -----------------------------------------------------------------------
      const fyId = await resolveTransactionFyId(input.firmId, input.paymentDate, tx);

      // -----------------------------------------------------------------------
      // Step 6: MATHEMATICAL COMPUTATIONS
      // metalFineWeightMg = Math.round(metalWeightMg * metalPurityPct / 100)
      // metalValuePaise = Math.round(metalFineWeightMg / 1000 * metalRatePaisePerGram)
      // totalValuePaise = metalValuePaise + moneyAmountPaise
      // -----------------------------------------------------------------------
      const metalFineWeightMg =
        metalWeightMg > 0
          ? Math.round((metalWeightMg * metalPurityPct) / 100)
          : 0;

      const metalValuePaise =
        metalFineWeightMg > 0
          ? Math.round((metalFineWeightMg / 1000) * metalRatePaisePerGram)
          : 0;

      const totalValuePaise = metalValuePaise + moneyAmountPaise;

      // -----------------------------------------------------------------------
      // Step 7: INSERT INTO supplier_metal_payments
      // -----------------------------------------------------------------------
      const payment = supplierMetalPaymentRepository.insert(tx, {
        firmId: input.firmId,
        fyId,
        supplierId: input.supplierId,
        paymentDate: input.paymentDate,
        metalWeightMg,
        metalPurityPct,
        metalFineWeightMg,
        metalRatePaisePerGram,
        metalValuePaise,
        moneyAmountPaise,
        moneyMode: moneyAmountPaise > 0 ? input.moneyMode ?? null : null,
        bankAccountId: moneyAmountPaise > 0 ? input.bankAccountId ?? null : null,
        totalValuePaise,
        linkedPurchaseInvoiceId: input.linkedPurchaseInvoiceId ?? null,
        notes: input.notes ?? null,
      });

      // -----------------------------------------------------------------------
      // Step 8: INSERT INTO ledger_entries
      // partyType = SUPPLIER, partyId = supplierId, type = DEBIT, amountPaise = totalValuePaise,
      // linkedEntityType = SUPPLIER_METAL_PAYMENT, linkedEntityId = payment.id.
      // This DEBIT reduces the supplier's outstanding payable.
      // -----------------------------------------------------------------------
      let descParts: string[] = [];
      if (metalWeightMg > 0) {
        descParts.push(
          `Metal ${(metalWeightMg / 1000).toFixed(3)}g (${metalPurityPct}% @ ₹${(
            metalRatePaisePerGram / 100
          ).toFixed(2)}/g = ₹${(metalValuePaise / 100).toFixed(2)})`
        );
      }
      if (moneyAmountPaise > 0) {
        descParts.push(
          `Money ₹${(moneyAmountPaise / 100).toFixed(2)} via ${input.moneyMode || 'CASH'}`
        );
      }
      const description = `Supplier Payment: ${descParts.join(' + ')}`;

      const ledgerEntry = ledgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId,
        partyId: input.supplierId,
        partyType: 'SUPPLIER',
        type: 'DEBIT',
        amountPaise: totalValuePaise,
        linkedEntityType: 'SUPPLIER_METAL_PAYMENT',
        linkedEntityId: payment.id,
        description,
      });

      // -----------------------------------------------------------------------
      // Step 9: INVALIDATE MMKV BALANCE CACHE
      // -----------------------------------------------------------------------
      accountingTruthService.invalidatePartyBalanceCache(input.firmId, input.supplierId);

      // -----------------------------------------------------------------------
      // Step 10: AUDIT REPO LOG
      // eventType = SUPPLIER_METAL_PAYMENT_RECORDED
      // -----------------------------------------------------------------------
      const deviceId = getSafeDeviceId();
      auditRepository.log(tx, {
        eventType: 'SUPPLIER_METAL_PAYMENT_RECORDED',
        firmId: input.firmId,
        entityId: payment.id,
        deviceId,
        payload: {
          supplierId: input.supplierId,
          totalValuePaise,
          metalWeightMg,
          metalRatePaisePerGram,
          moneyAmountPaise,
          linkedPurchaseInvoiceId: input.linkedPurchaseInvoiceId ?? null,
        },
      });

      // -----------------------------------------------------------------------
      // Step 11: COMMIT & RETURN
      // -----------------------------------------------------------------------
      return { payment, ledgerEntry };
    }, customTx);
  },

  /**
   * Retrieves payments for a supplier ordered newest first.
   */
  getSupplierPayments(
    firmId: string,
    supplierId: string,
    customTx?: any
  ): SupplierMetalPayment[] {
    const conn = getDb(customTx);
    return supplierMetalPaymentRepository.getBySupplier(conn, firmId, supplierId);
  },

  /**
   * Retrieves all payments linked to a specific purchase invoice.
   */
  getLinkedPurchasePayments(
    firmId: string,
    purchaseInvoiceId: string,
    customTx?: any
  ): SupplierMetalPayment[] {
    const conn = getDb(customTx);
    return supplierMetalPaymentRepository.getByLinkedInvoice(
      conn,
      firmId,
      purchaseInvoiceId
    );
  },
};
