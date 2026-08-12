// e2e/phase1.e2e.ts — Phase 1 Hardware & Route Verification E2E Spec

import { by, device, element, expect, waitFor } from 'detox';

describe('Phase 1: Real Device Hardware Integration', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxPrintUpdates: 'YES' },
    });
  });

  it('GATE 1: Absolute First Boot bypasses Safe Mode', async () => {
    await expect(element(by.id('safe-mode-screen'))).not.toExist();
  });

  it('GATE 2: App successfully routes to Setup or Dashboard', async () => {
    try {
      await waitFor(element(by.id('setup-screen')))
        .toBeVisible()
        .withTimeout(5000);
    } catch {
      await waitFor(element(by.id('dashboard-screen')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it('GATE 3: Root Layout mounts without MMKV initialization crashes', async () => {
    await expect(element(by.id('root-layout'))).toExist();
  });
});