// tests/currency.test.ts
// v7.7 AMOUNTTOWORDS-TESTS — Phase 2 gate requirement
// v7.9 FIX-V79-4 — max boundary corrected to 999999999 (₹99,99,999.99)
// v7.8 FIX-V78-2 — trim() regression test for exact-lakh boundary
//
// ALL 8 tests MUST PASS on real Android device before Phase 2 begins.
// Run: npx jest tests/currency.test.ts

import { amountToWords } from '../../utils/currency';

// ─── HAPPY PATH ────────────────────────────────────────────────────────────

test('whole rupees — no paise remainder', () => {
  expect(amountToWords(650000)).toBe('Rupees Six Thousand Five Hundred Only');
});

test('rupees and paise — non-zero remainder', () => {
  expect(amountToWords(650050)).toBe(
    'Rupees Six Thousand Five Hundred and Paise Fifty Only'
  );
});

test('zero amount', () => {
  expect(amountToWords(0)).toBe('Rupees Zero Only');
});

// v7.9 FIX-V79-4: max is 999999999 paise (₹99,99,999.99 = 9,999,999 rupees 99 paise)
// Previous incorrect value was 9999999999 (10 crore) — corrected to 9 digits
test('max valid amount — boundary must not throw', () => {
  expect(() => amountToWords(999999999)).not.toThrow();
});

// ─── ERROR GUARDS ──────────────────────────────────────────────────────────

test('negative input throws AMOUNT_NEGATIVE', () => {
  expect(() => amountToWords(-1)).toThrow('AMOUNT_NEGATIVE');
});

// v7.9 FIX-V79-4: first value above corrected max (1000000000 = ₹1,00,00,000.00 = 1 crore)
test('above max throws AMOUNT_TOO_LARGE', () => {
  expect(() => amountToWords(1000000000)).toThrow('AMOUNT_TOO_LARGE');
});

test('non-integer input throws AMOUNT_NOT_INTEGER', () => {
  expect(() => amountToWords(1.5)).toThrow('AMOUNT_NOT_INTEGER');
});

// v7.8 FIX-V78-2: trim() regression — exact lakh must have no trailing space before 'Only'
// Without .trim(), 'Rupees One Lakh  Only' (double space) was produced
test('exact lakh boundary — no trailing space before Only', () => {
  expect(amountToWords(10000000)).toBe('Rupees One Lakh Only');
});