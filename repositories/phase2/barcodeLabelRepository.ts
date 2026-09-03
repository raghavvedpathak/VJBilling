// repositories/phase2/barcodeLabelRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { items, designs } from '@/db/schema';
import type { DrizzleTransaction, Item } from '@/types/phase2/phase2.types';

export interface BarcodeLabelRepository {
  getItemWithDesignName(
    itemId: string,
    firmId: string
  ): Promise<(Item & { designName: string }) | null>;
  getItemWithDesignName(
    tx: DrizzleTransaction,
    itemId: string,
    firmId: string
  ): (Item & { designName: string }) | null;
}

export const barcodeLabelRepository: BarcodeLabelRepository = {
  // Step 5.1 / FEAT-BARCODE-LABEL-1: Read-only join query assembling label data
  getItemWithDesignName(
    first: DrizzleTransaction | string,
    second: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      const itemId = first;
      const firmId = second;
      return db
        .select({
          item: items,
          designName: designs.name,
        })
        .from(items)
        .innerJoin(
          designs,
          and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId))
        )
        .where(and(eq(items.id, itemId), eq(items.firmId, firmId)))
        .limit(1)
        .then((rows) => {
          const row = rows[0];
          if (!row) return null;
          return { ...row.item, designName: row.designName };
        });
    }

    const tx = first as DrizzleTransaction;
    const itemId = second;
    const firmId = third!;
    const row = tx
      .select({
        item: items,
        designName: designs.name,
      })
      .from(items)
      .innerJoin(
        designs,
        and(eq(designs.id, items.designId), eq(designs.firmId, items.firmId))
      )
      .where(and(eq(items.id, itemId), eq(items.firmId, firmId)))
      .limit(1)
      .get();

    if (!row) return null;
    return { ...row.item, designName: row.designName };
  },
};