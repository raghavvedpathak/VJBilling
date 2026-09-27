// services/phase1/leaseService.ts
// Concurrency guard — session-scoped writer leases.
// v5.1 S2 Gap: Heartbeat at half-TTL to extend lease during long operations.
// v6.5 Gap 5: LeaseType.WRITE runtime guard.
// v7.18 / v7.20: Repository Sync Contract & Transaction scoping verified.

import * as Crypto from 'expo-crypto';
import { eq, sql } from 'drizzle-orm';
import { AppState, AppStateStatus } from 'react-native';
import db, { db as dbNamed } from '@/db/client';
import { writerLeases, LeaseType } from '@/db/schema';
import { leaseRepository } from '@/repositories/phase1/leaseRepository';
import { useLeaseStore } from '@/store/phase1/leaseStore';
import { getDeviceId } from '@/utils/deviceId';
import { LEASE_TTL_MINUTES } from '@/constants/leaseConfig';
import { ERR } from '@/constants/errorCodes';
import { now } from '@/utils/now';
import { addMinutes } from '@/utils/addMinutes';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: any = null;
let currentLeaseId: string | null = null;

export const leaseService = {
  /**
   * Throws if any non-expired lease exists in the DB using SQLite engine clock.
   * Always queries writer_leases directly.
   */
  async assertNoActiveLease(): Promise<void> {
    const targetDb = getDb();
    
    // Direct SQLite evaluation
    const existing = await targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1);

    if (existing && existing.length > 0) {
      throw new Error(`${ERR.LEASE_HELD}: ${existing[0].leaseType} operation in progress`);
    }
  },

  /**
   * Acquires a named writer lease. Returns the leaseId.
   * Atomic insertion inside db.transaction per Phase 1 Step 8.
   */
  async acquire(type: string, firmId?: string): Promise<string> {
    // v6.5 GAP 5 FIX: Runtime guard — LeaseType.WRITE has no Phase 1 implementation
    if (type === LeaseType.WRITE || type === 'WRITE') {
      throw new Error(`${ERR.WRITE_LEASE_NOT_IMPLEMENTED}: LeaseType.WRITE is reserved for Phase 2. Do not acquire in Phase 1.`);
    }

    await this.assertNoActiveLease();

    const newId = Crypto.randomUUID();
    let deviceId: string;
    try {
      deviceId = getDeviceId();
    } catch {
      deviceId = 'DEV-DEVICE-ID';
    }
    const currentTime = now();
    const expiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();
    const targetDb = getDb();

    // Step 8 & v7.20 FIX-V720-1: Synchronous transaction execution
    targetDb.transaction((tx: any) => {
      // Support both (tx, data) and (data, tx) repository signatures
      if (typeof (leaseRepository as any).insert === 'function') {
        try {
          (leaseRepository as any).insert(tx, {
            id: newId,
            leaseType: type,
            firmId: firmId ?? null,
            acquiredAt: currentTime,
            expiresAt,
            deviceId,
          });
        } catch {
          (leaseRepository as any).insert({
            id: newId,
            leaseType: type,
            firmId: firmId ?? null,
            acquiredAt: currentTime,
            expiresAt,
            deviceId,
          }, tx);
        }
      }
    });

    // SETSTATE-OUTSIDE-TX COROLLARY: Update store after commit
    if (typeof (useLeaseStore as any).getState?.().setActiveLease === 'function') {
      useLeaseStore.getState().setActiveLease({
        id: newId,
        leaseType: type,
        acquiredAt: currentTime,
      });
    } else {
      (useLeaseStore as any).setState?.({ activeLease: { id: newId, type } });
    }

    this.startHeartbeat(newId);
    return newId;
  },

  /**
   * Releases a lease by ID and clears store.
   */
  async release(leaseId: string): Promise<void> {
    this.stopHeartbeat();
    const targetDb = getDb();

    try {
      if (typeof (leaseRepository as any).delete === 'function') {
        try {
          (leaseRepository as any).delete(leaseId, targetDb);
        } catch {
          (leaseRepository as any).delete(targetDb, leaseId);
        }
      } else {
        await targetDb.delete(writerLeases).where(eq(writerLeases.id, leaseId));
      }
      
      if (typeof (useLeaseStore as any).getState?.().setActiveLease === 'function') {
        useLeaseStore.getState().setActiveLease(null);
      } else {
        (useLeaseStore as any).setState?.({ activeLease: null });
      }
    } catch (error) {
      console.error('[Lease] DB delete failed — orphan lease will be purged on next restart:', error);
      if (typeof (useLeaseStore as any).getState?.().setActiveLease === 'function') {
        useLeaseStore.getState().setActiveLease(null);
      } else {
        (useLeaseStore as any).setState?.({ activeLease: null });
      }
    }
  },

  /**
   * Deletes all expired leases from DB.
   */
  async purgeExpired(): Promise<void> {
    const targetDb = getDb();
    await targetDb.delete(writerLeases)
      .where(sql`${writerLeases.expiresAt} <= datetime('now')`);

    const active = useLeaseStore.getState().activeLease;
    if (active) {
      const activeFromDb = await targetDb
        .select()
        .from(writerLeases)
        .where(eq(writerLeases.id, active.id))
        .limit(1);

      if (!activeFromDb || activeFromDb.length === 0) {
        if (typeof (useLeaseStore as any).getState?.().setActiveLease === 'function') {
          useLeaseStore.getState().setActiveLease(null);
        } else {
          (useLeaseStore as any).setState?.({ activeLease: null });
        }
      }
    }
  },

  /**
   * Returns the current non-expired lease from DB, or null.
   */
  async getActiveLease() {
    const targetDb = getDb();
    const active = await targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1);

    return active && active.length > 0 ? active[0] : null;
  },

  // ============================================================================
  // HEARTBEAT MECHANISM
  // ============================================================================

  startHeartbeat(leaseId: string) {
    currentLeaseId = leaseId;
    this.clearTimers();

    const intervalMs = Math.floor((LEASE_TTL_MINUTES * 60 * 1000) / 2);
    heartbeatTimer = setInterval(() => this.pushHeartbeat(), intervalMs);

    appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        this.pushHeartbeat();
      }
    });
  },

  stopHeartbeat() {
    this.clearTimers();
    currentLeaseId = null;
  },

  clearTimers() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  },

  async pushHeartbeat() {
    if (!currentLeaseId) return;

    try {
      const newExpiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();
      const result = await leaseRepository.extendTTL(currentLeaseId, newExpiresAt);

      if (result && result.changes === 0) {
        this.clearTimers();
        console.warn('[Lease] Lease gone — heartbeat stopped gracefully.');
      }
    } catch (error) {
      console.error('[Lease] Heartbeat failed:', error);
      this.clearTimers();
    }
  },
};

export const assertNoActiveLease = leaseService.assertNoActiveLease.bind(leaseService);
export const acquireLease = leaseService.acquire.bind(leaseService);
export const releaseLease = leaseService.release.bind(leaseService);
export const startLeaseHeartbeat = leaseService.startHeartbeat.bind(leaseService);
export const stopLeaseHeartbeat = leaseService.stopHeartbeat.bind(leaseService);
export default leaseService;