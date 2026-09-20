// repositories/phase3/invoiceNumberRepository.ts — Phase 3 Invoice Number Sequence Data Access Layer
// Adheres strictly to STEP 4 Specification & Phase 3 Contracts:
// Sequence store ownership (v4.9 / v5.4 GAP 5): Phase 3 owns invoice_number_config.
// Document types: SALE | PURCHASE | CN | DN | EST (v5.23 FIX-V523-3).
// Resets per FY. Never goes backward.
// v5.4 GAP 7 FIX: createdAt & updatedAt timestamps.

import { eq, and } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { invoiceNumberConfig } from '@/db/schema/phase3_money_truth';
import { firms } from '@/db/schema/phase1_core';
import {
  DocType,
  InvoiceNumberConfig,
  NewInvoiceNumberConfig,
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

export const invoiceNumberRepository = {
  /**
   * Derives default prefix according to Step 4 contract:
   * - SALE: Firm's firmCode (e.g. 'VJ')
   * - PURCHASE: Same as SALE prefix (e.g. 'VJ')
   * - CN: Defaults to SALE prefix + '-CN' (e.g. 'VJ-CN')
   * - DN: Defaults to SALE prefix + '-DN' (e.g. 'VJ-DN')
   * - EST: 'EST' (v5.23 FIX-V523-3)
   */
  getDefaultPrefix(tx: any, firmId: string, docType: DocType): string {
    if (docType === 'EST') {
      return 'EST';
    }

    const conn = getDb(tx);
    let basePrefix = 'VJ';

    try {
      const firmRow = conn
        .select({ firmCode: firms.firmCode })
        .from(firms)
        .where(eq(firms.id, firmId))
        .limit(1)
        .all();

      if (firmRow && firmRow.length > 0 && firmRow[0].firmCode) {
        basePrefix = firmRow[0].firmCode.trim() || 'VJ';
      }
    } catch {
      // Fallback default
      basePrefix = 'VJ';
    }

    switch (docType) {
      case 'CN':
        return `${basePrefix}-CN`;
      case 'DN':
        return `${basePrefix}-DN`;
      case 'SALE':
      case 'PURCHASE':
      default:
        return basePrefix;
    }
  },

  /**
   * FIX-V520-10 (v5.20): lockForUpdate() implementation contract:
   * SQLite WAL mode serialises all writes — no explicit SELECT FOR UPDATE needed.
   * SELECT inside active write tx achieves same row-lock effect.
   * If no row exists (first invoice of a new FY): auto-bootstrap config row
   * with lastSequence=0, prefix from getDefaultPrefix(). MUST NOT throw on missing row.
   */
  async lockForUpdate(
    tx: any,
    firmId: string,
    fyId: string,
    docType: DocType
  ): Promise<InvoiceNumberConfig> {
    if (!tx) {
      throw new Error('TRANSACTION_REQUIRED: lockForUpdate must be executed within an active transaction');
    }
    const conn = getDb(tx);

    const existing = conn
      .select()
      .from(invoiceNumberConfig)
      .where(
        and(
          eq(invoiceNumberConfig.firmId, firmId),
          eq(invoiceNumberConfig.fyId, fyId),
          eq(invoiceNumberConfig.docType, docType)
        )
      )
      .limit(1)
      .all();

    if (existing && existing.length > 0) {
      return existing[0] as InvoiceNumberConfig;
    }

    // Auto-bootstrap row for new FY / docType
    const defaultPrefix = this.getDefaultPrefix(tx, firmId, docType);
    const timestamp = now();
    const newConfig: InvoiceNumberConfig = {
      id: Crypto.randomUUID(),
      firmId,
      fyId,
      docType,
      prefix: defaultPrefix,
      lastSequence: 0,
      allowManualOverride: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    conn.insert(invoiceNumberConfig).values(newConfig).run();
    return newConfig;
  },

  /**
   * Atomically increments lastSequence and updates updatedAt timestamp (v5.4 GAP 7 FIX).
   */
  async incrementSequence(tx: any, configId: string, nextSeq: number): Promise<void> {
    const conn = getDb(tx);
    const timestamp = now();
    conn
      .update(invoiceNumberConfig)
      .set({
        lastSequence: nextSeq,
        updatedAt: timestamp,
      })
      .where(eq(invoiceNumberConfig.id, configId))
      .run();
  },

  /**
   * Updates prefix. Cannot change if invoices already exist for that prefix (lastSequence > 0).
   */
  async updatePrefix(tx: any, configId: string, newPrefix: string): Promise<void> {
    const conn = getDb(tx);
    const existing = conn
      .select()
      .from(invoiceNumberConfig)
      .where(eq(invoiceNumberConfig.id, configId))
      .limit(1)
      .all();

    if (!existing || existing.length === 0) {
      throw new Error('INVOICE_CONFIG_NOT_FOUND');
    }

    const config = existing[0] as InvoiceNumberConfig;
    if (config.lastSequence > 0) {
      throw new Error('INVOICE_PREFIX_LOCKED: Cannot change prefix after invoices have been generated');
    }

    conn
      .update(invoiceNumberConfig)
      .set({
        prefix: newPrefix.trim(),
        updatedAt: now(),
      })
      .where(eq(invoiceNumberConfig.id, configId))
      .run();
  },

  /**
   * Fetches config by firmId, fyId, and docType.
   */
  async getByFirmAndDocType(
    txOrFirmId: any,
    firmIdOrFyId: string,
    fyIdOrDocType: string,
    docTypeArg?: DocType
  ): Promise<InvoiceNumberConfig | null> {
    let tx: any;
    let firmId: string;
    let fyId: string;
    let docType: DocType;

    if (typeof txOrFirmId === 'string') {
      tx = undefined;
      firmId = txOrFirmId;
      fyId = firmIdOrFyId;
      docType = fyIdOrDocType as DocType;
    } else {
      tx = txOrFirmId;
      firmId = firmIdOrFyId;
      fyId = fyIdOrDocType;
      docType = docTypeArg as DocType;
    }

    const conn = getDb(tx);
    const rows = conn
      .select()
      .from(invoiceNumberConfig)
      .where(
        and(
          eq(invoiceNumberConfig.firmId, firmId),
          eq(invoiceNumberConfig.fyId, fyId),
          eq(invoiceNumberConfig.docType, docType)
        )
      )
      .limit(1)
      .all();

    return (rows[0] as InvoiceNumberConfig) || null;
  },

  /**
   * Retrieves all sequence configs for a firm and FY.
   */
  async getConfigsByFirmAndFy(
    tx: any,
    firmId: string,
    fyId: string
  ): Promise<InvoiceNumberConfig[]> {
    const conn = getDb(tx);
    return conn
      .select()
      .from(invoiceNumberConfig)
      .where(
        and(
          eq(invoiceNumberConfig.firmId, firmId),
          eq(invoiceNumberConfig.fyId, fyId)
        )
      )
      .all() as InvoiceNumberConfig[];
  },
};
