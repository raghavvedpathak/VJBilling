import { eq, and, or, like, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { gemstoneLots } from '../db/schema';
import type { DrizzleTransaction, GemstoneLot, GemstoneStatus } from '../types/phase2.types';
import { now } from '../utils/now';

type NewGemstoneLot = typeof gemstoneLots.$inferInsert;

export const gemstoneLotRepository = {
  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: NewGemstoneLot): GemstoneLot {
    tx.insert(gemstoneLots).values(data).run();
    const result = tx.select().from(gemstoneLots).where(eq(gemstoneLots.id, data.id)).limit(1).get();
    return result as unknown as GemstoneLot;
  },

  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, id: string, firmId: string): GemstoneLot | null {
    const lot = tx
      .select()
      .from(gemstoneLots)
      .where(
        and(
          eq(gemstoneLots.id, id),
          eq(gemstoneLots.firmId, firmId)
        )
      )
      .limit(1)
      .get();
    return (lot as unknown as GemstoneLot) || null;
  },

  // Operates globally outside a transaction — safely left as async
  async findByFirmId(firmId: string): Promise<GemstoneLot[]> {
    return db
      .select()
      .from(gemstoneLots)
      .where(eq(gemstoneLots.firmId, firmId));
  },

  // Operates globally outside a transaction — safely left as async
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

  // FIX-V718-1: Synchronous execution using .run()
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: GemstoneStatus): void {
    tx
      .update(gemstoneLots)
      .set({ status, updatedAt: now() })
      .where(
        and(
          eq(gemstoneLots.id, id),
          eq(gemstoneLots.firmId, firmId)
        )
      )
      .run();
  },

  // Operates globally outside a transaction — safely left as async
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