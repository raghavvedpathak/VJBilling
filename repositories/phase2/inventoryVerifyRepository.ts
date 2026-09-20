// repositories/phase2/inventoryVerifyRepository.ts — Phase 2 v2.34 Canonical Repository
// Aligned with Step 5.5, FIX-CAT-ITEM-FK (v1.42), FEAT-PURITY-ROUND-1 (v1.90),
// FIX-V192-CHECK4B-1/2 (v1.92), FEAT-PHANTOM-INVENTORY-1 (v1.67/v1.68), FIX-OLDMETAL-RENAME-1 (v2.32)

import { db } from '@/db/client';
import { eq, lt, and, gt, sum, isNull, isNotNull, inArray } from 'drizzle-orm';
import {
  items,
  designs,
  categories,
  oldMetalLots,
  financialYears,
  looseStockLots,
  looseStockEvents,
} from '@/db/schema';

export const inventoryVerifyRepository = {
  /**
   * Count of items whose designId does not exist in active designs for this firm.
   */
  async getOrphanItemDesignCount(firmId: string): Promise<number> {
    const allDesignIds = new Set(
      (await db.select({ id: designs.id }).from(designs).where(eq(designs.firmId, firmId))).map((r) => r.id)
    );
    const itemDesignIds = (
      await db.select({ designId: items.designId }).from(items).where(eq(items.firmId, firmId))
    ).map((r) => r.designId);
    return itemDesignIds.filter((id) => !allDesignIds.has(id)).length;
  },

  /**
   * Count of items whose categoryId does not exist in active categories for this firm (FIX-CAT-ITEM-FK).
   */
  async getOrphanItemCategoryCount(firmId: string): Promise<number> {
    const allCategoryIds = new Set(
      (await db.select({ id: categories.id }).from(categories).where(eq(categories.firmId, firmId))).map((r) => r.id)
    );
    const itemCategoryIds = (
      await db.select({ categoryId: items.categoryId }).from(items).where(eq(items.firmId, firmId))
    ).map((r) => r.categoryId);
    return itemCategoryIds.filter((id) => id && !allCategoryIds.has(id)).length;
  },

  /**
   * IDs of items with grossWeightMg = 0.
   */
  async findZeroGrossWeightItemIds(firmId: string): Promise<string[]> {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.firmId, firmId), eq(items.grossWeightMg, 0)));
    return rows.map((r) => r.id);
  },

  /**
   * IDs of items where fineWeightMg > grossWeightMg (effective purity > 100%).
   */
  async findPurityOver100ItemIds(firmId: string): Promise<string[]> {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.firmId, firmId), gt(items.fineWeightMg, items.grossWeightMg)));
    return rows.map((r) => r.id);
  },

  /**
   * Total accumulated purity rounding delta in mg across regular items and old metal lots (FIX-V192-CHECK4B-2).
   */
  async getAccumulatedPurityRoundingDeltaMg(firmId: string): Promise<number> {
    const roundingTotal = await db
      .select({ total: sum(items.purityRoundingDeltaMg) })
      .from(items)
      .where(eq(items.firmId, firmId));
    const oldMetalRoundingTotal = await db
      .select({ total: sum(oldMetalLots.purityRoundingDeltaMg) })
      .from(oldMetalLots)
      .where(eq(oldMetalLots.firmId, firmId));
    return (Number(roundingTotal[0]?.total) || 0) + (Number(oldMetalRoundingTotal[0]?.total) || 0);
  },

  /**
   * IDs of active financial years whose endDate is > 60 days in the past.
   */
  async findStaleActiveFYIds(firmId: string, sixtyDaysAgoIso: string): Promise<string[]> {
    const rows = await db
      .select({ id: financialYears.id })
      .from(financialYears)
      .where(
        and(
          eq(financialYears.firmId, firmId),
          eq(financialYears.status, 'ACTIVE'),
          lt(financialYears.endDate, sixtyDaysAgoIso)
        )
      );
    return rows.map((r) => r.id);
  },

  /**
   * IDs of unreconciled phantom items created more than 30 days ago.
   */
  async findStalePhantomItemIds(firmId: string, thirtyDaysAgoIso: string): Promise<string[]> {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.firmId, firmId),
          inArray(items.status, ['PHANTOM_AVAILABLE', 'PHANTOM_SOLD']),
          isNull(items.phantomStockId),
          lt(items.createdAt, thirtyDaysAgoIso)
        )
      );
    return rows.map((r) => r.id);
  },

  /**
   * IDs of open unreconciled phantom items that block financial year closure.
   */
  async findOpenPhantomItemIds(firmId: string): Promise<string[]> {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.firmId, firmId),
          inArray(items.status, ['PHANTOM_AVAILABLE', 'PHANTOM_SOLD']),
          isNull(items.phantomStockId)
        )
      );
    return rows.map((r) => r.id);
  },

  /**
   * IDs of items in invalid status within firm.
   */
  async findInvalidStatusItemIds(firmId: string): Promise<string[]> {
    const validStatuses = [
      'DRAFT',
      'AVAILABLE',
      'SOLD',
      'SENT_TO_KARIGAR',
      'SENT_TO_REFINERY',
      'MELTED',
      'DAMAGED',
      'RETURNED',
      'SENT_TO_MELT',
      'PHANTOM_AVAILABLE',
      'PHANTOM_SOLD',
    ];
    const rows = await db
      .select({ id: items.id, status: items.status })
      .from(items)
      .where(eq(items.firmId, firmId));
    return rows.filter((r) => !validStatuses.includes(r.status as string)).map((r) => r.id);
  },

  /**
   * IDs of loose stock lots referencing non-existent design.
   */
  async findOrphanLooseLots(firmId: string): Promise<string[]> {
    try {
      const allDesignIds = new Set(
        (await db.select({ id: designs.id }).from(designs).where(eq(designs.firmId, firmId))).map((r) => r.id)
      );
      const lotRows = await db
        .select({ id: looseStockLots.id, designId: looseStockLots.designId })
        .from(looseStockLots)
        .where(eq(looseStockLots.firmId, firmId));
      return lotRows.filter((r) => r.designId && !allDesignIds.has(r.designId)).map((r) => r.id);
    } catch {
      return [];
    }
  },

  /**
   * IDs of loose stock events referencing non-existent lot.
   */
  async findOrphanStockLotEvents(firmId: string): Promise<string[]> {
    try {
      const allLotIds = new Set(
        (await db.select({ id: looseStockLots.id }).from(looseStockLots).where(eq(looseStockLots.firmId, firmId))).map(
          (r) => r.id
        )
      );
      const eventRows = await db
        .select({ id: looseStockEvents.id, lotId: looseStockEvents.lotId })
        .from(looseStockEvents)
        .where(eq(looseStockEvents.firmId, firmId));
      return eventRows.filter((r) => r.lotId && !allLotIds.has(r.lotId)).map((r) => r.id);
    } catch {
      return [];
    }
  },

  /**
   * IDs of items with invalid HUID format (not matching ^[A-Z0-9]{6}$).
   */
  async findHuidFormatViolations(firmId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ id: items.id, huid: items.huid })
        .from(items)
        .where(and(eq(items.firmId, firmId), isNotNull(items.huid)));
      return rows
        .filter((r) => r.huid && !/^[A-Z0-9]{6}$/.test(r.huid.trim().toUpperCase()))
        .map((r) => r.id);
    } catch {
      return [];
    }
  },

  /**
   * Global check: duplicate HUIDs across all items in all firms.
   */
  async findGlobalDuplicateHuids(): Promise<{ huid: string; count: number }[]> {
    try {
      const rows = await db
        .select({ huid: items.huid })
        .from(items)
        .where(isNotNull(items.huid));
      const counts: Record<string, number> = {};
      for (const r of rows) {
        if (r.huid && r.huid.trim().length > 0) {
          const clean = r.huid.trim().toUpperCase();
          counts[clean] = (counts[clean] || 0) + 1;
        }
      }
      return Object.entries(counts)
        .filter(([, count]) => count > 1)
        .map(([huid, count]) => ({ huid, count }));
    } catch {
      return [];
    }
  },
};

export default inventoryVerifyRepository;
