// repositories/phase1/sequenceCounterRepository.ts — Phase 2 Canonical Repository
// Implements Step 5 & Step 12.11 (FIX-URD-SEQ-ARCH-1, FIX-FYREPO-SYNC-CONTRACT-1)
// JSI Synchronous Repository Contract Compliant

import { eq } from 'drizzle-orm';
import { sequenceCounters } from '@/db/schema';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import type { DrizzleTransaction, SequenceCounter, SequenceCounterType } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';

export interface SequenceCounterRepository {
  getById(arg1: any, arg2?: any): SequenceCounter | null;
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number;
}

export const sequenceCounterRepository: SequenceCounterRepository = {
  /**
   * Fetches sequence counter by composite ID.
   * Supports both (tx, id) and (id, tx) signatures.
   */
  getById(arg1: any, arg2?: any): SequenceCounter | null {
    let tx: DrizzleTransaction;
    let id: string;

    if (typeof arg1 === 'string') {
      id = arg1;
      tx = arg2;
    } else {
      tx = arg1;
      id = arg2;
    }

    if (!id || !tx) return null;

    const res = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, id)).get();
    return (res as SequenceCounter) || null;
  },

  /**
   * FY-scoped document sequence generation: key = '{firmId}_{type}_{fyLabel}'
   * Executes synchronously inside active db.transaction per REPOSITORY SYNC CONTRACT.
   */
  nextVal(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    type: SequenceCounterType | string
  ): number {
    // Lookup financial year using canonical synchronous overload (tx, fyId)
    const fy = fyRepository.getById(tx, fyId) ?? fyRepository.getById(fyId, tx);
    if (!fy || fy.firmId !== firmId) {
      const errorMsg = (ERR as any)?.FY_NOT_FOUND || 'FY_NOT_FOUND';
      throw new Error(errorMsg);
    }

    const counterId = `${firmId}_${type}_${fy.label}`;
    const existing = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, counterId)).get();

    let nextSeq = 1;
    if (existing) {
      const current = typeof existing.currentSeq === 'number' ? existing.currentSeq : 0;
      nextSeq = current + 1;
      tx.update(sequenceCounters)
        .set({ currentSeq: nextSeq, lastUsedAt: now() })
        .where(eq(sequenceCounters.id, counterId))
        .run();
    } else {
      tx.insert(sequenceCounters)
        .values({
          id: counterId,
          firmId,
          month: String(type), // Stores sequence type (e.g. 'URD', 'INV')
          year: fy.label,      // Stores FY label for human readability
          currentSeq: nextSeq,
          lastUsedAt: now(),
        })
        .run();
    }

    return nextSeq;
  },
};

export const getSequenceCounterById = sequenceCounterRepository.getById.bind(sequenceCounterRepository);
export const getNextSequenceVal = sequenceCounterRepository.nextVal.bind(sequenceCounterRepository);
export default sequenceCounterRepository;
