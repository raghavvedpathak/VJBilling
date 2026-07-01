import * as Crypto from 'expo-crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { bisLogos } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export const bisLogoRepository = {

  // FIX-V718-1: Synchronous execution, returns string
  insert(entry: { firmId: string; fileRef: string }, tx: DbOrTx = db): string {
    const id = Crypto.randomUUID();

    tx.insert(bisLogos).values({
      id,
      firmId: entry.firmId,
      fileRef: entry.fileRef,
      isArchived: 0,
      createdAt: now(),
    }).run();

    return id;
  },

  // FIX-V718-1: Synchronous execution
  archive(firmId: string, bisLogoId: string, reason: string = 'licence_removed', tx: DbOrTx = db): void {
    tx.update(bisLogos)
      .set({
        isArchived: 1,
        archivedAt: now(),
        archivedReason: reason,
      })
      .where(and(eq(bisLogos.id, bisLogoId), eq(bisLogos.firmId, firmId)))
      .run();
  },

  // v6.6 BUG FIX: Required by updateFirm() to get the UUID id of the active bis_logo row
  // FIX-V718-1: Synchronous execution using .get()
  findActiveByFirmId(firmId: string, tx: DbOrTx = db): any {
    const row = tx
      .select()
      .from(bisLogos)
      .where(and(eq(bisLogos.firmId, firmId), eq(bisLogos.isArchived, 0)))
      .limit(1)
      .get();
    return row ?? null;
  },
};