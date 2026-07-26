import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { oldGoldLots } from '../db/schema';
import type { DrizzleTransaction, OldGoldLot, OldGoldLotStatus } from '../types/phase2.types';
import { now } from '../utils/now';

export const oldGoldLotRepository = {
  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: typeof oldGoldLots.$inferInsert): OldGoldLot {
    tx.insert(oldGoldLots).values(data).run();
    const result = tx.select().from(oldGoldLots).where(eq(oldGoldLots.id, data.id as string)).limit(1).get();
    return result as unknown as OldGoldLot;
  },

  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): OldGoldLot | null {
    const result = tx.select().from(oldGoldLots).where(and(eq(oldGoldLots.id, id), eq(oldGoldLots.firmId, firmId))).limit(1).get();
    return (result as unknown as OldGoldLot) || null;
  },

  // Operates globally outside a transaction — safely left as async
  async findByFirmId(firmId: string): Promise<OldGoldLot[]> {
    return db.select().from(oldGoldLots).where(eq(oldGoldLots.firmId, firmId));
  },

  // FIX-V718-1: Synchronous execution using .run()
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: OldGoldLotStatus): void {
    tx.update(oldGoldLots)
      .set({ status, updatedAt: now() })
      .where(and(eq(oldGoldLots.id, id), eq(oldGoldLots.firmId, firmId)))
      .run();
  },

  delete(tx: DrizzleTransaction, firmId: string, id: string): void {
    tx.delete(oldGoldLots).where(and(eq(oldGoldLots.id, id), eq(oldGoldLots.firmId, firmId))).run();
  },

  // Operates globally outside a transaction — safely left as async
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
  },

  // FEAT-GAP5-REFINERYPENDING-1 (v1.66)
  // Operates globally outside a transaction — safely left as async
  async getPendingRefineryLots(firmId: string): Promise<OldGoldLot[]> {
    return db
      .select()
      .from(oldGoldLots)
      .where(
        and(
          eq(oldGoldLots.firmId, firmId),
          inArray(oldGoldLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
        )
      )
      .orderBy(desc(oldGoldLots.createdAt));
  }
};