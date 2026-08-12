// services/phase1/safeModeService.ts — Canonical Safe Mode Service

import db, { db as dbNamed } from '@/db/client';
import { safeModeRepository } from '@/repositories/phase1/safeModeRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { safeModeStore, SafeModeTrigger } from '@/store/phase1/safeModeStore';
import { now } from '@/utils/now';
import { getDeviceId } from '@/utils/deviceId';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const bootstrapComplete = { value: false };

export const safeModeService = {
  async activate(reason: SafeModeTrigger, details?: object) {
    const currentTime = now();
    const deviceId = await getDeviceId().catch(() => 'DEV-DEVICE-ID');
    const targetDb = getDb();

    targetDb.transaction((tx: any) => {
      safeModeRepository.upsert(tx, {
        isActive: 1,
        reason: reason,
        activatedAt: currentTime,
        clearedAt: null,
      });

      auditRepository.create(
        {
          firmId: null,
          eventType: 'SAFE_MODE_ACTIVATED',
          payload: { reason, ...details },
          deviceId,
        },
        tx
      );
    });

    safeModeStore.getState().setState({
      isActive: true,
      reason: reason,
      activatedAt: currentTime,
    });
  },

  async clear() {
    const currentTime = now();
    const deviceId = await getDeviceId().catch(() => 'DEV-DEVICE-ID');
    const targetDb = getDb();

    targetDb.transaction((tx: any) => {
      safeModeRepository.upsert(tx, {
        isActive: 0,
        reason: null,
        activatedAt: null,
        clearedAt: currentTime,
      });

      auditRepository.create(
        {
          firmId: null,
          eventType: 'SAFE_MODE_CLEARED',
          payload: {},
          deviceId,
        },
        tx
      );
    });

    safeModeStore.getState().setState({
      isActive: false,
      reason: null,
      activatedAt: null,
    });
  },

  loadState() {
    const state = safeModeRepository.get();

    if (state && state.isActive === 1) {
      safeModeStore.getState().setState({
        isActive: true,
        reason: state.reason as SafeModeTrigger,
        activatedAt: state.activatedAt,
      });
    }
  },

  assertNotInSafeMode() {
    if (!bootstrapComplete.value) {
      throw new Error('BOOTSTRAP_INCOMPLETE: assertNotInSafeMode called before bootstrap finished');
    }

    const { isActive } = safeModeStore.getState();
    if (isActive) {
      throw new Error('SAFE_MODE_ACTIVE: Write operations are blocked to protect data integrity.');
    }
  },
};

export const activateSafeMode = safeModeService.activate.bind(safeModeService);
export const clearSafeMode = safeModeService.clear.bind(safeModeService);
export const assertNotInSafeMode = safeModeService.assertNotInSafeMode.bind(safeModeService);
export const loadSafeModeState = safeModeService.loadState.bind(safeModeService);