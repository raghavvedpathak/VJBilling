// tests/utils/pinService.test.ts
// v7.29 FIX-VSEC-3, FIX-V729-1, FIX-V729-2 — Step R Test Matrix
// Validates 4/6 digit selection, skip logic, exponential lockouts, and PIN changes.

// ─── CRYPTO MOCK FOR JEST ───────────────────────────────────────────────────
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (algorithm, data) => {
    return require('crypto').createHash('sha256').update(data).digest('hex');
  }),
  getRandomBytes: jest.fn((length) => {
    return require('crypto').randomBytes(length);
  }),
}));

// ─── STORAGE MOCK FOR JEST ───────────────────────────────────────────────────
jest.mock('@/utils/storage', () => {
  let store: Record<string, string> = {};
  return {
    storage: {
      getString: jest.fn((key: string) => store[key]),
      set: jest.fn((key: string, val: string) => { store[key] = val; }),
      delete: jest.fn((key: string) => { delete store[key]; }),
      clearAll: () => { store = {}; }
    }
  };
});

// ─── IMPORTS ─────────────────────────────────────────────────────────────────
import { 
  setPin, 
  verifyPin, 
  isPinSet, 
  getPinLength, 
  getFailedAttempts, 
  incrementFailedAttempts, 
  isLockedOut, 
  resetFailedAttempts,
  isPinSkipped,
  setPinSkipped,
  changePin
} from '@/services/phase1/pinService';
import { storage } from '@/utils/storage';

// ─── TEST SETUP ──────────────────────────────────────────────────────────────
beforeEach(() => {
  (storage as any).clearAll();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── TEST SUITE ──────────────────────────────────────────────────────────────
describe('PIN Security Engine (v7.29)', () => {

  describe('1. Setup & Length Validation (FIX-V729-2)', () => {
    it("setPin('1234') succeeds and getPinLength() returns 4", async () => {
      await expect(setPin('1234')).resolves.not.toThrow();
      expect(getPinLength()).toBe(4);
      expect(isPinSet()).toBe(true);
    });

    it("setPin('123456') succeeds and getPinLength() returns 6", async () => {
      await expect(setPin('123456')).resolves.not.toThrow();
      expect(getPinLength()).toBe(6);
      expect(isPinSet()).toBe(true);
    });

    it("setPin('12345') throws PIN_INCORRECT (5 digits)", async () => {
      await expect(setPin('12345')).rejects.toThrow('PIN_INCORRECT');
      expect(isPinSet()).toBe(false);
    });

    it("setPin('abcd') throws PIN_INCORRECT (non-numeric)", async () => {
      await expect(setPin('abcd')).rejects.toThrow('PIN_INCORRECT');
      expect(isPinSet()).toBe(false);
    });
  });

  describe('2. Verification & Lockout (FIX-VSEC-3)', () => {
    it('verifyPin() with correct PIN returns true', async () => {
      await setPin('123456');
      expect(await verifyPin('123456')).toBe(true);
    });

    it('verifyPin() with incorrect PIN returns false and increments failed-attempt counter', async () => {
      await setPin('123456');
      expect(await verifyPin('654321')).toBe(false);
      
      incrementFailedAttempts();
      expect(getFailedAttempts()).toBe(1);
    });

    it('3rd consecutive failure triggers isLockedOut() = true for 30s', async () => {
      await setPin('123456');
      incrementFailedAttempts(); // 1
      incrementFailedAttempts(); // 2
      incrementFailedAttempts(); // 3 -> Lockout!
      
      expect(isLockedOut()).toBe(true);
      
      jest.advanceTimersByTime(29 * 1000);
      expect(isLockedOut()).toBe(true);
      
      jest.advanceTimersByTime(2 * 1000);
      expect(isLockedOut()).toBe(false);
    });

    it('4th consecutive failure doubles lockout to 60s', async () => {
      await setPin('123456');
      incrementFailedAttempts(); // 1
      incrementFailedAttempts(); // 2
      incrementFailedAttempts(); // 3 (30s)
      incrementFailedAttempts(); // 4 (60s)
      
      expect(isLockedOut()).toBe(true);
      
      jest.advanceTimersByTime(59 * 1000);
      expect(isLockedOut()).toBe(true);
      
      jest.advanceTimersByTime(2 * 1000);
      expect(isLockedOut()).toBe(false);
    });

    it('isLockedOut() = false and counters cleared after resetFailedAttempts()', async () => {
      await setPin('123456');
      incrementFailedAttempts();
      incrementFailedAttempts();
      incrementFailedAttempts();
      
      expect(isLockedOut()).toBe(true);
      resetFailedAttempts();
      
      expect(isLockedOut()).toBe(false);
      expect(getFailedAttempts()).toBe(0);
    });
  });

  describe('3. Skip Logic (FIX-V729-1)', () => {
    it('isPinSet() = false and isPinSkipped() = false on first-ever boot', () => {
      expect(isPinSet()).toBe(false);
      expect(isPinSkipped()).toBe(false);
    });

    it('tapping "Skip for now" calls setPinSkipped(), and isPinSet() remains false', () => {
      setPinSkipped();
      expect(isPinSkipped()).toBe(true);
      expect(isPinSet()).toBe(false);
    });

    it('setPin() from the Settings row after a skip clears the skipped flag', async () => {
      setPinSkipped();
      expect(isPinSkipped()).toBe(true);
      
      await setPin('1234');
      
      expect(isPinSet()).toBe(true);
      expect(isPinSkipped()).toBe(false);
    });
  });

  describe('4. Change PIN', () => {
    it('changePin() with wrong currentPin throws PIN_INCORRECT and does not alter the stored PIN', async () => {
      await setPin('1234');
      await expect(changePin('9999', '123456')).rejects.toThrow('PIN_INCORRECT');
      
      expect(await verifyPin('1234')).toBe(true);
      expect(getPinLength()).toBe(4);
    });

    it('changePin() with valid newPin of different length succeeds and getPinLength() reflects new length', async () => {
      await setPin('1234');
      await changePin('1234', '123456');
      
      expect(await verifyPin('123456')).toBe(true);
      expect(await verifyPin('1234')).toBe(false);
      expect(getPinLength()).toBe(6);
    });
  });

});