import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { stones } from '../db/schema';
import type { DrizzleTransaction, Stone } from '../types/phase2.types';
import { now } from '../utils/now';

type NewStone = typeof stones.$inferInsert;

export const stoneRepository = {
  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: NewStone): Stone {
    tx.insert(stones).values(data).run();
    const result = tx.select().from(stones).where(eq(stones.id, data.id)).limit(1).get();
    return result as unknown as Stone;
  },

  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, id: string, firmId: string): Stone | null {
    const stone = tx
      .select()
      .from(stones)
      .where(
        and(
          eq(stones.id, id),
          eq(stones.firmId, firmId)
        )
      )
      .limit(1)
      .get();

    return (stone as unknown as Stone) || null;
  },

  // Operates globally outside a transaction — safely left as async
  async findByFirmId(firmId: string): Promise<Stone[]> {
    return db
      .select()
      .from(stones)
      .where(
        and(
          eq(stones.firmId, firmId),
          eq(stones.isActive, 1)
        )
      );
  },

  // FIX-V718-1: Synchronous execution using .run()
  softDelete(tx: DrizzleTransaction, id: string, firmId: string): void {
    tx.update(stones)
      .set({ isActive: 0, updatedAt: now() })
      .where(
        and(
          eq(stones.id, id),
          eq(stones.firmId, firmId)
        )
      )
      .run();
  }
};