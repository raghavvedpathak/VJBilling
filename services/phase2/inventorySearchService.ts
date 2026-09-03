// services/phase2/inventorySearchService.ts — Phase 2 v2.24 Canonical Service
// Step 3 / Step 6 / RED-7 (LIMIT 20)

import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designRepository } from '@/repositories/phase2/designRepository';
import type { ItemSearchResult, DesignStockResult, Item } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

// --- searchItems (Step 6 / RED-7 LIMIT 20) ---
// Read-only search query for available stock items matching SKU, barcode, or HUID
export async function searchItems(firmId: string, query: string): Promise<ItemSearchResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  if (!query || query.trim().length < 2) return [];
  return itemRepository.search(firmId, query.trim());
}

// --- searchDesignStock (Step 3 / RED-7 LIMIT 20) ---
// Read-only search query for design stock aggregates matching design name or code
export async function searchDesignStock(firmId: string, query: string): Promise<DesignStockResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  if (!query || query.trim().length < 2) return [];
  return designRepository.searchStock(firmId, query.trim());
}

// --- getItemBySku (Exact Single Item SKU / Barcode Lookup) ---
export async function getItemBySku(firmId: string, sku: string): Promise<Item | null> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  if (!sku || !sku.trim()) return null;
  return itemRepository.findBySku(firmId, sku.trim());
}

export const inventorySearchService = {
  searchItems,
  searchDesignStock,
  getItemBySku,
};