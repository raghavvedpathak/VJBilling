// e2e/phase1.e2e.ts — Phase 1 v8.0 Real Device Hardware & Boot Verification E2E Spec
// Implements FIX-V729-1/2 (PIN Gate), FIX-V741-3 (Crypto preflight), Step 16 Decision Tree

import { by, device, element, expect, waitFor } from 'detox';

describe('Phase 1: Real Device Hardware Integration (v8.0)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxPrintUpdates: 'YES' },
    });
  });

  it('GATE 1: Crypto preflight passes and does not block on CryptoUnavailableScreen', async () => {
    await expect(element(by.text('SECURITY ENGINE UNAVAILABLE'))).not.toBeVisible();
  });

  it('GATE 2: Absolute First Boot bypasses Safe Mode and Database Error screens', async () => {
    await expect(element(by.text('SAFE MODE ACTIVE'))).not.toBeVisible();
    await expect(element(by.text('Database Error'))).not.toBeVisible();
  });

  it('GATE 3: App handles PIN Gate and routes cleanly to Welcome/Setup or Dashboard', async () => {
    // FIX-V729-1: Dismiss first-boot PIN setup if presented
    try {
      await waitFor(element(by.text('Skip Setup for now')))
        .toBeVisible()
        .withTimeout(4000);
      await element(by.text('Skip Setup for now')).tap();
    } catch {
      // PIN already configured or skipped on this device
    }

    // Step 16 Decision Tree: Must land on Welcome/Setup (0 firms) or Dashboard (>= 1 firm)
    try {
      await waitFor(element(by.text('Core Modules')))
        .toBeVisible()
        .withTimeout(6000);
    } catch {
      await waitFor(element(by.text('Restore Database')))
        .toBeVisible()
        .withTimeout(6000);
    }
  });

  it('GATE 4: Re-launching after first boot opens cleanly without DB_KEY errors', async () => {
    await device.launchApp({ newInstance: true });
    await expect(element(by.text('Database Error'))).not.toBeVisible();
    await expect(element(by.text('SECURITY ENGINE UNAVAILABLE'))).not.toBeVisible();
  });
});
