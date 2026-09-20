// repositories/phase3/estimateRepository.ts — Phase 3 Estimate Data Access Layer
// Implements STEP 7B Domain Model (v4.2 / v5.5 / v5.10 / v5.21 / v5.23):
// Status Lifecycle: DRAFT -> SAVED -> CONVERTED -> EXPIRED
// Zero Financial & Stock Impact Guarantee

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { estimateInvoices, estimateItems } from '@/db/schema/phase3_money_truth';
import type {
  EstimateInvoice,
  NewEstimateInvoice,
  EstimateItem,
  NewEstimateItem,
  EstimateWithItems,
  EstimateStatus,
} from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const estimateRepository = {
  /**
   * Creates a new draft estimate.
   */
  async createDraft(
    data: Omit<NewEstimateInvoice, 'id' | 'status' | 'estimateNumber' | 'createdAt' | 'updatedAt'>,
    customTx?: any
  ): Promise<EstimateInvoice> {
    const conn = getDb(customTx);
    const id = Crypto.randomUUID();
    const timestamp = now();

    const record: NewEstimateInvoice = {
      ...data,
      id,
      status: 'DRAFT',
      estimateNumber: null,
      netPayablePaise: data.netPayablePaise ?? 0,
      makingChargesPaise: data.makingChargesPaise ?? 0,
      makingChargesMode: data.makingChargesMode ?? 'FLAT',
      isManualRate: data.isManualRate ?? 0,
      notes: data.notes ?? null,
      customerId: data.customerId ?? null,
      convertedInvoiceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    conn.insert(estimateInvoices).values(record).run();
    const created = await this.getById(id, data.firmId, conn);
    return created!;
  },

  /**
   * Adds an item to an estimate.
   */
  async addItem(
    itemData: Omit<NewEstimateItem, 'id'>,
    customTx?: any
  ): Promise<EstimateItem> {
    const conn = getDb(customTx);
    const id = Crypto.randomUUID();

    const record: NewEstimateItem = {
      ...itemData,
      id,
      itemName: itemData.itemName || 'Jewellery Item',
      stoneWeightMg: itemData.stoneWeightMg ?? 0,
      metalValuePaise: itemData.metalValuePaise ?? 0,
      makingChargesPaise: itemData.makingChargesPaise ?? 0,
      lineTotalPaise: itemData.lineTotalPaise ?? 0,
    };

    conn.insert(estimateItems).values(record).run();
    const created = await this.getItemById(id, conn);
    return created!;
  },

  /**
   * Removes an item from an estimate.
   */
  async removeItem(itemId: string, customTx?: any): Promise<void> {
    const conn = getDb(customTx);
    conn.delete(estimateItems).where(eq(estimateItems.id, itemId)).run();
  },

  /**
   * Gets an estimate by ID, optionally verifying firmId.
   */
  async getById(estimateId: string, firmId?: string, customTx?: any): Promise<EstimateInvoice | null> {
    const conn = getDb(customTx);
    const conditions = [eq(estimateInvoices.id, estimateId)];
    if (firmId) {
      conditions.push(eq(estimateInvoices.firmId, firmId));
    }
    const rows = conn
      .select()
      .from(estimateInvoices)
      .where(and(...conditions))
      .limit(1)
      .all();
    return (rows[0] as EstimateInvoice) || null;
  },

  /**
   * Gets an estimate line item by ID.
   */
  async getItemById(itemId: string, customTx?: any): Promise<EstimateItem | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(estimateItems)
      .where(eq(estimateItems.id, itemId))
      .limit(1)
      .all();
    return (rows[0] as EstimateItem) || null;
  },

  /**
   * Gets all line items for an estimate.
   */
  async getItemsByEstimateId(estimateId: string, customTx?: any): Promise<EstimateItem[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(estimateItems)
      .where(eq(estimateItems.estimateId, estimateId))
      .all() as EstimateItem[];
  },

  /**
   * Gets an estimate with all attached items.
   */
  async getWithItems(estimateId: string, firmId?: string, customTx?: any): Promise<EstimateWithItems | null> {
    const estimate = await this.getById(estimateId, firmId, customTx);
    if (!estimate) return null;
    const items = await this.getItemsByEstimateId(estimateId, customTx);
    return {
      ...estimate,
      items,
    };
  },

  /**
   * Updates fields of a draft estimate.
   * Throws if estimate is not in DRAFT status.
   */
  async updateDraft(
    estimateId: string,
    updates: Partial<Omit<NewEstimateInvoice, 'id' | 'firmId' | 'status' | 'createdAt'>>,
    customTx?: any
  ): Promise<EstimateInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(estimateId, undefined, conn);
    if (!current) {
      throw new Error(ERR.ESTIMATE_NOT_FOUND);
    }
    if (current.status !== 'DRAFT') {
      throw new Error('ESTIMATE_NOT_DRAFT: Only DRAFT estimates can be updated');
    }

    conn
      .update(estimateInvoices)
      .set({
        ...updates,
        updatedAt: now(),
      })
      .where(eq(estimateInvoices.id, estimateId))
      .run();

    return (await this.getById(estimateId, undefined, conn))!;
  },

  /**
   * Transitions estimate from DRAFT -> SAVED and sets estimateNumber.
   */
  async saveEstimate(
    estimateId: string,
    estimateNumber: string,
    customTx?: any
  ): Promise<EstimateInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(estimateId, undefined, conn);
    if (!current) {
      throw new Error(ERR.ESTIMATE_NOT_FOUND);
    }
    if (current.status !== 'DRAFT') {
      throw new Error('ESTIMATE_NOT_DRAFT: Only DRAFT estimates can be saved');
    }

    const timestamp = now();
    conn
      .update(estimateInvoices)
      .set({
        status: 'SAVED',
        estimateNumber,
        updatedAt: timestamp,
      })
      .where(eq(estimateInvoices.id, estimateId))
      .run();

    return (await this.getById(estimateId, undefined, conn))!;
  },

  /**
   * Transitions estimate to CONVERTED and links convertedInvoiceId.
   */
  async markConverted(
    estimateId: string,
    convertedInvoiceId: string,
    customTx?: any
  ): Promise<EstimateInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(estimateId, undefined, conn);
    if (!current) {
      throw new Error(ERR.ESTIMATE_NOT_FOUND);
    }

    const timestamp = now();
    conn
      .update(estimateInvoices)
      .set({
        status: 'CONVERTED',
        convertedInvoiceId,
        updatedAt: timestamp,
      })
      .where(eq(estimateInvoices.id, estimateId))
      .run();

    return (await this.getById(estimateId, undefined, conn))!;
  },

  /**
   * Transitions estimate to EXPIRED.
   */
  async markExpired(estimateId: string, customTx?: any): Promise<EstimateInvoice> {
    const conn = getDb(customTx);
    const current = await this.getById(estimateId, undefined, conn);
    if (!current) {
      throw new Error(ERR.ESTIMATE_NOT_FOUND);
    }

    const timestamp = now();
    conn
      .update(estimateInvoices)
      .set({
        status: 'EXPIRED',
        updatedAt: timestamp,
      })
      .where(eq(estimateInvoices.id, estimateId))
      .run();

    return (await this.getById(estimateId, undefined, conn))!;
  },

  /**
   * Deletes a draft estimate and cascading items.
   */
  async deleteDraft(estimateId: string, customTx?: any): Promise<void> {
    const conn = getDb(customTx);
    const current = await this.getById(estimateId, undefined, conn);
    if (!current) return;
    if (current.status !== 'DRAFT') {
      throw new Error('ESTIMATE_NOT_DRAFT: Cannot delete a SAVED or CONVERTED estimate');
    }

    conn.delete(estimateItems).where(eq(estimateItems.estimateId, estimateId)).run();
    conn.delete(estimateInvoices).where(eq(estimateInvoices.id, estimateId)).run();
  },

  /**
   * Lists estimates for a firm, optionally filtered by status.
   */
  async listByFirm(
    firmId: string,
    status?: EstimateStatus,
    customTx?: any
  ): Promise<EstimateInvoice[]> {
    const conn = getDb(customTx);
    if (status) {
      return conn
        .select()
        .from(estimateInvoices)
        .where(
          and(
            eq(estimateInvoices.firmId, firmId),
            eq(estimateInvoices.status, status)
          )
        )
        .orderBy(desc(estimateInvoices.createdAt))
        .all() as EstimateInvoice[];
    }
    return conn
      .select()
      .from(estimateInvoices)
      .where(eq(estimateInvoices.firmId, firmId))
      .orderBy(desc(estimateInvoices.createdAt))
      .all() as EstimateInvoice[];
  },
};
