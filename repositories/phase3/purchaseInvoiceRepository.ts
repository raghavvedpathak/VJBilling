// repositories/phase3/purchaseInvoiceRepository.ts — Phase 3 Purchase Invoice Data Access Layer
// Implements STEP 15 — PURCHASE INVOICE DOMAIN MODEL (v5.1, v5.21 FIX-V521-8 Option A, v5.26 FEAT-PURCHASE-AUTOSTOCK-1)
// Manages purchase_invoices and purchase_invoice_items tables.

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { purchaseInvoices, purchaseInvoiceItems } from '@/db/schema/phase3_money_truth';
import {
  PurchaseInvoice,
  NewPurchaseInvoice,
  PurchaseInvoiceItem,
  NewPurchaseInvoiceItem,
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

export const purchaseInvoiceRepository = {
  /**
   * Inserts a new purchase invoice record inside transaction.
   * Single-operation POSTED-only.
   */
  insert(tx: any, data: NewPurchaseInvoice): PurchaseInvoice {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();
    const postedAt = data.postedAt ?? now();
    const status = data.status ?? 'POSTED';

    const record: PurchaseInvoice = {
      id,
      firmId: data.firmId,
      fyId: data.fyId,
      supplierId: data.supplierId,
      supplierInvoiceNumber: data.supplierInvoiceNumber ?? null,
      supplierInvoiceDate: data.supplierInvoiceDate,
      invoiceNumber: data.invoiceNumber,
      status,
      taxableAmountPaise: Math.round(data.taxableAmountPaise),
      cgstPaise: Math.round(data.cgstPaise ?? 0),
      sgstPaise: Math.round(data.sgstPaise ?? 0),
      totalAmountPaise: Math.round(data.totalAmountPaise),
      notes: data.notes ?? null,
      createdAt,
      postedAt,
    };

    conn.insert(purchaseInvoices).values(record).run();
    return record;
  },

  /**
   * Inserts a single purchase invoice line item.
   * APPEND-ONLY: No update or delete methods exist.
   */
  insertItem(tx: any, data: NewPurchaseInvoiceItem): PurchaseInvoiceItem {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();

    const record: PurchaseInvoiceItem = {
      id,
      invoiceId: data.invoiceId,
      itemDescription: data.itemDescription,
      metalType: data.metalType ?? null,
      grossWeightMg: Math.round(data.grossWeightMg ?? 0),
      purityPct: Number(data.purityPct ?? 0),
      fineWeightMg: Math.round(data.fineWeightMg ?? 0),
      ratePerGramPaise: Math.round(data.ratePerGramPaise ?? 0),
      taxableAmountPaise: Math.round(data.taxableAmountPaise),
      cgstPaise: Math.round(data.cgstPaise ?? 0),
      sgstPaise: Math.round(data.sgstPaise ?? 0),
      lineTotalPaise: Math.round(data.lineTotalPaise),
      hsnCode: data.hsnCode ?? null,
      createdItemId: data.createdItemId ?? null,
    };

    conn.insert(purchaseInvoiceItems).values(record).run();
    return record;
  },

  /**
   * Updates createdItemId on a purchase invoice line item (STEP 36.6 back-link).
   */
  updateItemCreatedItemId(tx: any, itemId: string, createdItemId: string): void {
    const conn = getDb(tx);
    conn
      .update(purchaseInvoiceItems)
      .set({ createdItemId })
      .where(eq(purchaseInvoiceItems.id, itemId))
      .run();
  },

  /**
   * Finds a purchase invoice by UUID.
   */
  async getById(id: string, customTx?: any): Promise<PurchaseInvoice | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, id))
      .limit(1)
      .all();
    return (rows[0] as PurchaseInvoice) || null;
  },

  /**
   * Synchronous getById for transaction contexts.
   */
  getByIdSync(tx: any, id: string): PurchaseInvoice | null {
    const conn = getDb(tx);
    const rows = conn
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, id))
      .limit(1)
      .all();
    return (rows[0] as PurchaseInvoice) || null;
  },

  /**
   * Finds a purchase invoice by its formatted invoice number within a firm.
   */
  async findByInvoiceNumber(
    firmId: string,
    invoiceNumber: string,
    customTx?: any
  ): Promise<PurchaseInvoice | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.firmId, firmId),
          eq(purchaseInvoices.invoiceNumber, invoiceNumber)
        )
      )
      .limit(1)
      .all();
    return (rows[0] as PurchaseInvoice) || null;
  },

  /**
   * Lists all purchase invoices for a firm, ordered newest first.
   */
  async listByFirm(firmId: string, customTx?: any): Promise<PurchaseInvoice[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.firmId, firmId))
      .orderBy(desc(purchaseInvoices.createdAt))
      .all() as PurchaseInvoice[];
  },

  /**
   * Lists all purchase invoices for a supplier within a firm.
   */
  async listBySupplier(
    firmId: string,
    supplierId: string,
    customTx?: any
  ): Promise<PurchaseInvoice[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.firmId, firmId),
          eq(purchaseInvoices.supplierId, supplierId)
        )
      )
      .orderBy(desc(purchaseInvoices.createdAt))
      .all() as PurchaseInvoice[];
  },

  /**
   * Fetches line items for a specific purchase invoice.
   */
  async getItemsByInvoiceId(
    invoiceId: string,
    customTx?: any
  ): Promise<PurchaseInvoiceItem[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, invoiceId))
      .all() as PurchaseInvoiceItem[];
  },

  /**
   * Synchronous getItemsByInvoiceId for transaction contexts.
   */
  getItemsByInvoiceIdSync(tx: any, invoiceId: string): PurchaseInvoiceItem[] {
    const conn = getDb(tx);
    return conn
      .select()
      .from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, invoiceId))
      .all() as PurchaseInvoiceItem[];
  },
};
