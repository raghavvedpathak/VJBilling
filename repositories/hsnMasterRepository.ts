import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { hsnCodes } from '../db/schema';
import type { DrizzleTransaction, HsnCode } from '../types/phase2.types';

// src/db/repositories/hsnMasterRepository.ts — FIX-HSN-MASTER-1 (v1.46)
// READ-ONLY repository. No Dual Guard. Receives tx from createItem() caller.
export const hsnMasterRepository = {
  // Called inside createItem() transaction. Throws ITEM_HSN_MISSING if code unknown/inactive.
  async findByCode(
    tx: DrizzleTransaction,
    firmId: string,
    code: string,
  ): Promise<HsnCode> {
    const [row] = await tx
      .select()
      .from(hsnCodes)
      .where(
        and(
          eq(hsnCodes.code, code), 
          eq(hsnCodes.isActive, 1)
        )
      )
      .limit(1);

    if (!row) throw new Error('ITEM_HSN_MISSING');
    return row;
  },

  // For UI HSN picker (Settings > Inventory > HSN Codes)
  async findAll(): Promise<HsnCode[]> {
    return db
      .select()
      .from(hsnCodes)
      .where(eq(hsnCodes.isActive, 1))
      // @ts-ignore drizzle missing orderBy inference locally sometimes
      .orderBy(hsnCodes.code);
  },

  // Filter by chapter — e.g. findByChapter("71") returns all jewellery codes
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
