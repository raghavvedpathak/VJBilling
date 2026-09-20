// repositories/phase3/creditNoteRepository.ts — Phase 3 Credit Note Data Access Layer
// Implements STEP 13 — CREDIT NOTE DOMAIN MODEL (v5.1 / v5.4 GAP 6 / v5.20)
// Manages credit_notes table: invoice reversals and partial credit notes.

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { creditNotes } from '@/db/schema/phase3_money_truth';
import {
  CreditNote,
  NewCreditNote,
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

export const creditNoteRepository = {
  /**
   * Inserts a new credit note record inside transaction.
   */
  insert(tx: any, data: NewCreditNote): CreditNote {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();
    const status = data.status ?? 'POSTED';
    const isPartial = data.isPartial ?? 0;
    const remainingOldMetalCreditPaise = data.remainingOldMetalCreditPaise ?? 0;

    const record: CreditNote = {
      id,
      firmId: data.firmId,
      fyId: data.fyId,
      originalInvoiceId: data.originalInvoiceId,
      cnNumber: data.cnNumber,
      cnDate: data.cnDate,
      reason: data.reason,
      returnedItemIds: data.returnedItemIds,
      creditAmountPaise: Math.round(data.creditAmountPaise),
      isPartial,
      remainingOldMetalCreditPaise,
      status,
      createdAt,
    };

    conn.insert(creditNotes).values(record).run();
    return record;
  },

  /**
   * Finds a credit note by UUID.
   */
  async getById(id: string, customTx?: any): Promise<CreditNote | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.id, id))
      .limit(1)
      .all();
    return (rows[0] as CreditNote) || null;
  },

  /**
   * Finds all credit notes linked to a specific original invoice.
   */
  async findByOriginalInvoiceId(
    firmId: string,
    originalInvoiceId: string,
    customTx?: any
  ): Promise<CreditNote[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.firmId, firmId),
          eq(creditNotes.originalInvoiceId, originalInvoiceId)
        )
      )
      .orderBy(desc(creditNotes.createdAt))
      .all() as CreditNote[];
  },

  /**
   * Finds a credit note by its formatted CN number within a firm.
   */
  async findByCnNumber(
    firmId: string,
    cnNumber: string,
    customTx?: any
  ): Promise<CreditNote | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.firmId, firmId),
          eq(creditNotes.cnNumber, cnNumber)
        )
      )
      .limit(1)
      .all();
    return (rows[0] as CreditNote) || null;
  },

  /**
   * Lists all credit notes for a firm ordered by creation date descending.
   */
  async listByFirm(firmId: string, customTx?: any): Promise<CreditNote[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.firmId, firmId))
      .orderBy(desc(creditNotes.createdAt))
      .all() as CreditNote[];
  },
};
