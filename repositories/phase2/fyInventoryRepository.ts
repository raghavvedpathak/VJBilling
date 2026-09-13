// repositories/phase2/fyInventoryRepository.ts — Phase 2 v2.34 Canonical Repository
// Aligned with Step 5.5, FIX-CLOSEF-1 (v1.37), FIX-CLOSEF-2 (v1.95), FIX-OLDGOLD-METAL-CLOSEFY-1 (v2.26),
// and FIX-OLDMETAL-VOID-1 (v2.33 / v2.34)

import db, { db as dbNamed } from '@/db/client';
import { eq, and, notInArray, sum, count } from 'drizzle-orm';
import { items, oldMetalLots } from '@/db/schema';
import { karigarRepository } from '@/repositories/phase2/karigarRepository';
import type { DrizzleTransaction } from '@/types/phase2/phase2.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const fyInventoryRepository = {
  /**
   * Returns count of unpublished DRAFT items for a firm.
   * Can be executed synchronously inside a transaction or asynchronously against the database.
   */
  getDraftItemCount(txOrDb: any, firmId: string): number {
    const targetTx = getDb(txOrDb);
    const row = targetTx
      .select({ total: count() })
      .from(items)
      .where(and(eq(items.firmId, firmId), eq(items.status, 'DRAFT')))
      .get();
    return Number(row?.total) || 0;
  },

  /**
   * Native SQLite aggregation for total open gold fine weight in milligrams.
   * Strictly filters metal = 'GOLD' and excludes SETTLED, SENT_TO_MELT, and VOIDED exchange lots.
   */
  getOpenGoldLotFineWeightMg(txOrDb: any, firmId: string): number {
    const targetTx = getDb(txOrDb);
    const result = targetTx
      .select({ total: sum(oldMetalLots.fineWeightMg) })
      .from(oldMetalLots)
      .where(
        and(
          eq(oldMetalLots.firmId, firmId),
          eq(oldMetalLots.metal, 'GOLD'),
          notInArray(oldMetalLots.status, ['SETTLED', 'SENT_TO_MELT', 'VOIDED'])
        )
      )
      .get();
    return Number(result?.total) || 0;
  },

  /**
   * Outstanding Karigar fine weight balance in milligrams.
   */
  getKarigarOutstandingFineWeightMg(txOrDb: any, firmId: string): number {
    const targetTx = getDb(txOrDb);
    return karigarRepository?.getOutstandingFineMg
      ? karigarRepository.getOutstandingFineMg(targetTx, firmId)
      : 0;
  },

  /**
   * Consolidated Year-End fine metal balance components for opening inventory carryover.
   */
  getYearEndFineBalances(txOrDb: any, firmId: string): {
    karigarOutstandingFineMg: number;
    refineryOutstandingFineMg: number;
    openGoldLotFineMg: number;
    totalOpeningFineMg: number;
  } {
    const karigarOutstandingFineMg = this.getKarigarOutstandingFineWeightMg(txOrDb, firmId);
    const refineryOutstandingFineMg = 0;
    const openGoldLotFineMg = this.getOpenGoldLotFineWeightMg(txOrDb, firmId);
    const totalOpeningFineMg = karigarOutstandingFineMg + refineryOutstandingFineMg + openGoldLotFineMg;

    return {
      karigarOutstandingFineMg,
      refineryOutstandingFineMg,
      openGoldLotFineMg,
      totalOpeningFineMg,
    };
  },
};

export default fyInventoryRepository;
