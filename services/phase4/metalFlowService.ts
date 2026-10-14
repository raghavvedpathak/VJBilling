// services/phase4/metalFlowService.ts
// Phase 4: Gold Intelligence — Metal Balance Engine
// Complies with:
// - Fine Balance Formula (firm-level, FY-scoped)
// - P3-FIX-5: LABOUR_IN_GOLD no-multiply rule (weightMg is already fine mg, purityPct = 0)
// - FIX-METALOUT-REVERSAL v1.8: + Karigar Issue Reversal Fine
// - REVIEW-3: Metal Location Summary (do NOT sum ISSUED_TO_KARIGAR lots from old_metal_lots)

import Decimal from 'decimal.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import {
  oldMetalLots,
  items,
  karigarLedger,
  karigar,
  auditLogs,
} from '@/db/schema';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import type {
  FineBalanceBreakdown,
  MetalLocationSummary,
  MetalLocationBucket,
  KarigarMetalLocationBucket,
  KarigarBalance,
} from '@/types/phase4/phase4.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const metalFlowService = {
  /**
   * FINE BALANCE FORMULA (firm-level, FY-scoped)
   *
   * Fine Balance (firm-level, FY-scoped) =
   *   Opening Fine Balance (from FY close carry-forward — FY_CLOSE_FINE_BALANCE audit event)
   * + Purchase Fine (Phase 2/3 — CUSTOMER_OLD_ORNAMENTS + SUPPLIER_PURCHASE lots)
   * + Refinery Output Fine (REFINERY_OUTPUT lots — fine metal settled)
   * + Melt Output Fine (MELT_OUTPUT lots created after melting)
   * + Karigar Return Fine (METAL_IN entries in karigar_ledger)
   * − Sale Fine (Phase 3 — fine weight of sold items)
   * − Karigar Issue Fine (METAL_OUT entries in karigar_ledger)
   * + Karigar Issue Reversal Fine (METAL_OUT_REVERSAL entries in karigar_ledger) [FIX-METALOUT-REVERSAL v1.8]
   * − Refinery Input Fine (fine weight of lots SENT_TO_REFINERY)
   * − Melt Input Fine (fine weight of lots SENT_TO_MELT)
   * − Karigar Labour Gold (LABOUR_IN_GOLD entries — agreed wastage)
   * = Current Fine Balance in milligrams
   *
   * ⚠️ CRITICAL RULE — LABOUR_IN_GOLD no-multiply (P3-FIX-5)
   * LABOUR_IN_GOLD.weightMg is already fine milligrams. Do NOT apply purityPct/100 multiplier
   * to LABOUR_IN_GOLD rows. purityPct stored for LABOUR_IN_GOLD rows = 0.
   */
  async getFineBalance(
    firmId: string,
    fyId?: string,
    customTx?: any
  ): Promise<FineBalanceBreakdown> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);

    const conn = getDb(customTx);

    // 1. Opening Fine Balance from FY_CLOSE_FINE_BALANCE audit event (Step 11 — MISALIGN-2 FIX v1.4)
    let openingFineBalanceMg = 0;
    try {
      const priorFyCloseEvent = await auditRepository.findLatest(conn, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
      });

      if (priorFyCloseEvent) {
        let payload = priorFyCloseEvent.payload;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            payload = {};
          }
        }

        // CORRECT — matches Phase 2 v1.12 P4-FIX-3 payload structure (MISALIGN-2 FIX):
        // payload?.fineBalanceComponents?.totalOpeningFineMg ?? 0
        openingFineBalanceMg =
          payload?.fineBalanceComponents?.totalOpeningFineMg ??
          payload?.fineBalanceComponents?.totalFineBalanceMg ??
          payload?.totalOpeningFineMg ??
          0;
      }
    } catch {
      openingFineBalanceMg = 0;
    }

    // 2. Fetch all relevant old metal lots for this firm (GOLD only)
    const lots = conn
      .select()
      .from(oldMetalLots)
      .where(and(eq(oldMetalLots.firmId, firmId), eq(oldMetalLots.metal, 'GOLD')))
      .all?.() ?? [];

    let purchaseFineMg = 0;
    let refineryOutputFineMg = 0;
    let meltOutputFineMg = 0;
    let refineryInputFineMg = 0;
    let meltInputFineMg = 0;

    const purchaseSources = new Set([
      'CUSTOMER',
      'CUSTOMER_OLD_ORNAMENTS',
      'CUSTOMER_OLD_GOLD',
      'PURCHASE',
      'SUPPLIER_PURCHASE',
    ]);

    for (const lot of lots) {
      if (lot.status === 'VOIDED') continue;

      const fineMg = lot.fineWeightMg || 0;

      // Purchase Fine
      if (lot.metalSource && purchaseSources.has(lot.metalSource)) {
        purchaseFineMg += fineMg;
      }

      // Refinery Output Fine
      if (lot.metalSource === 'REFINERY_OUTPUT') {
        refineryOutputFineMg += fineMg;
      }

      // Melt Output Fine
      if (lot.metalSource === 'MELT_OUTPUT') {
        meltOutputFineMg += fineMg;
      }

      // Refinery Input Fine (lots SENT_TO_REFINERY)
      if (lot.status === 'SENT_TO_REFINERY') {
        refineryInputFineMg += fineMg;
      }

      // Melt Input Fine (lots SENT_TO_MELT)
      if (lot.status === 'SENT_TO_MELT') {
        meltInputFineMg += fineMg;
      }
    }

    // 3. Karigar Ledger Entries
    const ledgerEntries = conn
      .select()
      .from(karigarLedger)
      .where(eq(karigarLedger.firmId, firmId))
      .all?.() ?? [];

    let karigarReturnFineMg = 0;
    let karigarIssueFineMg = 0;
    let karigarIssueReversalFineMg = 0;
    let karigarLabourGoldFineMg = 0;

    for (const entry of ledgerEntries) {
      switch (entry.type) {
        case 'METAL_IN':
          karigarReturnFineMg += Math.round(
            (entry.weightMg * (entry.purityPct || 0)) / 100
          );
          break;
        case 'METAL_OUT':
          karigarIssueFineMg += Math.round(
            (entry.weightMg * (entry.purityPct || 0)) / 100
          );
          break;
        case 'METAL_OUT_REVERSAL':
          // FIX-METALOUT-REVERSAL v1.8
          karigarIssueReversalFineMg += Math.round(
            (entry.weightMg * (entry.purityPct || 0)) / 100
          );
          break;
        case 'LABOUR_IN_GOLD':
          // ⚠️ P3-FIX-5: LABOUR_IN_GOLD.weightMg is already fine mg. purityPct stored = 0.
          // Do NOT apply purityPct/100 multiplier. Formula: - SUM(LABOUR_IN_GOLD.weightMg).
          karigarLabourGoldFineMg += entry.weightMg || 0;
          break;
        default:
          break;
      }
    }

    // 4. Sale Fine (Phase 3 — fine weight of sold items)
    const soldItems = conn
      .select({ fineWeightMg: items.fineWeightMg })
      .from(items)
      .where(and(eq(items.firmId, firmId), eq(items.status, 'SOLD')))
      .all?.() ?? [];

    let saleFineMg = 0;
    for (const item of soldItems) {
      saleFineMg += item.fineWeightMg || 0;
    }

    // 5. Total fine balance calculation using Decimal
    const currentFineBalanceMg = new Decimal(openingFineBalanceMg)
      .plus(purchaseFineMg)
      .plus(refineryOutputFineMg)
      .plus(meltOutputFineMg)
      .plus(karigarReturnFineMg)
      .minus(saleFineMg)
      .minus(karigarIssueFineMg)
      .plus(karigarIssueReversalFineMg)
      .minus(refineryInputFineMg)
      .minus(meltInputFineMg)
      .minus(karigarLabourGoldFineMg)
      .toNumber();

    return {
      openingFineBalanceMg,
      purchaseFineMg,
      refineryOutputFineMg,
      meltOutputFineMg,
      karigarReturnFineMg,
      saleFineMg,
      karigarIssueFineMg,
      karigarIssueReversalFineMg,
      refineryInputFineMg,
      meltInputFineMg,
      karigarLabourGoldFineMg,
      currentFineBalanceMg,
    };
  },

  /**
   * METAL LOCATION SUMMARY (REVIEW-3: ISSUED_TO_KARIGAR clarification)
   *
   * Location Breakdown:
   * - IN HAND: OldMetalLots WHERE status = 'RECEIVED' (does NOT include ISSUED_TO_KARIGAR)
   * - AT REFINERY: OldMetalLots WHERE status = 'SENT_TO_REFINERY'
   * - WITH KARIGAR: karigar_ledger outstanding balance per karigar
   *   (REVIEW-3 FIX: Do NOT sum ISSUED_TO_KARIGAR lots from old_metal_lots — already reflected in karigar_ledger METAL_OUT)
   * - CONSUMED (MELT): OldMetalLots WHERE status = 'SENT_TO_MELT' (Terminal)
   * - SETTLED (REFINERY): OldMetalLots WHERE status = 'SETTLED' (Terminal)
   */
  async getMetalLocationSummary(
    firmId: string,
    second?: string | any,
    third?: any
  ): Promise<MetalLocationSummary> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);

    let fyId: string | undefined;
    let customTx: any;

    if (typeof second === 'string') {
      fyId = second;
      customTx = third;
    } else {
      customTx = second;
      fyId = undefined;
    }

    const conn = getDb(customTx);

    const lots = conn
      .select()
      .from(oldMetalLots)
      .where(and(eq(oldMetalLots.firmId, firmId), eq(oldMetalLots.metal, 'GOLD')))
      .all?.() ?? [];

    const inHand: MetalLocationBucket = { grossWeightMg: 0, fineWeightMg: 0, lotCount: 0 };
    const atRefinery: MetalLocationBucket = { grossWeightMg: 0, fineWeightMg: 0, lotCount: 0 };
    const consumedMelt: MetalLocationBucket = { grossWeightMg: 0, fineWeightMg: 0, lotCount: 0 };
    const settledRefinery: MetalLocationBucket = { grossWeightMg: 0, fineWeightMg: 0, lotCount: 0 };

    for (const lot of lots) {
      if (lot.status === 'VOIDED') continue;

      const grossMg = lot.grossWeightMg || 0;
      const fineMg = lot.fineWeightMg || 0;

      switch (lot.status) {
        case 'RECEIVED':
          // Physical gold in the shop. Does NOT include ISSUED_TO_KARIGAR lots.
          inHand.grossWeightMg += grossMg;
          inHand.fineWeightMg += fineMg;
          inHand.lotCount += 1;
          break;
        case 'SENT_TO_REFINERY':
          // Lots currently at refinery awaiting output.
          atRefinery.grossWeightMg += grossMg;
          atRefinery.fineWeightMg += fineMg;
          atRefinery.lotCount += 1;
          break;
        case 'SENT_TO_MELT':
          // Terminal. Consumed in melting.
          consumedMelt.grossWeightMg += grossMg;
          consumedMelt.fineWeightMg += fineMg;
          consumedMelt.lotCount += 1;
          break;
        case 'SETTLED':
          // Terminal. Settlement completed.
          settledRefinery.grossWeightMg += grossMg;
          settledRefinery.fineWeightMg += fineMg;
          settledRefinery.lotCount += 1;
          break;
        default:
          break;
      }
    }

    // WITH KARIGAR: karigar_ledger outstanding balance per karigar
    // REVIEW-3 FIX: Do NOT sum ISSUED_TO_KARIGAR lots from old_metal_lots
    const karigars = conn
      .select()
      .from(karigar)
      .where(and(eq(karigar.firmId, firmId), eq(karigar.isDeleted, 0)))
      .all?.() ?? [];

    const ledgerEntries = conn
      .select()
      .from(karigarLedger)
      .where(eq(karigarLedger.firmId, firmId))
      .all?.() ?? [];

    // Group ledger entries by karigarId
    const entriesByKarigar = new Map<string, any[]>();
    for (const entry of ledgerEntries) {
      if (!entriesByKarigar.has(entry.karigarId)) {
        entriesByKarigar.set(entry.karigarId, []);
      }
      entriesByKarigar.get(entry.karigarId)!.push(entry);
    }

    let totalWithKarigarFineMg = 0;
    const perKarigar: Array<{ karigarId: string; karigarName: string; fineWeightMg: number }> = [];

    for (const k of karigars) {
      const kEntries = entriesByKarigar.get(k.id) || [];
      let kBalanceMg = 0;

      for (const entry of kEntries) {
        switch (entry.type) {
          case 'METAL_OUT':
            kBalanceMg += Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
            break;
          case 'METAL_IN':
            kBalanceMg -= Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
            break;
          case 'METAL_OUT_REVERSAL':
            kBalanceMg -= Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
            break;
          case 'LABOUR_IN_GOLD':
            // P3-FIX-5: NO purity multiplier — already fine mg
            kBalanceMg -= entry.weightMg || 0;
            break;
          case 'METAL_SETTLED_AS_MONEY':
            // Decision D2: NO purity multiplier — already fine mg
            kBalanceMg -= entry.weightMg || 0;
            break;
          default:
            break;
        }
      }

      if (kBalanceMg !== 0) {
        totalWithKarigarFineMg += kBalanceMg;
        perKarigar.push({
          karigarId: k.id,
          karigarName: k.name,
          fineWeightMg: kBalanceMg,
        });
      }
    }

    const withKarigar: KarigarMetalLocationBucket = {
      fineWeightMg: totalWithKarigarFineMg,
      karigarCount: perKarigar.length,
      perKarigar,
    };

    const totalFineWeightMg =
      inHand.fineWeightMg + atRefinery.fineWeightMg + withKarigar.fineWeightMg;

    return {
      inHand,
      atRefinery,
      withKarigar,
      consumedMelt,
      settledRefinery,
      totalFineWeightMg,
    };
  },

  /**
   * Outstanding Karigar fine gold balance (per karigar) — Step 10
   * KARIGAR-BALANCE-SCOPE v1.9: fyId REMOVED per Phase 3 v5.17 decision.
   * karigar_ledger rows are FY-scoped at write time (each row has a fyId FK)
   * BUT getKarigarBalance() aggregates CROSS-FY — Phase 3 v5.17 removed fyId param.
   * D6 caveat: firm-level fine balance IS FY-scoped; karigar-level is NOT.
   * getFineBalance(firmId, fyId) retains fyId — correct for firm-level only.
   * NEVER pass fyId to getKarigarBalance() — Phase 3 implementation will reject it.
   *
   * Returns { issued, returned, labourGold, outstanding }
   * outstanding = METAL_OUT − METAL_IN − LABOUR_IN_GOLD
   * ⚠️ LABOUR_IN_GOLD: no purityPct multiply. weightMg is already fine mg. (D2)
   */
  async getKarigarBalance(
    karigarId: string,
    firmId: string,
    customTx?: any
  ): Promise<KarigarBalance> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!karigarId) throw new Error(ERR.KARIGAR_NOT_FOUND);

    // Guard: NEVER pass fyId to getKarigarBalance() per KARIGAR-BALANCE-SCOPE v1.9
    if (typeof customTx === 'string') {
      throw new Error(
        'INVALID_ARGUMENT: fyId is not accepted by getKarigarBalance (cross-FY aggregate per Phase 3 v5.17)'
      );
    }

    const conn = getDb(customTx);

    const entries =
      conn
        .select()
        .from(karigarLedger)
        .where(
          and(
            eq(karigarLedger.firmId, firmId),
            eq(karigarLedger.karigarId, karigarId)
          )
        )
        .all?.() ?? [];

    let issued = 0;
    let returned = 0;
    let labourGold = 0;
    let settledAsMoney = 0;

    for (const entry of entries) {
      switch (entry.type) {
        case 'METAL_OUT':
          issued += Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
          break;
        case 'METAL_OUT_REVERSAL':
          issued -= Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
          break;
        case 'METAL_IN':
          returned += Math.round((entry.weightMg * (entry.purityPct || 0)) / 100);
          break;
        case 'LABOUR_IN_GOLD':
          // ⚠️ D2 & P3-FIX-5: purityPct stored = 0, weightMg is already fine mg — NO MULTIPLY!
          labourGold += entry.weightMg || 0;
          break;
        case 'METAL_SETTLED_AS_MONEY':
          settledAsMoney += entry.weightMg || 0;
          break;
        default:
          break;
      }
    }

    const outstanding = issued - returned - labourGold - settledAsMoney;

    const result = {
      issued,
      returned,
      labourGold,
      outstanding,
      valueOf(): number {
        return outstanding;
      },
      [Symbol.toPrimitive](hint: string) {
        if (hint === 'string') return String(outstanding);
        return outstanding;
      },
    };

    return result;
  },
};
