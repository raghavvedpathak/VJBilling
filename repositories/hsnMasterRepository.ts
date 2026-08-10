// repositories/hsnMasterRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { hsnCodes } from '../db/schema';
import type { DrizzleTransaction, HsnCode } from '../types/phase2.types';
import { ERR } from '../constants/errorCodes';

export interface HsnMasterRepository {
  // --- findByCode (Step 4.75 / FIX-HSN-MASTER-1) ---
  findByCode(tx: DrizzleTransaction, code: string): HsnCode;
  findByCode(tx: DrizzleTransaction, firmId: string, code: string): HsnCode;

  // --- findAll ---
  findAll(): Promise<HsnCode[]>;

  // --- findByChapter ---
  findByChapter(chapter: string): Promise<HsnCode[]>;
}

// READ-ONLY repository (FIX-HSN-MASTER-1 v1.46 / Step 4.75).
// No Dual Guard. Receives tx from createItem() caller.
export const hsnMasterRepository: HsnMasterRepository = {
  // --- findByCode (Step 4.75 / FIX-HSN-MASTER-1) ---
  // Called inside createItem() transaction using .get() to prevent JSI stalls.
  // Throws ITEM_HSN_MISSING if code is unknown or inactive.
  findByCode(
    tx: DrizzleTransaction,
    second: string,
    third?: string
  ): HsnCode {
    const code = third ?? second; // Handles both 2-arg (tx, code) and 3-arg (tx, firmId, code) calls

    const row = tx
      .select()
      .from(hsnCodes)
      .where(
        and(
          eq(hsnCodes.code, code),
          eq(hsnCodes.isActive, 1)
        )
      )
      .limit(1)
      .get();

    if (!row) throw new Error(ERR.ITEM_HSN_MISSING);
    return row as HsnCode;
  },

  // --- findAll (UI HSN picker: Settings > Inventory > HSN Codes) ---
  async findAll(): Promise<HsnCode[]> {
    return db
      .select()
      .from(hsnCodes)
      .where(eq(hsnCodes.isActive, 1))
      .orderBy(hsnCodes.code);
  },

  // --- findByChapter (Filter by GST Chapter, e.g. "71" for jewellery) ---
  async findByChapter(chapter: string): Promise<HsnCode[]> {
    return db
      .select()
      .from(hsnCodes)
      .where(
        and(
          eq(hsnCodes.chapter, chapter),
          eq(hsnCodes.isActive, 1)
        )
      )
      .orderBy(hsnCodes.code);
  },
};