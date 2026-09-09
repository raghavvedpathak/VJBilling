// repositories/phase2/urdPurchaseRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and, or, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { urdPurchases } from '@/db/schema';
import type { DrizzleTransaction, URDPurchase, NewURDPurchase } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface URDPurchaseRepository {
  // --- insert (Step 12.11 createURDPurchase) ---
  insert(tx: DrizzleTransaction, data: NewURDPurchase): URDPurchase;

  // --- getById (Overloaded for (id), (id, firmId), (tx, id), and (tx, firmId, id)) ---
  getById(id: string): Promise<URDPurchase | null>;
  getById(id: string, firmId: string): Promise<URDPurchase | null>;
  getById(tx: DrizzleTransaction, id: string): URDPurchase | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): URDPurchase | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): URDPurchase | null;

  // --- update (Overloaded to support 3-arg and 4-arg calls - Step 12.11 confirmURDPurchase) ---
  update(tx: DrizzleTransaction, id: string, data: Partial<NewURDPurchase>): void;
  update(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewURDPurchase>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<NewURDPurchase>): void;

  // --- delete (Overloaded to support 2-arg and 3-arg calls) ---
  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, id: string, firmId: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- findByFirmId (Sync tx overload and async standalone) ---
  findByFirmId(firmId: string): Promise<URDPurchase[]>;
  findByFirmId(tx: DrizzleTransaction, firmId: string): URDPurchase[];

  // --- findByFyId ---
  findByFyId(firmId: string, fyId: string): Promise<URDPurchase[]>;

  // --- findByCustomerId ---
  findByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]>;
}

export const urdPurchaseRepository: URDPurchaseRepository = {
  insert(tx: DrizzleTransaction, data: NewURDPurchase): URDPurchase {
    const id = data.id ?? Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(urdPurchases).values(row).run();
    const result = tx.select().from(urdPurchases).where(eq(urdPurchases.id, id)).get();
    return result as URDPurchase;
  },

  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        return db
          .select()
          .from(urdPurchases)
          .where(
            or(
              and(eq(urdPurchases.id, first), eq(urdPurchases.firmId, second)),
              and(eq(urdPurchases.id, second), eq(urdPurchases.firmId, first))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      return db
        .select()
        .from(urdPurchases)
        .where(eq(urdPurchases.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      const res = tx
        .select()
        .from(urdPurchases)
        .where(
          or(
            and(eq(urdPurchases.id, third), eq(urdPurchases.firmId, second!)),
            and(eq(urdPurchases.id, second!), eq(urdPurchases.firmId, third))
          )
        )
        .get();
      return (res as URDPurchase) || null;
    }
    const res = tx.select().from(urdPurchases).where(eq(urdPurchases.id, second!)).get();
    return (res as URDPurchase) || null;
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<NewURDPurchase>,
    fourth?: Partial<NewURDPurchase>
  ): void {
    if (typeof third === 'object' && third !== null) {
      tx.update(urdPurchases)
        .set({ ...third, updatedAt: third.updatedAt ?? now() })
        .where(eq(urdPurchases.id, second))
        .run();
    } else {
      const a = second;
      const b = third as string;
      const data = fourth!;
      tx.update(urdPurchases)
        .set({ ...data, updatedAt: data.updatedAt ?? now() })
        .where(
          or(
            and(eq(urdPurchases.id, a), eq(urdPurchases.firmId, b)),
            and(eq(urdPurchases.id, b), eq(urdPurchases.firmId, a))
          )
        )
        .run();
    }
  },

  delete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      tx.delete(urdPurchases).where(eq(urdPurchases.id, second)).run();
    } else {
      const a = second;
      const b = third;
      tx.delete(urdPurchases)
        .where(
          or(
            and(eq(urdPurchases.id, a), eq(urdPurchases.firmId, b)),
            and(eq(urdPurchases.id, b), eq(urdPurchases.firmId, a))
          )
        )
        .run();
    }
  },

  findByFirmId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(urdPurchases)
        .where(eq(urdPurchases.firmId, first))
        .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(urdPurchases)
      .where(eq(urdPurchases.firmId, firmId))
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt))
      .all() as URDPurchase[];
  },

  async findByFyId(firmId: string, fyId: string): Promise<URDPurchase[]> {
    return db
      .select()
      .from(urdPurchases)
      .where(and(eq(urdPurchases.firmId, firmId), eq(urdPurchases.fyId, fyId)))
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  },

  async findByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]> {
    return db
      .select()
      .from(urdPurchases)
      .where(
        and(
          eq(urdPurchases.firmId, firmId),
          eq(urdPurchases.customerId, customerId)
        )
      )
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  },
};