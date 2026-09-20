// repositories/phase3/karigarLedgerRepository.ts — Phase 3 Karigar Dual Ledger Data Access Layer
// Adheres strictly to STEP 3 Specification:
// APPEND-ONLY — No update or delete methods exist.
// FIX-KARIGAR-CROSSFY-1 (v5.17): Balances are firm-wide lifetime aggregates (no fyId filter).
// v4.9 purityPct:0 NO-MULTIPLY RULE: METAL_SETTLED_AS_MONEY and LABOUR_IN_GOLD use weightMg directly.

import { eq, and, asc } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { karigarLedger } from '@/db/schema/phase3_money_truth';
import {
  KarigarLedgerEntry,
  NewKarigarLedgerEntry,
  KarigarBalanceSummary,
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

export const karigarLedgerRepository = {
  /**
   * Inserts a new karigar ledger entry.
   * APPEND-ONLY: This table has no update or delete operations.
   * Supports both (tx, entry) and (entry, tx?) signatures.
   */
  insert(arg1: any, arg2?: any): KarigarLedgerEntry {
    let entryData: NewKarigarLedgerEntry;
    let customTx: any = undefined;

    if (arg1 && typeof arg1 === 'object' && 'type' in arg1 && 'karigarId' in arg1) {
      entryData = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      entryData = arg2;
    }

    const conn = getDb(customTx);
    const timestamp = now();

    const toInsert = {
      id: entryData.id || crypto.randomUUID(),
      firmId: entryData.firmId,
      fyId: entryData.fyId ?? null,
      karigarId: entryData.karigarId,
      type: entryData.type,
      weightMg: entryData.weightMg ?? 0,
      purityPct: entryData.purityPct ?? 0,
      amountPaise: entryData.amountPaise ?? 0,
      ratePaisePerGram: entryData.ratePaisePerGram ?? 0,
      isManualRate: entryData.isManualRate ?? 0,
      linkedEntityId: entryData.linkedEntityId ?? null,
      linkedJobWorkId: entryData.linkedJobWorkId ?? null,
      notes: entryData.notes ?? null,
      createdAt: entryData.createdAt || timestamp,
    };

    conn.insert(karigarLedger).values(toInsert).run();

    return toInsert as KarigarLedgerEntry;
  },

  /**
   * Retrieves a single ledger entry by its primary key id.
   * Supports (id, tx?) and (tx, id).
   */
  findById(arg1: any, arg2?: any): KarigarLedgerEntry | null {
    let id: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string') {
      id = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      id = arg2;
    }

    if (!id) return null;

    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(karigarLedger)
      .where(eq(karigarLedger.id, id))
      .limit(1)
      .all();

    return (rows[0] as KarigarLedgerEntry) || null;
  },

  /**
   * FIX-LINKEDJOBWORK-COL-1 (v5.14):
   * Enables: SELECT * FROM karigar_ledger WHERE linkedJobWorkId = ?
   * Uses partial index idx_karigar_ledger_job_work.
   */
  getByLinkedJobWorkId(linkedJobWorkId: string, customTx?: any): KarigarLedgerEntry[] {
    if (!linkedJobWorkId) return [];
    const conn = getDb(customTx);
    return conn
      .select()
      .from(karigarLedger)
      .where(eq(karigarLedger.linkedJobWorkId, linkedJobWorkId))
      .orderBy(asc(karigarLedger.createdAt))
      .all() as KarigarLedgerEntry[];
  },

  /**
   * Retrieves all ledger entries for a karigar within a firm, ordered by createdAt ASC.
   * Supports (firmId, karigarId, tx?), (tx, karigarId, firmId), and (tx, firmId, karigarId).
   */
  getEntriesByKarigar(arg1: any, arg2: any, arg3?: any): KarigarLedgerEntry[] {
    let firmId: string;
    let karigarId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      karigarId = arg2;
      customTx = arg3;
    } else if (typeof arg2 === 'string' && typeof arg3 === 'string') {
      customTx = arg1;
      karigarId = arg2;
      firmId = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      karigarId = arg3;
    }

    if (!firmId || !karigarId) return [];

    const conn = getDb(customTx);
    let rows = conn
      .select()
      .from(karigarLedger)
      .where(
        and(
          eq(karigarLedger.firmId, firmId),
          eq(karigarLedger.karigarId, karigarId)
        )
      )
      .orderBy(asc(karigarLedger.createdAt))
      .all();

    // Fallback if caller passed firmId and karigarId reversed
    if ((!rows || rows.length === 0) && firmId !== karigarId) {
      const swappedRows = conn
        .select()
        .from(karigarLedger)
        .where(
          and(
            eq(karigarLedger.firmId, karigarId),
            eq(karigarLedger.karigarId, firmId)
          )
        )
        .orderBy(asc(karigarLedger.createdAt))
        .all();
      if (swappedRows && swappedRows.length > 0) {
        rows = swappedRows;
      }
    }

    return (rows as KarigarLedgerEntry[]) || [];
  },

  /**
   * Retrieves all ledger entries for a firm across all karigars, ordered by createdAt ASC.
   */
  getEntriesByFirm(firmId: string, customTx?: any): KarigarLedgerEntry[] {
    if (!firmId) return [];
    try {
      const conn = getDb(customTx);
      return conn
        .select()
        .from(karigarLedger)
        .where(eq(karigarLedger.firmId, firmId))
        .orderBy(asc(karigarLedger.createdAt))
        .all() as KarigarLedgerEntry[];
    } catch {
      return [];
    }
  },

  /**
   * FIX-KARIGAR-CROSSFY-1 (v5.17) & v4.9 purityPct:0 NO-MULTIPLY RULE:
   * Metal balance is a firm-wide lifetime aggregate (NO fyId filter).
   * Formula:
   *   SUM(METAL_OUT.weightMg * purityPct / 100)
   * - SUM(METAL_IN.weightMg * purityPct / 100)
   * - SUM(METAL_SETTLED_AS_MONEY.weightMg) [NO purity multiply — already fine mg]
   * - SUM(LABOUR_IN_GOLD.weightMg) [NO purity multiply — already fine mg]
   * Returns fine milligrams (mg) outstanding.
   * If karigarId is provided, returns balance for that karigar; otherwise returns total firm balance.
   */
  getMetalBalance(arg1: any, arg2?: any, arg3?: any): number {
    let firmId: string;
    let karigarId: string | undefined = undefined;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      karigarId = arg2;
      customTx = arg3;
    } else if (typeof arg1 === 'string' && (arg2 === undefined || (typeof arg2 === 'object' && arg2 !== null))) {
      firmId = arg1;
      customTx = arg2;
    } else if (typeof arg2 === 'string' && arg3 === undefined) {
      customTx = arg1;
      firmId = arg2;
    } else {
      customTx = arg1;
      firmId = arg2;
      karigarId = arg3;
    }

    const entries = karigarId
      ? this.getEntriesByKarigar(firmId, karigarId, customTx)
      : this.getEntriesByFirm(firmId, customTx);

    let fineBalanceMg = 0;

    for (const entry of entries) {
      switch (entry.type) {
        case 'METAL_OUT':
          fineBalanceMg += Math.round((entry.weightMg * entry.purityPct) / 100);
          break;
        case 'METAL_IN':
          fineBalanceMg -= Math.round((entry.weightMg * entry.purityPct) / 100);
          break;
        case 'METAL_SETTLED_AS_MONEY':
          // v4.9 Rule: purityPct is 0, weightMg is already fine mg — do NOT multiply by purity!
          fineBalanceMg -= entry.weightMg;
          break;
        case 'LABOUR_IN_GOLD':
          // Fine weight gold deducted for labour payment — no purity multiplier
          fineBalanceMg -= entry.weightMg;
          break;
        default:
          // Money types (LABOUR_PAYABLE, LABOUR_PAID) do not affect metal balance
          break;
      }
    }

    return fineBalanceMg;
  },

  /**
   * Retrieves total firm-wide lifetime outstanding metal balance in fine milligrams.
   */
  getFirmMetalBalance(firmId: string, customTx?: any): number {
    return this.getMetalBalance(firmId, customTx);
  },

  /**
   * FIX-KARIGAR-CROSSFY-1 (v5.17):
   * Money balance is a firm-wide lifetime aggregate (NO fyId filter).
   * Formula:
   *   SUM(LABOUR_PAYABLE.amountPaise)
   * + SUM(METAL_SETTLED_AS_MONEY.amountPaise)
   * - SUM(LABOUR_PAID.amountPaise)
   * Returns integer paise outstanding.
   */
  getMoneyBalance(arg1: any, arg2: any, arg3?: any): number {
    let firmId: string;
    let karigarId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      karigarId = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      karigarId = arg3;
    }

    const entries = this.getEntriesByKarigar(firmId, karigarId, customTx);

    let moneyBalancePaise = 0;

    for (const entry of entries) {
      switch (entry.type) {
        case 'LABOUR_PAYABLE':
          moneyBalancePaise += entry.amountPaise;
          break;
        case 'METAL_SETTLED_AS_MONEY':
          moneyBalancePaise += entry.amountPaise;
          break;
        case 'LABOUR_PAID':
          moneyBalancePaise -= entry.amountPaise;
          break;
        default:
          // Pure metal types do not affect money balance
          break;
      }
    }

    return moneyBalancePaise;
  },

  /**
   * Retrieves both metal (fine mg) and money (paise) balances for a karigar.
   */
  getBalanceSummary(arg1: any, arg2: any, arg3?: any): KarigarBalanceSummary {
    let firmId: string;
    let karigarId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      karigarId = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      karigarId = arg3;
    }

    return {
      metalBalanceMg: this.getMetalBalance(firmId, karigarId, customTx),
      moneyBalancePaise: this.getMoneyBalance(firmId, karigarId, customTx),
    };
  },

  /**
   * v5.14 FIX-LINKEDJOBWORK-COL-1:
   * Finds all ledger entries linked to a specific job work ID.
   */
  findByLinkedJobWorkId(firmId: string, linkedJobWorkId: string, customTx?: any): KarigarLedgerEntry[] {
    if (!firmId || !linkedJobWorkId) return [];

    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(karigarLedger)
      .where(
        and(
          eq(karigarLedger.firmId, firmId),
          eq(karigarLedger.linkedJobWorkId, linkedJobWorkId)
        )
      )
      .orderBy(asc(karigarLedger.createdAt))
      .all();

    return (rows as KarigarLedgerEntry[]) || [];
  },

  /**
   * CHECK 10 (STEP 3A / v4.7): Karigar Metal Aggregate Integrity Check.
   * Formula:
   *   SUM(METAL_OUT fine mg) >= SUM(METAL_IN fine mg) + SUM(METAL_SETTLED_AS_MONEY.weightMg) + SUM(LABOUR_IN_GOLD.weightMg)
   *
   * RATIONALE:
   * Metal settlement linkage (linkedEntityId) is for AUDIT TRACEABILITY ONLY.
   * Balance enforcement is at the karigar aggregate level — not per METAL_OUT entry.
   * If violated -> CRITICAL -> Safe Mode.
   */
  verifyAggregateIntegrity(arg1: any, arg2: any, arg3?: any): {
    isValid: boolean;
    fineIssuedMg: number;
    fineReturnedMg: number;
    fineSettledMg: number;
    fineLabourGoldMg: number;
    fineDeductedMg: number;
    deficitMg: number;
  } {
    let firmId: string;
    let karigarId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      karigarId = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      karigarId = arg3;
    }

    const entries = this.getEntriesByKarigar(firmId, karigarId, customTx);

    let fineIssuedMg = 0;
    let fineReturnedMg = 0;
    let fineSettledMg = 0;
    let fineLabourGoldMg = 0;

    for (const entry of entries) {
      switch (entry.type) {
        case 'METAL_OUT':
          fineIssuedMg += Math.round((entry.weightMg * (entry.purityPct ?? 0)) / 100);
          break;
        case 'METAL_IN':
          fineReturnedMg += Math.round((entry.weightMg * (entry.purityPct ?? 0)) / 100);
          break;
        case 'METAL_SETTLED_AS_MONEY':
          // v4.9 Rule: weightMg is already fine mg — do not multiply by purity
          fineSettledMg += entry.weightMg;
          break;
        case 'LABOUR_IN_GOLD':
          // Fine weight gold deducted for labour payment — no purity multiplier
          fineLabourGoldMg += entry.weightMg;
          break;
        default:
          break;
      }
    }

    const fineDeductedMg = fineReturnedMg + fineSettledMg + fineLabourGoldMg;
    const isValid = fineIssuedMg >= fineDeductedMg;
    const deficitMg = isValid ? 0 : fineDeductedMg - fineIssuedMg;

    return {
      isValid,
      fineIssuedMg,
      fineReturnedMg,
      fineSettledMg,
      fineLabourGoldMg,
      fineDeductedMg,
      deficitMg,
    };
  },

  /**
   * Returns distinct karigar IDs that have ledger entries for a firm.
   */
  getDistinctKarigarIds(firmId: string, customTx?: any): string[] {
    if (!firmId) return [];
    const conn = getDb(customTx);
    const rows = conn
      .select({ karigarId: karigarLedger.karigarId })
      .from(karigarLedger)
      .where(eq(karigarLedger.firmId, firmId))
      .all();

    const set = new Set<string>();
    for (const r of rows) {
      if (r.karigarId) set.add(r.karigarId);
    }
    return Array.from(set);
  },
};

/**
 * ✅ v4.9 FIX — getMetalBalance() FULL TYPESCRIPT SIGNATURE
 * (fyId param REMOVED v5.17 — FIX-KARIGAR-CROSSFY-1)
 *
 * @param tx - Transaction | null (pass inside transaction, null for read-only display)
 * @param karigarId - string (party identity)
 * @param firmId - string (firm scope)
 * @returns Promise<{ fineOutstandingMg: number; moneyOutstandingPaise: number; }>
 */
export async function getMetalBalance(
  tx: any | null,
  karigarId: string,
  firmId: string
): Promise<{
  fineOutstandingMg: number;
  moneyOutstandingPaise: number;
  metalBalanceMg: number;
  moneyBalancePaise: number;
}> {
  const fineOutstandingMg = karigarLedgerRepository.getMetalBalance(firmId, karigarId, tx);
  const moneyOutstandingPaise = karigarLedgerRepository.getMoneyBalance(firmId, karigarId, tx);
  return {
    fineOutstandingMg,
    moneyOutstandingPaise,
    metalBalanceMg: fineOutstandingMg,
    moneyBalancePaise: moneyOutstandingPaise,
  };
}

