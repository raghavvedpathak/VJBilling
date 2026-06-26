import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { itemEvents } from '../db/schema';
import type { DrizzleTransaction, ItemEventType } from '../types/phase2.types';
import * as Crypto from 'expo-crypto';

export const itemEventRepository = {
  async insert(tx: DrizzleTransaction, data: Omit<typeof itemEvents.$inferInsert, 'id'>) {
    await tx.insert(itemEvents).values({
      ...data,
      id: Crypto.randomUUID(),
    });
  },

  async deleteByItemId(tx: DrizzleTransaction, firmId: string, itemId: string): Promise<void> {
    await tx.delete(itemEvents).where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId)));
  },

  async findByItemId(firmId: string, itemId: string) {
    return await db.select().from(itemEvents).where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId)));
  },

  async countByItemIdAndEventType(tx: DrizzleTransaction, firmId: string, itemId: string, eventType: ItemEventType): Promise<number> {
    const result = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(itemEvents)
      .where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId), eq(itemEvents.eventType, eventType as any)));
    return Number(result[0]?.count) || 0;
  }
};
