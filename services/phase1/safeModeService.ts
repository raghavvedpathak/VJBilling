// services/phase1/safeModeService.ts — Canonical Safe Mode Service (v8.0)
// Implements Step 10, G42, FIX-V78-4, FIX-V718-5/6, FIX-V740-8

import db, { db as dbNamed } from '@/db/client';
import { safeTransaction } from '@/db/safeTransaction';
import { schemaVersion } from '@/db/schema';
import { safeModeRepository } from '@/repositories/phase1/safeModeRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { safeModeStore, SafeModeTrigger } from '@/store/phase1/safeModeStore';
import { now } from '@/utils/now';
import { getDeviceId } from '@/utils/deviceId';
import { ERR } from '@/constants/errorCodes';

export const bootstrapComplete = { value: false };

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

function getTargetDb(customTx?: any): any {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const safeModeService = {
  async activate(reason: SafeModeTrigger, details?: object): Promise<void> {
    const currentTime = now();
    const deviceId = getSafeDeviceId();

    safeTransaction((tx) => {
      safeModeRepository.upsert(tx, {
        id: 1, // Singleton row: id always = 1
        isActive: 1,
        reason,
        activatedAt: currentTime,
        clearedAt: null,
      });

      const auditPayload = { reason, ...details };

      auditRepository.log(tx, {
        eventType: 'SAFE_MODE_ACTIVATED',
        firmId: null,
        payload: JSON.stringify(auditPayload),
        deviceId,
      });
    });

    // v7.18 FIX-V718-5: SETSTATE-OUTSIDE-TX COROLLARY
    safeModeStore.setState({
      isActive: true,
      reason,
      activatedAt: currentTime,
    });
  },

  // INTERNAL ONLY — called only by verifyService or restoreService
  async clear(): Promise<void> {
    const currentTime = now();
    const deviceId = getSafeDeviceId();

    safeTransaction((tx) => {
      safeModeRepository.upsert(tx, {
        id: 1, // Singleton row: id always = 1
        isActive: 0,
        reason: null,
        activatedAt: null,
        clearedAt: currentTime,
      });

      auditRepository.log(tx, {
        eventType: 'SAFE_MODE_CLEARED',
        firmId: null,
        payload: JSON.stringify({}),
        deviceId,
      });
    });

    // v7.18 FIX-V718-6: SETSTATE-OUTSIDE-TX COROLLARY
    safeModeStore.setState({
      isActive: false,
      reason: null,
      activatedAt: null,
    });
  },

  async loadState(): Promise<void> {
    const state = safeModeRepository.get();

    // v7.7 / v7.8 FIX-V78-4: SAFE-MODE-ROW-GUARD
    if (!state) {
      try {
        const targetDb = getTargetDb();
        const svRows = targetDb.select().from(schemaVersion).limit(1).all?.() || [];
        const hasSchemaVersion = Array.isArray(svRows) ? svRows.length > 0 : !!svRows;

        if (hasSchemaVersion) {
          console.error(
            '[SafeMode] Corruption detected: schema_version exists but safe_mode_state row missing.'
          );
          await this.activate('STORAGE_CORRUPTION_DETECTED' as SafeModeTrigger, {
            missingTable: 'safe_mode_state',
            schemaVersionConfirmed: true,
          });
          return;
        }
      } catch (err) {
        console.warn('[SafeMode] Unable to check schemaVersion during loadState fallback:', err);
      }
      return;
    }

    safeModeStore.setState({
      isActive: state.isActive === 1,
      reason: (state.reason as SafeModeTrigger) ?? null,
      activatedAt: state.activatedAt ?? null,
    });
  },

  assertNotInSafeMode(): void {
    if (!bootstrapComplete.value) {
      throw new Error(
        `${ERR.BOOTSTRAP_INCOMPLETE}: assertNotInSafeMode called before bootstrap finished`
      );
    }

    const { isActive } = safeModeStore.getState();
    if (isActive) {
      throw new Error(
        `${ERR.SAFE_MODE_ACTIVE}: Write operations are blocked to protect data integrity.`
      );
    }
  },
};

export const activateSafeMode = safeModeService.activate.bind(safeModeService);
export const clearSafeMode = safeModeService.clear.bind(safeModeService);
export const assertNotInSafeMode = safeModeService.assertNotInSafeMode.bind(safeModeService);
export const loadSafeModeState = safeModeService.loadState.bind(safeModeService);
export default safeModeService;
