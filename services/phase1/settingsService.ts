// services/phase1/settingsService.ts — Phase 1 v7.47 & Phase 2 Canonical Settings Service
// Implements v6.4 BLOCKER C, G67, FIX-V740-6, FIX-V740-8, FIX-V7411-2

import { db } from '@/db/client';
import { safeTransaction } from '@/db/safeTransaction';
import { appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { ERR } from '@/constants/errorCodes';
import {
  MIN_AUDIT_RETENTION_DAYS,
  MAX_AUDIT_RETENTION_DAYS,
  ALLOWED_DATE_TOKENS,
} from '@/constants/auditRetention';
import type { UpdateSettingsInput } from '@/types/phase1/settings';

const ALLOWED_THEMES = [
  'system',
  'light',
  'dark',
  'saffron',
  'lotus_silk',
  'sandstone_ochre',
] as const;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const settingsService = {
  async getSettings() {
    const query = db.select().from(appSettings).where(eq(appSettings.id, 1));
    const results = typeof (query as any).all === 'function' ? (query as any).all() : await query;
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
    safeModeService.assertNotInSafeMode();    // GUARD 2

    // FIX-V7411-2: Throw registered ERR.CURRENCY_IMMUTABLE code
    if ('currency' in input || 'currencySymbol' in input || 'currencyDecimalPlaces' in input) {
      throw new Error(ERR.CURRENCY_IMMUTABLE + ': currency fields are read-only (G67)');
    }

    // FIX-V740-6: Validate settings fields against strict bounds & allowlists
    if ('auditRetentionDays' in input && input.auditRetentionDays !== undefined) {
      const d = input.auditRetentionDays;
      if (
        !Number.isInteger(d) ||
        d < MIN_AUDIT_RETENTION_DAYS ||
        d > MAX_AUDIT_RETENTION_DAYS
      ) {
        throw new Error(
          `${ERR.AUDIT_RETENTION_INVALID}: must be a whole number of days between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS}`
        );
      }
    }

    if (
      'dateFormatToken' in input &&
      input.dateFormatToken !== undefined &&
      !(ALLOWED_DATE_TOKENS as readonly string[]).includes(input.dateFormatToken)
    ) {
      throw new Error(`${ERR.INVALID_SETTINGS_VALUE}: dateFormatToken`);
    }

    if (
      'theme' in input &&
      input.theme !== undefined &&
      !(ALLOWED_THEMES as readonly string[]).includes(input.theme)
    ) {
      throw new Error(`${ERR.INVALID_SETTINGS_VALUE}: theme`);
    }

    if (
      'warnUnsavedChanges' in input &&
      input.warnUnsavedChanges !== undefined &&
      input.warnUnsavedChanges !== 0 &&
      input.warnUnsavedChanges !== 1
    ) {
      throw new Error(`${ERR.INVALID_SETTINGS_VALUE}: warnUnsavedChanges`);
    }

    const deviceId = getSafeDeviceId();
    const existing = appSettingsStore.getState();
    const updated = { ...existing, ...input, updatedAt: now() };

    // FIX-V740-8: Synchronous transaction via safeTransaction()
    safeTransaction((tx) => {
      tx.insert(appSettings)
        .values({
          id: 1,
          theme: updated.theme,
          auditRetentionDays: updated.auditRetentionDays,
          auditRetentionLastRunAt: updated.auditRetentionLastRunAt,
          currency: updated.currency,
          currencySymbol: updated.currencySymbol,
          currencyDecimalPlaces: updated.currencyDecimalPlaces,
          dateFormatToken: updated.dateFormatToken,
          warnUnsavedChanges: updated.warnUnsavedChanges,
          updatedAt: updated.updatedAt,
        } as any)
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...input, updatedAt: updated.updatedAt },
        })
        .run();

      auditRepository.log(tx, {
        eventType: 'SETTINGS_CHANGED',
        firmId: null,
        deviceId,
        payload: JSON.stringify({
          fields: Object.keys(input),
          oldValues: Object.fromEntries(
            Object.keys(input).map((k) => [k, (existing as any)[k]])
          ),
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
