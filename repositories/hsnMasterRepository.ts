import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { hsnCodes } from '../db/schema';
import type { DrizzleTransaction, HsnCode } from '../types/phase2.types';
import { ERR } from '../constants/errorCodes';

// src/db/repositories/hsnMasterRepository.ts — FIX-HSN-MASTER-1 (v1.46)
// READ-ONLY repository. No Dual Guard. Receives tx from createItem() caller.
export const hsnMasterRepository = {
  // FIX-V718-1: Synchronous execution using .get() to prevent JSI transaction stalls.
  // Called inside createItem() transaction. Throws ITEM_HSN_MISSING if code unknown/inactive.
  findByCode(
    tx: DrizzleTransaction,
    firmId: string, // firmId kept for signature consistency, though hsn_codes is global
    code: string,
  ): HsnCode {
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
    return row as unknown as HsnCode;
  },

  // For UI HSN picker (Settings > Inventory > HSN Codes)
  // Operates on global async db - safely left as async
  async findAll(): Promise<HsnCode[]> {
    return db
      .select()
      .from(hsnCodes)
      .where(eq(hsnCodes.isActive, 1))
      // @ts-ignore drizzle missing orderBy inference locally sometimes
      .orderBy(hsnCodes.code);
  },

  // Filter by chapter — e.g. findByChapter("71") returns all jewellery codes
  // Operates on global async db - safely left as async
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
      // @ts-ignore drizzle missing orderBy inference locally sometimes
      .orderBy(hsnCodes.code);
  },
};