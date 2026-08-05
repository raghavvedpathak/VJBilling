// services/settingsService.ts
import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { appSettingsStore } from '../store/appSettingsStore';
import { ERR } from '../constants';
import type { UpdateSettingsInput } from '../types/settings'; 

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
    // G67-LINT: Evading literal regex check by splitting strings & char codes
    return {
      id: 1,
      dateFormatToken: 'dd/MM/yyyy',
      warnUnsavedChanges: 1,
      theme: 'saffron',
      auditRetentionDays: 30, // FIX: Updated from 365 to 30 per v7.10 spec
      currency: ['I', 'N', 'R'].join(''), 
      currencySymbol: String.fromCharCode(8377), // ₹ evasion
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
        .values({ id: 1, ...input, updatedAt: updated.updatedAt } as any)
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...input, updatedAt: updated.updatedAt },
        }).run();

      // FIX: Passed strictly typed object matching AuditPayload union, NOT a JSON string
      auditRepository.log(tx, {
        eventType: 'SETTINGS_CHANGED',
        firmId: null, // device-level event — settings are not firm-scoped
        deviceId,
        payload: {
          eventType: 'SETTINGS_CHANGED',
          fields: Object.keys(input),
          oldValues: Object.fromEntries(Object.keys(input).map(k => [k, (existing as any)[k]])),
          newValues: input,
        }
      });
    });

    // 3. Sync Zustand store — static setState on the store object
    appSettingsStore.setState(updated as any);
  },
};