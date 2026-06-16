import { eq } from 'drizzle-orm';
import { sequenceCounters } from '../db/schema';
import { financialYearRepository } from './fyRepository';
import type { DrizzleTransaction } from '../types/phase2.types';
import { now } from '../utils/now';

export const sequenceCounterRepository = {
  async nextVal(tx: DrizzleTransaction, firmId: string, fyId: string, type: string): Promise<number> {
    const fy = await financialYearRepository.getById(tx, fyId);
    if (!fy) throw new Error('FY_NOT_FOUND');
    const fyLabel = fy.label;
    
    const counterId = `${firmId}_${type}_${fyLabel}`;

    const [existing] = await tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, counterId)).limit(1);
    
    let nextSeq = 1;
    if (existing) {
      nextSeq = existing.currentSeq + 1;
      await tx.update(sequenceCounters).set({ currentSeq: nextSeq, lastUsedAt: now() }).where(eq(sequenceCounters.id, counterId));
    } else {
      await tx.insert(sequenceCounters).values({
        id: counterId,
        firmId,
        month: 'DOC',
        year: 'DOC',
        currentSeq: nextSeq,
        lastUsedAt: now()
      });
    }
    
    return nextSeq;
  }
};
