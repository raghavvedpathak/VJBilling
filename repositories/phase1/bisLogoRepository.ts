// repositories/bisLogoRepository.ts
// Strict DB access layer for bis_logos table.

import * as Crypto from 'expo-crypto';
import { eq, and } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { bisLogos } from '@/db/schema';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function resolveTxAndFirmId(arg1: any, arg2?: any): { tx: DbOrTx; firmId: string } {
  if (typeof arg1 === 'string') {
    return { firmId: arg1, tx: getDb(arg2) };
  }
  return { tx: getDb(arg1), firmId: arg2 };
}

export const bisLogoRepository = {
  /**
   * Inserts a new BIS logo record. Supports both (tx, entry) and (entry, tx).
   */
  insert(arg1: any, arg2?: any): string {
    let tx: DbOrTx = getDb();
    let entry: { firmId: string; fileRef: string } = { firmId: '', fileRef: '' };

    if (arg1 && typeof arg1 === 'object' && 'firmId' in arg1) {
      entry = arg1;
      tx = getDb(arg2);
    } else {
      tx = getDb(arg1);
      entry = arg2;
    }

    const id = Crypto.randomUUID();

    tx.insert(bisLogos)
      .values({
        id,
        firmId: entry.firmId,
        fileRef: entry.fileRef,
        isArchived: 0,
        createdAt: now(),
      })
      .run();

    return id;
  },

  /**
   * Soft-deletes / archives a BIS logo record.
   * Supports (tx, bisLogoId, reason?), (firmId, bisLogoId, reason?, tx), and (bisLogoId, tx).
   */
  archive(arg1: any, arg2?: any, arg3?: any, arg4?: any): void {
    let tx: DbOrTx = getDb();
    let bisLogoId: string = '';
    let reason: string = 'licence_removed';

    if (arg1 && typeof arg1 === 'object' && 'update' in arg1) {
      // (tx, bisLogoId, reason)
      tx = getDb(arg1);
      bisLogoId = arg2;
      if (typeof arg3 === 'string') reason = arg3;
    } else if (arg4 && typeof arg4 === 'object' && 'update' in arg4) {
      // (firmId, bisLogoId, reason, tx)
      tx = getDb(arg4);
      bisLogoId = arg2;
      if (typeof arg3 === 'string') reason = arg3;
    } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      bisLogoId = arg2;
      if (typeof arg3 === 'string') reason = arg3;
      tx = getDb(arg4);
    } else if (typeof arg1 === 'string') {
      bisLogoId = arg1;
      if (typeof arg2 === 'string') reason = arg2;
      tx = getDb(arg3);
    }

    if (!bisLogoId) return;

    tx.update(bisLogos)
      .set({
        isArchived: 1,
        archivedAt: now(),
        archivedReason: reason,
      })
      .where(eq(bisLogos.id, bisLogoId))
      .run();
  },

  /**
   * Finds the active BIS logo for a given firmId. Supports both (tx, firmId) and (firmId, tx).
   */
  findActiveByFirmId(arg1: any, arg2?: any): any {
    const { tx, firmId } = resolveTxAndFirmId(arg1, arg2);

    const row = tx
      .select()
      .from(bisLogos)
      .where(and(eq(bisLogos.firmId, firmId), eq(bisLogos.isArchived, 0)))
      .limit(1)
      .get();

    return row ?? null;
  },
};