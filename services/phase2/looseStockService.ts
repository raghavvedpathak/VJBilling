// services/phase2/looseStockService.ts — Phase 2 v2.24 Canonical Service

import { looseStockLotRepository } from '@/repositories/phase2/looseStockLotRepository';
import { looseStockEventRepository } from '@/repositories/phase2/looseStockEventRepository';
import { addLooseStock, sellFromLooseLot } from '@/services/phase2/itemService';
import type { LooseStockLot, LooseStockEvent, AddLooseStockInput, DrizzleTransaction } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

export async function getLooseStockLots(firmId: string): Promise<LooseStockLot[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return looseStockLotRepository.findByFirmId(firmId);
}

export async function getLooseStockLotById(lotId: string, firmId: string): Promise<LooseStockLot | null> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return looseStockLotRepository.getById(lotId, firmId);
}

export async function getLooseStockLotEvents(lotId: string, firmId: string): Promise<LooseStockEvent[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return looseStockEventRepository.findByLotId(lotId, firmId);
}

export const looseStockService = {
  addLooseStock,
  sellFromLooseLot,
  getLots: getLooseStockLots,
  getLotById: getLooseStockLotById,
  getLotEvents: getLooseStockLotEvents,
};