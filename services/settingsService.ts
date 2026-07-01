import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
// FIX: Reverted to the spec-compliant appSettingsStore
import { appSettingsStore } from '../store/appSettingsStore';

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
      auditRetentionDays: 30, // FIX: Updated from 365 to 30 per v7.10 spec
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
    const existing = appSettingsStore.getState();
    const updated = { ...existing, ...input, updatedAt: now() };

    // 2. ATOMIC TRANSACTION — UPSERT prevents ghost-reset bug
    // FIX-V718-1: JSI driver requires synchronous tx callback
    db.transaction((tx) => {
      tx.insert(appSettings)
        .values({ id: 1, ...input, updatedAt: updated.updatedAt })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...input, updatedAt: updated.updatedAt },
        }).run();

      auditRepository.log(tx, {
        eventType: 'SETTINGS_CHANGED',
        firmId: null, // device-level event — settings are not firm-scoped
        payload: JSON.stringify({
          fields: Object.keys(input),
          oldValues: Object.fromEntries(Object.keys(input).map(k => [k, (existing as any)[k]])),
          newValues: input,
        }),
        deviceId,
      });
    });

    // 3. Sync Zustand store — static setState on the store object
    appSettingsStore.setState(updated as any);
  },
};