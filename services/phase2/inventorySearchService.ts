// services/phase2/inventorySearchService.ts — Phase 2 v2.34 Canonical Service
// Step 3 / Step 6 / RED-7 (LIMIT 20) / RED-9 / Step P2-BACKDATE-SIZE (v1.76)

import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designRepository } from '@/repositories/phase2/designRepository';
import type { ItemSearchResult, DesignStockResult, Item } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

// --- searchItems (Step 6 / RED-7 LIMIT 20) ---
// Read-only search query for available stock items matching SKU, barcode, design, category, HUID, or numeric size
export async function searchItems(firmId: string, query: string): Promise<ItemSearchResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  const trimmedQuery = query?.trim() ?? '';
  if (trimmedQuery.length === 0) return [];
  return itemRepository.search(firmId, trimmedQuery);
}

// --- searchDesignStock (Step 3 / RED-7 LIMIT 20) ---
// Read-only search query for design stock aggregates matching design name, category, or numeric size
export async function searchDesignStock(firmId: string, query: string): Promise<DesignStockResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  const trimmedQuery = query?.trim() ?? '';
  if (trimmedQuery.length === 0) return [];
  return designRepository.searchStock(firmId, trimmedQuery);
}

// --- getItemBySku (Exact Single Item SKU / Barcode Lookup) ---
export async function getItemBySku(firmId: string, sku: string): Promise<Item | null> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  const trimmedSku = sku?.trim() ?? '';
  if (!trimmedSku) return null;
  return itemRepository.findBySku(firmId, trimmedSku);
}

export const inventorySearchService = {
  searchItems,
  searchDesignStock,
  getItemBySku,
};