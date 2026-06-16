import { format } from 'date-fns';
import { eq, and } from 'drizzle-orm';
import { sequenceCounters, items } from '../db/schema';
import type { DrizzleTransaction, Design } from '../types/phase2.types';
import { now } from '../utils/now';

// FIX-SKU-PREFIX-1 (v1.34) UPDATED (v1.41): generateDesignPrefix()
export function generateDesignPrefix(designName: string, metal: 'GOLD' | 'SILVER'): string {
  const words = designName.trim().toUpperCase().split(' ');
  if (words.length === 0 || words.length > 2) throw new Error('DESIGN_NAME_INVALID');
  
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
export async function generateSKU(
  tx: DrizzleTransaction, 
  design: Design, 
  firmId: string
): Promise<string> {
  const metalCode = design.metal === 'GOLD' ? 'G' : 'S';
  const desPrefix = generateDesignPrefix(design.name, design.metal);
  const mmyy = format(new Date(), 'MMyy'); // date-fns e.g. '0226'
  const counterId = `${firmId}_${mmyy}`; // GLOBAL per firm per month
  
  // NOTE: drizzle's sqlite dialect `.get()` works if supported, but `.limit(1)` + destruct is safer. 
  // Sticking to exactly `.limit(1)` array destructure pattern for cross-dialect safety:
  const [existing] = await tx
    .select()
    .from(sequenceCounters)
    .where(eq(sequenceCounters.id, counterId))
    .limit(1);

  let nextSeq: number;

  if (!existing) {
    // New month — auto-reset: insert fresh counter row starting at 1
    await tx.insert(sequenceCounters).values({
      id: counterId, 
      firmId, 
      month: mmyy,
      year: format(new Date(), 'yyyy'), 
      currentSeq: 1, 
      lastUsedAt: now(),
    });
    nextSeq = 1;
  } else {
    nextSeq = existing.currentSeq + 1;
    await tx.update(sequenceCounters)
      .set({ currentSeq: nextSeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId));
  }

  const seq = String(nextSeq).padStart(4, '0'); // stored: 4-digit
  const sku = `${metalCode}${desPrefix}${mmyy}${seq}`;

  // SKU-DEDUP-1 (v1.43): Pre-generation duplicate check
  const MAX_SKU_RETRIES = 3;
  let candidate = sku;
  let retrySeq = nextSeq;

  for (let attempt = 0; attempt < MAX_SKU_RETRIES; attempt++) {
    const [collision] = await tx.select({ id: items.id })
      .from(items)
      .where(and(eq(items.sku, candidate), eq(items.firmId, firmId)))
      .limit(1);

    if (!collision) break; // candidate is clean — use it
    
    // Collision found — increment seq and rebuild candidate
    retrySeq += 1;
    await tx.update(sequenceCounters)
      .set({ currentSeq: retrySeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId));
    
    candidate = `${metalCode}${desPrefix}${mmyy}${String(retrySeq).padStart(4, '0')}`;
  }

  const [stillExists] = await tx.select({ id: items.id })
    .from(items)
    .where(and(eq(items.sku, candidate), eq(items.firmId, firmId)))
    .limit(1);

  if (stillExists) throw new Error('SKU_GENERATION_FAILED'); // 3 retries exhausted
  
  return candidate;
}
