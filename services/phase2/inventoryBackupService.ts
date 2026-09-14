// services/phase2/inventoryBackupService.ts — Phase 2 Canonical Inventory Backup Service
// Takes a snapshot of all Phase 2 jewelry inventory tables inside an active transaction.
// Automatically registers as an extension provider with Phase 1 backupService.

import {
  categories,
  designs,
  stones,
  hsnCodes,
  items,
  itemEvents,
  gemstoneLots,
  designCategoryMap,
  sequenceCounters,
  oldMetalLots,
  urdPurchases,
  looseStockLots,
  looseStockEvents,
} from '@/db/schema/phase2_inventory';
import { registerBackupExporter } from '@/services/phase1/backupService';
import db, { db as dbNamed } from '@/db/client';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export interface InventoryBackupPayload {
  categories: (typeof categories.$inferSelect)[];
  designs: (typeof designs.$inferSelect)[];
  stones: (typeof stones.$inferSelect)[];
  hsnCodes: (typeof hsnCodes.$inferSelect)[];
  items: (typeof items.$inferSelect)[];
  itemEvents: (typeof itemEvents.$inferSelect)[];
  gemstoneLots: (typeof gemstoneLots.$inferSelect)[];
  designCategoryMap: (typeof designCategoryMap.$inferSelect)[];
  sequenceCounters: (typeof sequenceCounters.$inferSelect)[];
  oldGoldLots: (typeof oldMetalLots.$inferSelect)[];
  oldMetalLots: (typeof oldMetalLots.$inferSelect)[];
  urdPurchases: (typeof urdPurchases.$inferSelect)[];
  looseStockLots: (typeof looseStockLots.$inferSelect)[];
  looseStockEvents: (typeof looseStockEvents.$inferSelect)[];
  [key: string]: any;
}

/**
 * Reads all Phase 2 inventory tables synchronously inside the active backup transaction.
 */
export function exportInventoryData(tx: DbOrTx): InventoryBackupPayload {
  const targetTx = getDb(tx);

  const categoriesRows = targetTx.select().from(categories).all();
  const designsRows = targetTx.select().from(designs).all();
  const stonesRows = targetTx.select().from(stones).all();
  const hsnCodesRows = targetTx.select().from(hsnCodes).all();
  const itemsRows = targetTx.select().from(items).all();
  const itemEventsRows = targetTx.select().from(itemEvents).all();
  const gemstoneLotsRows = targetTx.select().from(gemstoneLots).all();
  const designCategoryMapRows = targetTx.select().from(designCategoryMap).all();
  const sequenceCountersRows = targetTx.select().from(sequenceCounters).all();
  const oldMetalLotsRows = targetTx.select().from(oldMetalLots).all();
  const urdPurchasesRows = targetTx.select().from(urdPurchases).all();
  const looseStockLotsRows = targetTx.select().from(looseStockLots).all();
  const looseStockEventsRows = targetTx.select().from(looseStockEvents).all();

  return {
    categories: categoriesRows,
    designs: designsRows,
    stones: stonesRows,
    hsnCodes: hsnCodesRows,
    items: itemsRows,
    itemEvents: itemEventsRows,
    gemstoneLots: gemstoneLotsRows,
    designCategoryMap: designCategoryMapRows,
    sequenceCounters: sequenceCountersRows,
    oldGoldLots: oldMetalLotsRows,
    oldMetalLots: oldMetalLotsRows,
    urdPurchases: urdPurchasesRows,
    looseStockLots: looseStockLotsRows,
    looseStockEvents: looseStockEventsRows,
  };
}

/**
 * Returns inventory record counts for reporting and preview modals.
 */
export function getInventoryRecordCounts(tx?: DbOrTx): Record<string, number> {
  const targetTx = getDb(tx);
  try {
    return {
      categories: targetTx.select().from(categories).all().length,
      designs: targetTx.select().from(designs).all().length,
      items: targetTx.select().from(items).all().length,
      gemstoneLots: targetTx.select().from(gemstoneLots).all().length,
      urdPurchases: targetTx.select().from(urdPurchases).all().length,
      oldMetalLots: targetTx.select().from(oldMetalLots).all().length,
      looseStockLots: targetTx.select().from(looseStockLots).all().length,
    };
  } catch {
    return {};
  }
}

// Register Phase 2 extension with Phase 1 backupService
registerBackupExporter('phase2_inventory', exportInventoryData);

export const inventoryBackupService = {
  exportInventoryData,
  getInventoryRecordCounts,
};

export default inventoryBackupService;
