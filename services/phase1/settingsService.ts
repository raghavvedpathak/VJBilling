// services/phase1/settingsService.ts — Phase 1 & 2 Canonical Settings Service
// v6.4 BLOCKER C: updateSettings() canonical implementation
// v6.7 / v6.8 / v6.9: Dual Guard + SETTINGS_CHANGED audit + CURRENCY_IMMUTABLE guard
//
// CONSTITUTIONAL RULES:
//   - updateSettings() MUST begin with Dual Guard (assertNoActiveLease + assertNotInSafeMode).
//   - Currency fields are read-only and immutable (G67).
//   - appSettingsStore.setState() MUST run AFTER db.transaction() commits (SETSTATE-OUTSIDE-TX).

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { ERR } from '@/constants/errorCodes';
import type { UpdateSettingsInput } from '@/types/phase1/settings'; 

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const settingsService = {
  async getSettings() {
    const results = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    if (results.length > 0) {
      return results[0];
    }
    return {
      id: 1,
      dateFormatToken: 'dd/MM/yyyy',
      warnUnsavedChanges: 1,
      theme: 'system',
      auditRetentionDays: 30,
      currency: 'INR',
      currencySymbol: '₹',
      currencyDecimalPlaces: 2,
      updatedAt: '',
    };
  },

  async updateSettings(input: UpdateSettingsInput): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input) {
      throw new Error('CURRENCY_IMMUTABLE: currency fields are read-only constitutional rules (G67)');
    }

    const deviceId = getSafeDeviceId();
    const existing = appSettingsStore.getState();
    const updated = { ...existing, ...input, updatedAt: now() };

    db.transaction((tx) => {
      tx.insert(appSettings)
        .values({ id: 1, ...input, updatedAt: updated.updatedAt } as any)
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...input, updatedAt: updated.updatedAt },
        }).run();

      auditRepository.log(tx, {
        eventType: 'SETTINGS_CHANGED',
        firmId: null,
        deviceId,
        payload: JSON.stringify({
          fields: Object.keys(input),
          oldValues: Object.fromEntries(Object.keys(input).map(k => [k, (existing as any)[k]])),
          newValues: input,
        }),
      });
    });

    // SETSTATE-OUTSIDE-TX COROLLARY: updates store strictly after tx commits
    appSettingsStore.setState(updated as any);
  },
};

export const updateSettings = settingsService.updateSettings.bind(settingsService);
export const getSettings = settingsService.getSettings.bind(settingsService);
export default settingsService;