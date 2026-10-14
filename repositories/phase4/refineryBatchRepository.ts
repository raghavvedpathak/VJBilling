// repositories/phase4/refineryBatchRepository.ts
// Phase 4: Gold Intelligence — Refinery Batch Data Access Layer

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import {
  refineryBatches,
  refineryBatchLots,
  refineryOutputLots,
} from '@/db/schema/phase4_gold_intelligence';
import type { DrizzleTransaction } from '@/types/phase2/phase2.types';
import type {
  RefineryBatch,
  NewRefineryBatch,
  RefineryBatchLot,
  NewRefineryBatchLot,
  RefineryOutputLot,
  NewRefineryOutputLot,
} from '@/types/phase4/phase4.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const refineryBatchRepository = {
  // ─── REFINERY BATCHES ────────────────────────────────────────────────────────

  insertBatch(tx: DrizzleTransaction, data: Omit<NewRefineryBatch, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): RefineryBatch {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(refineryBatches)
      .values({
        ...data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as NewRefineryBatch)
      .run();

    return conn
      .select()
      .from(refineryBatches)
      .where(eq(refineryBatches.id, id))
      .get() as RefineryBatch;
  },

  getBatchById(first: DrizzleTransaction | string, second?: string, third?: string): any {
    if (typeof first === 'string') {
      const id = first;
      const firmId = second;
      const conn = getDb();
      if (firmId) {
        return (
          conn
            .select()
            .from(refineryBatches)
            .where(and(eq(refineryBatches.id, id), eq(refineryBatches.firmId, firmId)))
            .get() || null
        );
      }
      return conn.select().from(refineryBatches).where(eq(refineryBatches.id, id)).get() || null;
    }

    const tx = first as DrizzleTransaction;
    const id = second!;
    const firmId = third;
    const conn = getDb(tx);
    if (firmId) {
      return (
        conn
          .select()
          .from(refineryBatches)
          .where(and(eq(refineryBatches.id, id), eq(refineryBatches.firmId, firmId)))
          .get() || null
      );
    }
    return conn.select().from(refineryBatches).where(eq(refineryBatches.id, id)).get() || null;
  },

  updateBatch(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewRefineryBatch>): void {
    const conn = getDb(tx);
    conn
      .update(refineryBatches)
      .set({
        ...data,
        updatedAt: now(),
      })
      .where(and(eq(refineryBatches.id, id), eq(refineryBatches.firmId, firmId)))
      .run();
  },

  listBatches(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const firmId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(refineryBatches)
          .where(eq(refineryBatches.firmId, firmId))
          .orderBy(desc(refineryBatches.createdAt))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const firmId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(refineryBatches)
        .where(eq(refineryBatches.firmId, firmId))
        .orderBy(desc(refineryBatches.createdAt))
        .all() || []
    );
  },

  // ─── REFINERY BATCH LOTS ─────────────────────────────────────────────────────

  insertBatchLot(tx: DrizzleTransaction, data: Omit<NewRefineryBatchLot, 'id' | 'createdAt'> & { id?: string }): RefineryBatchLot {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(refineryBatchLots)
      .values({
        ...data,
        id,
        createdAt: timestamp,
      } as NewRefineryBatchLot)
      .run();

    return conn
      .select()
      .from(refineryBatchLots)
      .where(eq(refineryBatchLots.id, id))
      .get() as RefineryBatchLot;
  },

  getBatchLots(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const batchId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(refineryBatchLots)
          .where(eq(refineryBatchLots.batchId, batchId))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const batchId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(refineryBatchLots)
        .where(eq(refineryBatchLots.batchId, batchId))
        .all() || []
    );
  },

  getBatchLotByLotId(first: DrizzleTransaction | string, second: string, third?: string): any {
    if (typeof first === 'string') {
      const batchId = first;
      const lotId = second;
      const conn = getDb();
      return (
        conn
          .select()
          .from(refineryBatchLots)
          .where(and(eq(refineryBatchLots.batchId, batchId), eq(refineryBatchLots.lotId, lotId)))
          .get() || null
      );
    }

    const tx = first as DrizzleTransaction;
    const batchId = second;
    const lotId = third!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(refineryBatchLots)
        .where(and(eq(refineryBatchLots.batchId, batchId), eq(refineryBatchLots.lotId, lotId)))
        .get() || null
    );
  },

  getBatchLotByLot(lotId: string): RefineryBatchLot | null {
    const conn = getDb();
    return (
      conn
        .select()
        .from(refineryBatchLots)
        .where(eq(refineryBatchLots.lotId, lotId))
        .get() || null
    );
  },

  updateBatchLot(tx: DrizzleTransaction, id: string, data: Partial<NewRefineryBatchLot>): void {
    const conn = getDb(tx);
    conn
      .update(refineryBatchLots)
      .set(data)
      .where(eq(refineryBatchLots.id, id))
      .run();
  },

  // ─── REFINERY OUTPUT LOTS ────────────────────────────────────────────────────

  insertOutputLot(tx: DrizzleTransaction, data: Omit<NewRefineryOutputLot, 'id' | 'createdAt'> & { id?: string }): RefineryOutputLot {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(refineryOutputLots)
      .values({
        ...data,
        id,
        createdAt: timestamp,
      } as NewRefineryOutputLot)
      .run();

    return conn
      .select()
      .from(refineryOutputLots)
      .where(eq(refineryOutputLots.id, id))
      .get() as RefineryOutputLot;
  },

  getOutputLots(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const batchId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(refineryOutputLots)
          .where(eq(refineryOutputLots.batchId, batchId))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const batchId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(refineryOutputLots)
        .where(eq(refineryOutputLots.batchId, batchId))
        .all() || []
    );
  },
};
