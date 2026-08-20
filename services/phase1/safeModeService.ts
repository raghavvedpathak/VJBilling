// services/phase1/safeModeService.ts — Canonical Safe Mode Service

import db, { db as dbNamed } from '@/db/client';
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
  async activate(reason: SafeModeTrigger, details?: object) {
    const currentTime = now();
    const deviceId = getSafeDeviceId();
    const targetDb = getTargetDb();

    targetDb.transaction((tx: any) => {
      safeModeRepository.upsert(tx, {
        id: 1, // Singleton row: id always = 1
        isActive: 1,
        reason: reason,
        activatedAt: currentTime,
        clearedAt: null,
      });

      auditRepository.create(
        {
          firmId: null,
          eventType: 'SAFE_MODE_ACTIVATED',
          payload: JSON.stringify({ reason, ...details }),
          deviceId,
        },
        tx
      );
    });

    safeModeStore.setState({
      isActive: true,
      reason: reason,
      activatedAt: currentTime,
    });
  },

  async clear() {
    const currentTime = now();
    const deviceId = getSafeDeviceId();
    const targetDb = getTargetDb();

    targetDb.transaction((tx: any) => {
      safeModeRepository.upsert(tx, {
        id: 1, // Singleton row: id always = 1
        isActive: 0,
        reason: null,
        activatedAt: null,
        clearedAt: currentTime,
      });

      auditRepository.create(
        {
          firmId: null,
          eventType: 'SAFE_MODE_CLEARED',
          payload: JSON.stringify({}),
          deviceId,
        },
        tx
      );
    });

    safeModeStore.setState({
      isActive: false,
      reason: null,
      activatedAt: null,
    });
  },

  loadState() {
    const state = safeModeRepository.get();
    if (!state) return;

    safeModeStore.setState({
      isActive: state.isActive === 1,
      reason: (state.reason as SafeModeTrigger) ?? null,
      activatedAt: state.activatedAt ?? null,
    });
  },

  assertNotInSafeMode() {
    if (!bootstrapComplete.value) {
      throw new Error(`${ERR.BOOTSTRAP_INCOMPLETE}: assertNotInSafeMode called before bootstrap finished`);
    }

    const { isActive } = safeModeStore.getState();
    if (isActive) {
      throw new Error(`${ERR.SAFE_MODE_ACTIVE}: Write operations are blocked to protect data integrity.`);
    }
  },
};

export const activateSafeMode = safeModeService.activate.bind(safeModeService);
export const clearSafeMode = safeModeService.clear.bind(safeModeService);
export const assertNotInSafeMode = safeModeService.assertNotInSafeMode.bind(safeModeService);
export const loadSafeModeState = safeModeService.loadState.bind(safeModeService);
export default safeModeService;