// utils/validateIFSC.ts — Indian Financial System Code (IFSC) Validator
// Standard RBI IFSC Format: 11 characters
// - First 4 characters: Alphabetic (Bank Code, e.g., 'SBIN', 'HDFC')
// - 5th character: '0' (Reserved for future use)
// - Last 6 characters: Alphanumeric (Branch Code, e.g., '001234', '000001')

import { ERR } from '@/constants/errorCodes';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Validates an Indian Bank IFSC code.
 * Throws IFSC_REQUIRED if empty.
 * Throws IFSC_INVALID if not conforming to 11-char uppercase alphanumeric format.
 * Returns normalized uppercase IFSC string on success.
 */
export function validateIFSC(ifsc: string | null | undefined): string {
  if (!ifsc || typeof ifsc !== 'string' || !ifsc.trim()) {
    throw new Error(ERR.IFSC_REQUIRED);
  }

  const normalized = ifsc.trim().toUpperCase();

  if (normalized.length !== 11 || !IFSC_REGEX.test(normalized)) {
    throw new Error(ERR.IFSC_INVALID);
  }

  return normalized;
}
