// v7.0 G70 Canonical Implementation
import { VALID_STATE_CODE_SET } from './indianStates';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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

export function validateGSTIN(gstin: string): void {
  if (!gstin || gstin.length !== 15) {
    throw new Error('INVALID_GSTIN: must be exactly 15 chars');
  }
  
  const upper = gstin.toUpperCase();
  
  if (!VALID_STATE_CODE_SET.has(upper.slice(0, 2))) {
    throw new Error('INVALID_GSTIN: invalid state code');
  }

  const panSegment = upper.slice(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panSegment)) {
    throw new Error('INVALID_GSTIN: invalid PAN segment');
  }

  if (upper[13] !== 'Z') {
    throw new Error('INVALID_GSTIN: character 14 must be Z');
  }
  
  if (!GSTIN_PATTERN.test(upper)) {
    throw new Error('INVALID_GSTIN: format mismatch');
  }
  
  if (!verifyGSTINChecksum(upper)) {
    throw new Error('INVALID_GSTIN: checksum mismatch');
  }
}