// v2.9 / v7.6 Canonical Implementation
const FIRM_CODE_REGEX = /^[A-Za-z0-9_-]{1,10}$/;

export function validateFirmCode(firmCode: string): void {
  if (!firmCode || firmCode.trim().length === 0) {
    throw new Error('INVALID_FIRM_CODE: firmCode is required');
  }
  
  if (firmCode.length > 10) {
    throw new Error(`INVALID_FIRM_CODE: maximum 10 characters, got ${firmCode.length}`);
  }
  
  if (!FIRM_CODE_REGEX.test(firmCode)) {
    throw new Error('INVALID_FIRM_CODE: only letters, digits, hyphen, underscore allowed');
  }
}