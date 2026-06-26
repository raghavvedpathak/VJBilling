import { validateGSTIN } from '../../utils/validateGSTIN';

/**
 * GSTIN LUHN MOD-36 ALGORITHM - WORKED EXAMPLE (AUDITABLE REFERENCE)
 * Mandated by Phase 1 Contract - Step R (Review Item 9)
 *
 * Character set: "0-9" (0-9), "A-Z" (10-35).
 * Rule: 1-indexed positions 1-14. Even positions (2, 4, 6...14) multiply value by 2.
 * Reduction: If result >= 36, subtract 35 (equivalent to quotient + remainder in base 36).
 *
 * Test Vector: 27AAPFU0939F1ZV
 *
 * | Pos (1-idx) | Char | Base Value | Multiplier | Product | Reduced (if >=36, -35) |
 * |-------------|------|------------|------------|---------|------------------------|
 * | 1 (Odd)     | 2    | 2          | x1         | 2       | 2                      |
 * | 2 (Even)    | 7    | 7          | x2         | 14      | 14                     |
 * | 3 (Odd)     | A    | 10         | x1         | 10      | 10                     |
 * | 4 (Even)    | A    | 10         | x2         | 20      | 20                     |
 * | 5 (Odd)     | P    | 25         | x1         | 25      | 25                     |
 * | 6 (Even)    | F    | 15         | x2         | 30      | 30                     |
 * | 7 (Odd)     | U    | 30         | x1         | 30      | 30                     |
 * | 8 (Even)    | 0    | 0          | x2         | 0       | 0                      |
 * | 9 (Odd)     | 9    | 9          | x1         | 9       | 9                      |
 * | 10 (Even)   | 3    | 3          | x2         | 6       | 6                      |
 * | 11 (Odd)    | 9    | 9          | x1         | 9       | 9                      |
 * | 12 (Even)   | F    | 15         | x2         | 30      | 30                     |
 * | 13 (Odd)    | 1    | 1          | x1         | 1       | 1                      |
 * | 14 (Even)   | Z    | 35         | x2         | 70      | 35                     |
 *
 * Sum = 2+14+10+20+25+30+30+0+9+6+9+30+1+35 = 221.
 * Modulo Math: 221 mod 36 = 5.
 * Expected Check Digit Index = (36 - 5) mod 36 = 31.
 * Char at index 31 = "V".
 * Character 15 is V -> ✓ VALID.
 */

describe('validateGSTIN', () => {
  it('passes a known-valid GSTIN vector (27AAPFU0939F1ZV)', () => {
    expect(() => validateGSTIN('27AAPFU0939F1ZV')).not.toThrow();
  });

  it('throws INVALID_GSTIN: checksum mismatch for mutated last character', () => {
    // Changed 'V' to 'X'
    expect(() => validateGSTIN('27AAPFU0939F1ZX')).toThrow('INVALID_GSTIN: checksum mismatch');
  });

  it('throws INVALID_GSTIN: must be exactly 15 chars', () => {
    expect(() => validateGSTIN('27AAPFU0939F1Z')).toThrow('INVALID_GSTIN: must be exactly 15 chars');
    expect(() => validateGSTIN('27AAPFU0939F1ZVA')).toThrow('INVALID_GSTIN: must be exactly 15 chars');
  });

  it('throws INVALID_GSTIN: invalid state code', () => {
    // FIX: '99' IS a valid state code ('Centre Jurisdiction') in INDIAN_STATES —
    // using it here would NOT throw and the test would fail.
    // '25' was Daman & Diu (merged into code 26 in 2020) and is NOT present
    // in VALID_STATE_CODE_SET — this is the correct input for this test.
    expect(() => validateGSTIN('25AAPFU0939F1ZV')).toThrow('INVALID_GSTIN: invalid state code');
  });

  it('throws INVALID_GSTIN: invalid PAN segment', () => {
    // PAN must match [A-Z]{5}[0-9]{4}[A-Z]{1}. Mutating to AAPF00939F (digit in pos 5).
    expect(() => validateGSTIN('27AAPF00939F1ZV')).toThrow('INVALID_GSTIN: invalid PAN segment');
  });

  it('throws INVALID_GSTIN: character 14 must be Z', () => {
    // Mutating 14th char 'Z' to 'Y'
    expect(() => validateGSTIN('27AAPFU0939F1YV')).toThrow('INVALID_GSTIN: character 14 must be Z');
  });
});
