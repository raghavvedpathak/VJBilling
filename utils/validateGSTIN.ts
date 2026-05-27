// v7.0 G70 Canonical Implementation
import { VALID_STATE_CODE_SET } from './indianStates';

export function verifyGSTINChecksum(gstin: string): boolean {
  const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  
  for (let i = 0; i < 14; i++) {
    let val = CHARSET.indexOf(gstin[i]);
    if (val === -1) return false;
    
    if ((i + 1) % 2 === 0) { // even position (1-indexed)
      val = val * 2;
      if (val >= 36) val -= 35;
    }
    sum += val;
  }
  
  const expectedVal = (36 - (sum % 36)) % 36;
  return CHARSET.indexOf(gstin[14]) === expectedVal;
}

export function validateGSTIN(gstin?: string | null): void {
  // Unregistered firms leave GSTIN empty (Bill of Supply)
  if (!gstin || gstin.trim() === '') return;
  
  if (gstin.length !== 15) {
    throw new Error('INVALID_GSTIN: must be exactly 15 chars');
  }
  
  const upper = gstin.toUpperCase();
  
  // v7.0 FIX: Single source of truth from indianStates.ts
  const stateCode = upper.slice(0, 2);
  if (!VALID_STATE_CODE_SET.has(stateCode)) {
    throw new Error('INVALID_GSTIN: invalid state code');
  }
  
  // Check PAN segment (Chars 3-12: 5 Letters, 4 Numbers, 1 Letter)
  const panSegment = upper.slice(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panSegment)) {
    throw new Error('INVALID_GSTIN: invalid PAN segment');
  }

  // Check Entity Code (Char 13: 1-9 or A-Z)
  if (!/^[1-9A-Z]{1}$/.test(upper[12])) {
     throw new Error('INVALID_GSTIN: invalid entity code');
  }
  
  // Check 'Z' constraint (Char 14 must be Z)
  if (upper[13] !== 'Z') {
    throw new Error('INVALID_GSTIN: character 14 must be Z');
  }
  
  if (!verifyGSTINChecksum(upper)) {
    throw new Error('INVALID_GSTIN: checksum mismatch');
  }
}