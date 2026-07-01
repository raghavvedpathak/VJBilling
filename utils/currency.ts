// utils/currency.ts
// v7.6 G67-AMOUNTTOWORDS — Canonical Implementation
// v7.8 FIX-V78-2 — .trim() trailing-space fix
// v7.9 FIX-V79-4 — max guard corrected: 9999999999 → 999999999 (₹99,99,999.99 = 999,999,999 paise)
//
// INPUT: Integer paise. Callers MUST NOT pre-divide. Pass raw paise value.
// OUTPUT: Indian denomination words string. Always ends with "Only".
// CALLERS: Phase 2 URD bill (URD-AMOUNT-WORDS v1.54), Phase 3 receipts.
//
// GUARDS:
//   AMOUNT_NOT_INTEGER — input is not a safe integer
//   AMOUNT_NEGATIVE    — input < 0
//   AMOUNT_TOO_LARGE   — input > 999999999 (max ₹99,99,999.99)

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

/**
 * Converts a number 1–999 to English words.
 * Returns '' for 0.
 */
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

/**
 * Converts integer paise to Indian denomination words.
 *
 * Denomination grouping: Crore → Lakh → Thousand → Hundred (NOT million/billion).
 * Rupees/Paise split at 100 boundary.
 * "Only" suffix always appended.
 * Zero paise remainder suppressed.
 * Non-zero paise remainder: "and Paise [words] Only".
 *
 * @param paise - Integer paise value (1 rupee = 100 paise). Always pass raw integer.
 * @throws AMOUNT_NOT_INTEGER if paise is not a safe integer
 * @throws AMOUNT_NEGATIVE if paise < 0
 * @throws AMOUNT_TOO_LARGE if paise > 999999999 (₹99,99,999.99)
 */
export function amountToWords(paise: number): string {
  // --- GUARDS ---
  if (!Number.isInteger(paise)) {
    throw new Error('AMOUNT_NOT_INTEGER: paise must be an integer');
  }
  if (paise < 0) {
    throw new Error('AMOUNT_NEGATIVE: paise cannot be negative');
  }
  // v7.9 FIX-V79-4: max is 999999999 (₹99,99,999.99 = 9,999,999 rupees + 99 paise)
  if (paise > 999999999) {
    throw new Error('AMOUNT_TOO_LARGE: maximum is ₹99,99,999.99 (999999999 paise)');
  }

  // --- ZERO CASE ---
  if (paise === 0) {
    return 'Rupees Zero Only';
  }

  // --- SPLIT RUPEES AND PAISE ---
  const rupees = Math.floor(paise / 100);
  const remainingPaise = paise % 100;

  // --- RUPEE WORDS (Indian grouping: Crore → Lakh → Thousand → Hundred) ---
  const parts: string[] = [];

  if (rupees > 0) {
    let r = rupees;

    // Crore (1,00,00,000)
    if (r >= 10000000) {
      parts.push(threeDigitWords(Math.floor(r / 10000000)) + ' Crore');
      r = r % 10000000;
    }

    // Lakh (1,00,000)
    if (r >= 100000) {
      parts.push(threeDigitWords(Math.floor(r / 100000)) + ' Lakh');
      r = r % 100000;
    }

    // Thousand (1,000)
    if (r >= 1000) {
      parts.push(threeDigitWords(Math.floor(r / 1000)) + ' Thousand');
      r = r % 1000;
    }

    // Remainder (1–999)
    if (r > 0) {
      parts.push(threeDigitWords(r));
    }
  }

  // v7.8 FIX-V78-2: .trim() removes trailing space when parts ends with an
  // exact denomination multiple (e.g. "One Lakh ") before "Only" is appended.
  const rupeeWords = ('Rupees ' + parts.join(' ')).trim();

  // --- PAISE WORDS ---
  if (remainingPaise > 0) {
    const paiseWords = threeDigitWords(remainingPaise);
    return `${rupeeWords} and Paise ${paiseWords} Only`;
  }

  return `${rupeeWords} Only`;
}

import { appSettingsStore } from '../store/appSettingsStore';

export function getCurrencySymbol(): string {
  return appSettingsStore.getState().currencySymbol ?? '\u20B9';
}