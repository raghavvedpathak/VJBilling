// utils/validateGSTIN.ts — v7.0 G70 Canonical Implementation with Smart GSTIN Formatting & Dynamic Keyboard Switching

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

/**
 * Smart formatting and input masking for GSTIN (15 characters):
 * Pos 0-1: 2 digits (State Code)
 * Pos 2-6: 5 letters (PAN alphabet)
 * Pos 7-10: 4 digits (PAN numbers)
 * Pos 11: 1 letter (PAN letter)
 * Pos 12: 1 alphanumeric (entity code)
 * Pos 13: 'Z' (default statutory GST character)
 * Pos 14: 1 alphanumeric (checksum)
 */
export function formatGSTINInput(input: string): string {
  if (!input) return '';
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let result = '';
  
  for (let i = 0; i < cleaned.length && result.length < 15; i++) {
    const char = cleaned[i];
    const pos = result.length;
    
    // Pos 0, 1: Must be digits (State code e.g. 27)
    if (pos === 0 || pos === 1) {
      if (/[0-9]/.test(char)) result += char;
    }
    // Pos 2, 3, 4, 5, 6: Must be uppercase letters (PAN alphabet)
    else if (pos >= 2 && pos <= 6) {
      if (/[A-Z]/.test(char)) result += char;
    }
    // Pos 7, 8, 9, 10: Must be digits (PAN 4 digits)
    else if (pos >= 7 && pos <= 10) {
      if (/[0-9]/.test(char)) result += char;
    }
    // Pos 11: Must be uppercase letter (PAN checksum letter)
    else if (pos === 11) {
      if (/[A-Z]/.test(char)) result += char;
    }
    // Pos 12: 1-9 or A-Z (entity count)
    else if (pos === 12) {
      if (/[0-9A-Z]/.test(char)) result += char;
    }
    // Pos 13: Must be 'Z'
    else if (pos === 13) {
      if (char === 'Z') result += char;
      else if (/[A-Z0-9]/.test(char)) result += 'Z';
    }
    // Pos 14: Check code (0-9 or A-Z)
    else if (pos === 14) {
      if (/[0-9A-Z]/.test(char)) result += char;
    }
  }
  return result;
}

/**
 * Dynamic keyboard switcher for GSTIN input:
 * - Pos 0-1 (State code): Numeric keypad
 * - Pos 2-6 (PAN letters): Default text keypad (auto-capitalized)
 * - Pos 7-10 (PAN numbers): Numeric keypad
 * - Pos 11-14 (Entity, 'Z', Checksum): Default text keypad
 */
export function getGSTINKeyboardType(currentLength: number): 'numeric' | 'default' {
  if (currentLength < 2) return 'numeric'; // 2 digits state code
  if (currentLength >= 2 && currentLength < 7) return 'default'; // 5 letters
  if (currentLength >= 7 && currentLength < 11) return 'numeric'; // 4 digits
  return 'default'; // remaining 4 alphanumeric
}