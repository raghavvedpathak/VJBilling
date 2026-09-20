// repositories/phase3/supplierMetalPaymentRepository.ts — Phase 3 Supplier Metal Payment Data Access Layer
// Implements STEP 11A — SUPPLIER METAL PAYMENT ENGINE: Append-Only Metal & Money Movements
// NON-NEGOTIABLE CONSTITUTIONAL RULE: Table is strictly APPEND-ONLY.
// NO update, delete, or remove methods exist in this repository.

import { eq, and, desc, asc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { supplierMetalPayments } from '@/db/schema/phase3_money_truth';
import {
  SupplierMetalPayment,
  NewSupplierMetalPayment,
} from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const supplierMetalPaymentRepository = {
  /**
   * Inserts a new supplier metal payment record.
   * Strictly APPEND-ONLY: Inserts new rows; never modifies or deletes existing rows.
   */
  insert(tx: any, data: NewSupplierMetalPayment): SupplierMetalPayment {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();

    const record: SupplierMetalPayment = {
      id,
      firmId: data.firmId,
      fyId: data.fyId,
      supplierId: data.supplierId,
      paymentDate: data.paymentDate,
      metalWeightMg: Math.round(data.metalWeightMg ?? 0),
      metalPurityPct: data.metalPurityPct ?? 0,
      metalFineWeightMg: Math.round(data.metalFineWeightMg ?? 0),
      metalRatePaisePerGram: Math.round(data.metalRatePaisePerGram ?? 0),
      metalValuePaise: Math.round(data.metalValuePaise ?? 0),
      moneyAmountPaise: Math.round(data.moneyAmountPaise ?? 0),
      moneyMode: data.moneyMode ?? null,
      bankAccountId: data.bankAccountId ?? null,
      totalValuePaise: Math.round(data.totalValuePaise),
      linkedPurchaseInvoiceId: data.linkedPurchaseInvoiceId ?? null,
      notes: data.notes ?? null,
      createdAt,
    };

    conn.insert(supplierMetalPayments).values(record).run();
    return record;
  },

  /**
   * Finds a supplier metal payment by UUID.
   */
  getById(tx: any, id: string): SupplierMetalPayment | null {
    const conn = getDb(tx);
    const rows = conn
      .select()
      .from(supplierMetalPayments)
      .where(eq(supplierMetalPayments.id, id))
      .limit(1)
      .all();
    return (rows && rows.length > 0 ? rows[0] : null) as SupplierMetalPayment | null;
  },

  /**
   * Retrieves payments for a supplier ordered newest first.
   * Covers idx_smp_firm_supplier for supplier payment history queries.
   */
  getBySupplier(tx: any, firmId: string, supplierId: string): SupplierMetalPayment[] {
    const conn = getDb(tx);
    return conn
      .select()
      .from(supplierMetalPayments)
      .where(
        and(
          eq(supplierMetalPayments.firmId, firmId),
          eq(supplierMetalPayments.supplierId, supplierId)
        )
      )
      .orderBy(desc(supplierMetalPayments.createdAt))
      .all() as SupplierMetalPayment[];
  },

  /**
   * Retrieves all payments linked to a specific purchase invoice.
   * Covers idx_smp_invoice for T30(f) bill-linkage balance display.
   */
  getByLinkedInvoice(
    tx: any,
    firmId: string,
    linkedPurchaseInvoiceId: string
  ): SupplierMetalPayment[] {
    const conn = getDb(tx);
    return conn
      .select()
      .from(supplierMetalPayments)
      .where(
        and(
          eq(supplierMetalPayments.firmId, firmId),
          eq(supplierMetalPayments.linkedPurchaseInvoiceId, linkedPurchaseInvoiceId)
        )
      )
      .orderBy(asc(supplierMetalPayments.createdAt))
      .all() as SupplierMetalPayment[];
  },

  /**
   * Filterable listing of supplier metal payments within a firm.
   */
  list(
    tx: any,
    firmId: string,
    options?: {
      supplierId?: string;
      limit?: number;
      offset?: number;
    }
  ): SupplierMetalPayment[] {
    const conn = getDb(tx);
    const conditions = [eq(supplierMetalPayments.firmId, firmId)];

    if (options?.supplierId) {
      conditions.push(eq(supplierMetalPayments.supplierId, options.supplierId));
    }

    let query = conn
      .select()
      .from(supplierMetalPayments)
      .where(and(...conditions))
      .orderBy(desc(supplierMetalPayments.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query.all() as SupplierMetalPayment[];
  },
};
