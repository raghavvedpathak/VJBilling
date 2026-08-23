// services/phase2/inventorySearchService.ts — Phase 2 v2.11 Canonical Service

import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designRepository } from '@/repositories/phase2/designRepository';
import type { ItemSearchResult, DesignStockResult } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

export const inventorySearchService = {
  // --- searchItems (Step 6 / RED-7 LIMIT 20) ---
  // Read-only search query for available stock items matching SKU, barcode, or HUID
  async searchItems(firmId: string, query: string): Promise<ItemSearchResult[]> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!query || query.trim().length < 2) return [];
    return itemRepository.search(firmId, query.trim());
  },

  // --- searchDesignStock (Step 3 / RED-7 LIMIT 20) ---
  // Read-only search query for design stock aggregates matching design name or code
  async searchDesignStock(firmId: string, query: string): Promise<DesignStockResult[]> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!query || query.trim().length < 2) return [];
    return designRepository.searchStock(firmId, query.trim());
  },

  // --- getItemBySku (Exact Single Item SKU / Barcode Lookup) ---
  async getItemBySku(firmId: string, sku: string) {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!sku || !sku.trim()) return null;
    return itemRepository.findBySku(firmId, sku.trim());
  }
};
