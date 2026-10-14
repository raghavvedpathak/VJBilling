// repositories/phase4/meltBatchRepository.ts
// Phase 4: Gold Intelligence — Melt Batch Data Access Layer

import { eq, and, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import {
  meltBatches,
  meltBatchInputs,
} from '@/db/schema/phase4_gold_intelligence';
import type { DrizzleTransaction } from '@/types/phase2/phase2.types';
import type {
  MeltBatch,
  NewMeltBatch,
  MeltBatchInput,
  NewMeltBatchInput,
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

export const meltBatchRepository = {
  // ─── MELT BATCHES ────────────────────────────────────────────────────────────

  insertBatch(
    tx: DrizzleTransaction,
    data: Omit<NewMeltBatch, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): MeltBatch {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(meltBatches)
      .values({
        ...data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as NewMeltBatch)
      .run();

    return conn
      .select()
      .from(meltBatches)
      .where(eq(meltBatches.id, id))
      .get() as MeltBatch;
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
            .from(meltBatches)
            .where(and(eq(meltBatches.id, id), eq(meltBatches.firmId, firmId)))
            .get() || null
        );
      }
      return conn.select().from(meltBatches).where(eq(meltBatches.id, id)).get() || null;
    }

    const tx = first as DrizzleTransaction;
    const id = second!;
    const firmId = third;
    const conn = getDb(tx);
    if (firmId) {
      return (
        conn
          .select()
          .from(meltBatches)
          .where(and(eq(meltBatches.id, id), eq(meltBatches.firmId, firmId)))
          .get() || null
      );
    }
    return conn.select().from(meltBatches).where(eq(meltBatches.id, id)).get() || null;
  },

  updateBatch(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewMeltBatch>): void {
    const conn = getDb(tx);
    conn
      .update(meltBatches)
      .set({
        ...data,
        updatedAt: now(),
      })
      .where(and(eq(meltBatches.id, id), eq(meltBatches.firmId, firmId)))
      .run();
  },

  listBatches(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const firmId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(meltBatches)
          .where(eq(meltBatches.firmId, firmId))
          .orderBy(desc(meltBatches.createdAt))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const firmId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(meltBatches)
        .where(eq(meltBatches.firmId, firmId))
        .orderBy(desc(meltBatches.createdAt))
        .all() || []
    );
  },

  // ─── MELT BATCH INPUTS ───────────────────────────────────────────────────────

  insertBatchInput(
    tx: DrizzleTransaction,
    data: Omit<NewMeltBatchInput, 'id' | 'createdAt'> & { id?: string }
  ): MeltBatchInput {
    const conn = getDb(tx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = now();

    conn
      .insert(meltBatchInputs)
      .values({
        ...data,
        id,
        createdAt: timestamp,
      } as NewMeltBatchInput)
      .run();

    return conn
      .select()
      .from(meltBatchInputs)
      .where(eq(meltBatchInputs.id, id))
      .get() as MeltBatchInput;
  },

  getBatchInputs(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      const batchId = first;
      const conn = getDb();
      return (
        conn
          .select()
          .from(meltBatchInputs)
          .where(eq(meltBatchInputs.batchId, batchId))
          .all() || []
      );
    }

    const tx = first as DrizzleTransaction;
    const batchId = second!;
    const conn = getDb(tx);
    return (
      conn
        .select()
        .from(meltBatchInputs)
        .where(eq(meltBatchInputs.batchId, batchId))
        .all() || []
    );
  },

  getBatchInputByLotId(lotId: string): MeltBatchInput | null {
    const conn = getDb();
    return (
      conn
        .select()
        .from(meltBatchInputs)
        .where(eq(meltBatchInputs.lotId, lotId))
        .get() || null
    );
  },
};
