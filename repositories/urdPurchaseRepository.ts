// repositories/urdPurchaseRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { urdPurchases } from '../db/schema';
import type { DrizzleTransaction, URDPurchase, NewURDPurchase } from '../types/phase2.types';
import { now } from '../utils/now';

export interface URDPurchaseRepository {
  // --- insert (Step 12.11 createURDPurchase) ---
  insert(tx: DrizzleTransaction, data: NewURDPurchase): URDPurchase;

  // --- getById (Overloaded for (id), (tx, id), and (tx, firmId, id)) ---
  getById(id: string): Promise<URDPurchase | null>;
  getById(tx: DrizzleTransaction, id: string): URDPurchase | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): URDPurchase | null;

  // --- update (Overloaded to support 3-arg and 4-arg calls - Step 12.11 confirmURDPurchase) ---
  update(tx: DrizzleTransaction, id: string, data: Partial<NewURDPurchase>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<NewURDPurchase>): void;

  // --- delete (Overloaded to support 2-arg and 3-arg calls) ---
  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<URDPurchase[]>;

  // --- findByCustomerId ---
  findByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]>;
}

export const urdPurchaseRepository: URDPurchaseRepository = {
  insert(tx: DrizzleTransaction, data: NewURDPurchase): URDPurchase {
    tx.insert(urdPurchases).values(data).run();
    const result = tx.select().from(urdPurchases).where(eq(urdPurchases.id, data.id!)).get();
    return result as URDPurchase;
  },

  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(urdPurchases).where(eq(urdPurchases.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg call: getById(tx, firmId, id)
      const res = tx.select().from(urdPurchases).where(and(eq(urdPurchases.id, third), eq(urdPurchases.firmId, second!))).get();
      return (res as URDPurchase) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(urdPurchases).where(eq(urdPurchases.id, second!)).get();
    return (res as URDPurchase) || null;
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<NewURDPurchase>,
    fourth?: Partial<NewURDPurchase>
  ): void {
    if (typeof third === 'object') {
      // 3-arg call: update(tx, id, data)
      tx.update(urdPurchases)
        .set(third)
        .where(eq(urdPurchases.id, second))
        .run();
    } else {
      // 4-arg call: update(tx, firmId, id, data)
      tx.update(urdPurchases)
        .set(fourth!)
        .where(and(eq(urdPurchases.id, third as string), eq(urdPurchases.firmId, second)))
        .run();
    }
  },

  delete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      tx.delete(urdPurchases).where(eq(urdPurchases.id, second)).run();
    } else {
      tx.delete(urdPurchases).where(and(eq(urdPurchases.id, third), eq(urdPurchases.firmId, second))).run();
    }
  },

  async findByFirmId(firmId: string): Promise<URDPurchase[]> {
    return db.select()
      .from(urdPurchases)
      .where(eq(urdPurchases.firmId, firmId))
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  },

  async findByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]> {
    return db.select()
      .from(urdPurchases)
      .where(
        and(
          eq(urdPurchases.firmId, firmId),
          eq(urdPurchases.customerId, customerId)
        )
      )
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  }
};