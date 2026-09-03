// repositories/phase2/looseStockLotRepository.ts — Phase 2 v2.24 Canonical Repository
// FEAT-LOOSE-STOCK-1 (v2.23 / v2.24) / STEP 6.9 & FIX-P2-SYNC-CONTRACT-1

import { eq, and, desc, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { looseStockLots } from '@/db/schema';
import type {
  DrizzleTransaction,
  LooseStockLot,
  NewLooseStockLot,
  LooseStockLotStatus,
} from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface LooseStockLotRepository {
  // --- getById (Sync tx overload and async standalone) ---
  getById(id: string): Promise<LooseStockLot | null>;
  getById(id: string, firmId: string): Promise<LooseStockLot | null>;
  getById(tx: DrizzleTransaction, id: string): LooseStockLot | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): LooseStockLot | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): LooseStockLot | null;

  // --- getByDesignAndPurity (Step 6.9: Merge-on-add lookup) ---
  getByDesignAndPurity(designId: string, purityPercent: number, firmId: string): Promise<LooseStockLot | null>;
  getByDesignAndPurity(tx: DrizzleTransaction, designId: string, purityPercent: number, firmId: string): LooseStockLot | null;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewLooseStockLot): LooseStockLot;

  // --- updateCounts (Step 6.9: atomic merge & sell count/weight/status updates) ---
  updateCounts(
    tx: DrizzleTransaction,
    id: string,
    pieceCount: number,
    totalWeightMg: number,
    status: LooseStockLotStatus
  ): void;

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<LooseStockLot[]>;
  findByFirmId(tx: DrizzleTransaction, firmId: string): LooseStockLot[];
}

export const looseStockLotRepository: LooseStockLotRepository = {
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
          .from(looseStockLots)
          .where(
            or(
              and(eq(looseStockLots.id, first), eq(looseStockLots.firmId, second)),
              and(eq(looseStockLots.id, second), eq(looseStockLots.firmId, first))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      // 1-arg async call: getById(id)
      return db
        .select()
        .from(looseStockLots)
        .where(eq(looseStockLots.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }

    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg sync call: supports both (tx, id, firmId) and (tx, firmId, id)
      const res = tx
        .select()
        .from(looseStockLots)
        .where(
          or(
            and(eq(looseStockLots.id, second!), eq(looseStockLots.firmId, third)),
            and(eq(looseStockLots.id, third), eq(looseStockLots.firmId, second!))
          )
        )
        .get();
      return (res as LooseStockLot) || null;
    }
    // 2-arg sync call: getById(tx, id)
    const res = tx
      .select()
      .from(looseStockLots)
      .where(eq(looseStockLots.id, second!))
      .get();
    return (res as LooseStockLot) || null;
  },

  getByDesignAndPurity(
    first: DrizzleTransaction | string,
    second: string | number,
    third: number | string,
    fourth?: string
  ): any {
    if (typeof first === 'string') {
      // Async call: getByDesignAndPurity(designId, purityPercent, firmId)
      const designId = first;
      const purityPercent = Number(second);
      const firmId = third as string;
      return db
        .select()
        .from(looseStockLots)
        .where(
          and(
            eq(looseStockLots.designId, designId),
            eq(looseStockLots.purityPercent, purityPercent),
            eq(looseStockLots.firmId, firmId)
          )
        )
        .limit(1)
        .then((r) => r[0] || null);
    }

    // Sync call: getByDesignAndPurity(tx, designId, purityPercent, firmId)
    const tx = first as DrizzleTransaction;
    const designId = second as string;
    const purityPercent = Number(third);
    const firmId = fourth!;

    const res = tx
      .select()
      .from(looseStockLots)
      .where(
        and(
          eq(looseStockLots.designId, designId),
          eq(looseStockLots.purityPercent, purityPercent),
          eq(looseStockLots.firmId, firmId)
        )
      )
      .get();

    return (res as LooseStockLot) || null;
  },

  insert(tx: DrizzleTransaction, data: NewLooseStockLot): LooseStockLot {
    const id = data.id ?? Crypto.randomUUID();
    const row = {
      ...data,
      id,
      status: data.status ?? 'ACTIVE',
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };
    tx.insert(looseStockLots).values(row).run();
    const result = tx.select().from(looseStockLots).where(eq(looseStockLots.id, id)).get();
    return result as LooseStockLot;
  },

  updateCounts(
    tx: DrizzleTransaction,
    id: string,
    pieceCount: number,
    totalWeightMg: number,
    status: LooseStockLotStatus
  ): void {
    tx.update(looseStockLots)
      .set({
        pieceCount,
        totalWeightMg,
        status,
        updatedAt: now(),
      })
      .where(eq(looseStockLots.id, id))
      .run();
  },

  findByFirmId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(looseStockLots)
        .where(eq(looseStockLots.firmId, first))
        .orderBy(desc(looseStockLots.createdAt));
    }

    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(looseStockLots)
      .where(eq(looseStockLots.firmId, firmId))
      .orderBy(desc(looseStockLots.createdAt))
      .all() as LooseStockLot[];
  },
};