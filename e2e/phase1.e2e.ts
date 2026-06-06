// e2e/phase1.e2e.ts
import { by, device, element, expect } from 'detox';

describe('Phase 1: Real Device Hardware Integration', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxPrintUpdates: 'YES' }
    });
  });

  // ✅ FIXED: Remove reloadReactNative() from beforeEach entirely.
  // It disconnects the app because Metro must serve the new bundle,
  // which either isn't running or isn't ready yet.
  // launchApp() in beforeAll already gives us a clean state.

  it('GATE 1: Absolute First Boot bypasses Safe Mode (0.3 Gap)', async () => {
    await expect(element(by.id('safe-mode-screen'))).not.toExist();
  });

  it('GATE 2: App successfully routes to Setup or Dashboard', async () => {
    try {
      await expect(element(by.id('setup-screen'))).toExist();
    } catch {
      await expect(element(by.id('dashboard-screen'))).toExist();
    }
  });

  it('GATE 3: Root Layout mounts without MMKV initialization crashes', async () => {
    await expect(element(by.id('root-layout'))).toExist();
  });
});