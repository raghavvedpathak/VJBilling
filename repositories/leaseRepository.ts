import { eq, gt } from 'drizzle-orm';
import { db } from '../db/client';
import { writerLeases } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export const leaseRepository = {

  async insert(tx: DbOrTx, data: any) {
    await tx.insert(writerLeases).values(data);
  },

  async extendTTL(leaseId: string, newExpiresAt: string) {
    const result = await db.update(writerLeases)
      .set({ expiresAt: newExpiresAt })
      .where(eq(writerLeases.id, leaseId));

    const changes = (result as any)?.changes ?? (result as any)?.rowsAffected ?? 1;
    return { changes };
  },

  /**
   * Returns the first non-expired lease, or null if the system is free.
   * Used by LeaseStatusBanner to check lock state without importing db or schema directly.
   * "Active" means: expiresAt > now() — same filter leaseService uses for assertNoActiveLease().
   */
  async getActiveLease(tx: DbOrTx = db) {
    const result = await tx
      .select()
      .from(writerLeases)
      .where(gt(writerLeases.expiresAt, now()))
      .limit(1);

    return result[0] ?? null;
  },

  async delete(leaseId: string, tx: DbOrTx = db) {
    await tx.delete(writerLeases).where(eq(writerLeases.id, leaseId));
  },

  async deleteAll(tx: DbOrTx = db) {
    await tx.delete(writerLeases);
  },
};