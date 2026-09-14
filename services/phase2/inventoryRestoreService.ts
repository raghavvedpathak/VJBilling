// services/phase2/inventoryRestoreService.ts — Phase 2 Canonical Inventory Restore Service
// Handles atomic deletion and restoration of Phase 2 jewelry inventory tables in strict dependency order.
// Automatically registers as an extension handler with Phase 1 backupService/restoreService.

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
import { registerRestoreHandler } from '@/services/phase1/backupService';
import db, { db as dbNamed } from '@/db/client';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Clears all Phase 2 inventory tables in reverse dependency order (children first).
 */
export function clearInventoryData(tx: DbOrTx): void {
  const targetTx = getDb(tx);

  // Child tables deleted before parent tables to respect foreign keys
  targetTx.delete(looseStockEvents).run();
  targetTx.delete(looseStockLots).run();
  targetTx.delete(urdPurchases).run();
  targetTx.delete(oldMetalLots).run();
  targetTx.delete(sequenceCounters).run();
  targetTx.delete(designCategoryMap).run();
  targetTx.delete(gemstoneLots).run();
  targetTx.delete(itemEvents).run();
  targetTx.delete(items).run();
  targetTx.delete(hsnCodes).run();
  targetTx.delete(stones).run();
  targetTx.delete(designs).run();
  targetTx.delete(categories).run();
}

/**
 * Inserts all Phase 2 inventory tables in dependency order (parents first).
 */
export function restoreInventoryData(tx: DbOrTx, payload: Record<string, any>): void {
  const targetTx = getDb(tx);

  // 1. Master tables
  if (payload.categories?.length) {
    targetTx.insert(categories).values(payload.categories).run();
  }
  if (payload.designs?.length) {
    targetTx.insert(designs).values(payload.designs).run();
  }
  if (payload.stones?.length) {
    targetTx.insert(stones).values(payload.stones).run();
  }
  if (payload.hsnCodes?.length) {
    targetTx.insert(hsnCodes).values(payload.hsnCodes).run();
  }

  // 2. Items & Item Events
  if (payload.items?.length) {
    targetTx.insert(items).values(payload.items).run();
  }
  if (payload.itemEvents?.length) {
    targetTx.insert(itemEvents).values(payload.itemEvents).run();
  }

  // 3. Gemstones, Cross-references, Sequence Counters
  if (payload.gemstoneLots?.length) {
    targetTx.insert(gemstoneLots).values(payload.gemstoneLots).run();
  }
  if (payload.designCategoryMap?.length) {
    targetTx.insert(designCategoryMap).values(payload.designCategoryMap).run();
  }
  if (payload.sequenceCounters?.length) {
    targetTx.insert(sequenceCounters).values(payload.sequenceCounters).run();
  }

  // 4. Old Metal Lots (supports backward compatibility with older 'oldGoldLots' backups)
  const lots = payload.oldMetalLots?.length ? payload.oldMetalLots : payload.oldGoldLots;
  if (lots?.length) {
    targetTx.insert(oldMetalLots).values(lots).run();
  }

  // 5. URD Purchases
  if (payload.urdPurchases?.length) {
    targetTx.insert(urdPurchases).values(payload.urdPurchases).run();
  }

  // 6. Loose Stock Lots & Events (GAP-FIX v2.34)
  if (payload.looseStockLots?.length) {
    targetTx.insert(looseStockLots).values(payload.looseStockLots).run();
  }
  if (payload.looseStockEvents?.length) {
    targetTx.insert(looseStockEvents).values(payload.looseStockEvents).run();
  }
}

/**
 * Validates that an inventory backup payload conforms to Phase 2 expectations.
 */
export function validateInventoryPayload(payload: Record<string, any>): boolean {
  if (!payload || typeof payload !== 'object') return false;
  // If inventory tables are present, check they are arrays
  if (payload.categories && !Array.isArray(payload.categories)) return false;
  if (payload.designs && !Array.isArray(payload.designs)) return false;
  if (payload.items && !Array.isArray(payload.items)) return false;
  return true;
}

// Register Phase 2 extension with Phase 1 backupService / restoreService
registerRestoreHandler('phase2_inventory', {
  clear: clearInventoryData,
  restore: restoreInventoryData,
});

export const inventoryRestoreService = {
  clearInventoryData,
  restoreInventoryData,
  validateInventoryPayload,
};

export default inventoryRestoreService;
