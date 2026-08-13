// services/phase1/leaseService.ts
// Concurrency guard — session-scoped writer leases.
// v5.1 S2 Gap: Heartbeat at half-TTL to extend lease during long operations.
// v6.5 Gap 5: LeaseType.WRITE runtime guard.
//
// CONSTITUTIONAL RULES:
//   - acquire(), release(), purgeExpired() ALWAYS use top-level db — NEVER a tx context.
//     A tx-scoped lease check sees a partial DB view, defeating isolation.
//   - All leases are purged on every app restart (bootstrapService Step 3 — no WHERE clause).

import * as Crypto from 'expo-crypto';
import { eq, lt, sql } from 'drizzle-orm';
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
   * Always uses top-level db — never a transaction context.
   */
  async assertNoActiveLease(): Promise<void> {
    const targetDb = getDb();
    const existing = targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1)
      .all();

    if (existing.length > 0) {
      throw new Error(`${ERR.LEASE_HELD}: ${existing[0].leaseType} operation in progress`);
    }
  },

  /**
   * Acquires a named writer lease. Returns the leaseId.
   */
  async acquire(type: string, firmId?: string): Promise<string> {
    // v6.5 GAP 5 FIX: Runtime guard — LeaseType.WRITE has no Phase 1 implementation
    if (type === LeaseType.WRITE || type === 'WRITE') {
      throw new Error(`${ERR.WRITE_LEASE_NOT_IMPLEMENTED}: LeaseType.WRITE is reserved for Phase 2. Do not acquire in Phase 1.`);
    }

    await this.assertNoActiveLease();

    const newId = Crypto.randomUUID();
    const deviceId = await getDeviceId().catch(() => 'DEV-DEVICE-ID');
    const currentTime = now();
    const expiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();
    const targetDb = getDb();

    leaseRepository.insert(targetDb, {
      id: newId,
      leaseType: type,
      firmId: firmId ?? null,
      acquiredAt: currentTime,
      expiresAt,
      deviceId,
    });

    useLeaseStore.getState().setActiveLease({
      id: newId,
      leaseType: type,
      acquiredAt: currentTime,
    });

    this.startHeartbeat(newId);
    return newId;
  },

  /**
   * Releases a lease by ID.
   */
  async release(leaseId: string): Promise<void> {
    this.stopHeartbeat();
    const targetDb = getDb();

    try {
      leaseRepository.delete(leaseId, targetDb);
      useLeaseStore.getState().setActiveLease(null);
    } catch (error) {
      console.error('[Lease] DB delete failed — orphan lease will be purged on next restart:', error);
      useLeaseStore.getState().setActiveLease(null);
    }
  },

  /**
   * Deletes all expired leases from DB.
   */
  async purgeExpired(): Promise<void> {
    const targetDb = getDb();
    targetDb.delete(writerLeases)
      .where(sql`${writerLeases.expiresAt} <= datetime('now')`)
      .run();

    const active = useLeaseStore.getState().activeLease;
    if (active) {
      const activeFromDb = targetDb
        .select()
        .from(writerLeases)
        .where(eq(writerLeases.id, active.id))
        .limit(1)
        .get();

      if (!activeFromDb) {
        useLeaseStore.getState().setActiveLease(null);
      }
    }
  },

  /**
   * Returns the current non-expired lease from DB, or null.
   */
  async getActiveLease() {
    const targetDb = getDb();
    const active = targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1)
      .get();

    return active ?? null;
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
      const result = leaseRepository.extendTTL(currentLeaseId, newExpiresAt);

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