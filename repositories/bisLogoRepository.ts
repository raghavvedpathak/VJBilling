import * as Crypto from 'expo-crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { bisLogos } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export const bisLogoRepository = {

  async insert(entry: { firmId: string; fileRef: string }, tx: DbOrTx = db): Promise<string> {
    const id = Crypto.randomUUID();

    await tx.insert(bisLogos).values({
      id,
      firmId: entry.firmId,
      fileRef: entry.fileRef,
      isArchived: 0,
      createdAt: now(),
    });

    return id;
  },

  async archive(firmId: string, bisLogoId: string, reason: string = 'licence_removed', tx: DbOrTx = db): Promise<void> {
    await tx
      .update(bisLogos)
      .set({
        isArchived: 1,
        archivedAt: now(),
        archivedReason: reason,
      })
      .where(and(eq(bisLogos.id, bisLogoId), eq(bisLogos.firmId, firmId)));
  },

  // v6.6 BUG FIX: Required by updateFirm() to get the UUID id of the active bis_logo row
  async findActiveByFirmId(firmId: string, tx: DbOrTx = db): Promise<any> {
    const rows = await tx
      .select()
      .from(bisLogos)
      .where(and(eq(bisLogos.firmId, firmId), eq(bisLogos.isArchived, 0)))
      .limit(1);
    return rows[0] ?? null;
  },
};