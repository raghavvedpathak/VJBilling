// repositories/phase2/gemstoneLotRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and, or, like, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { gemstoneLots } from '@/db/schema';
import type { DrizzleTransaction, GemstoneLot, GemstoneStatus, NewGemstoneLot } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface GemstoneLotRepository {
  // --- insert (Step 4.5 / createGemstoneLot) ---
  insert(tx: DrizzleTransaction, data: NewGemstoneLot): GemstoneLot;

  // --- getById (Overloaded for (id), (id, firmId), (tx, id), and (tx, id, firmId) / (tx, firmId, id)) ---
  getById(id: string): Promise<GemstoneLot | null>;
  getById(id: string, firmId: string): Promise<GemstoneLot | null>;
  getById(tx: DrizzleTransaction, id: string): GemstoneLot | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): GemstoneLot | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): GemstoneLot | null;

  // --- findByFirmId (Sync tx overload and async standalone) ---
  findByFirmId(firmId: string): Promise<GemstoneLot[]>;
  findByFirmId(tx: DrizzleTransaction, firmId: string): GemstoneLot[];

  // --- findByStatus (Sync tx overload and async standalone) ---
  findByStatus(firmId: string, status: GemstoneStatus): Promise<GemstoneLot[]>;
  findByStatus(tx: DrizzleTransaction, firmId: string, status: GemstoneStatus): GemstoneLot[];

  // --- updateStatus (Overloaded for 3-arg (tx, id, status) and 4-arg (tx, firmId, id, status)) ---
  updateStatus(tx: DrizzleTransaction, id: string, status: GemstoneStatus): void;
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: GemstoneStatus): void;

  // --- search (GEMSTONE-1 v1.21 & RED-7 LIMIT 20) ---
  search(firmId: string, query: string): Promise<GemstoneLot[]>;
}

export const gemstoneLotRepository: GemstoneLotRepository = {
  insert(tx: DrizzleTransaction, data: NewGemstoneLot): GemstoneLot {
    const id = data.id ?? Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(gemstoneLots).values(row).run();
    const result = tx.select().from(gemstoneLots).where(eq(gemstoneLots.id, id)).get();
    return result as GemstoneLot;
  },

  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        // 2-arg async call: supports both (id, firmId) and (firmId, id)
        return db
          .select()
          .from(gemstoneLots)
          .where(
            or(
              and(eq(gemstoneLots.id, first), eq(gemstoneLots.firmId, second)),
              and(eq(gemstoneLots.id, second), eq(gemstoneLots.firmId, first))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      // 1-arg async call: getById(id)
      return db
        .select()
        .from(gemstoneLots)
        .where(eq(gemstoneLots.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // Handles both (tx, id, firmId) and (tx, firmId, id)
      const res = tx
        .select()
        .from(gemstoneLots)
        .where(
          or(
            and(eq(gemstoneLots.id, second!), eq(gemstoneLots.firmId, third)),
            and(eq(gemstoneLots.id, third), eq(gemstoneLots.firmId, second!))
          )
        )
        .get();
      return (res as GemstoneLot) || null;
    }
    // 2-arg sync call: getById(tx, id)
    const res = tx.select().from(gemstoneLots).where(eq(gemstoneLots.id, second!)).get();
    return (res as GemstoneLot) || null;
  },

  findByFirmId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(gemstoneLots)
        .where(eq(gemstoneLots.firmId, first))
        .orderBy(desc(gemstoneLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(gemstoneLots)
      .where(eq(gemstoneLots.firmId, firmId))
      .orderBy(desc(gemstoneLots.createdAt))
      .all() as GemstoneLot[];
  },

  findByStatus(first: DrizzleTransaction | string, second: string, third?: GemstoneStatus): any {
    if (typeof first === 'string') {
      const firmId = first;
      const status = second as GemstoneStatus;
      return db
        .select()
        .from(gemstoneLots)
        .where(
          and(
            eq(gemstoneLots.firmId, firmId),
            eq(gemstoneLots.status, status)
          )
        )
        .orderBy(desc(gemstoneLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second;
    const status = third!;
    return tx
      .select()
      .from(gemstoneLots)
      .where(
        and(
          eq(gemstoneLots.firmId, firmId),
          eq(gemstoneLots.status, status)
        )
      )
      .orderBy(desc(gemstoneLots.createdAt))
      .all() as GemstoneLot[];
  },

  updateStatus(
    tx: DrizzleTransaction,
    second: string,
    third: string | GemstoneStatus,
    fourth?: GemstoneStatus
  ): void {
    if (fourth !== undefined) {
      // 4-arg call: updateStatus(tx, firmId, id, status)
      tx.update(gemstoneLots)
        .set({ status: fourth, updatedAt: now() })
        .where(and(eq(gemstoneLots.id, third as string), eq(gemstoneLots.firmId, second)))
        .run();
    } else {
      // 3-arg call: updateStatus(tx, id, status)
      tx.update(gemstoneLots)
        .set({ status: third as GemstoneStatus, updatedAt: now() })
        .where(eq(gemstoneLots.id, second))
        .run();
    }
  },

  async search(firmId: string, query: string): Promise<GemstoneLot[]> {
    const cleanQuery = query.trim();
    const likeQuery = `%${cleanQuery}%`;
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
      .limit(20); // RED-7
  }
};