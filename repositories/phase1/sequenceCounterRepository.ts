// repositories/phase1/sequenceCounterRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { sequenceCounters } from '@/db/schema';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import type { DrizzleTransaction, SequenceCounter, SequenceCounterType } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';

export interface SequenceCounterRepository {
  // --- getById (Inspect counter row by id) ---
  getById(tx: DrizzleTransaction, id: string): SequenceCounter | null;

  // --- nextVal (Step 5 & Step 12.11 / FIX-URD-SEQ-ARCH-1 v1.53) ---
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number;
}

export const sequenceCounterRepository: SequenceCounterRepository = {
  // --- getById (Inspect counter row by id) ---
  getById(tx: DrizzleTransaction, id: string): SequenceCounter | null {
    const res = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, id)).get();
    return (res as SequenceCounter) || null;
  },

  // --- nextVal (Step 5 & Step 12.11 / FIX-URD-SEQ-ARCH-1 v1.53) ---
  // Generates document sequence numbers for FY-scoped counters: key = '{firmId}_{type}_{fyLabel}'
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number {
    // Lookup FY label using fyRepository (supports (tx, firmId, fyId) or (tx, fyId))
    const fy = fyRepository.getById(tx, firmId, fyId) ?? fyRepository.getById(tx, fyId);
    if (!fy) throw new Error(ERR.FY_NOT_FOUND);
    const fyLabel = fy.label;

    const counterId = `${firmId}_${type}_${fyLabel}`;
    const existing = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, counterId)).get();

    let nextSeq = 1;
    if (existing) {
      nextSeq = existing.currentSeq + 1;
      tx.update(sequenceCounters)
        .set({ currentSeq: nextSeq, lastUsedAt: now() })
        .where(eq(sequenceCounters.id, counterId))
        .run();
    } else {
      tx.insert(sequenceCounters)
        .values({
          id: counterId,
          firmId,
          month: 'DOC', // Placeholder for FY-scoped document counters
          year: 'DOC',  // Placeholder for FY-scoped document counters
          currentSeq: nextSeq,
          lastUsedAt: now(),
        })
        .run();
    }

    return nextSeq;
  }
};
