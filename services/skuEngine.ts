import { format, parseISO } from 'date-fns';
import { eq, and } from 'drizzle-orm';
import { sequenceCounters, items } from '../db/schema';
import type { DrizzleTransaction, Design } from '../types/phase2.types';
import { now } from '../utils/now';
import { ERR } from '../constants/errorCodes';

// FIX-SKU-PREFIX-1 (v1.34) UPDATED (v1.41): generateDesignPrefix()
export function generateDesignPrefix(designName: string, metal: 'GOLD' | 'SILVER'): string {
  const words = designName.trim().toUpperCase().split(' ');
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);
  
  const [word1, word2] = words;
  
  // 1-word design: take first 3 chars of the single word
  if (words.length === 1) {
    return word1.slice(0, 3); // e.g. "Chainjod" → CHA
  }
  
  // 2-word design: word1[0] + word2[0:3]. No metal-word skip.
  const word2Prefix = word2.slice(0, 3); // 2 or 3 chars — use what is available
  // ARCH-DEAD-CODE-1 (v1.42) + ARCH-DEAD-CODE-2 (v1.43): orphan brace removed
  return word1[0] + word2Prefix; 
}

// FIX-SKU-ENGINE-1 (v1.34) + SKU-DEDUP-1 (v1.43): generateSKU()
// FIX-V718-1: Made strictly synchronous to run safely inside JSI transactions
export function generateSKU(
  tx: DrizzleTransaction, 
  design: Design, 
  firmId: string,
  entryDate?: string
): string {
  const metalCode = design.metal === 'GOLD' ? 'G' : 'S';
  const desPrefix = generateDesignPrefix(design.name, design.metal);
  
  // GAP-P2-BACKDATE-1 (v1.76): Date source change
  const targetDate = entryDate ? parseISO(entryDate) : new Date();
  const mmyy = format(targetDate, 'MMyy'); // date-fns e.g. '0226'
  const counterId = `${firmId}_${mmyy}`; // GLOBAL per firm per month
  
  // Synchronous .get()
  const existing = tx
    .select()
    .from(sequenceCounters)
    .where(eq(sequenceCounters.id, counterId))
    .get();

  let nextSeq: number;

  if (!existing) {
    // New month — auto-reset: insert fresh counter row starting at 1
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
    nextSeq = (existing as any).currentSeq + 1;
    tx.update(sequenceCounters)
      .set({ currentSeq: nextSeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId))
      .run();
  }

  const seq = String(nextSeq).padStart(4, '0'); // stored: 4-digit
  const sku = `${metalCode}${desPrefix}${mmyy}${seq}`;

  // SKU-DEDUP-1 (v1.43): Pre-generation duplicate check
  const MAX_SKU_RETRIES = 3;
  let candidate = sku;
  let retrySeq = nextSeq;

  for (let attempt = 0; attempt < MAX_SKU_RETRIES; attempt++) {
    const collision = tx.select({ id: items.id })
      .from(items)
      .where(and(eq(items.sku, candidate), eq(items.firmId, firmId)))
      .get();

    if (!collision) break; // candidate is clean — use it
    
    // Collision found — increment seq and rebuild candidate
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

  if (stillExists) throw new Error(ERR.SKU_GENERATION_FAILED); // 3 retries exhausted
  
  return candidate;
}