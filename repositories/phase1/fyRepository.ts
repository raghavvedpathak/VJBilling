// repositories/fyRepository.ts
// Strict DB access layer for financial_years table.
//
// CONSTITUTIONAL RULES:
//   - FY label format: 'FY YYYY-YY' e.g. 'FY 2025-26'
//   - startDate / endDate stored as YYYY-MM-DD date strings ONLY — NOT full ISO-8601 datetimes.
//   - resolveTransactionFyId: ALL Phase 3+ write services MUST use this — NEVER getActiveFY().id

import * as Crypto from 'expo-crypto';
import { eq, and, lte, gte } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { financialYears, FYStatus } from '@/db/schema';
import type { DrizzleTransaction, FinancialYear } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function resolveTxAndId(arg1: any, arg2: any): { tx: DbOrTx; id: string } {
  if (typeof arg1 === 'string') {
    return { id: arg1, tx: getDb(arg2) };
  }
  return { tx: getDb(arg1), id: arg2 };
}

export type NewFY = typeof financialYears.$inferInsert;
export type { FinancialYear };

export const fyRepository = {
  /**
   * Primary insert method — creates a financial year row.
   * Supports both (tx, data) and (data, tx) parameter orders.
   */
  insert(arg1: any, arg2?: any): FinancialYear {
    let tx: DbOrTx;
    let data: Partial<NewFY> = {};

    if (arg1 && typeof arg1 === 'object' && 'label' in arg1) {
      data = arg1;
      tx = getDb(arg2);
    } else {
      tx = getDb(arg1);
      data = arg2 || {};
    }

    const newId = data.id || Crypto.randomUUID();

    tx.insert(financialYears)
      .values({
        ...data,
        id: newId,
        status: data.status || FYStatus.ACTIVE,
        createdAt: data.createdAt || now(),
      } as NewFY)
      .run();

    const created = tx.select().from(financialYears).where(eq(financialYears.id, newId)).get();
    return created as FinancialYear;
  },

  /**
   * Alias for insert
   */
  create(input: Omit<NewFY, 'id' | 'createdAt' | 'status'>, tx?: DbOrTx): FinancialYear {
    return this.insert(tx, input);
  },

  /**
   * Creates initial FY for a firm (April 1 -> March 31).
   * Supports both (tx, firmId) and (firmId, tx).
   */
  insertInitial(arg1: any, arg2?: any): FinancialYear {
    let tx: DbOrTx;
    let firmId: string = '';

    if (typeof arg1 === 'string') {
      firmId = arg1;
      tx = getDb(arg2);
    } else {
      tx = getDb(arg1);
      firmId = arg2;
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let startYear: number;
    let endYear: number;

    if (currentMonth < 3) {
      startYear = currentYear - 1;
      endYear = currentYear;
    } else {
      startYear = currentYear;
      endYear = currentYear + 1;
    }

    const endYearShort = String(endYear).slice(-2);
    const fyLabel = `FY ${startYear}-${endYearShort}`;
    const startDate = `${startYear}-04-01`;
    const endDate = `${endYear}-03-31`;

    return this.insert(tx, { firmId, label: fyLabel, startDate, endDate });
  },

  /**
   * Alias for insertInitial
   */
  createInitialFY(firmId: string, tx?: DbOrTx): FinancialYear {
    return this.insertInitial(tx, firmId);
  },

  /**
   * Returns single ACTIVE FY for a firm — supports (tx, firmId) and (firmId, tx).
   */
  getActiveFY(arg1: any, arg2?: any): FinancialYear | null {
    const { tx, id: firmId } = resolveTxAndId(arg1, arg2);
    const fy = tx
      .select()
      .from(financialYears)
      .where(
        and(
          eq(financialYears.firmId, firmId),
          eq(financialYears.status, FYStatus.ACTIVE)
        )
      )
      .get();
    return fy ?? null;
  },

  /**
   * Fetches FY by UUID — supports (tx, fyId), (fyId, tx), (firmId, fyId), or (tx, firmId, fyId).
   */
  findById(first: any, second?: any, third?: any): FinancialYear | null {
    let targetTx: DbOrTx = db;
    let firmId: string | undefined = undefined;
    let fyId: string = '';

    if (typeof first === 'string' && typeof second === 'string') {
      // (firmId, fyId) or (fyId, unusedString)
      if (third && typeof third === 'object' && 'select' in third) {
        targetTx = third;
        firmId = first;
        fyId = second;
      } else {
        targetTx = getDb(third);
        firmId = first;
        fyId = second;
      }
    } else if (typeof first === 'string') {
      // (fyId, tx?)
      fyId = first;
      targetTx = getDb(second);
    } else {
      // (tx, firmId, fyId) or (tx, fyId)
      targetTx = getDb(first);
      if (typeof second === 'string' && typeof third === 'string') {
        firmId = second;
        fyId = third;
      } else if (typeof second === 'string') {
        fyId = second;
      }
    }

    if (!fyId) return null;

    const fy = targetTx
      .select()
      .from(financialYears)
      .where(
        firmId
          ? and(eq(financialYears.id, fyId), eq(financialYears.firmId, firmId))
          : eq(financialYears.id, fyId)
      )
      .get();
    return (fy as FinancialYear) ?? null;
  },

  /**
   * Alias for findById
   */
  getById(first: any, second?: any, third?: any): FinancialYear | null {
    return this.findById(first, second, third);
  },

  /**
   * Closes a financial year by setting status = CLOSED.
   */
  closeFY(firmId: string, fyId: string, tx?: DbOrTx): void {
    const targetTx = getDb(tx);
    targetTx.update(financialYears)
      .set({ status: FYStatus.CLOSED })
      .where(
        and(
          eq(financialYears.id, fyId),
          eq(financialYears.firmId, firmId)
        )
      )
      .run();
  },

  /**
   * Updates status of a financial year.
   */
  updateStatus(first: any, second: string, third?: string, fourth?: string): void {
    let tx: DbOrTx;
    let firmId = '';
    let fyId = '';
    let status: string = FYStatus.CLOSED;

    if (typeof first === 'string') {
      firmId = first;
      fyId = second;
      status = third ?? FYStatus.CLOSED;
      tx = getDb();
    } else {
      tx = getDb(first);
      firmId = second;
      fyId = third!;
      status = fourth ?? FYStatus.CLOSED;
    }

    tx.update(financialYears)
      .set({ status })
      .where(
        and(
          eq(financialYears.id, fyId),
          eq(financialYears.firmId, firmId)
        )
      )
      .run();
  },

  /**
   * Constitutional FY resolution function — finds ACTIVE FY covering entryDate.
   */
  resolveTransactionFyId(firmId: string, entryDate: string, tx?: DbOrTx): string {
    const targetTx = getDb(tx);
    const match = targetTx
      .select()
      .from(financialYears)
      .where(
        and(
          eq(financialYears.firmId, firmId),
          eq(financialYears.status, FYStatus.ACTIVE),
          lte(financialYears.startDate, entryDate),
          gte(financialYears.endDate, entryDate)
        )
      )
      .limit(1)
      .get();

    if (!match) {
      throw new Error('ENTRY_DATE_IN_CLOSED_FY');
    }

    return match.id as string;
  },
};

export const financialYearRepository = fyRepository;