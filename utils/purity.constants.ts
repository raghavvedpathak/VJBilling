import { ERR } from '../constants/errorCodes';

// purity.constants.ts — FIX-GAP-D-1 (v1.19)
export const PURITY_MAP: Record<number, number> = {
  24: 99.9, 23: 95.8, 22: 91.6, 21: 87.5, // FIX-24K-PURITY-1 (v1.57): 99.9 is canonical karatToPercent(24) display value. percentToKarat() extended below to also accept 99.99 and 99.50 as 24K.
  20: 83.3, 18: 75.0, 14: 58.3, 10: 41.7, 9: 37.5,
  // NEW-3 FIX: 14K = 58.3 (14/24x100 = 58.333 -> 58.3) | FIX-SILVER-PURITY-1 (v1.46): percentToKarat() returns null for ALL silver purities (99.9%, 92.5%, 83.5%, 80.0%). Silver items ALWAYS stored with purityKarat=0. getDisplayPurity() for SILVER always shows percentage string (e.g. "92.5%"), NEVER karat label. Silver purity reference — FIX-SILVER-PURITY-2 (v1.94): corrected to the current BIS IS 2112:2025 seven-grade table (2014's retired 900 grade intentionally NOT carried forward, since the 2025 revision dropped it): 99.9%=Fine(999), 99.0%=990, 97.0%=970, 95.8%=Britannia(958), 92.5%=Sterling(925), 83.5%=835, 80.0%=800. RULE: a silver item with purityPercent=92.5 gets purityKarat=0 at createItem(). karatToPercent() is a GOLDONLY function — DO NOT call with silver purity percentages. FIX-SILVER-PURITY-UI-1 (v1.56): UI LAYER WARNING — the item creation screen MUST NOT call karatToPercent() when metal === 'SILVER'. Doing so will throw INVALID_KARAT for any silver purity value. Always check metal before calling karatToPercent(). getDisplayPurity() handles silver correctly and is safe to call for both metals.
};

// FEAT-SILVER-PURITY-GRADES-1 (v1.94): Reference lists of officially recognized purity grades, for informational UI display ONLY.
export const SILVER_PURITY_GRADES: number[] = [80.0, 83.5, 92.5, 95.8, 97.0, 99.0, 99.9]; // BIS IS 2112:2025, seven grades
export const GOLD_PURITY_GRADES: number[] = Object.values(PURITY_MAP); // derived from PURITY_MAP, kept in sync automatically

export function isStandardPurityGrade(purityPercent: number, metal: 'GOLD' | 'SILVER'): boolean {
  const grades = metal === 'SILVER' ? SILVER_PURITY_GRADES : GOLD_PURITY_GRADES;
  return grades.some(g => Math.abs(g - purityPercent) <= 0.01); // tolerance for float rounding
}

// FEAT-PURITY-ROUND-1 (v1.90): Trade-convention purity rounding for regular stock.
// Product decision (Raghav — Project Leader / Lead Developer / Architect / Tester): entering
// a near-24K/near-fine purity should record fineWeightMg as if it were 100% pure, matching
// trade convention. This is a deliberate, DOCUMENTED exception to RED-5/RED-10 (fineWeightMg
// = exact physical truth) — see amended red-line clauses. Applies to REGULAR STOCK ONLY:
// createItem(), createItemsBulk(), adjustWeight() — AND createOldGoldLot() when metalSource = 'MELT_OUTPUT'
// (FEAT-PURITY-ROUND-1 v1.91, extended; corrected here FIX-V192-RED5-SYNC-1 — this comment previously said the opposite). CUSTOMER/KARIGAR/EXCHANGE/PURCHASE old-gold lots and URD purchases keep the exact-purity formula unchanged, by explicit decision.
export const PURITY_ROUND_TO_100: Record<'GOLD' | 'SILVER', number[]> = {
  GOLD: [99.50, 99.9, 99.99],
  SILVER: [99.9],
};

// resolveFineWeightMg() is the SOLE fine-weight entry point for regular stock. Returns the
// (possibly rounded) fineWeightMg plus purityRoundingDeltaMg — the physical gap this rounding
// creates (netWeightMg minus true fine weight), stored so a future refinery/melt-yield
// reconciliation (Phase 4, not yet built) can explain the gap instead of treating it as an
// unexplained shortfall. verifyService surfaces the accumulated total for visibility today.
export function resolveFineWeightMg(netWeightMg: number, purityPercent: number, metal: 'GOLD' | 'SILVER'): { fineWeightMg: number; purityRoundingDeltaMg: number } {
  const trueFineWeightMg = Math.round(netWeightMg * purityPercent / 100);
  const isRounded = PURITY_ROUND_TO_100[metal].includes(purityPercent);
  if (!isRounded) return { fineWeightMg: trueFineWeightMg, purityRoundingDeltaMg: 0 };
  return { fineWeightMg: netWeightMg, purityRoundingDeltaMg: netWeightMg - trueFineWeightMg };
}

// FIX-24K-PURITY-1 (v1.57): Extended reverse-lookup for 24K sub-variants.
// PURITY_MAP[24] = 99.9 is the canonical value (karatToPercent display direction).
// 99.99 (4-nine fine, investment grade) and 99.50 (BIS 995) are real BIS 24K
// standards. They fall outside the 0.05 tolerance of percentToKarat() so
// they are handled via explicit extended map checked first. 99.90 already
// resolves correctly via tolerance (|99.9 - 99.90| = 0.0 < 0.05).
export const PURITY_PERCENT_EXTENDED: Record<number, number> = {
  99.99: 24, // 4-nine fine gold — investment grade, BIS 9999
  99.50: 24, // BIS 995 — hallmarked 24K fine gold
};

// karatToPercent() — throws if karat not in map
export function karatToPercent(karat: number): number {
  const pct = PURITY_MAP[karat];
  if (pct === undefined) throw new Error(`${ERR.INVALID_KARAT}: ${karat}`);
  return pct;
}

// percentToKarat() — checks PURITY_PERCENT_EXTENDED first (exact match), then PURITY_MAP (within 0.05%). Returns null if no match.
export function percentToKarat(percent: number): number | null {
  // FIX-24K-PURITY-1 (v1.57): check extended map first (exact match)
  if (PURITY_PERCENT_EXTENDED[percent] !== undefined) return PURITY_PERCENT_EXTENDED[percent];
  // then fall through to PURITY_MAP tolerance check
  for (const [k, v] of Object.entries(PURITY_MAP)) {
    if (Math.abs(v - percent) < 0.05) return Number(k);
  }
  return null;
}

// getDisplayPurity() — UI DISPLAY LAYER ONLY. NEVER used in math.
export function getDisplayPurity(purityPercent: number, purityKarat: number | null, metal: 'GOLD' | 'SILVER'): string {
  if (metal === "GOLD" && purityKarat !== null && purityKarat > 0) return `${purityKarat}K`;
  return `${purityPercent}%`;
}

// FEAT-EFFECTIVE-PRICE-1 (v2.00): computeEffectivePricePaisePerGram() / computeEstTotalCostPaise() — UI DISPLAY LAYER ONLY.
export function computeEffectivePricePaisePerGram(purchaseRatePaise: number, purityPercent: number, wastagePercent: number): number {
  return Math.round(purchaseRatePaise * ((purityPercent + wastagePercent) / 100));
}

export function computeEstTotalCostPaise(effectivePricePaisePerGram: number, netWeightMg: number): number {
  return Math.round(effectivePricePaisePerGram * (netWeightMg / 1000));
}

