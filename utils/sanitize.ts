// utils/sanitize.ts — Phase 2 v2.24 Canonical Text Sanitization
// GAP-P1ALIGN-4 (v1.74)

import { ERR } from '@/constants/errorCodes';

export interface SanitizeOptions {
  allowNewlines?: boolean;
}

/**
 * Strips HTML tags and ASCII control characters from free-text service inputs before persistence.
 * Throws INVALID_TEXT_CONTENT if input is not a string or if sanitization strips all characters.
 */
export function sanitizeText(input: string, options: SanitizeOptions = {}): string {
  if (typeof input !== 'string') {
    throw new Error(`${ERR.INVALID_TEXT_CONTENT}: input must be a string`);
  }

  // Preserve \t (0x09), \n (0x0A), \r (0x0D) if multiline is allowed
  const controlCharRegex = options.allowNewlines
    ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
    : /[\x00-\x1F\x7F]/g;

  const stripped = input
    .replace(/<[^>]*>/g, '')         // Strip HTML tags
    .replace(controlCharRegex, '')   // Strip ASCII control characters
    .trim();

  if (stripped.length === 0 && input.trim().length > 0) {
    throw new Error(`${ERR.INVALID_TEXT_CONTENT}: input reduced to empty after sanitization`);
  }

  return stripped;
}

/**
 * Convenience helper for optional/nullable fields (notes, descriptions, remarks).
 * Returns null if input is null, undefined, or empty after sanitization.
 */
export function sanitizeOptionalText(
  input?: string | null,
  options: SanitizeOptions = {}
): string | null {
  if (!input || typeof input !== 'string') return null;
  const sanitized = sanitizeText(input, options);
  return sanitized.length > 0 ? sanitized : null;
}