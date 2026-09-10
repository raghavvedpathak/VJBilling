// tests/utils/sanitize.test.ts
// Unit Test Suite for Text Sanitization (GAP-P1ALIGN-4 / FIX-SEC-CODEQL-1)

import { sanitizeText, sanitizeOptionalText } from '@/utils/sanitize';
import { ERR } from '@/constants/errorCodes';

describe('sanitizeText', () => {
  it('preserves clean alphanumeric text and normal punctuation', () => {
    expect(sanitizeText('Vijay Jewellers')).toBe('Vijay Jewellers');
    expect(sanitizeText('Gold Ring 22K (Hallmarked)')).toBe('Gold Ring 22K (Hallmarked)');
    expect(sanitizeText('Rate: Rs. 65,000/10g; Total: Rs. 1,30,000.')).toBe('Rate: Rs. 65,000/10g; Total: Rs. 1,30,000.');
  });

  it('strips standard HTML tags', () => {
    expect(sanitizeText('<b>Gold Bangles</b>')).toBe('Gold Bangles');
    expect(sanitizeText('Hello <script>alert(1)</script> World')).toBe('Hello alert(1) World');
    expect(sanitizeText('<span style="color:red">Item</span>')).toBe('Item');
  });

  it('mitigates nested HTML tag injection bypasses (CodeQL js/incomplete-multi-character-sanitization)', () => {
    // Multi-level and nested tags are neutralized with all HTML markup stripped:
    expect(sanitizeText('<b><b>nested bold</b></b>')).toBe('nested bold');
    expect(sanitizeText('<div <div>>nested</div>')).toBe('nested');
    expect(sanitizeText('<scr<script>ipt>hello</script>')).toBe('ipthello');
    expect(sanitizeText('<<script>script>alert(1)</script>')).toBe('scriptalert(1)');
  });

  it('neutralizes residual unclosed angle brackets', () => {
    expect(sanitizeText('<script src="evil.js"')).toBe('script src="evil.js"');
    expect(sanitizeText('Price > 5000 and < 10000')).toBe('Price  5000 and  10000');
  });

  it('strips ASCII control characters', () => {
    // ASCII control chars 0x01, 0x08, 0x1F
    const dirty = 'Gold\x01\x08Ring\x1F';
    expect(sanitizeText(dirty)).toBe('GoldRing');
  });

  it('handles multiline option correctly', () => {
    const textWithNewlines = 'Line 1\nLine 2\r\nLine 3\tTabbed';
    // Without allowNewlines: newlines stripped
    expect(sanitizeText(textWithNewlines, { allowNewlines: false })).toBe('Line 1Line 2Line 3Tabbed');
    // With allowNewlines: newlines and tabs preserved
    expect(sanitizeText(textWithNewlines, { allowNewlines: true })).toBe('Line 1\nLine 2\r\nLine 3\tTabbed');
  });

  it('throws INVALID_TEXT_CONTENT if input reduces to empty after sanitization', () => {
    expect(() => sanitizeText('<script></script>')).toThrow(ERR.INVALID_TEXT_CONTENT);
    expect(() => sanitizeText('   <p></p>   ')).toThrow(ERR.INVALID_TEXT_CONTENT);
    expect(() => sanitizeText('\x00\x01\x02')).toThrow(ERR.INVALID_TEXT_CONTENT);
  });

  it('throws INVALID_TEXT_CONTENT if input is not a string', () => {
    // @ts-expect-error Testing runtime guard against non-string input
    expect(() => sanitizeText(12345)).toThrow(ERR.INVALID_TEXT_CONTENT);
    // @ts-expect-error Testing runtime guard against non-string input
    expect(() => sanitizeText(null)).toThrow(ERR.INVALID_TEXT_CONTENT);
  });
});

describe('sanitizeOptionalText', () => {
  it('returns null for null, undefined, or empty string', () => {
    expect(sanitizeOptionalText(null)).toBeNull();
    expect(sanitizeOptionalText(undefined)).toBeNull();
    expect(sanitizeOptionalText('')).toBeNull();
    expect(sanitizeOptionalText('   ')).toBeNull();
  });

  it('returns sanitized string when input has valid content', () => {
    expect(sanitizeOptionalText('<b>Customer Notes</b>')).toBe('Customer Notes');
    expect(sanitizeOptionalText('Special discount applied')).toBe('Special discount applied');
  });

  it('returns null if input strips to empty', () => {
    expect(sanitizeOptionalText('<br>')).toBeNull();
  });
});
