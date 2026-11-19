// services/phase1/leaseService.ts — Phase 1 v8.0
// Concurrency guard — session-scoped writer leases.
// v5.1 S2 Gap: Heartbeat at half-TTL to extend lease during long operations.
// v6.5 Gap 5: LeaseType.WRITE runtime guard.
// v7.18 / v7.20 / v7.40 FIX-V740-3 & FIX-V740-8: Repository Sync Contract & safeTransaction().
// v7.46 FIX-V746-3 / v7.47 FIX-V747-3: Optional ttlMinutes on acquireLease() and startLeaseHeartbeat().

import * as Crypto from 'expo-crypto';
import { eq, sql } from 'drizzle-orm';
import { AppState, AppStateStatus } from 'react-native';
import db, { db as dbNamed } from '@/db/client';
import { safeTransaction } from '@/db/safeTransaction';
import { writerLeases, LeaseType } from '@/db/schema';
import { leaseRepository } from '@/repositories/phase1/leaseRepository';
import { useLeaseStore } from '@/store/phase1/leaseStore';
import { getDeviceId } from '@/utils/deviceId';
import { LEASE_TTL_MINUTES } from '@/constants/leaseConfig';
import { ERR } from '@/constants/errorCodes';
import { now } from '@/utils/now';
import { addMinutes } from '@/utils/addMinutes';

type DbOrTx = any;

const isTestEnv =
  typeof process !== 'undefined' &&
  (process.env?.NODE_ENV === 'test' || process.env?.JEST_WORKER_ID !== undefined);

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
let currentTtlMinutes: number = LEASE_TTL_MINUTES;

export const leaseService = {
  /**
   * Throws if any non-expired lease exists in the DB using SQLite engine clock.
   * Always queries writer_leases directly (Step 8, v2.4 G01).
   */
  async assertNoActiveLease(): Promise<void> {
    const targetDb = getDb();

    const query = targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1);

    const existing = typeof query.all === 'function' ? query.all() : await query;

    if (existing && existing.length > 0) {
      throw new Error(`${ERR.LEASE_HELD}: ${existing[0].leaseType} operation in progress`);
    }
  },

  /**
   * Acquires a named writer lease. Returns the leaseId.
   * Atomic insertion inside safeTransaction per Phase 1 Step 8 & FIX-V740-8.
   * v7.47 FIX-V747-3: ttlMinutes support (15 min for background backup, 5 min default).
   */
  async acquire(
    type: string,
    firmId?: string,
    ttlMinutes: number = LEASE_TTL_MINUTES
  ): Promise<string> {
    // v6.5 GAP 5 FIX: Runtime guard — LeaseType.WRITE has no Phase 1 implementation
    if (type === LeaseType.WRITE || type === 'WRITE') {
      throw new Error(
        `${ERR.WRITE_LEASE_NOT_IMPLEMENTED}: LeaseType.WRITE is reserved for Phase 2. Do not acquire in Phase 1.`
      );
    }

    await this.assertNoActiveLease();

    const leaseId = Crypto.randomUUID();
    let deviceId: string;
    try {
      deviceId = getDeviceId();
    } catch (err) {
      if (!isTestEnv) throw err;
      deviceId = 'DEV-DEVICE-ID';
    }
    const currentTime = now();
    const expiresAt = addMinutes(new Date(), ttlMinutes).toISOString();

    // Step 8, v7.20 FIX-V720-1 & v7.40 FIX-V740-8: Synchronous transaction execution
    safeTransaction((tx) => {
      leaseRepository.insert(tx, {
        id: leaseId,
        leaseType: type,
        firmId: firmId ?? null,
        acquiredAt: currentTime,
        expiresAt,
        deviceId,
      });
    });

    // SETSTATE-OUTSIDE-TX COROLLARY: Update Zustand store strictly AFTER transaction commits
    useLeaseStore.setState({
      activeLease: {
        id: leaseId,
        type,
        leaseType: type,
        acquiredAt: currentTime,
      },
    });

    this.startHeartbeat(leaseId, ttlMinutes);
    return leaseId;
  },

  /**
   * Releases a lease by ID and clears store.
   */
  async release(leaseId: string): Promise<void> {
    this.stopHeartbeat();
    const targetDb = getDb();

    try {
      leaseRepository.delete(targetDb, leaseId);
    } catch (error) {
      console.error(
        '[Lease] DB delete failed — orphan lease will be purged on next restart:',
        error
      );
    } finally {
      useLeaseStore.setState({ activeLease: null });
    }
  },

  /**
   * Deletes all expired leases from DB.
   */
  async purgeExpired(): Promise<void> {
    const targetDb = getDb();
    const delQuery = targetDb
      .delete(writerLeases)
      .where(sql`${writerLeases.expiresAt} <= datetime('now')`);
    if (typeof delQuery.run === 'function') {
      delQuery.run();
    } else {
      await delQuery;
    }

    const active = useLeaseStore.getState().activeLease;
    if (active) {
      const selQuery = targetDb
        .select()
        .from(writerLeases)
        .where(eq(writerLeases.id, active.id))
        .limit(1);
      const activeFromDb =
        typeof selQuery.all === 'function' ? selQuery.all() : await selQuery;

      if (!activeFromDb || activeFromDb.length === 0) {
        useLeaseStore.setState({ activeLease: null });
      }
    }
  },

  /**
   * Returns the current non-expired lease from DB, or null.
   */
  async getActiveLease() {
    const targetDb = getDb();
    const query = targetDb
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1);
    const active = typeof query.all === 'function' ? query.all() : await query;

    return active && active.length > 0 ? active[0] : null;
  },

  // ============================================================================
  // HEARTBEAT MECHANISM (HARDENING 3 + v7.47 FIX-V747-3)
  // ============================================================================

  startHeartbeat(leaseId: string, ttlMinutes: number = LEASE_TTL_MINUTES): void {
    currentLeaseId = leaseId;
    currentTtlMinutes = ttlMinutes;
    this.clearTimers();

    const intervalMs = Math.floor((ttlMinutes * 60 * 1000) / 2); // fires at half-TTL
    heartbeatTimer = setInterval(() => {
      void this.pushHeartbeat();
    }, intervalMs);

    appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          void this.pushHeartbeat();
        }
      }
    );
  },

  stopHeartbeat(): void {
    this.clearTimers();
    currentLeaseId = null;
    currentTtlMinutes = LEASE_TTL_MINUTES;
  },

  clearTimers(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  },

  async pushHeartbeat(): Promise<void> {
    if (!currentLeaseId) return;

    try {
      const newExpiresAt = addMinutes(new Date(), currentTtlMinutes).toISOString();
      const result = leaseRepository.extendTTL(currentLeaseId, newExpiresAt);

      if (result && result.changes === 0) {
        this.stopHeartbeat();
        console.warn('Lease gone — heartbeat stopped');
      }
    } catch (error) {
      console.error('[Lease] Heartbeat failed:', error);
      this.stopHeartbeat();
    }
  },
};

export const assertNoActiveLease = leaseService.assertNoActiveLease.bind(leaseService);
export const acquireLease = leaseService.acquire.bind(leaseService);
export const releaseLease = leaseService.release.bind(leaseService);
export const startLeaseHeartbeat = leaseService.startHeartbeat.bind(leaseService);
export const stopLeaseHeartbeat = leaseService.stopHeartbeat.bind(leaseService);
export default leaseService;
