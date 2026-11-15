// utils/validatePincode.ts — v7.0 G70 + v7.44 FIX-V744-6 Canonical Implementation
import { ERR } from '@/constants/errorCodes';

export function validatePincode(pincode: string): void {
  if (!pincode || pincode.trim().length === 0) {
    throw new Error(ERR.INVALID_PINCODE + ': pincode is required');
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    throw new Error(ERR.INVALID_PINCODE + ': must be exactly 6 digits, numeric only');
  }
}
