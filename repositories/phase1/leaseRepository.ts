// repositories/leaseRepository.ts
// Strict DB access layer for writer_leases table.

import { eq, sql } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { writerLeases } from '@/db/schema';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const leaseRepository = {
  /**
   * Synchronous insert for writer_leases.
   * Supports both (tx, data) and (data, tx).
   */
  insert(arg1: any, arg2?: any): void {
    let tx: DbOrTx = db;
    let data: any = {};

    if (arg1 && typeof arg1 === 'object' && 'leaseType' in arg1) {
      data = arg1;
      tx = arg2 || db;
    } else {
      tx = arg1 || db;
      data = arg2 || {};
    }

    const targetTx = getDb(tx);
    targetTx.insert(writerLeases).values(data).run();
  },

  /**
   * Extends lease TTL for heartbeat execution.
   */
  extendTTL(leaseId: string, newExpiresAt: string): { changes: number } {
    const targetTx = getDb();
    const result = targetTx
      .update(writerLeases)
      .set({ expiresAt: newExpiresAt })
      .where(eq(writerLeases.id, leaseId))
      .run();

    return { changes: result?.changes ?? 0 };
  },

  /**
   * Returns the first active (non-expired) lease from DB using SQLite's native datetime('now').
   */
  getActiveLease(tx?: DbOrTx): any {
    const targetTx = getDb(tx);
    const result = targetTx
      .select()
      .from(writerLeases)
      .where(sql`${writerLeases.expiresAt} > datetime('now')`)
      .limit(1)
      .get();

    return result ?? null;
  },

  /**
   * Deletes a lease by ID. Supports both (leaseId, tx) and (tx, leaseId).
   */
  delete(arg1: any, arg2?: any): void {
    let tx: DbOrTx = db;
    let leaseId: string = '';

    if (typeof arg1 === 'string') {
      leaseId = arg1;
      tx = arg2 || db;
    } else {
      tx = arg1 || db;
      leaseId = arg2;
    }

    if (!leaseId) return;

    const targetTx = getDb(tx);
    targetTx.delete(writerLeases).where(eq(writerLeases.id, leaseId)).run();
  },

  /**
   * Deletes all leases (used during app boot cleanup).
   */
  deleteAll(tx?: DbOrTx): void {
    const targetTx = getDb(tx);
    targetTx.delete(writerLeases).run();
  },
};