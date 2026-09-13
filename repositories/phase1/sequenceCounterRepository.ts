// repositories/phase1/sequenceCounterRepository.ts — Phase 2 v2.34 Canonical Repository
// Implements Step 5 & Step 12.11 (FIX-URD-SEQ-ARCH-1 v1.53, FIX-FYREPO-SYNC-CONTRACT-1 v1.84, RED-9)

import { eq } from 'drizzle-orm';
import { sequenceCounters } from '@/db/schema';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import type { DrizzleTransaction, SequenceCounter, SequenceCounterType } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';

export interface SequenceCounterRepository {
  getById(tx: DrizzleTransaction, id: string): SequenceCounter | null;
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number;
}

export const sequenceCounterRepository: SequenceCounterRepository = {
  getById(tx: DrizzleTransaction, id: string): SequenceCounter | null {
    const res = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, id)).get();
    return (res as SequenceCounter) || null;
  },

  // FY-scoped document sequence generation: key = '{firmId}_{type}_{fyLabel}'
  // Synchronous execution inside active db.transaction per REPOSITORY SYNC CONTRACT
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number {
    // Lookup financial year using canonical synchronous overload (tx, fyId)
    const fy = fyRepository.getById(tx, fyId);
    if (!fy || fy.firmId !== firmId) throw new Error(ERR.FY_NOT_FOUND);

    const counterId = `${firmId}_${type}_${fy.label}`;
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
          month: type,      // Stores sequence type (e.g. 'URD')
          year: fy.label,   // Stores FY label for human readability
          currentSeq: nextSeq,
          lastUsedAt: now(),
        })
        .run();
    }

    return nextSeq;
  },
};
