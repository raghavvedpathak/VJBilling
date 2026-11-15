// utils/currency.ts — Phase 1 v7.47 (G67, FIX-V78-2, FIX-V742-7, FIX-V744-6) & Phase 2–4 Canonical Currency Utility

import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { ERR } from '@/constants/errorCodes';

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function threeDigitWords(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)] + ' Hundred');
    n = n % 100;
  }

  if (n >= 20) {
    const tensWord = TENS[Math.floor(n / 10)];
    const onesWord = ONES[n % 10];
    parts.push(onesWord ? tensWord + ' ' + onesWord : tensWord);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }

  return parts.join(' ');
}

export const MAX_AMOUNT_PAISE = 99_999_999_999; // v7.42 FIX-V742-7: ₹99,99,99,999.99

/**
 * Converts integer paise to Bhartiya denomination words.
 * Max limit: 99,999,999,999 paise (₹99,99,99,999.99 — FIX-V742-7)
 */
export function amountToWords(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`${ERR.AMOUNT_NOT_INTEGER}: paise must be an integer`);
  }
  if (paise < 0) {
    throw new Error(`${ERR.AMOUNT_NEGATIVE}: paise cannot be negative`);
  }
  if (paise > MAX_AMOUNT_PAISE) {
    throw new Error(`${ERR.AMOUNT_TOO_LARGE}: maximum is ₹99,99,99,999.99 (99999999999 paise)`);
  }

  if (paise === 0) {
    return 'Rupees Zero Only';
  }

  const rupees = Math.floor(paise / 100);
  const remainingPaise = paise % 100;

  const parts: string[] = [];

  if (rupees > 0) {
    let r = rupees;

    if (r >= 10000000) {
      parts.push(threeDigitWords(Math.floor(r / 10000000)) + ' Crore');
      r = r % 10000000;
    }

    if (r >= 100000) {
      parts.push(threeDigitWords(Math.floor(r / 100000)) + ' Lakh');
      r = r % 100000;
    }

    if (r >= 1000) {
      parts.push(threeDigitWords(Math.floor(r / 1000)) + ' Thousand');
      r = r % 1000;
    }

    if (r > 0) {
      parts.push(threeDigitWords(r));
    }
  }

  // v7.8 FIX-V78-2: .trim() prevents trailing space when rupees === 0 (paise-only amounts)
  const rupeeWords = ('Rupees ' + parts.join(' ')).trim();

  if (remainingPaise > 0) {
    const paiseWords = threeDigitWords(remainingPaise);
    return `${rupeeWords} and Paise ${paiseWords} Only`;
  }

  return `${rupeeWords} Only`;
}

export function getCurrencySymbol(): string {
  const symbol = appSettingsStore.getState()?.currencySymbol;
  if (!symbol || symbol === '$' || symbol === 'USD') {
    return '\u20B9';
  }
  return symbol;
}

export function rupeesToPaise(rupees: number | string | null | undefined): number | null {
  if (rupees === null || rupees === undefined) return null;
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

export function paiseToRupees(paise: number | null | undefined): number {
  if (paise === null || paise === undefined || isNaN(paise)) return 0;
  return paise / 100;
}

export function formatRupees(paise: number | null | undefined): string {
  const symbol = getCurrencySymbol();
  if (paise === null || paise === undefined || isNaN(paise)) return `${symbol}0.00`;
  return symbol + (paise / 100).toFixed(2);
}

export const formatPaiseToRupees = formatRupees;
