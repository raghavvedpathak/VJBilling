// tests/currency.test.ts
// v7.7 AMOUNTTOWORDS-TESTS — Phase 2 gate requirement
// v7.42 FIX-V742-7 / v7.44 FIX-V744-9 — max boundary raised to 99999999999 (₹99,99,99,999.99)
// v7.8 FIX-V78-2 — trim() regression test for exact-lakh boundary

import { amountToWords } from '@/utils/currency';

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

test('paise only (rupees === 0) returns correct wording without Rupees prefix', () => {
  expect(amountToWords(50)).toBe('Paise Fifty Only');
  expect(amountToWords(1)).toBe('Paise One Only');
  expect(amountToWords(99)).toBe('Paise Ninety Nine Only');
});

test('sub-crore boundary (999999999 paise) must not throw', () => {
  expect(() => amountToWords(999999999)).not.toThrow();
});

// v7.42 FIX-V742-7 / v7.44 FIX-V744-9: max is 99999999999 paise (₹99,99,99,999.99)
test('max valid amount (99999999999 paise) — boundary must not throw', () => {
  expect(amountToWords(99999999999)).toBe(
    'Rupees Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Paise Ninety Nine Only'
  );
});

// ─── ERROR GUARDS ──────────────────────────────────────────────────────────

test('negative input throws AMOUNT_NEGATIVE', () => {
  expect(() => amountToWords(-1)).toThrow('AMOUNT_NEGATIVE');
});

// v7.42 FIX-V742-7: first value above corrected max (100000000000 = ₹1,00,00,00,000.00 = 100 crore)
test('above max throws AMOUNT_TOO_LARGE', () => {
  expect(() => amountToWords(100000000000)).toThrow('AMOUNT_TOO_LARGE');
});

test('non-integer input throws AMOUNT_NOT_INTEGER', () => {
  expect(() => amountToWords(1.5)).toThrow('AMOUNT_NOT_INTEGER');
});

// v7.8 FIX-V78-2: trim() regression — exact lakh must have no trailing space before 'Only'
test('exact lakh boundary — no trailing space before Only', () => {
  expect(amountToWords(10000000)).toBe('Rupees One Lakh Only');
});
