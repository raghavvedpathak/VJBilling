import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
// FIX: correct store name — useAppSettingsStore (with `use` prefix)
// The previous import `appSettingsStore` was wrong — Zustand stores created
// with create() are React hooks and must be named with the `use` prefix.
// useAppSettingsStore.setState() is the correct static setState call pattern.
import { useAppSettingsStore } from '../store/appSettingsStore';

export type UpdateSettingsInput = Partial<typeof appSettings.$inferInsert>;

export const settingsService = {

  /**
   * Fetches the current application settings from DB (row ID = 1).
   * Fallback covers absolute first boot before Migration Zero seed runs.
   * G67: '₹' must not appear as a string literal — use Unicode escape \u20B9.
   */
  async getSettings() {
    const results = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    if (results.length > 0) {
      return results[0];
    }
    // Fallback: seed row not yet written (pre-migration first boot)
    // G67-LINT: currency symbol as Unicode escape — NOT '₹' string literal
    return {
      id: 1,
      dateFormatToken: 'dd/MM/yyyy',
      warnUnsavedChanges: 1,
      theme: 'system',
      auditRetentionDays: 365,
      currency: 'INR',
      currencySymbol: '\u20B9', // ₹ — Unicode escape per G67-LINT
      currencyDecimalPlaces: 2,
      updatedAt: '',
    };
  },

  /**
   * STEP 15 HARDENING: Updates settings with Dual Guard, Transaction, and Audit Log.
   * Syncs to Zustand store immediately after DB commit.
   * Currency fields are constitutionally immutable (G67) — blocked here.
   */
  async updateSettings(input: UpdateSettingsInput) {
    // 1. DUAL GUARD
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input) {
      throw new Error('CURRENCY_IMMUTABLE: currency fields are read-only constitutional rules (G67)');
    }

    const deviceId = await getDeviceId();
    const timestamp = now();

    // 2. ATOMIC TRANSACTION — UPSERT prevents ghost-reset bug
    await db.transaction(async (tx) => {
      await tx.insert(appSettings)
        .values({ id: 1, ...input, updatedAt: timestamp })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...input, updatedAt: timestamp },
        });

      await auditRepository.create({
        firmId: null,
        eventType: 'SETTINGS_CHANGED',
        payload: JSON.stringify({ changes: Object.keys(input) }),
        deviceId,
      }, tx);
    });

    // 3. Sync Zustand store — static setState on the store object
    // FIX: useAppSettingsStore.setState() — correct Zustand static setState pattern
    useAppSettingsStore.setState(input as any);
  },
};