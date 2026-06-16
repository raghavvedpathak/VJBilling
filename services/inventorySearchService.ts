import { itemRepository } from '../repositories/itemRepository';
import { designRepository } from '../repositories/designRepository';
import type { ItemSearchResult, DesignStockResult } from '../types/phase2.types';

export const inventorySearchService = {
  async searchItems(firmId: string, query: string): Promise<ItemSearchResult[]> {
    if (query.trim().length < 2) return [];
    return itemRepository.search(firmId, query.trim());
  },

  async searchDesignStock(firmId: string, query: string): Promise<DesignStockResult[]> {
    if (query.trim().length < 2) return [];
    return designRepository.searchStock(firmId, query.trim());
  }
};
