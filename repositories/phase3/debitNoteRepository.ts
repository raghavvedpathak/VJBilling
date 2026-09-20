// repositories/phase3/debitNoteRepository.ts — Phase 3 Debit Note Data Access Layer
// Implements STEP 14 — DEBIT NOTE DOMAIN MODEL (v5.22 FIX-V522-11 / v5.23 FIX-V523-1)
// Manages debit_notes table: underbilling corrections and receivable increases.

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { debitNotes } from '@/db/schema/phase3_money_truth';
import {
  DebitNote,
  NewDebitNote,
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

export const debitNoteRepository = {
  /**
   * Inserts a new debit note record inside transaction.
   * Single-operation POSTED-only (Rule 3).
   */
  insert(tx: any, data: NewDebitNote): DebitNote {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();
    const status = data.status ?? 'POSTED';

    const record: DebitNote = {
      id,
      firmId: data.firmId,
      fyId: data.fyId,
      customerId: data.customerId,
      originalInvoiceId: data.originalInvoiceId,
      dnNumber: data.dnNumber,
      entryDate: data.entryDate,
      reason: data.reason,
      additionalAmountPaise: Math.round(data.additionalAmountPaise),
      status,
      createdAt,
    };

    conn.insert(debitNotes).values(record).run();
    return record;
  },

  /**
   * Finds a debit note by UUID.
   */
  async getById(id: string, customTx?: any): Promise<DebitNote | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(debitNotes)
      .where(eq(debitNotes.id, id))
      .limit(1)
      .all();
    return (rows[0] as DebitNote) || null;
  },

  /**
   * Finds all debit notes linked to a specific original invoice.
   */
  async findByOriginalInvoiceId(
    firmId: string,
    originalInvoiceId: string,
    customTx?: any
  ): Promise<DebitNote[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(debitNotes)
      .where(
        and(
          eq(debitNotes.firmId, firmId),
          eq(debitNotes.originalInvoiceId, originalInvoiceId)
        )
      )
      .orderBy(desc(debitNotes.createdAt))
      .all() as DebitNote[];
  },

  /**
   * Finds a debit note by its formatted DN number within a firm.
   */
  async findByDnNumber(
    firmId: string,
    dnNumber: string,
    customTx?: any
  ): Promise<DebitNote | null> {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(debitNotes)
      .where(
        and(
          eq(debitNotes.firmId, firmId),
          eq(debitNotes.dnNumber, dnNumber)
        )
      )
      .limit(1)
      .all();
    return (rows[0] as DebitNote) || null;
  },

  /**
   * Lists all debit notes for a firm ordered by entry date descending.
   */
  async listByFirm(firmId: string, customTx?: any): Promise<DebitNote[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(debitNotes)
      .where(eq(debitNotes.firmId, firmId))
      .orderBy(desc(debitNotes.entryDate), desc(debitNotes.createdAt))
      .all() as DebitNote[];
  },

  /**
   * Lists all debit notes for a customer ordered by entry date descending.
   */
  async listByCustomer(
    firmId: string,
    customerId: string,
    customTx?: any
  ): Promise<DebitNote[]> {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(debitNotes)
      .where(
        and(
          eq(debitNotes.firmId, firmId),
          eq(debitNotes.customerId, customerId)
        )
      )
      .orderBy(desc(debitNotes.entryDate), desc(debitNotes.createdAt))
      .all() as DebitNote[];
  },
};
