// utils/purity.constants.ts — Phase 2 v2.11 Canonical Purity & Math Utilities

import { ERR } from '../constants/errorCodes';

// PURITY MAP (Step 6.1)
export const PURITY_MAP: Record<number, number> = {
  24: 99.9,
  23: 95.8,
  22: 91.6,
  21: 87.5,
  20: 83.3,
  18: 75.0,
  14: 58.3,
  10: 41.7,
  9: 37.5,
};

// Reference lists for informational UI display ONLY (v1.94 FEAT-SILVER-PURITY-GRADES-1)
export const SILVER_PURITY_GRADES: number[] = [80.0, 83.5, 92.5, 95.8, 97.0, 99.0, 99.9]; // BIS IS 2112:2025
export const GOLD_PURITY_GRADES: number[] = Object.values(PURITY_MAP);

export interface PurityPreset {
  id: string;
  label: string;
  val: string;
  karat: number | null;
  metal: 'GOLD' | 'SILVER';
}

export const GOLD_PURITY_PRESETS: PurityPreset[] = [
  { id: 'gold_24k_9999', label: '24K (99.99%)', val: '99.99', karat: 24, metal: 'GOLD' },
  { id: 'gold_24k_999', label: '24K (99.9%)', val: '99.9', karat: 24, metal: 'GOLD' },
  { id: 'gold_24ks_995', label: '24KS (99.5%)', val: '99.50', karat: 24, metal: 'GOLD' },
  { id: 'gold_23k_958', label: '23K (95.8%)', val: '95.8', karat: 23, metal: 'GOLD' },
  { id: 'gold_22k_916', label: '22K (91.6%)', val: '91.6', karat: 22, metal: 'GOLD' },
  { id: 'gold_21k_875', label: '21K (87.5%)', val: '87.5', karat: 21, metal: 'GOLD' },
  { id: 'gold_20k_833', label: '20K (83.3%)', val: '83.3', karat: 20, metal: 'GOLD' },
  { id: 'gold_18k_750', label: '18K (75%)', val: '75.0', karat: 18, metal: 'GOLD' },
  { id: 'gold_14k_583', label: '14K (58.3%)', val: '58.3', karat: 14, metal: 'GOLD' },
  { id: 'gold_10k_417', label: '10K (41.7%)', val: '41.7', karat: 10, metal: 'GOLD' },
  { id: 'gold_9k_375', label: '9K (37.5%)', val: '37.5', karat: 9, metal: 'GOLD' },
];

export const SILVER_PURITY_PRESETS: PurityPreset[] = [
  { id: 'silver_999', label: '99.9% Fine', val: '99.9', karat: null, metal: 'SILVER' },
  { id: 'silver_990', label: '99.0%', val: '99.0', karat: null, metal: 'SILVER' },
  { id: 'silver_970', label: '97.0%', val: '97.0', karat: null, metal: 'SILVER' },
  { id: 'silver_958', label: '95.8% Britannia', val: '95.8', karat: null, metal: 'SILVER' },
  { id: 'silver_925', label: '92.5% Sterling', val: '92.5', karat: null, metal: 'SILVER' },
  { id: 'silver_835', label: '83.5%', val: '83.5', karat: null, metal: 'SILVER' },
  { id: 'silver_800', label: '80.0%', val: '80.0', karat: null, metal: 'SILVER' },
];

export const PURITY_PRESETS: Record<'GOLD' | 'SILVER', PurityPreset[]> = {
  GOLD: GOLD_PURITY_PRESETS,
  SILVER: SILVER_PURITY_PRESETS,
};

export function getPurityPresets(metal: 'GOLD' | 'SILVER' = 'GOLD'): PurityPreset[] {
  return PURITY_PRESETS[metal] || GOLD_PURITY_PRESETS;
}

export function getPurityPresetById(id: string): PurityPreset | undefined {
  return [...GOLD_PURITY_PRESETS, ...SILVER_PURITY_PRESETS].find(p => p.id === id);
}

export function isStandardPurityGrade(purityPercent: number, metal: 'GOLD' | 'SILVER'): boolean {
  const grades = metal === 'SILVER' ? SILVER_PURITY_GRADES : GOLD_PURITY_GRADES;
  return grades.some(g => Math.abs(g - purityPercent) <= 0.01);
}

// FEAT-PURITY-ROUND-1 (v1.90/v1.91): Regular stock & MELT_OUTPUT old gold trade rounding
export const PURITY_ROUND_TO_100: Record<'GOLD' | 'SILVER', number[]> = {
  GOLD: [99.50, 99.9, 99.99],
  SILVER: [99.9],
};

// SOLE fine-weight entry point for regular stock (Step 6.1)
export function resolveFineWeightMg(
  netWeightMg: number,
  purityPercent: number,
  metal: 'GOLD' | 'SILVER'
): { fineWeightMg: number; purityRoundingDeltaMg: number } {
  const trueFineWeightMg = Math.round((netWeightMg * purityPercent) / 100);
  const isRounded = PURITY_ROUND_TO_100[metal].some(target => Math.abs(target - purityPercent) < 0.01);
  if (!isRounded) return { fineWeightMg: trueFineWeightMg, purityRoundingDeltaMg: 0 };
  return { fineWeightMg: netWeightMg, purityRoundingDeltaMg: netWeightMg - trueFineWeightMg };
}

// FIX-24K-PURITY-1 (v1.57) Extended reverse lookup
export const PURITY_PERCENT_EXTENDED: Record<number, number> = {
  99.99: 24, // 4-nine fine
  99.50: 24, // BIS 995
};

export function karatToPercent(karat: number): number {
  const pct = PURITY_MAP[karat];
  if (pct === undefined) throw new Error(`${ERR.INVALID_KARAT}: ${karat}`);
  return pct;
}

export function percentToKarat(percent: number): number | null {
  if (PURITY_PERCENT_EXTENDED[percent] !== undefined) return PURITY_PERCENT_EXTENDED[percent];
  for (const [k, v] of Object.entries(PURITY_MAP)) {
    if (Math.abs(v - percent) < 0.05) return Number(k);
  }
  return null;
}

// UI DISPLAY LAYER ONLY — getDisplayPurity() (Step 6.1)
export function getDisplayPurity(
  purityPercent?: number | null,
  purityKarat?: number | null,
  metal: 'GOLD' | 'SILVER' = 'GOLD'
): string {
  const safePercent = purityPercent != null && !isNaN(Number(purityPercent)) ? Number(purityPercent) : 0;
  const resolvedKarat = (purityKarat != null && purityKarat > 0)
    ? purityKarat
    : (metal === 'GOLD' ? percentToKarat(safePercent) : null);

  if (metal === 'GOLD' && resolvedKarat && resolvedKarat > 0) {
    return `${resolvedKarat}K`;
  }
  return `${safePercent}%`;
}

// FEAT-EFFECTIVE-PRICE-1 (v2.00) & FIX-EFFPRICE-FORMULA-1 (v2.03) — UI DISPLAY ONLY
export function computeEffectivePricePerGram(
  ratePerGram: number,
  purityPercent: number,
  wastagePercent: number
): number {
  return ratePerGram * ((purityPercent + wastagePercent) / 100);
}

export function computeEffectivePricePaisePerGram(
  purchaseRatePaise: number,
  purityPercent: number,
  wastagePercent: number
): number {
  return Math.round(purchaseRatePaise * ((purityPercent + wastagePercent) / 100));
}

export function computeEstTotalCostPaise(
  effectivePricePaisePerGram: number,
  netWeightMg: number
): number {
  return Math.round(effectivePricePaisePerGram * (netWeightMg / 1000));
}

// FIX-WAST-CENTRALIZE-1 (v2.04) & FIX-WAST-NETBASIS-1 (v2.04) — Supplier Cost Truth
export function computeFineGoldChargedMg(
  netWeightMg: number,
  purityPercent: number,
  wastagePercent: number
): number | null {
  if (wastagePercent <= 0) return null;
  return Math.round(netWeightMg * ((purityPercent + wastagePercent) / 100));
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

// --- WEIGHT FORMULAS & CONVERSIONS (RULE-1A-WEIGHT-DISPLAY v1.54) ---
export function formatWeightMg(mg: number | null | undefined): string {
  if (mg === null || mg === undefined || isNaN(mg)) return '0.000 g';
  return (mg / 1000).toFixed(3) + ' g';
}

export function formatWeightGrams(grams: number | null | undefined): string {
  if (grams === null || grams === undefined || isNaN(grams)) return '0.000 g';
  return grams.toFixed(3) + ' g';
}

export function parseCleanFloat(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') return isNaN(input) ? 0 : input;
  const cleaned = input.toString().replace(/,/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

export function mgToGrams(mg: number): number {
  return mg / 1000;
}

export function gramsToMg(grams: number): number {
  return Math.round(grams * 1000);
}

export function computeNetWeightMg(
  grossWeightMg: number,
  stoneWeightMg: number = 0,
  beadsWeightMg: number = 0
): number {
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

export function computeGemstoneTotalPaise(
  weightCaratX100: number,
  purchaseRatePaisePerCarat: number | null | undefined
): number | null {
  if (purchaseRatePaisePerCarat === null || purchaseRatePaisePerCarat === undefined) return null;
  return Math.round((weightCaratX100 / 100) * purchaseRatePaisePerCarat);
}

// --- CENTRAL URD PURCHASE FORMULAS ---
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
  adjustmentPaise: number;
  adjustmentRupees: number;
  discountPaise: number;
  discountRupees: number;
  subtotalPaise: number;
  subtotalRupees: number;
  roundOffPaise: number;
  roundOffRupees: number;
  totalValuePaise: number;
  totalValueRupees: number;
  formattedFineGrams: string;
}

export function computeURDFineWeightMg(grossWeightMg: number, purityPercent: number): number {
  const safeGrossMg = Math.max(0, grossWeightMg || 0);
  const safePurity = Math.max(0, Math.min(100, purityPercent || 0));
  return Math.round(safeGrossMg * (safePurity / 100));
}

export function computeURDTotalValuePaise(
  fineWeightMg: number,
  ratePerGramPaise: number,
  adjustmentPaise: number = 0
): number {
  const safeFineMg = Math.max(0, fineWeightMg || 0);
  const safeRatePaise = Math.max(0, ratePerGramPaise || 0);
  const safeAdjustmentPaise = adjustmentPaise || 0;
  const grossValuePaise = Math.round((safeFineMg / 1000) * safeRatePaise);
  const subtotalPaise = Math.max(0, grossValuePaise + safeAdjustmentPaise);
  return Math.round(subtotalPaise / 100) * 100;
}

export function computeURDCostBreakdown(
  grossWeightMg: number,
  purityPercent: number,
  ratePerGramPaise: number,
  adjustmentPaise: number = 0
): URDCostBreakdown {
  const safeGrossMg = Math.max(0, grossWeightMg || 0);
  const safePurity = Math.max(0, Math.min(100, purityPercent || 0));
  const safeRatePaise = Math.max(0, ratePerGramPaise || 0);
  const safeAdjustmentPaise = adjustmentPaise || 0;

  const fineWeightMg = computeURDFineWeightMg(safeGrossMg, safePurity);
  const grossValuePaise = Math.round((fineWeightMg / 1000) * safeRatePaise);
  const subtotalAfterAdjustmentPaise = Math.max(0, grossValuePaise + safeAdjustmentPaise);
  
  // Round to nearest rupee (100 paise)
  const totalValuePaise = Math.round(subtotalAfterAdjustmentPaise / 100) * 100;
  const roundOffPaise = totalValuePaise - subtotalAfterAdjustmentPaise;

  const grossWeightGrams = safeGrossMg / 1000;
  const fineWeightGrams = fineWeightMg / 1000;
  const ratePerGramRupees = safeRatePaise / 100;
  const grossValueRupees = grossValuePaise / 100;
  const adjustmentRupees = safeAdjustmentPaise / 100;
  const discountPaise = -safeAdjustmentPaise;
  const discountRupees = discountPaise / 100;
  const subtotalRupees = subtotalAfterAdjustmentPaise / 100;
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
    adjustmentPaise: safeAdjustmentPaise,
    adjustmentRupees,
    discountPaise,
    discountRupees,
    subtotalPaise: subtotalAfterAdjustmentPaise,
    subtotalRupees,
    roundOffPaise,
    roundOffRupees,
    totalValuePaise,
    totalValueRupees,
    formattedFineGrams: (fineWeightGrams).toFixed(3) + ' g',
  };
}


