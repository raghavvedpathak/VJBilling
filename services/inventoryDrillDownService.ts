// services/inventoryDrillDownService.ts
// FEAT-DRILL-DOWN-1 (v1.65): Read-only drill-down + item detail service.
// Constitutional: READ-ONLY throughout. firmId MANDATORY. No transaction.
// No dual guards. No audit writes. No lease acquisition.

import { inventoryDrillDownRepository } from '../repositories/inventoryDrillDownRepository';
import type { ItemSearchResult, DesignCategoryStockResult, ItemDetail } from '../types/phase2.types';

export async function getCategoriesWithStock(
  firmId: string
): Promise<{ id: string; name: string; availableCount: number; totalNetWeightMg: number }[]> {
  if (!firmId) throw new Error('FIRM_ID_REQUIRED');
  return inventoryDrillDownRepository.getCategoriesWithStock(firmId);
}

export async function getDraftItems(
  firmId: string
): Promise<ItemSearchResult[]> {
  if (!firmId) throw new Error('FIRM_ID_REQUIRED');
  return inventoryDrillDownRepository.getDraftItems(firmId);
}

export async function getDesignsByCategory(
  firmId: string,
  categoryId: string
): Promise<DesignCategoryStockResult[]> {
  if (!firmId || !categoryId) throw new Error('FIRM_ID_AND_CATEGORY_ID_REQUIRED');
  return inventoryDrillDownRepository.getDesignsByCategory(firmId, categoryId);
}

export async function getItemsByDesign(
  firmId: string,
  designId: string
): Promise<ItemSearchResult[]> {
  if (!firmId || !designId) throw new Error('FIRM_ID_AND_DESIGN_ID_REQUIRED');
  return inventoryDrillDownRepository.getItemsByDesign(firmId, designId);
}

export async function getItemDetail(
  firmId: string,
  itemId: string
): Promise<ItemDetail> {
  if (!firmId || !itemId) throw new Error('FIRM_ID_AND_ITEM_ID_REQUIRED');
  
  const item = await inventoryDrillDownRepository.getItemWithNames(firmId, itemId);
  if (!item) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');
  
  const timeline = await inventoryDrillDownRepository.getItemTimeline(firmId, itemId);
  
  return { ...item, timeline };
}

// Re-export old functions for backwards compatibility until fully refactored, if needed
// (But wait, the prompt asks to redefine `inventoryDrillDownService` entirely? Let's export it as an object too so we don't break existing files that import `inventoryDrillDownService.xxx`)
export const inventoryDrillDownService = {
  getCategoriesWithStock,
  getDesignsByCategory,
  getItemsByDesign,
  getItemDetail,
  getDraftItems,
};
