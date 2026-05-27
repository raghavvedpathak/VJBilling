// services/leaseService.ts
// Concurrency guard — session-scoped writer leases.
// v5.1 S2 Gap: Heartbeat at half-TTL to extend lease during long operations.
// v6.5 GAP 5: LeaseType.WRITE acquisition throws immediately — reserved for Phase 2.
//
// CONSTITUTIONAL RULES:
//   - acquire(), release(), purgeExpired() ALWAYS use top-level db — NEVER a tx context.
//     A tx-scoped lease check sees a partial DB view, defeating isolation.
//   - All leases are purged on every app restart (bootstrapService Step 3 — no WHERE clause).
//   - LeaseType.WRITE must never be acquired in Phase 1.

import * as Crypto from 'expo-crypto';
import { eq, lt, gt } from 'drizzle-orm';
import { AppState, AppStateStatus } from 'react-native';
import { db } from '../db/client';
import { writerLeases, LeaseType } from '../db/schema';
import { leaseRepository } from '../repositories/leaseRepository';
import { useLeaseStore } from '../store/leaseStore';
import { getDeviceId } from '../utils/deviceId';
import { LEASE_TTL_MINUTES } from '../constants/leaseConfig';
import { now } from '../utils/now';
import { addMinutes } from '../utils/addMinutes';

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: any = null;
let currentLeaseId: string | null = null;

export const leaseService = {

  /**
   * Throws if any non-expired lease exists in the DB.
   * Always uses top-level db — never a transaction context.
   * Constitutional rule: tx-scoped check sees partial DB view, defeating isolation.
   */
  async assertNoActiveLease(): Promise<void> {
    const currentTime = now();
    const existing = await db
      .select()
      .from(writerLeases)
      .where(gt(writerLeases.expiresAt, currentTime))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`LEASE_HELD: System is busy with ${existing[0].leaseType}`);
    }
  },

  /**
   * Acquires a named writer lease. Returns the leaseId.
   * Always uses top-level db — never accepts a tx context.
   * LeaseType.WRITE is blocked in Phase 1 (v6.5 GAP 5).
   *
   * FIX: setActiveLease now passes `leaseType` (not `type`) to match the
   * corrected ActiveLease interface in leaseStore. The old `type` field caused
   * a TypeScript error after leaseStore was fixed to use `leaseType`.
   */
  async acquire(type: string, firmId?: string): Promise<string> {
    // v6.5 GAP 5: Phase 2 Write Block
    if (type === LeaseType.WRITE) {
      throw new Error(
        'WRITE_LEASE_NOT_IMPLEMENTED: LeaseType.WRITE is reserved for Phase 2. Do not acquire in Phase 1.'
      );
    }

    await this.assertNoActiveLease();

    const newId = Crypto.randomUUID();
    const deviceId = await getDeviceId();
    const currentTime = now();
    const expiresAt = addMinutes(new Date(), LEASE_TTL_MINUTES).toISOString();

    await leaseRepository.insert(db, {
      id: newId,
      leaseType: type,
      firmId: firmId ?? null,
      acquiredAt: currentTime,
      expiresAt,
      deviceId,
    });

    // FIX: field name is `leaseType` — matches corrected ActiveLease interface
    useLeaseStore.getState().setActiveLease({
      id: newId,
      leaseType: type,   // was `type` — now `leaseType` per leaseStore fix
      acquiredAt: currentTime,
    });

    this.startHeartbeat(newId);
    return newId;
  },

  /**
   * Releases a lease by ID.
   * Always uses top-level db — never accepts a tx context.
   * Clears UI store and stops heartbeat regardless of DB success.
   */
  async release(leaseId: string): Promise<void> {
    this.stopHeartbeat();

    try {
      await leaseRepository.delete(leaseId, db);
      useLeaseStore.getState().setActiveLease(null);
    } catch (error) {
      console.error('[Lease] DB delete failed — orphan lease will be purged on next restart:', error);
      useLeaseStore.getState().setActiveLease(null);
    }
  },

  /**
   * Deletes all expired leases from DB.
   * Always uses top-level db — never accepts a tx context.
   * Also clears UI store if the active lease was already purged.
   */
  async purgeExpired(): Promise<void> {
    const currentTime = now();
    await db.delete(writerLeases).where(lt(writerLeases.expiresAt, currentTime));

    const active = useLeaseStore.getState().activeLease;
    if (active) {
      const activeFromDb = await db
        .select()
        .from(writerLeases)
        .where(eq(writerLeases.id, active.id))
        .limit(1);
      if (activeFromDb.length === 0) {
        useLeaseStore.getState().setActiveLease(null);
      }
    }
  },

  /**
   * Returns the current non-expired lease from DB, or null.
   * leaseService owns this query directly — not through leaseRepository —
   * because constitutional rule mandates top-level db for all lease checks.
   */
  async getActiveLease() {
    const currentTime = now();
    const [active] = await db
      .select()
      .from(writerLeases)
      .where(gt(writerLeases.expiresAt, currentTime))
      .limit(1);

    return active ?? null;
  },

  // ============================================================================
  // HEARTBEAT MECHANISM (v5.1 S2 Gap)
  // Fires at half-TTL to extend lease during long operations.
  // AppState listener handles iOS background/foreground transitions.
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
        // Lease already purged (e.g. restart wiped it) — stop gracefully
        this.clearTimers();
        console.warn('[Lease] Lease gone — heartbeat stopped gracefully.');
      }
    } catch (error) {
      console.error('[Lease] Heartbeat failed:', error);
      this.clearTimers();
    }
  },
};