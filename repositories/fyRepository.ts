// repositories/fyRepository.ts
// Strict DB access layer for financial_years table.
//
// CONSTITUTIONAL RULES:
//   - FY label format: 'FY YYYY-YY' e.g. 'FY 2025-26' (spec schema comment canonical form)
//   - startDate / endDate stored as YYYY-MM-DD date strings ONLY — NOT full ISO-8601 datetimes.
//     Storing as datetimes breaks resolveTransactionFyId string comparison with entryDate.
//   - resolveTransactionFyId: ALL Phase 3+ write services MUST use this — NEVER getActiveFY().id
//   - v7.5 UQ-ACTIVE-FY-CONSTRAINT: enforced by DB partial unique index (migration zero SQL)
//
// ADDED METHODS (required by fyService.closeFY):
//   - getById(fyId)   — fetches a single FY row by UUID primary key
//   - closeFY(firmId, fyId) — sets status = CLOSED; validates firmId ownership

import * as Crypto from 'expo-crypto';
import { eq, and, lte, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { financialYears, FYStatus } from '../db/schema';
import type { DrizzleTransaction, FinancialYear } from '../types/phase2.types';
import { now } from '../utils/now';

type DbOrTx = any;

export type NewFY = typeof financialYears.$inferInsert;

export const fyRepository = {

  /**
   * Creates a financial year row. Status is always ACTIVE on creation.
   * startDate and endDate MUST be YYYY-MM-DD strings — NOT ISO-8601 datetimes.
   */
  // FIX-V718-1: Synchronous execution, returns raw object
  create(
    input: Omit<NewFY, 'id' | 'createdAt' | 'status'>,
    tx: DbOrTx = db
  ): any {
    const newId = Crypto.randomUUID();

    const createdFY = tx.insert(financialYears).values({
      ...input,
      id: newId,
      status: FYStatus.ACTIVE,
      createdAt: now(),
    }).returning().get();

    return createdFY;
  },

  /**
   * Creates the initial FY for a new firm.
   * Indian FY: April 1 → March 31.
   * Months Jan–Mar (0–2) belong to the FY that started the previous calendar year.
   *
   * Label format: 'FY YYYY-YY' e.g. 'FY 2025-26'
   * Spec canonical: schema comment on financial_years.label says "e.g. 'FY 2025-26'"
   *
   * Date format: 'YYYY-MM-DD' — stored as plain date strings, NOT ISO-8601 datetimes.
   * Reason: resolveTransactionFyId uses lte/gte string comparison against entryDate ('YYYY-MM-DD').
   * Storing full datetimes (e.g. 'T23:59:59.000Z') would break that comparison at timezone boundaries.
   */
  // FIX-V718-1: Synchronous execution
  createInitialFY(firmId: string, tx: DbOrTx = db): any {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed: Jan=0, Mar=2, Apr=3
    const currentYear = today.getFullYear();

    // Indian FY starts April 1. Jan/Feb/Mar belong to FY that started previous year.
    let startYear: number;
    let endYear: number;

    if (currentMonth < 3) {
      // Jan, Feb, Mar → FY started last calendar year
      startYear = currentYear - 1;
      endYear = currentYear;
    } else {
      // Apr through Dec → FY started this calendar year
      startYear = currentYear;
      endYear = currentYear + 1;
    }

    // Label: 'FY YYYY-YY' — e.g. 'FY 2025-26' (last 2 digits of endYear only)
    const endYearShort = String(endYear).slice(-2);
    const fyLabel = `FY ${startYear}-${endYearShort}`;

    // Dates as YYYY-MM-DD strings ONLY — NOT full ISO-8601 datetimes
    const startDate = `${startYear}-04-01`;
    const endDate   = `${endYear}-03-31`;

    return this.create({ firmId, label: fyLabel, startDate, endDate }, tx);
  },

  /**
   * Returns the single ACTIVE FY for a firm.
   * For Phase 1 reads and display only.
   * Phase 3+ write services MUST use resolveTransactionFyId() instead — NEVER this method for fyId.
   */
  // FIX-V718-1: Synchronous execution using .get()
  getActiveFY(firmId: string, tx: DbOrTx = db): any {
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
   * Fetches a single FY row by UUID primary key.
   * Called by fyService.closeFY() to read the FY label for the audit_archive_index row.
   * Returns null if the FY does not exist — callers must guard with ! assert.
   */
  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): FinancialYear | null {
    const fy = tx
      .select()
      .from(financialYears)
      .where(and(eq(financialYears.id, id), eq(financialYears.firmId, firmId)))
      .get();
    return (fy as unknown as FinancialYear) ?? null;
  },

  /**
   * Closes a financial year by setting status = CLOSED.
   * firmId ownership is validated via the WHERE clause — a cross-firm close is
   * structurally impossible because the query will match 0 rows for a foreign firmId.
   *
   * CONSTITUTIONAL:
   * - Only fyService.closeFY() may call this method.
   * - Must always run inside a transaction (tx context mandatory).
   * - Does NOT open a new transaction itself — the caller owns the transaction.
   * - Does NOT write audit logs — fyService.closeFY() owns all audit writes.
   *
   * @param firmId - Required for firm isolation — prevents cross-firm FY close
   * @param fyId   - UUID of the FY to close
   * @param tx     - Drizzle transaction context — MUST be provided by caller
   */
  // FIX-V718-1: Synchronous execution using .run()
  closeFY(firmId: string, fyId: string, tx: DbOrTx = db): void {
    tx.update(financialYears)
      .set({ status: FYStatus.CLOSED })
      .where(
        and(
          eq(financialYears.id, fyId),
          eq(financialYears.firmId, firmId) // firm isolation: cross-firm close structurally impossible
        )
      )
      .run();
  },

  /**
   * v7.5 RESOLVE-TRANSACTION-FYID — Constitutional FY resolution function.
   *
   * MANDATORY: All Phase 3+ write services (postSaleInvoice, postPurchaseInvoice,
   * recordPayment, postExpense, postStockEntry, karigar issue/return) MUST call this
   * to derive fyId from entryDate. They MUST NOT use getActiveFY().id for fyId assignment.
   *
   * Why: A backdated March 15 entry created on April 2 must receive fyId = FY-2025-26,
   * not FY-2026-27. Using getActiveFY() after the FY transition would produce VJ/26-27/0001
   * for a March invoice — a statutory GSTR-1 compliance failure (date vs prefix mismatch).
   *
   * @param firmId    - The firm whose FYs to search
   * @param entryDate - ISO date string 'YYYY-MM-DD' — the transaction's entry date
   * @returns fyId string (UUID) of the matching ACTIVE FY
   * @throws ENTRY_DATE_IN_CLOSED_FY if no ACTIVE FY covers the entryDate
   */
  // FIX-V718-1: Synchronous execution using .get()
  resolveTransactionFyId(
    firmId: string,
    entryDate: string, // MUST be 'YYYY-MM-DD' — same format as stored startDate/endDate
    tx: DbOrTx = db
  ): string {
    const match = tx
      .select()
      .from(financialYears)
      .where(
        and(
          eq(financialYears.firmId, firmId),
          eq(financialYears.status, FYStatus.ACTIVE),
          lte(financialYears.startDate, entryDate), // startDate <= entryDate
          gte(financialYears.endDate, entryDate)    // endDate >= entryDate
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