import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { stones } from '../db/schema';
import type { DrizzleTransaction, Stone } from '../types/phase2.types';
import { now } from '../utils/now';

type NewStone = typeof stones.$inferInsert;

export const stoneRepository = {
  async insert(tx: DrizzleTransaction, data: NewStone): Promise<Stone> {
    const [inserted] = await tx.insert(stones).values(data).returning();
    return inserted;
  },

  async getById(tx: DrizzleTransaction, id: string, firmId: string): Promise<Stone | null> {
    const [stone] = await tx
      .select()
      .from(stones)
      .where(
        and(
          eq(stones.id, id),
          eq(stones.firmId, firmId)
        )
      )
      .limit(1);

    return stone || null;
  },

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

  async softDelete(tx: DrizzleTransaction, id: string, firmId: string): Promise<void> {
    await tx
      .update(stones)
      .set({ isActive: 0, updatedAt: now() })
      .where(
        and(
          eq(stones.id, id),
          eq(stones.firmId, firmId)
        )
      );
  }
};
