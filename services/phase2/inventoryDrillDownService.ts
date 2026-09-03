// services/phase2/inventoryDrillDownService.ts — Phase 2 v2.24 Canonical Service
// FEAT-DRILL-DOWN-1 (v1.65) / FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13) / FEAT-SCREEN-C-SIZE-1 (v2.13)

import { expoDb } from '@/db/client';
import { inventoryDrillDownRepository } from '@/repositories/phase2/inventoryDrillDownRepository';
import type { 
  ItemSearchResult, 
  DesignCategoryStockResult, 
  MetalSourceStockResult, 
  ItemTimelineEvent, 
  ItemDetail,
  LowStockDesignPurityVariant 
} from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

// --- Synchronous Fast Helpers (Used by UI Tabs & Cache-First Views) ---

export function getDraftCountSync(firmId: string): number {
  try {
    const res = expoDb.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM items WHERE firm_id = ? AND status = 'DRAFT'`,
      [firmId]
    );
    return res?.count || 0;
  } catch {
    return 0;
  }
}

export function getItemDetailSync(firmId: string, itemId: string): ItemDetail | null {
  const item = expoDb.getFirstSync<any>(`
    SELECT 
      i.id,
      i.sku,
      i.barcode,
      i.barcode_reprint_required AS barcodeReprintRequired,
      i.huid,
      i.design_id AS designId,
      i.category_id AS categoryId,
      i.firm_id AS firmId,
      i.primary_stone_id AS primaryStoneId,
      i.metal,
      i.purity_percent AS purityPercent,
      i.purity_karat AS purityKarat,
      i.gross_weight_mg AS grossWeightMg,
      i.stone_weight_mg AS stoneWeightMg,
      i.beads_weight_mg AS beadsWeightMg,
      i.net_weight_mg AS netWeightMg,
      i.fine_weight_mg AS fineWeightMg,
      i.purity_rounding_delta_mg AS purityRoundingDeltaMg,
      i.wastage_percent AS wastagePercent,
      i.fine_gold_charged_mg AS fineGoldChargedMg,
      i.purchase_rate_paise AS purchaseRatePaise,
      i.making_charge_paise AS makingChargePaise,
      i.stone_cost_paise AS stoneCostPaise,
      i.location,
      i.sale_invoice_id AS saleInvoiceId,
      i.purchase_invoice_id AS purchaseInvoiceId,
      i.phantom_stock_id AS phantomStockId,
      i.hsn_code AS hsnCode,
      i.size_value AS sizeValue,
      i.size_unit AS sizeUnit,
      i.metal_source AS metalSource,
      i.status,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt,
      d.name AS designName, 
      c.name AS categoryName
    FROM items i
    JOIN designs d ON i.design_id = d.id
    JOIN categories c ON i.category_id = c.id
    WHERE i.id = ? AND i.firm_id = ?
    LIMIT 1
  `, [itemId, firmId]);

  if (!item) return null;

  const timelineRows = expoDb.getAllSync<any>(`
    SELECT 
      ie.id, 
      ie.event_type AS eventType, 
      ie.severity, 
      ie.timestamp, 
      ie.old_value AS oldValue, 
      ie.new_value AS newValue, 
      ie.reason, 
      ie.performed_by AS performedBy,
      ie.karigar_id AS karigarId,
      al.payload
    FROM item_events ie
    LEFT JOIN audit_logs al 
      ON al.entity_id = ie.item_id 
      AND al.event_type = ie.event_type 
      AND al.firm_id = ie.firm_id
    WHERE ie.item_id = ? AND ie.firm_id = ?
    ORDER BY ie.timestamp ASC
  `, [itemId, firmId]);

  // FIX-KARIGAR-DUPES-1: Deduplicate joined audit_logs rows by event ID
  const seenEventIds = new Set<string>();
  const timeline: ItemTimelineEvent[] = [];

  for (const row of timelineRows) {
    if (seenEventIds.has(row.id)) continue;
    seenEventIds.add(row.id);

    const event: ItemTimelineEvent = {
      id: row.id,
      eventType: row.eventType,
      severity: row.severity,
      timestamp: row.timestamp,
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: row.reason,
      performedBy: row.performedBy,
      karigarId: row.karigarId ?? null,
    };

    if (row.payload) {
      try {
        const payloadObj = JSON.parse(row.payload);
        if (row.eventType === 'ITEM_SENT_TO_KARIGAR' || row.eventType === 'ITEM_RETURNED_FROM_KARIGAR') {
          if (payloadObj.karigarName) event.karigarName = payloadObj.karigarName;
        }
        if (row.eventType === 'ITEM_RETURNED_FROM_KARIGAR') {
          if (payloadObj.outcome) event.outcome = payloadObj.outcome;
        }
        if (row.eventType === 'ITEM_EDITED') {
          if (payloadObj.changes) event.changes = payloadObj.changes;
        }
      } catch {
        // ignore parse error
      }
    }
    timeline.push(event);
  }

  return { 
    ...item, 
    barcodeReprintRequired: Boolean(item.barcodeReprintRequired),
    timeline 
  };
}

// --- Screen A: Category Browse ---
export async function getCategoriesWithStock(firmId: string) {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getCategoriesWithStock(firmId);
}

// --- Screen B: Design List Under Category ---
export async function getDesignsByCategory(firmId: string, categoryId: string): Promise<DesignCategoryStockResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getDesignsByCategory(firmId, categoryId);
}

// --- Screen C: Individual Items Under Design (FEAT-SCREEN-C-SIZE-1) ---
export async function getItemsByDesign(
  firmId: string,
  designId: string,
  purityPercent?: number
): Promise<ItemSearchResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getItemsByDesign(firmId, designId, purityPercent);
}

// --- Screen D: Item Detail & Timeline ---
export async function getItemDetail(firmId: string, itemId: string): Promise<ItemDetail> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  const detail = await inventoryDrillDownRepository.getItemDetail(firmId, itemId);
  if (!detail) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
  return detail;
}

export async function getItemWithNames(firmId: string, itemId: string) {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getItemWithNames(firmId, itemId);
}

export async function getItemTimeline(firmId: string, itemId: string): Promise<ItemTimelineEvent[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getItemTimeline(firmId, itemId);
}

// --- Draft Stock ---
export async function getDraftItems(firmId: string): Promise<ItemSearchResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getDraftItems(firmId);
}

// --- Low Stock Alerts (FIX-LOWSTOCK-PURITYGRAIN-1 v2.13) ---
export async function getLowStockDesignPurityVariants(firmId: string): Promise<LowStockDesignPurityVariant[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getLowStockDesignPurityVariants(firmId);
}

export async function getLowStockDesigns(firmId: string): Promise<LowStockDesignPurityVariant[]> {
  return getLowStockDesignPurityVariants(firmId);
}

// --- Metal Source Breakdown (FEAT-GAP4-METALSOURCE-1) ---
export async function getStockByMetalSource(firmId: string): Promise<MetalSourceStockResult[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
  return inventoryDrillDownRepository.getStockByMetalSource(firmId);
}

export const inventoryDrillDownService = {
  getDraftCountSync,
  getItemDetailSync,
  getCategoriesWithStock,
  getDesignsByCategory,
  getItemsByDesign,
  getItemDetail,
  getItemWithNames,
  getItemTimeline,
  getDraftItems,
  getLowStockDesignPurityVariants,
  getLowStockDesigns,
  getStockByMetalSource,
};