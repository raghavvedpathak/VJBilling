// services/phase2/skuEngine.ts — Phase 2 v2.11 Canonical Implementation

import { format, parseISO } from 'date-fns';
import { eq, and } from 'drizzle-orm';
import { sequenceCounters, items } from '@/db/schema';
import type { DrizzleTransaction, Design, SequenceCounter } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';

export function generateDesignPrefix(designName: string, metal: 'GOLD' | 'SILVER'): string {
  const words = designName.trim().toUpperCase().split(' ');
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);
  
  const [word1, word2] = words;
  
  if (words.length === 1) {
    return word1.slice(0, 3);
  }
  
  const word2Prefix = word2.slice(0, 3);
  return word1[0] + word2Prefix; 
}

export function generateSKU(
  tx: DrizzleTransaction, 
  design: Design, 
  firmId: string,
  entryDate?: string
): string {
  const metalCode = design.metal === 'GOLD' ? 'G' : 'S';
  const desPrefix = generateDesignPrefix(design.name, design.metal);
  
  const targetDate = entryDate ? parseISO(entryDate) : new Date();
  const mmyy = format(targetDate, 'MMyy');
  const counterId = `${firmId}_${mmyy}`;
  
  const existing = tx
    .select()
    .from(sequenceCounters)
    .where(eq(sequenceCounters.id, counterId))
    .get();

  let nextSeq: number;

  if (!existing) {
    tx.insert(sequenceCounters).values({
      id: counterId, 
      firmId, 
      month: mmyy,
      year: format(targetDate, 'yyyy'), 
      currentSeq: 1, 
      lastUsedAt: now(),
    }).run();
    nextSeq = 1;
  } else {
    nextSeq = (existing as SequenceCounter).currentSeq + 1;
    tx.update(sequenceCounters)
      .set({ currentSeq: nextSeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId))
      .run();
  }

  const seq = String(nextSeq).padStart(4, '0');
  const sku = `${metalCode}${desPrefix}${mmyy}${seq}`;

  const MAX_SKU_RETRIES = 3;
  let candidate = sku;
  let retrySeq = nextSeq;

  for (let attempt = 0; attempt < MAX_SKU_RETRIES; attempt++) {
    const collision = tx.select({ id: items.id })
      .from(items)
      .where(and(eq(items.sku, candidate), eq(items.firmId, firmId)))
      .get();

    if (!collision) break;
    
    retrySeq += 1;
    tx.update(sequenceCounters)
      .set({ currentSeq: retrySeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId))
      .run();
    
    candidate = `${metalCode}${desPrefix}${mmyy}${String(retrySeq).padStart(4, '0')}`;
  }

  const stillExists = tx.select({ id: items.id })
    .from(items)
    .where(and(eq(items.sku, candidate), eq(items.firmId, firmId)))
    .get();

  if (stillExists) throw new Error(ERR.SKU_GENERATION_FAILED);
  
  return candidate;
}

export function formatSKUDisplay(sku: string): string {
  if (sku.length < 4) return sku;
  const prefix = sku.slice(0, -4);
  const seqPart = sku.slice(-4);
  const seqNum = parseInt(seqPart, 10);
  if (isNaN(seqNum)) return sku;
  const displaySeq = seqNum < 10 ? `0${seqNum}` : String(seqNum);
  return `${prefix}${displaySeq}`;
}