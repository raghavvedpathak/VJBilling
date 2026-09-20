// repositories/phase3/invoiceRepository.ts — Phase 3 Sale Invoice Data Access Layer
// Implements STEP 6 Domain Model (v4.0 / v4.3 / v5.21 / v5.35):
// State Machine: DRAFT -> POSTED -> VOID
// Dual Line Types: SERIALIZED_ITEM | LOOSE_LOT

import { eq, and, sql, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { saleInvoices, saleInvoiceItems } from '@/db/schema/phase3_money_truth';
import {
  SaleInvoice,
  NewSaleInvoice,
  SaleInvoiceItem,
  NewSaleInvoiceItem,
  SaleInvoiceWithItems,
  SaleInvoiceStatus,
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

// In-memory registry for testing or pre-posted draft reservation
const registeredNumbers = new Set<string>();

export const invoiceRepository = {
  /**
   * Checks if an invoice number has already been allocated / posted within a firm.
   * Checks database tables (sale_invoices, purchase_invoices, etc.) if they exist,
   * as well as registered numbers.
   */
  async existsByNumber(tx: any, firmId: string, invoiceNumber: string): Promise<boolean> {
    if (!firmId || !invoiceNumber) return false;
    const key = `${firmId}:${invoiceNumber}`;
    if (registeredNumbers.has(key)) {
      return true;
    }

    const conn = getDb(tx);

    // 1. Check sale_invoices if table exists in active SQLite schema
    try {
      const rows = conn.all
        ? conn.all(
            sql`SELECT id FROM sale_invoices WHERE firm_id = ${firmId} AND invoice_number = ${invoiceNumber} LIMIT 1`
          )
        : conn
            .select({ id: saleInvoices.id })
            .from(saleInvoices)
            .where(
              and(
                eq(saleInvoices.firmId, firmId),
                eq(saleInvoices.invoiceNumber, invoiceNumber)
              )
            )
            .limit(1)
            .all();
      if (rows && rows.length > 0) return true;
    } catch {
      // Table may not exist yet in earlier Phase 3 steps
    }

    // 2. Check purchase_invoices if table exists
    try {
      const rows = conn.all
        ? conn.all(
            sql`SELECT id FROM purchase_invoices WHERE firm_id = ${firmId} AND invoice_number = ${invoiceNumber} LIMIT 1`
          )
        : [];
      if (rows && rows.length > 0) return true;
    } catch {
      // Table may not exist yet
    }

    return false;
  },

  /**
   * Creates a new draft invoice.
   */
  async createDraft(
    invoiceData: Omit<NewSaleInvoice, 'id' | 'status' | 'createdAt'>,
    customTx?: any
  ): Promise<SaleInvoice> {
    const conn = getDb(customTx);
    const id = Crypto.randomUUID();
    const timestamp = now();

    const record: NewSaleInvoice = {
      ...invoiceData,
      id,
      status: 'DRAFT',
      invoiceNumber: null,
      createdAt: timestamp,
      postedAt: null,
    };

    conn.insert(saleInvoices).values(record).run();
    return (await this.getById(id, conn))!;
  },

  /**
   * Adds an item line to a draft invoice.
   */
  async addItem(
    itemData: Omit<NewSaleInvoiceItem, 'id'>,
    customTx?: any
  ): Promise<SaleInvoiceItem> {
    const conn = getDb(customTx);
    const id = Crypto.randomUUID();

    const record: NewSaleInvoiceItem = {
      ...itemData,
      id,
      lineType: itemData.lineType || 'SERIALIZED_ITEM',
    };

    conn.insert(saleInvoiceItems).values(record).run();
    return (await this.getItemById(id, conn))!;
  },

  /**
   * Removes an item line from a draft invoice.
   */
  async removeItem(itemId: string, customTx?: any): Promise<void> {
    const conn = getDb(customTx);
    conn.delete(saleInvoiceItems).where(eq(saleInvoiceItems.id, itemId)).run();
  },

  /**
   * Gets a sale invoice by ID.
   */
  async getById(invoiceId: string, customTx?: any): Promise<SaleInvoice | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(saleInvoices)
      .where(eq(saleInvoices.id, invoiceId))
      .limit(1)
      .all();
    return (rows[0] as SaleInvoice) || null;
  },

  /**
   * Gets an invoice item by ID.
   */
  async getItemById(itemId: string, customTx?: any): Promise<SaleInvoiceItem | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(saleInvoiceItems)
      .where(eq(saleInvoiceItems.id, itemId))
      .limit(1)
      .all();
    return (rows[0] as SaleInvoiceItem) || null;
  },

  /**
   * Gets all items belonging to an invoice.
   */
  async getItemsByInvoiceId(invoiceId: string, customTx?: any): Promise<SaleInvoiceItem[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(saleInvoiceItems)
      .where(eq(saleInvoiceItems.invoiceId, invoiceId))
      .all() as SaleInvoiceItem[];
  },

  /**
   * Gets full invoice with all items attached.
   */
  async getWithItems(invoiceId: string, customTx?: any): Promise<SaleInvoiceWithItems | null> {
    const invoice = await this.getById(invoiceId, customTx);
    if (!invoice) return null;
    const items = await this.getItemsByInvoiceId(invoiceId, customTx);
    return {
      ...invoice,
      items,
    };
  },

  /**
   * Updates fields of a draft invoice.
   * Throws INVOICE_NOT_DRAFT if status is not DRAFT.
   */
  async updateDraft(
    invoiceId: string,
    updates: Partial<Omit<NewSaleInvoice, 'id' | 'firmId' | 'status' | 'createdAt'>>,
    customTx?: any
  ): Promise<SaleInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(invoiceId, conn);
    if (!current) {
      throw new Error('INVOICE_NOT_FOUND');
    }
    if (current.status !== 'DRAFT') {
      throw new Error('INVOICE_NOT_DRAFT: Only DRAFT invoices can be updated');
    }

    conn
      .update(saleInvoices)
      .set(updates)
      .where(eq(saleInvoices.id, invoiceId))
      .run();

    return (await this.getById(invoiceId, conn))!;
  },

  /**
   * Deletes a draft invoice and its cascaded items.
   * Throws INVOICE_NOT_DRAFT if invoice is already POSTED.
   */
  async deleteDraft(invoiceId: string, customTx?: any): Promise<void> {
    const conn = getDb(customTx);
    const current = await this.getById(invoiceId, conn);
    if (!current) return;
    if (current.status !== 'DRAFT') {
      throw new Error('INVOICE_NOT_DRAFT: Cannot delete a POSTED or VOID invoice');
    }

    // Delete items first (manual cascade safeguard for SQLite foreign keys disabled)
    conn.delete(saleInvoiceItems).where(eq(saleInvoiceItems.invoiceId, invoiceId)).run();
    conn.delete(saleInvoices).where(eq(saleInvoices.id, invoiceId)).run();
  },

  /**
   * Updates an invoice line item with snapshot calculation values at POST.
   */
  async updateItemSnapshot(
    itemId: string,
    snapshot: Partial<NewSaleInvoiceItem>,
    customTx?: any
  ): Promise<void> {
    const conn = getDb(customTx);
    conn
      .update(saleInvoiceItems)
      .set(snapshot)
      .where(eq(saleInvoiceItems.id, itemId))
      .run();
  },

  /**
   * Transitions invoice from DRAFT -> POSTED.
   * Assigns final invoiceNumber, sets postedAt timestamp, and records snapshot amounts.
   */
  async markPosted(
    invoiceId: string,
    dataOrNumber:
      | string
      | {
          invoiceNumber: string;
          fyId?: string;
          postedAt?: string;
          taxableMetalAmtPaise?: number;
          taxableMakingAmtPaise?: number;
          cgstPaise?: number;
          sgstPaise?: number;
          stoneAmtPaise?: number;
          oldMetalDeductionPaise?: number;
          discountPaise?: number;
          roundOffPaise?: number;
          netPayablePaise?: number;
        },
    postedAtOrTx?: any,
    customTx?: any
  ): Promise<SaleInvoice> {
    let payload: Record<string, any> = { status: 'POSTED' };
    let conn: any;

    if (typeof dataOrNumber === 'string') {
      payload.invoiceNumber = dataOrNumber;
      payload.postedAt = postedAtOrTx;
      conn = getDb(customTx);
    } else {
      payload = {
        ...payload,
        ...dataOrNumber,
        postedAt: dataOrNumber.postedAt || now(),
      };
      conn = getDb(postedAtOrTx);
    }

    const current = await this.getById(invoiceId, conn);
    if (!current) {
      throw new Error('INVOICE_NOT_FOUND');
    }
    if (current.status !== 'DRAFT') {
      throw new Error('INVOICE_NOT_DRAFT: Only DRAFT invoices can be posted');
    }

    conn
      .update(saleInvoices)
      .set(payload)
      .where(eq(saleInvoices.id, invoiceId))
      .run();

    return (await this.getById(invoiceId, conn))!;
  },

  /**
   * Transitions invoice to VOID (reversal via Credit Note only).
   */
  async markVoid(invoiceId: string, customTx?: any): Promise<SaleInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(invoiceId, conn);
    if (!current) {
      throw new Error('INVOICE_NOT_FOUND');
    }
    if (current.status !== 'POSTED') {
      throw new Error('INVOICE_NOT_POSTED: Only POSTED invoices can be voided via Credit Note');
    }

    conn
      .update(saleInvoices)
      .set({
        status: 'VOID',
      })
      .where(eq(saleInvoices.id, invoiceId))
      .run();

    return (await this.getById(invoiceId, conn))!;
  },

  /**
   * Lists invoices for a firm with optional status filter.
   */
  async listByFirm(
    firmId: string,
    status?: SaleInvoiceStatus,
    customTx?: any
  ): Promise<SaleInvoice[]> {
    const conn = getDb(customTx);
    if (status) {
      return conn
        .select()
        .from(saleInvoices)
        .where(
          and(
            eq(saleInvoices.firmId, firmId),
            eq(saleInvoices.status, status)
          )
        )
        .orderBy(desc(saleInvoices.createdAt))
        .all() as SaleInvoice[];
    }
    return conn
      .select()
      .from(saleInvoices)
      .where(eq(saleInvoices.firmId, firmId))
      .orderBy(desc(saleInvoices.createdAt))
      .all() as SaleInvoice[];
  },

  /**
   * Registers an invoice number (used for testing duplicate detection).
   */
  registerNumber(firmId: string, invoiceNumber: string): void {
    registeredNumbers.add(`${firmId}:${invoiceNumber}`);
  },

  /**
   * Clears registered numbers (for test cleanup).
   */
  clearRegisteredNumbers(): void {
    registeredNumbers.clear();
  },
};

export const saleInvoiceRepo = {
  async insert(tx: any, data: any): Promise<SaleInvoice> {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = data.createdAt || now();
    const record: NewSaleInvoice = {
      taxableMetalAmtPaise: 0,
      taxableMakingAmtPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      stoneAmtPaise: 0,
      oldMetalDeductionPaise: 0,
      discountPaise: 0,
      roundOffPaise: 0,
      netPayablePaise: 0,
      makingChargesMode: 'FLAT',
      makingChargesPaise: 0,
      isManualRate: 0,
      notes: null,
      invoiceDate: now().split('T')[0],
      ...data,
      id,
      status: data.status || 'DRAFT',
      invoiceNumber: data.invoiceNumber || null,
      createdAt: timestamp,
      postedAt: data.postedAt || null,
    };
    conn.insert(saleInvoices).values(record).run();
    const created = await invoiceRepository.getById(id, conn);
    return created!;
  },

  async getById(arg1: any, arg2?: any, arg3?: any): Promise<SaleInvoice | null> {
    let invoiceId: string;
    let customTx: any;
    let firmId: string | undefined;

    if (typeof arg1 === 'string') {
      invoiceId = arg1;
      customTx = arg2;
      firmId = arg3;
    } else {
      customTx = arg1;
      invoiceId = arg2;
      firmId = arg3;
    }

    const conn = getDb(customTx);
    const conditions = [eq(saleInvoices.id, invoiceId)];
    if (firmId) {
      conditions.push(eq(saleInvoices.firmId, firmId));
    }
    const rows = conn
      .select()
      .from(saleInvoices)
      .where(and(...conditions))
      .limit(1)
      .all();
    return (rows[0] as SaleInvoice) || null;
  },

  async update(arg1: any, arg2: any, arg3?: any): Promise<void> {
    let invoiceId: string;
    let updates: Partial<SaleInvoice>;
    let customTx: any;

    if (typeof arg1 === 'string') {
      invoiceId = arg1;
      updates = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      invoiceId = arg2;
      updates = arg3;
    }

    const conn = getDb(customTx);
    conn.update(saleInvoices).set(updates).where(eq(saleInvoices.id, invoiceId)).run();
  },

  async delete(arg1: any, arg2?: any): Promise<void> {
    let invoiceId: string;
    let customTx: any;

    if (typeof arg1 === 'string') {
      invoiceId = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      invoiceId = arg2;
    }

    const conn = getDb(customTx);
    conn.delete(saleInvoiceItems).where(eq(saleInvoiceItems.invoiceId, invoiceId)).run();
    conn.delete(saleInvoices).where(eq(saleInvoices.id, invoiceId)).run();
  },

  async deleteDraft(invoiceId: string, customTx?: any): Promise<void> {
    return this.delete(invoiceId, customTx);
  },
};

export const saleInvoiceItemRepo = {
  async insert(tx: any, data: any): Promise<SaleInvoiceItem> {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const record: NewSaleInvoiceItem = {
      stoneAmountPaise: 0,
      metalValuePaise: 0,
      makingChargesPaise: 0,
      lineGstPaise: 0,
      lineTotalPaise: 0,
      lineType: 'SERIALIZED_ITEM',
      stoneWeightMg: 0,
      itemName: 'Jewellery Item',
      ...data,
      id,
    };
    conn.insert(saleInvoiceItems).values(record).run();
    const created = await invoiceRepository.getItemById(id, conn);
    return created!;
  },

  async getByInvoiceId(tx: any, invoiceId: string): Promise<SaleInvoiceItem[]> {
    const conn = getDb(tx);
    return conn
      .select()
      .from(saleInvoiceItems)
      .where(eq(saleInvoiceItems.invoiceId, invoiceId))
      .all() as SaleInvoiceItem[];
  },

  async deleteByInvoiceId(tx: any, invoiceId: string): Promise<void> {
    const conn = getDb(tx);
    conn.delete(saleInvoiceItems).where(eq(saleInvoiceItems.invoiceId, invoiceId)).run();
  },
};

