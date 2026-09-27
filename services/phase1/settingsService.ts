// services/phase1/settingsService.ts — Phase 1 & 2 Canonical Settings Service
// v6.4 BLOCKER C: updateSettings() canonical implementation
// v6.7 / v6.8 / v6.9: Dual Guard + SETTINGS_CHANGED audit + CURRENCY_IMMUTABLE guard
// FIX-VSEC-7: Text input sanitization applied
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
import { sanitizeText } from '@/utils/sanitize';
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
      auditRetentionLastRunAt: null,
      currency: 'INR',
      currencySymbol: '₹',
      currencyDecimalPlaces: 2,
      updatedAt: '',
    };
  },

  async updateSettings(input: UpdateSettingsInput): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();     // GUARD 2

    if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input) {
      throw new Error('CURRENCY_IMMUTABLE: currency fields are read-only constitutional rules (G67)');
    }

    // FIX-VSEC-7: Sanitize free-text service inputs before persistence
    const sanitizedInput: UpdateSettingsInput = { ...input };
    if (typeof sanitizedInput.theme === 'string') {
      sanitizedInput.theme = sanitizeText(sanitizedInput.theme);
    }
    if (typeof sanitizedInput.dateFormatToken === 'string') {
      sanitizedInput.dateFormatToken = sanitizeText(sanitizedInput.dateFormatToken);
    }

    const deviceId = getSafeDeviceId();
    const existing = appSettingsStore.getState();
    const updated = { ...existing, ...sanitizedInput, updatedAt: now() };

    db.transaction((tx) => {
      tx.insert(appSettings)
        .values({ id: 1, ...sanitizedInput, updatedAt: updated.updatedAt } as any)
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...sanitizedInput, updatedAt: updated.updatedAt },
        }).run();

      const auditEntry = {
        eventType: 'SETTINGS_CHANGED',
        firmId: null,
        deviceId,
        payload: JSON.stringify({
          fields: Object.keys(sanitizedInput),
          oldValues: Object.fromEntries(Object.keys(sanitizedInput).map(k => [k, (existing as any)[k]])),
          newValues: sanitizedInput,
        }),
      };

      if (typeof (auditRepository as any).log === 'function') {
        (auditRepository as any).log(tx, auditEntry);
      } else if (typeof (auditRepository as any).create === 'function') {
        (auditRepository as any).create(auditEntry, tx);
      }
    });

    // SETSTATE-OUTSIDE-TX COROLLARY: updates store strictly after tx commits
    appSettingsStore.setState(updated as any);
  },
};

export const updateSettings = settingsService.updateSettings.bind(settingsService);
export const getSettings = settingsService.getSettings.bind(settingsService);
export default settingsService;