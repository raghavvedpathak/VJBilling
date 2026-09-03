// services/phase2/skuEngine.ts — Phase 2 v2.24 Canonical Implementation
// FIX-SKU-PREFIX-1 (v1.34/v1.41), SKU-DEDUP-1 (v1.43), FIX-SKU-DISPLAY-2 (v1.51) & FIX-GAP-P2-BACKDATE-1 (v1.76)

import { format, parseISO } from 'date-fns';
import { eq } from 'drizzle-orm';
import { sequenceCounters, items } from '@/db/schema';
import type { DrizzleTransaction, Design, SequenceCounter, Metal } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import { formatSKUDisplay } from '@/utils/skuDisplay';

// Re-export formatter for consumers importing via skuEngine
export { formatSKUDisplay };

// FIX-SKU-PREFIX-1 (v1.34) UPDATED (v1.41) & STEP 3 Alignment
export function generateDesignPrefix(designName: string, _metal?: Metal): string {
  const words = designName.trim().toUpperCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0 || words.length > 2) throw new Error(ERR.DESIGN_NAME_INVALID);

  const [word1, word2] = words;

  // 1-word design: take first 3 chars of the single word
  if (words.length === 1) {
    return word1.slice(0, 3);
  }

  // 2-word design: word1[0] + word2[0:3]. No metal-word skip (v1.41)
  const word2Prefix = word2.slice(0, 3);
  return word1[0] + word2Prefix;
}

// FIX-SKU-ENGINE-1 (v1.34), SKU-DEDUP-1 (v1.43) & FIX-GAP-P2-BACKDATE-1 (v1.76)
export function generateSKU(
  tx: DrizzleTransaction,
  design: Design,
  firmId: string,
  entryDate?: string
): string {
  const metalCode = design.metal === 'GOLD' ? 'G' : 'S';
  const desPrefix = generateDesignPrefix(design.name, design.metal);

  // Backdated stock entry calculates MMYY from entryDate (v1.76) with invalid-date protection
  let targetDate = new Date();
  if (entryDate) {
    const parsed = parseISO(entryDate);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  const mmyy = format(targetDate, 'MMyy');
  const counterId = `${firmId}_${mmyy}`;

  const existing = tx
    .select()
    .from(sequenceCounters)
    .where(eq(sequenceCounters.id, counterId))
    .get();

  let nextSeq: number;

  if (!existing) {
    // New month — auto-reset: insert fresh counter row starting at 1
    tx.insert(sequenceCounters)
      .values({
        id: counterId,
        firmId,
        month: mmyy,
        year: format(targetDate, 'yyyy'),
        currentSeq: 1,
        lastUsedAt: now(),
      })
      .run();
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

  // Pre-generation duplicate check with up to 3 retries (SKU-DEDUP-1 v1.43)
  // Queries items.sku globally matching the items_sku_unique index
  const MAX_SKU_RETRIES = 3;
  let candidate = sku;
  let retrySeq = nextSeq;

  for (let attempt = 0; attempt < MAX_SKU_RETRIES; attempt++) {
    const collision = tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.sku, candidate))
      .get();

    if (!collision) break;

    // Collision found — increment sequence counter and retry
    retrySeq += 1;
    tx.update(sequenceCounters)
      .set({ currentSeq: retrySeq, lastUsedAt: now() })
      .where(eq(sequenceCounters.id, counterId))
      .run();

    candidate = `${metalCode}${desPrefix}${mmyy}${String(retrySeq).padStart(4, '0')}`;
  }

  const stillExists = tx
    .select({ id: items.id })
    .from(items)
    .where(eq(items.sku, candidate))
    .get();

  if (stillExists) throw new Error(ERR.SKU_GENERATION_FAILED);

  return candidate;
}

export const skuEngine = {
  generateDesignPrefix,
  generateSKU,
  formatSKUDisplay,
};