// repositories/safeModeRepository.ts
// Strict DB access layer for safe_mode_state singleton table (id = 1).

import { eq } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { safeModeState } from '@/db/schema';

export type SafeModeStateRow = typeof safeModeState.$inferSelect;
export type NewSafeModeState = typeof safeModeState.$inferInsert;

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const safeModeRepository = {
  /**
   * Reads the current Safe Mode singleton state (id = 1).
   */
  get(tx?: DbOrTx): SafeModeStateRow | null {
    const targetTx = getDb(tx);
    const result = targetTx
      .select()
      .from(safeModeState)
      .where(eq(safeModeState.id, 1))
      .limit(1)
      .get();

    return result ?? null;
  },

  /**
   * Upserts the Safe Mode singleton row (id = 1).
   * Supports both (tx, data) and (data, tx) argument orders.
   */
  upsert(arg1: any, arg2?: any): void {
    let tx: DbOrTx = db;
    let data: Partial<NewSafeModeState> = {};

    if (arg1 && typeof arg1 === 'object' && ('isActive' in arg1 || 'reason' in arg1)) {
      data = arg1;
      tx = arg2 || db;
    } else {
      tx = arg1 || db;
      data = arg2 || {};
    }

    const targetTx = getDb(tx);
    const { id: _ignored, ...updateFields } = { ...data, id: 1 };

    targetTx
      .insert(safeModeState)
      .values({ ...data, id: 1 } as NewSafeModeState)
      .onConflictDoUpdate({
        target: safeModeState.id,
        set: updateFields,
      })
      .run();
  },
};