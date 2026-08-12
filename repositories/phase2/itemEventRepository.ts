// repositories/phase2/itemEventRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { itemEvents } from '@/db/schema';
import type { DrizzleTransaction, ItemEvent, ItemEventType, NewItemEvent } from '@/types/phase2/phase2.types';
import * as Crypto from 'expo-crypto';

export interface ItemEventRepository {
  // --- insert (Accepts id from caller or auto-generates if omitted) ---
  insert(tx: DrizzleTransaction, data: Omit<NewItemEvent, 'id'> & { id?: string }): ItemEvent;

  // --- deleteByItemId (Overloaded for (tx, itemId) and (tx, firmId, itemId) - Step 6.7.1 deleteItem) ---
  deleteByItemId(tx: DrizzleTransaction, itemId: string): void;
  deleteByItemId(tx: DrizzleTransaction, firmId: string, itemId: string): void;

  // --- findByItemId (Sync tx overload and async standalone) ---
  findByItemId(itemId: string): Promise<ItemEvent[]>;
  findByItemId(firmId: string, itemId: string): Promise<ItemEvent[]>;
  findByItemId(tx: DrizzleTransaction, itemId: string): ItemEvent[];

  // --- countByItemIdAndEventType (Step 10.7 / sendToKarigar) ---
  // Overloaded for 3-arg (tx, itemId, eventType) and 4-arg (tx, firmId, itemId, eventType)
  countByItemIdAndEventType(tx: DrizzleTransaction, itemId: string, eventType: ItemEventType): number;
  countByItemIdAndEventType(tx: DrizzleTransaction, firmId: string, itemId: string, eventType: ItemEventType): number;
}

export const itemEventRepository: ItemEventRepository = {
  // --- insert (Accepts id from caller or auto-generates if omitted) ---
  insert(tx: DrizzleTransaction, data: Omit<NewItemEvent, 'id'> & { id?: string }): ItemEvent {
    const id = data.id ?? Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(itemEvents).values(row).run();
    return row as ItemEvent;
  },

  // --- deleteByItemId (Overloaded for (tx, itemId) and (tx, firmId, itemId) - Step 6.7.1 deleteItem) ---
  deleteByItemId(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      // 2-arg call: deleteByItemId(tx, itemId)
      tx.delete(itemEvents).where(eq(itemEvents.itemId, second)).run();
    } else {
      // 3-arg call: deleteByItemId(tx, firmId, itemId)
      tx.delete(itemEvents).where(and(eq(itemEvents.itemId, third), eq(itemEvents.firmId, second))).run();
    }
  },

  // --- findByItemId (Sync tx overload and async standalone) ---
  findByItemId(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        const firmId = first;
        const itemId = second;
        return db
          .select()
          .from(itemEvents)
          .where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.firmId, firmId)))
          .orderBy(desc(itemEvents.timestamp));
      }
      return db
        .select()
        .from(itemEvents)
        .where(eq(itemEvents.itemId, first))
        .orderBy(desc(itemEvents.timestamp));
    }
    const tx = first as DrizzleTransaction;
    const itemId = second!;
    return tx
      .select()
      .from(itemEvents)
      .where(eq(itemEvents.itemId, itemId))
      .orderBy(desc(itemEvents.timestamp))
      .all() as ItemEvent[];
  },

  // --- countByItemIdAndEventType (Step 10.7 / sendToKarigar) ---
  // Overloaded for 3-arg (tx, itemId, eventType) and 4-arg (tx, firmId, itemId, eventType)
  countByItemIdAndEventType(
    tx: DrizzleTransaction,
    second: string,
    third: string | ItemEventType,
    fourth?: ItemEventType
  ): number {
    let itemId: string;
    let eventType: ItemEventType;
    let firmIdFilter: string | undefined;

    if (fourth !== undefined) {
      // 4-arg call: countByItemIdAndEventType(tx, firmId, itemId, eventType)
      firmIdFilter = second;
      itemId = third as string;
      eventType = fourth;
    } else {
      // 3-arg call: countByItemIdAndEventType(tx, itemId, eventType)
      itemId = second;
      eventType = third as ItemEventType;
    }

    const conditions = [
      eq(itemEvents.itemId, itemId),
      eq(itemEvents.eventType, eventType)
    ];

    if (firmIdFilter) {
      conditions.push(eq(itemEvents.firmId, firmIdFilter));
    }

    const result = tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(itemEvents)
      .where(and(...conditions))
      .get();

    return Number(result?.count) || 0;
  }
};