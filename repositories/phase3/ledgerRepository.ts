// repositories/phase3/ledgerRepository.ts — Phase 3 Monetary Ledger Data Access Layer
// Implements STEP 10 — LEDGER DERIVATION: Single Source of Monetary Truth
// NON-NEGOTIABLE CONSTITUTIONAL RULE: Ledger is strictly APPEND-ONLY.
// Balance is always dynamically derived, never stored as a table column.
// NO update, delete, or remove methods exist in this repository.

import { eq, and, sql, desc, asc, gte, lte } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { ledgerEntries } from '@/db/schema/phase3_money_truth';
import {
  LedgerEntry,
  NewLedgerEntry,
  LedgerPartyType,
  LedgerEntryType,
  LedgerStatement,
  LedgerStatementLine,
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

export const ledgerRepository = {
  /**
   * Inserts a single ledger row inside transaction.
   * Strictly APPEND-ONLY: Inserts new rows; never modifies or deletes existing rows.
   * Normalizes canonical Step 10 fields and backward-compatibility columns.
   */
  insert(arg1: any, arg2?: any): LedgerEntry {
    let tx: any = undefined;
    let data: NewLedgerEntry;

    if (arg2 !== undefined) {
      tx = arg1;
      data = arg2;
    } else if (arg1 && typeof arg1 === 'object' && ('partyId' in arg1 || 'type' in arg1 || 'amountPaise' in arg1)) {
      data = arg1;
    } else {
      tx = arg1;
      data = arg2;
    }

    const conn = getDb(tx);
    const id = data.id ?? Crypto.randomUUID();
    const createdAt = data.createdAt ?? now();

    // Determine entry type and amount
    let type: LedgerEntryType = 'DEBIT';
    let amountPaise = 0;

    const rawType = (data as any).type || (data as any).entryType;
    if (rawType) {
      type = rawType;
      amountPaise = data.amountPaise ?? (type === 'DEBIT' ? data.debitPaise ?? 0 : data.creditPaise ?? 0);
    } else if (data.debitPaise !== undefined || data.creditPaise !== undefined) {
      if ((data.debitPaise ?? 0) >= (data.creditPaise ?? 0)) {
        type = 'DEBIT';
        amountPaise = data.debitPaise ?? 0;
      } else {
        type = 'CREDIT';
        amountPaise = data.creditPaise ?? 0;
      }
    } else if (data.amountPaise !== undefined) {
      type = 'DEBIT';
      amountPaise = data.amountPaise;
    }

    const debitPaise = type === 'DEBIT' ? amountPaise : 0;
    const creditPaise = type === 'CREDIT' ? amountPaise : 0;
    const description = data.description ?? data.notes ?? null;
    const notes = data.notes ?? data.description ?? null;
    const linkedEntityType = data.linkedEntityType ?? data.referenceType ?? null;
    const referenceType = data.referenceType ?? data.linkedEntityType ?? null;
    const linkedEntityId = data.linkedEntityId ?? data.referenceId ?? null;
    const referenceId = data.referenceId ?? data.linkedEntityId ?? null;

    const record = {
      id,
      firmId: data.firmId,
      fyId: data.fyId ?? null,
      partyId: data.partyId,
      partyType: data.partyType,
      type,
      amountPaise,
      linkedEntityType,
      linkedEntityId,
      description,
      createdAt,
      // Backward compatibility columns
      debitPaise,
      creditPaise,
      referenceType,
      referenceId,
      notes,
    };

    conn.insert(ledgerEntries).values(record).run();
    return record as LedgerEntry;
  },

  /**
   * Fetches ledger entries for a party in chronological or reverse order.
   */
  getByParty(
    tx: any,
    firmId: string,
    partyId: string,
    partyType: LedgerPartyType,
    order: 'ASC' | 'DESC' = 'DESC'
  ): LedgerEntry[] {
    const conn = getDb(tx);
    const orderClause = order === 'ASC' ? asc(ledgerEntries.createdAt) : desc(ledgerEntries.createdAt);

    return conn
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.firmId, firmId),
          eq(ledgerEntries.partyId, partyId),
          eq(ledgerEntries.partyType, partyType)
        )
      )
      .orderBy(orderClause)
      .all() as LedgerEntry[];
  },

  /**
   * Computes party balance from ledger on the fly:
   * Balance is ALWAYS dynamically derived; NEVER stored as a column.
   * For CUSTOMER: SUM(DEBIT) - SUM(CREDIT) (positive = customer owes shop / receivable)
   * For SUPPLIER: SUM(CREDIT) - SUM(DEBIT) (positive = shop owes supplier / payable)
   */
  getBalance(
    tx: any,
    firmId: string,
    partyId: string,
    partyType: LedgerPartyType
  ): number {
    const conn = getDb(tx);
    const res = conn
      .select({
        totalDebit: sql<number>`COALESCE(SUM(CASE 
          WHEN ${ledgerEntries.type} = 'DEBIT' THEN ${ledgerEntries.amountPaise}
          WHEN ${ledgerEntries.debitPaise} > 0 THEN ${ledgerEntries.debitPaise}
          ELSE 0 END), 0)`,
        totalCredit: sql<number>`COALESCE(SUM(CASE 
          WHEN ${ledgerEntries.type} = 'CREDIT' THEN ${ledgerEntries.amountPaise}
          WHEN ${ledgerEntries.creditPaise} > 0 THEN ${ledgerEntries.creditPaise}
          ELSE 0 END), 0)`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.firmId, firmId),
          eq(ledgerEntries.partyId, partyId),
          eq(ledgerEntries.partyType, partyType)
        )
      )
      .all();

    const row = res[0] || { totalDebit: 0, totalCredit: 0 };
    const debit = Number(row.totalDebit) || 0;
    const credit = Number(row.totalCredit) || 0;

    return partyType === 'CUSTOMER' ? debit - credit : credit - debit;
  },

  /**
   * Convenience alias to compute customer balance.
   * Supports (firmId, customerId, tx?) and (tx, firmId, customerId).
   */
  getCustomerBalance(arg1: any, arg2: any, arg3?: any): number {
    let tx: any = undefined;
    let firmId: string;
    let customerId: string;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      customerId = arg2;
      tx = arg3;
    } else {
      tx = arg1;
      firmId = arg2;
      customerId = arg3;
    }
    return this.getBalance(tx, firmId, customerId, 'CUSTOMER');
  },

  /**
   * Fetches entries linked to a specific transaction (e.g. invoice, payment, credit note).
   */
  getByLinkedEntity(
    tx: any,
    firmId: string,
    linkedEntityId: string,
    linkedEntityType?: string
  ): LedgerEntry[] {
    const conn = getDb(tx);
    const conditions = [
      eq(ledgerEntries.firmId, firmId),
      sql`(${ledgerEntries.linkedEntityId} = ${linkedEntityId} OR ${ledgerEntries.referenceId} = ${linkedEntityId})`,
    ];

    if (linkedEntityType) {
      conditions.push(
        sql`(${ledgerEntries.linkedEntityType} = ${linkedEntityType} OR ${ledgerEntries.referenceType} = ${linkedEntityType})`
      );
    }

    return conn
      .select()
      .from(ledgerEntries)
      .where(and(...conditions))
      .orderBy(asc(ledgerEntries.createdAt))
      .all() as LedgerEntry[];
  },

  /**
   * Generates a complete party statement with running derived balances.
   */
  getStatement(
    tx: any,
    firmId: string,
    partyId: string,
    partyType: LedgerPartyType,
    startDate?: string,
    endDate?: string
  ): LedgerStatement {
    const conn = getDb(tx);

    // 1. Calculate opening balance before startDate
    let openingBalancePaise = 0;
    if (startDate) {
      const openRes = conn
        .select({
          totalDebit: sql<number>`COALESCE(SUM(CASE 
            WHEN ${ledgerEntries.type} = 'DEBIT' THEN ${ledgerEntries.amountPaise}
            WHEN ${ledgerEntries.debitPaise} > 0 THEN ${ledgerEntries.debitPaise}
            ELSE 0 END), 0)`,
          totalCredit: sql<number>`COALESCE(SUM(CASE 
            WHEN ${ledgerEntries.type} = 'CREDIT' THEN ${ledgerEntries.amountPaise}
            WHEN ${ledgerEntries.creditPaise} > 0 THEN ${ledgerEntries.creditPaise}
            ELSE 0 END), 0)`,
        })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.firmId, firmId),
            eq(ledgerEntries.partyId, partyId),
            eq(ledgerEntries.partyType, partyType),
            sql`${ledgerEntries.createdAt} < ${startDate}`
          )
        )
        .all();

      const openRow = openRes[0] || { totalDebit: 0, totalCredit: 0 };
      const openDebit = Number(openRow.totalDebit) || 0;
      const openCredit = Number(openRow.totalCredit) || 0;
      openingBalancePaise = partyType === 'CUSTOMER' ? openDebit - openCredit : openCredit - openDebit;
    }

    // 2. Fetch period entries ordered chronologically
    const periodConditions = [
      eq(ledgerEntries.firmId, firmId),
      eq(ledgerEntries.partyId, partyId),
      eq(ledgerEntries.partyType, partyType),
    ];
    if (startDate) periodConditions.push(gte(ledgerEntries.createdAt, startDate));
    if (endDate) periodConditions.push(lte(ledgerEntries.createdAt, endDate));

    const rows = conn
      .select()
      .from(ledgerEntries)
      .where(and(...periodConditions))
      .orderBy(asc(ledgerEntries.createdAt))
      .all() as LedgerEntry[];

    // 3. Compute running balance sequentially on the fly
    let runningBalance = openingBalancePaise;
    let totalDebitPaise = 0;
    let totalCreditPaise = 0;

    const statementLines: LedgerStatementLine[] = rows.map((entry) => {
      const isDebit = entry.type === 'DEBIT' || (entry.debitPaise ?? 0) > 0;
      const amount = entry.amountPaise || (isDebit ? entry.debitPaise ?? 0 : entry.creditPaise ?? 0);

      if (partyType === 'CUSTOMER') {
        if (isDebit) {
          runningBalance += amount;
          totalDebitPaise += amount;
        } else {
          runningBalance -= amount;
          totalCreditPaise += amount;
        }
      } else {
        // SUPPLIER
        if (!isDebit) {
          runningBalance += amount;
          totalCreditPaise += amount;
        } else {
          runningBalance -= amount;
          totalDebitPaise += amount;
        }
      }

      return {
        ...entry,
        runningBalancePaise: runningBalance,
      };
    });

    return {
      firmId,
      partyId,
      partyType,
      openingBalancePaise,
      closingBalancePaise: runningBalance,
      totalDebitPaise,
      totalCreditPaise,
      entries: statementLines,
    };
  },
};
