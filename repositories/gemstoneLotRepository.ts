// repositories/gemstoneLotRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, or, like, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { gemstoneLots } from '../db/schema';
import type { DrizzleTransaction, GemstoneLot, GemstoneStatus, NewGemstoneLot } from '../types/phase2.types';
import { now } from '../utils/now';

export interface GemstoneLotRepository {
  // --- insert (Step 4.5 / createGemstoneLot) ---
  insert(tx: DrizzleTransaction, data: NewGemstoneLot): GemstoneLot;

  // --- getById (Overloaded for (id), (tx, id), and (tx, id, firmId) / (tx, firmId, id)) ---
  getById(id: string): Promise<GemstoneLot | null>;
  getById(tx: DrizzleTransaction, id: string): GemstoneLot | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): GemstoneLot | null;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<GemstoneLot[]>;

  // --- findByStatus ---
  findByStatus(firmId: string, status: GemstoneStatus): Promise<GemstoneLot[]>;

  // --- updateStatus (Overloaded for 3-arg (tx, id, status) and 4-arg (tx, firmId, id, status)) ---
  updateStatus(tx: DrizzleTransaction, id: string, status: GemstoneStatus): void;
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: GemstoneStatus): void;

  // --- search (GEMSTONE-1 v1.21 & RED-7) ---
  search(firmId: string, query: string): Promise<GemstoneLot[]>;
}

export const gemstoneLotRepository: GemstoneLotRepository = {
  insert(tx: DrizzleTransaction, data: NewGemstoneLot): GemstoneLot {
    tx.insert(gemstoneLots).values(data).run();
    const result = tx.select().from(gemstoneLots).where(eq(gemstoneLots.id, data.id!)).get();
    return result as GemstoneLot;
  },

  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(gemstoneLots).where(eq(gemstoneLots.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // Handles both (tx, id, firmId) and (tx, firmId, id)
      const res = tx
        .select()
        .from(gemstoneLots)
        .where(
          and(
            eq(gemstoneLots.id, second!),
            eq(gemstoneLots.firmId, third)
          )
        )
        .get();
      if (res) return res as GemstoneLot;

      // Fallback check swapping order (tx, firmId, id)
      const resSwapped = tx
        .select()
        .from(gemstoneLots)
        .where(
          and(
            eq(gemstoneLots.id, third),
            eq(gemstoneLots.firmId, second!)
          )
        )
        .get();
      return (resSwapped as GemstoneLot) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(gemstoneLots).where(eq(gemstoneLots.id, second!)).get();
    return (res as GemstoneLot) || null;
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
      .limit(20); // RED-7
  }
};