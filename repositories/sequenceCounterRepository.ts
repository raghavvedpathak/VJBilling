import { eq } from 'drizzle-orm';
import { sequenceCounters } from '../db/schema';
import { fyRepository } from './fyRepository';
import type { DrizzleTransaction } from '../types/phase2.types';
import { now } from '../utils/now';
import { ERR } from '../constants';

export const sequenceCounterRepository = {
  nextVal(tx: DrizzleTransaction, firmId: string, fyId: string, type: string): number {
    const fy = fyRepository.getById(tx, firmId, fyId);
    if (!fy) throw new Error(ERR.FY_NOT_FOUND);
    const fyLabel = fy.label;
    
    const counterId = `${firmId}_${type}_${fyLabel}`;

    const existing = tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, counterId)).limit(1).get() as any;
    
    let nextSeq = 1;
    if (existing) {
      nextSeq = existing.currentSeq + 1;
      tx.update(sequenceCounters).set({ currentSeq: nextSeq, lastUsedAt: now() }).where(eq(sequenceCounters.id, counterId)).run();
    } else {
      tx.insert(sequenceCounters).values({
        id: counterId,
        firmId,
        month: 'DOC',
        year: 'DOC',
        currentSeq: nextSeq,
        lastUsedAt: now()
      }).run();
    }
    
    return nextSeq;
  }
};
