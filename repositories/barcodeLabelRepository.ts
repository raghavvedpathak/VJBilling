import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { items, designs } from '../db/schema';
import type { Item } from '../types/phase2.types';

export const barcodeLabelRepository = {
  async getItemWithDesignName(itemId: string, firmId: string) {
    const [row] = await db
      .select({
        item: items,
        designName: designs.name
      })
      .from(items)
      .innerJoin(designs, eq(designs.id, items.designId))
      .where(and(eq(items.id, itemId), eq(items.firmId, firmId)))
      .limit(1);
    
    if (!row) return null;
    return { ...row.item, designName: row.designName };
  }
};
