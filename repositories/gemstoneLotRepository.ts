import { eq, and, or, like, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { gemstoneLots } from '../db/schema';
import type { DrizzleTransaction, GemstoneLot, GemstoneStatus } from '../types/phase2.types';
import { now } from '../utils/now';

type NewGemstoneLot = typeof gemstoneLots.$inferInsert;

export const gemstoneLotRepository = {
  async insert(tx: DrizzleTransaction, data: NewGemstoneLot): Promise<GemstoneLot> {
    const [inserted] = await tx.insert(gemstoneLots).values(data).returning();
    return inserted;
  },

  async getById(tx: DrizzleTransaction, id: string, firmId: string): Promise<GemstoneLot | null> {
    const [lot] = await tx
      .select()
      .from(gemstoneLots)
      .where(
        and(
          eq(gemstoneLots.id, id),
          eq(gemstoneLots.firmId, firmId)
        )
      )
      .limit(1);
    return lot || null;
  },

  async findByFirmId(firmId: string): Promise<GemstoneLot[]> {
    return db
      .select()
      .from(gemstoneLots)
      .where(eq(gemstoneLots.firmId, firmId));
  },

  async findByStatus(firmId: string, status: GemstoneStatus): Promise<GemstoneLot[]> {
    return db
      .select()
      .from(gemstoneLots)
      .where(
        and(
          eq(gemstoneLots.firmId, firmId),
          eq(gemstoneLots.status, status)
        )
      );
  },

  async updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: GemstoneStatus): Promise<void> {
    await tx
      .update(gemstoneLots)
      .set({ status, updatedAt: now() })
      .where(
        and(
          eq(gemstoneLots.id, id),
          eq(gemstoneLots.firmId, firmId)
        )
      );
  },

  async search(firmId: string, query: string): Promise<GemstoneLot[]> {
    const likeQuery = `%${query}%`;
    return db
      .select()
      .from(gemstoneLots)
      .where(
        and(
          eq(gemstoneLots.firmId, firmId),
          eq(gemstoneLots.status, 'AVAILABLE'),
          or(
            like(gemstoneLots.name, likeQuery),
            like(gemstoneLots.supplierName, likeQuery)
          )
        )
      )
      .orderBy(desc(gemstoneLots.createdAt))
      .limit(20);
  }
};
