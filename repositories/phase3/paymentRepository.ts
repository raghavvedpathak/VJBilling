// repositories/phase3/paymentRepository.ts — Phase 3 Payment Data Access Layer
// Implements STEP 11 — PAYMENT ENGINE: Append-Only Money Movements
// NON-NEGOTIABLE CONSTITUTIONAL RULE: Payments table is strictly APPEND-ONLY.
// NO update, delete, or remove methods exist in this repository.

import { eq, and, desc, asc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { payments } from '@/db/schema/phase3_money_truth';
import {
  Payment,
  NewPayment,
  PaymentPartyType,
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

export const paymentRepository = {
  /**
   * Inserts a new payment record.
   * Strictly APPEND-ONLY: Inserts new rows; never modifies or deletes existing rows.
   */
  insert(tx: any, data: NewPayment): Payment {
    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();
    const status = data.status ?? 'PAID';

    const record: Payment = {
      id,
      firmId: data.firmId,
      fyId: data.fyId ?? null,
      partyId: data.partyId,
      partyType: data.partyType,
      type: data.type,
      amountPaise: Math.round(data.amountPaise),
      mode: data.mode,
      bankAccountId: data.bankAccountId ?? null,
      status,
      reason: data.reason ?? null,
      linkedInvoiceId: data.linkedInvoiceId ?? null,
      notes: data.notes ?? null,
      createdAt,
    };

    conn.insert(payments).values(record).run();
    return record;
  },

  /**
   * Finds a payment by UUID.
   */
  getById(tx: any, id: string): Payment | null {
    const conn = getDb(tx);
    const rows = conn
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1)
      .all();
    return (rows && rows.length > 0 ? rows[0] : null) as Payment | null;
  },

  /**
   * Retrieves payments for a party ordered newest first.
   */
  getByParty(
    tx: any,
    firmId: string,
    partyId: string,
    partyType: PaymentPartyType
  ): Payment[] {
    const conn = getDb(tx);
    return conn
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.firmId, firmId),
          eq(payments.partyId, partyId),
          eq(payments.partyType, partyType)
        )
      )
      .orderBy(desc(payments.createdAt))
      .all() as Payment[];
  },

  /**
   * Retrieves all payments linked to a specific bill (partial payment chain).
   * Ordered chronologically (oldest first) to track payment chain progression.
   */
  getByLinkedInvoice(tx: any, firmId: string, linkedInvoiceId: string): Payment[] {
    const conn = getDb(tx);
    return conn
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.firmId, firmId),
          eq(payments.linkedInvoiceId, linkedInvoiceId)
        )
      )
      .orderBy(asc(payments.createdAt))
      .all() as Payment[];
  },

  /**
   * Filterable listing of payments within a firm.
   */
  list(
    tx: any,
    firmId: string,
    options?: {
      partyId?: string;
      partyType?: PaymentPartyType;
      mode?: string;
      limit?: number;
      offset?: number;
    }
  ): Payment[] {
    const conn = getDb(tx);
    const conditions = [eq(payments.firmId, firmId)];

    if (options?.partyId) {
      conditions.push(eq(payments.partyId, options.partyId));
    }
    if (options?.partyType) {
      conditions.push(eq(payments.partyType, options.partyType));
    }
    if (options?.mode) {
      conditions.push(eq(payments.mode, options.mode as any));
    }

    let query = conn
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return query.all() as Payment[];
  },
};
