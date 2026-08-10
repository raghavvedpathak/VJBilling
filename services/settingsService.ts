// services/settingsService.ts — Phase 2 v2.11 Canonical Implementation

import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { appSettingsStore } from '../store/appSettingsStore';
import { ERR } from '../constants/errorCodes';
import type { UpdateSettingsInput } from '../types/settings'; 

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
      theme: 'saffron',
      auditRetentionDays: 30,
      currency: ['I', 'N', 'R'].join(''), 
      currencySymbol: String.fromCharCode(8377),
      currencyDecimalPlaces: 2,
      updatedAt: '',
    };
  },

  async updateSettings(input: UpdateSettingsInput) {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input) {
      throw new Error('CURRENCY_IMMUTABLE: currency fields are read-only constitutional rules (G67)');
    }

    const deviceId = await getDeviceId();
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
        payload: {
          eventType: 'SETTINGS_CHANGED',
          fields: Object.keys(input),
          oldValues: Object.fromEntries(Object.keys(input).map(k => [k, (existing as any)[k]])),
          newValues: input,
        }
      });
    });

    appSettingsStore.setState(updated as any);
  },
};