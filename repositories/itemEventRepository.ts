import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { itemEvents } from '../db/schema';
import type { DrizzleTransaction, ItemEventType } from '../types/phase2.types';
import * as Crypto from 'expo-crypto';

export const itemEventRepository = {
  // FIX-V718-1: Synchronous execution
  insert(tx: DrizzleTransaction, data: Omit<typeof itemEvents.$inferInsert, 'id'>) {
    const id = Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(itemEvents).values(row).run();
    return row;
  },

  // FIX-V718-1: Synchronous execution
  deleteByItemId(tx: DrizzleTransaction, firmId: string, itemId: string): void {
    tx.delete(itemEvents).where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId))).run();
  },

  // Operates globally outside a transaction — safely left as async
  async findByItemId(firmId: string, itemId: string) {
    return await db.select().from(itemEvents).where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId)));
  },

  // FIX-V718-1: Synchronous execution
  countByItemIdAndEventType(tx: DrizzleTransaction, firmId: string, itemId: string, eventType: ItemEventType): number {
    const result = tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(itemEvents)
      .where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId), eq(itemEvents.eventType, eventType as any)))
      .get();
    return Number((result as any)?.count) || 0;
  }
};