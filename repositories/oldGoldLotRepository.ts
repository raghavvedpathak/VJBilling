import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { oldGoldLots } from '../db/schema';
import type { DrizzleTransaction, OldGoldLot, OldGoldLotStatus } from '../types/phase2.types';
import { now } from '../utils/now';

export const oldGoldLotRepository = {
  async insert(tx: DrizzleTransaction, data: typeof oldGoldLots.$inferInsert): Promise<OldGoldLot> {
    const result = await tx.insert(oldGoldLots).values(data).returning();
    return result[0];
  },

  async getById(id: string): Promise<OldGoldLot | null> {
    const result = await db.select().from(oldGoldLots).where(eq(oldGoldLots.id, id)).limit(1);
    return result[0] || null;
  },

  async findByFirmId(firmId: string): Promise<OldGoldLot[]> {
    return db.select().from(oldGoldLots).where(eq(oldGoldLots.firmId, firmId));
  },

  async updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: OldGoldLotStatus): Promise<void> {
    await tx.update(oldGoldLots)
      .set({ status, updatedAt: now() })
      .where(and(eq(oldGoldLots.id, id), eq(oldGoldLots.firmId, firmId)));
  },

  async findAvailableForIssuance(firmId: string): Promise<OldGoldLot[]> {
    return db
      .select()
      .from(oldGoldLots)
      .where(
        and(
          eq(oldGoldLots.firmId, firmId),
          eq(oldGoldLots.status, 'RECEIVED'),
          eq(oldGoldLots.metalSource, 'MELT_OUTPUT')
        )
      );
  }
};
