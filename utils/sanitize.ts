// utils/sanitize.ts — Phase 2 v2.11 Canonical Text Sanitization

import { ERR } from '../constants/errorCodes';

/**
 * Strips HTML tags and ASCII control characters from free-text service inputs before persistence.
 * Throws INVALID_TEXT_CONTENT if input is not a string or if sanitization strips all characters.
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') {
    throw new Error(ERR.INVALID_TEXT_CONTENT + ': input must be a string');
  }

  const stripped = input
    .replace(/<[^>]*>/g, '')         // Strip HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Strip ASCII control characters
    .trim();

  if (stripped.length === 0 && input.trim().length > 0) {
    throw new Error(ERR.INVALID_TEXT_CONTENT + ': input reduced to empty after sanitization');
  }

  return stripped;
}