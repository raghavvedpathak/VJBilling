// v7.0 G70 Canonical Implementation
export function validatePincode(pincode: string): void {
  if (!pincode || pincode.trim().length === 0) {
    throw new Error('INVALID_PINCODE: pincode is required');
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    throw new Error('INVALID_PINCODE: must be exactly 6 digits, numeric only');
  }
}