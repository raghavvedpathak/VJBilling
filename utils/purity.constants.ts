import { ERR } from '../constants/errorCodes';

export const PURITY_MAP: Record<number, number> = {
  24: 99.9, 23: 95.8, 22: 91.6, 21: 87.5,
  20: 83.3, 18: 75.0, 14: 58.3, 10: 41.7, 9: 37.5,
};

export const PURITY_ROUND_TO_100: Record<'GOLD' | 'SILVER', number[]> = {
  GOLD: [99.50, 99.9, 99.99],
  SILVER: [99.9],
};

export function resolveFineWeightMg(netWeightMg: number, purityPercent: number, metal: 'GOLD' | 'SILVER'): { fineWeightMg: number; purityRoundingDeltaMg: number } {
  const trueFineWeightMg = Math.round(netWeightMg * purityPercent / 100);
  const isRounded = PURITY_ROUND_TO_100[metal].includes(purityPercent);
  if (!isRounded) return { fineWeightMg: trueFineWeightMg, purityRoundingDeltaMg: 0 };
  return { fineWeightMg: netWeightMg, purityRoundingDeltaMg: netWeightMg - trueFineWeightMg };
}

export const PURITY_PERCENT_EXTENDED: Record<number, number> = {
  99.99: 24, // 4-nine fine gold — investment grade, BIS 9999
  99.50: 24, // BIS 995 — hallmarked 24K fine gold
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

export function getDisplayPurity(purityPercent: number, purityKarat: number | null, metal: 'GOLD' | 'SILVER'): string {
  if (metal === "GOLD" && purityKarat !== null && purityKarat > 0) return `${purityKarat}K`;
  return `${purityPercent}%`;
}
