import { ERR } from '../constants';

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
  const isRounded = PURITY_ROUND_TO_100[metal].some(target => Math.abs(target - purityPercent) < 0.01);
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

// percentToKarat() — checks PURITY_MAP direct karat match first, then PURITY_PERCENT_EXTENDED (exact match), then PURITY_MAP (within 0.05%). Returns null if no match.
export function percentToKarat(percent: number): number | null {
  if (PURITY_MAP[percent] !== undefined) return percent;
  if (PURITY_PERCENT_EXTENDED[percent] !== undefined) return PURITY_PERCENT_EXTENDED[percent];
  for (const [k, v] of Object.entries(PURITY_MAP)) {
    if (Math.abs(v - percent) < 0.05) return Number(k);
  }
  return null;
}

// getDisplayPurity() — UI DISPLAY LAYER ONLY. NEVER used in math.
export function getDisplayPurity(purityPercent?: number | null, purityKarat?: number | null, metal: 'GOLD' | 'SILVER' = 'GOLD'): string {
  const safePercent = purityPercent != null && !isNaN(Number(purityPercent)) ? Number(purityPercent) : 0;
  const resolvedKarat = (purityKarat != null && purityKarat > 0) 
    ? purityKarat 
    : (metal === 'GOLD' ? percentToKarat(safePercent) : null);

  if (metal === 'GOLD' && resolvedKarat && resolvedKarat > 0) {
    return `${resolvedKarat}K`;
  }
  return `${safePercent}%`;
}

export function resolveEffectivePurityPercent(purityPercent: number, metal: 'GOLD' | 'SILVER' = 'GOLD'): number {
  const isRounded = PURITY_ROUND_TO_100[metal]?.some(target => Math.abs(target - purityPercent) < 0.01);
  return isRounded ? 100 : purityPercent;
}

// FEAT-EFFECTIVE-PRICE-1 (v2.00): computeEffectivePricePaisePerGram() / computeEstTotalCostPaise() — UI DISPLAY LAYER ONLY.
export function computeEffectivePricePerGram(ratePerGram: number, purityPercent: number, wastagePercent: number, metal: 'GOLD' | 'SILVER' = 'GOLD'): number {
  const effPurity = resolveEffectivePurityPercent(purityPercent, metal);
  return ratePerGram * ((effPurity + wastagePercent) / 100);
}

export function computeEffectivePricePaisePerGram(purchaseRatePaise: number, purityPercent: number, wastagePercent: number, metal: 'GOLD' | 'SILVER' = 'GOLD'): number {
  const effPurity = resolveEffectivePurityPercent(purityPercent, metal);
  return Math.round(purchaseRatePaise * ((effPurity + wastagePercent) / 100));
}

export function computeEstTotalCostPaise(effectivePricePaisePerGram: number, netWeightMg: number): number {
  return Math.round(effectivePricePaisePerGram * (netWeightMg / 1000));
}

export function computeFineGoldChargedMg(netWeightMg: number, purityPercent: number, wastagePercent: number, metal: 'GOLD' | 'SILVER' = 'GOLD'): number | null {
  if (wastagePercent <= 0) return null;
  const effPurity = resolveEffectivePurityPercent(purityPercent, metal);
  return Math.round(netWeightMg * ((effPurity + wastagePercent) / 100));
}

// --- INVENTORY ITEM COST & TRUTH HELPERS FOR ALL SCREENS ---
export function computeVaultTruthGrams(fineWeightMg: number): number {
  return fineWeightMg / 1000;
}

export function computeCostTruthGrams(fineGoldChargedMg: number | null, fineWeightMg: number): number {
  return fineGoldChargedMg !== null ? fineGoldChargedMg / 1000 : computeVaultTruthGrams(fineWeightMg);
}

export function computeWastageGoldGrams(costTruthGrams: number, vaultTruthGrams: number): number {
  return Math.max(0, costTruthGrams - vaultTruthGrams);
}

export function computeAbsoluteTotalCostRupees(
  netWeightGrams: number,
  effectivePricePerGram: number,
  makingCharges: number = 0,
  stoneCost: number = 0
): number {
  const totalGoldCost = netWeightGrams * effectivePricePerGram;
  return totalGoldCost + makingCharges + stoneCost;
}

// --- WEIGHT FORMULAS & CONVERSIONS (RULE-1A-WEIGHT-DISPLAY) ---
export function formatWeightMg(mg: number | null | undefined): string {
  if (mg === null || mg === undefined || isNaN(mg)) return '0.000 g';
  return (mg / 1000).toFixed(3) + ' g';
}

export function formatWeightGrams(grams: number | null | undefined): string {
  if (grams === null || grams === undefined || isNaN(grams)) return '0.000 g';
  return grams.toFixed(3) + ' g';
}

export function mgToGrams(mg: number): number {
  return mg / 1000;
}

export function gramsToMg(grams: number): number {
  return Math.round(grams * 1000);
}

export function computeNetWeightMg(grossWeightMg: number, stoneWeightMg: number = 0, beadsWeightMg: number = 0): number {
  return Math.max(0, grossWeightMg - stoneWeightMg - beadsWeightMg);
}

export function caratX100ToCarats(caratX100: number): number {
  return caratX100 / 100;
}

export function caratsToCaratX100(carats: number): number {
  return Math.round(carats * 100);
}

export function formatCarats(caratX100: number | null | undefined): string {
  if (caratX100 === null || caratX100 === undefined || isNaN(caratX100)) return '0.00 ct';
  return (caratX100 / 100).toFixed(2) + ' ct';
}

export function computeGemstoneTotalPaise(weightCaratX100: number, purchaseRatePaisePerCarat: number | null | undefined): number | null {
  if (purchaseRatePaisePerCarat === null || purchaseRatePaisePerCarat === undefined) return null;
  return Math.round((weightCaratX100 / 100) * purchaseRatePaisePerCarat);
}

// --- CENTRAL URD PURCHASE FORMULAS & LIVE COST BREAKDOWN ---
export interface URDCostBreakdown {
  grossWeightMg: number;
  grossWeightGrams: number;
  purityPercent: number;
  fineWeightMg: number;
  fineWeightGrams: number;
  ratePerGramPaise: number;
  ratePerGramRupees: number;
  grossValuePaise: number;
  grossValueRupees: number;
  discountPaise: number;
  discountRupees: number;
  subtotalPaise: number;
  subtotalRupees: number;
  roundOffPaise: number;
  roundOffRupees: number;
  totalValuePaise: number;
  totalValueRupees: number;
  formattedFineGrams: string;
  formattedGrossValue: string;
  formattedSubtotal: string;
  formattedDiscount: string;
  formattedRoundOff: string;
  formattedTotalValue: string;
}

export function computeURDFineWeightMg(grossWeightMg: number, purityPercent: number): number {
  const safeGrossMg = Math.max(0, grossWeightMg || 0);
  const safePurity = Math.max(0, Math.min(100, purityPercent || 0));
  return Math.round(safeGrossMg * (safePurity / 100));
}

export function computeURDTotalValuePaise(fineWeightMg: number, ratePerGramPaise: number, discountPaise: number = 0): number {
  const safeFineMg = Math.max(0, fineWeightMg || 0);
  const safeRatePaise = Math.max(0, ratePerGramPaise || 0);
  const safeDiscountPaise = Math.max(0, discountPaise || 0);
  const grossValuePaise = Math.round((safeFineMg / 1000) * safeRatePaise);
  const subtotalPaise = Math.max(0, grossValuePaise - safeDiscountPaise);
  return Math.round(subtotalPaise / 100) * 100;
}

export function computeURDCostBreakdown(
  grossWeightMg: number,
  purityPercent: number,
  ratePerGramPaise: number,
  discountPaise: number = 0
): URDCostBreakdown {
  const safeGrossMg = Math.max(0, grossWeightMg || 0);
  const safePurity = Math.max(0, Math.min(100, purityPercent || 0));
  const safeRatePaise = Math.max(0, ratePerGramPaise || 0);
  const safeDiscountPaise = Math.max(0, discountPaise || 0);

  const fineWeightMg = computeURDFineWeightMg(safeGrossMg, safePurity);
  const grossValuePaise = Math.round((fineWeightMg / 1000) * safeRatePaise);
  const subtotalAfterDiscountPaise = Math.max(0, grossValuePaise - safeDiscountPaise);
  
  // Round to nearest rupee (100 paise)
  const totalValuePaise = Math.round(subtotalAfterDiscountPaise / 100) * 100;
  const roundOffPaise = totalValuePaise - subtotalAfterDiscountPaise;

  const grossWeightGrams = safeGrossMg / 1000;
  const fineWeightGrams = fineWeightMg / 1000;
  const ratePerGramRupees = safeRatePaise / 100;
  const grossValueRupees = grossValuePaise / 100;
  const discountRupees = safeDiscountPaise / 100;
  const subtotalRupees = subtotalAfterDiscountPaise / 100;
  const roundOffRupees = roundOffPaise / 100;
  const totalValueRupees = totalValuePaise / 100;

  return {
    grossWeightMg: safeGrossMg,
    grossWeightGrams,
    purityPercent: safePurity,
    fineWeightMg,
    fineWeightGrams,
    ratePerGramPaise: safeRatePaise,
    ratePerGramRupees,
    grossValuePaise,
    grossValueRupees,
    discountPaise: safeDiscountPaise,
    discountRupees,
    subtotalPaise: subtotalAfterDiscountPaise,
    subtotalRupees,
    roundOffPaise,
    roundOffRupees,
    totalValuePaise,
    totalValueRupees,
    formattedFineGrams: fineWeightGrams.toFixed(3) + ' g',
    formattedGrossValue: '₹' + grossValueRupees.toFixed(2),
    formattedSubtotal: '₹' + subtotalRupees.toFixed(2),
    formattedDiscount: '₹' + discountRupees.toFixed(2),
    formattedRoundOff: (roundOffRupees >= 0 ? '+' : '') + roundOffRupees.toFixed(2),
    formattedTotalValue: '₹' + totalValueRupees.toFixed(2),
  };
}


