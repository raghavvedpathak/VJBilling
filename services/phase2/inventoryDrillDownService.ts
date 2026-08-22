// services/phase2/inventoryDrillDownService.ts
// FEAT-DRILL-DOWN-1 (v1.65) / FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13) / FEAT-SCREEN-C-SIZE-1 (v2.13)

import { db, expoDb } from '@/db/client';
import { sql, desc, asc } from 'drizzle-orm';
import type { 
  ItemSearchResult, 
  DesignCategoryStockResult, 
  MetalSourceStockResult, 
  ItemTimelineEvent, 
  LowStockDesignPurityVariant 
} from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

export const inventoryDrillDownService = {
  getDraftCountSync(firmId: string): number {
    try {
      const res = expoDb.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM items WHERE firm_id = ? AND status = 'DRAFT'`,
        [firmId]
      );
      return res?.count || 0;
    } catch {
      return 0;
    }
  },

  // FIX-LOWSTOCK-PURITYGRAIN-1 (v2.13): Grouped by (design_id, purity_percent)
  async getLowStockDesignPurityVariants(firmId: string): Promise<LowStockDesignPurityVariant[]> {
    const result = await db.all(sql`
      SELECT 
        dpt.design_id AS designId, 
        d.name AS designName,
        dpt.purity_percent AS purityPercent,
        dpt.low_stock_threshold AS lowStockThreshold, 
        COUNT(i.id) AS availableCount
      FROM design_purity_thresholds dpt
      JOIN designs d ON d.id = dpt.design_id
      LEFT JOIN items i ON i.design_id = dpt.design_id 
        AND i.purity_percent = dpt.purity_percent 
        AND i.status = 'AVAILABLE' 
        AND i.firm_id = ${firmId}
      WHERE d.firm_id = ${firmId} 
        AND d.is_active = 1
      GROUP BY dpt.design_id, dpt.purity_percent, dpt.low_stock_threshold, d.name
      HAVING availableCount <= dpt.low_stock_threshold
      ORDER BY availableCount ASC
    `);
    return result.map((r: any) => ({
      designId: r.designId,
      designName: r.designName,
      purityPercent: Number(r.purityPercent),
      lowStockThreshold: Number(r.lowStockThreshold),
      availableCount: Number(r.availableCount) || 0,
    }));
  },

  // Backward-compatibility alias
  async getLowStockDesigns(firmId: string): Promise<LowStockDesignPurityVariant[]> {
    return this.getLowStockDesignPurityVariants(firmId);
  },

  getItemDetailSync(firmId: string, itemId: string): any {
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
        i.invoice_id AS invoiceId,
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
        al.payload
      FROM item_events ie
      LEFT JOIN audit_logs al 
        ON al.entity_id = ie.item_id 
        AND al.event_type = ie.event_type 
        AND al.firm_id = ie.firm_id
      WHERE ie.item_id = ? AND ie.firm_id = ?
      ORDER BY ie.timestamp ASC
    `, [itemId, firmId]);

    const timeline = timelineRows.map((row: any) => {
      const event: ItemTimelineEvent = {
        id: row.id,
        eventType: row.eventType,
        severity: row.severity,
        timestamp: row.timestamp,
        oldValue: row.oldValue,
        newValue: row.newValue,
        reason: row.reason,
        performedBy: row.performedBy,
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
        } catch {}
      }
      return event;
    });

    return { ...item, timeline };
  },

  async getItemDetail(firmId: string, itemId: string): Promise<any> {
    const item = await this.getItemWithNames(firmId, itemId);
    if (!item) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
    const timeline = await this.getItemTimeline(firmId, itemId);
    return { ...item, timeline };
  },

  async getCategoriesWithStock(firmId: string): Promise<{ id: string; name: string; availableCount: number; totalNetWeightMg: number }[]> {
    const result = await db.all(sql`
      SELECT 
        c.id, 
        c.name, 
        COUNT(i.id) AS availableCount, 
        COALESCE(SUM(i.net_weight_mg), 0) AS totalNetWeightMg
      FROM categories c
      JOIN items i ON i.category_id = c.id 
        AND i.status = 'AVAILABLE' 
        AND i.firm_id = ${firmId}
      WHERE c.firm_id = ${firmId} 
        AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    return (result as unknown) as { id: string; name: string; availableCount: number; totalNetWeightMg: number }[];
  },

  async getStockByMetalSource(firmId: string): Promise<MetalSourceStockResult[]> {
    const result = await db.all(sql`
      SELECT 
        metal_source AS metalSource, 
        metal, 
        COALESCE(SUM(net_weight_mg), 0) AS totalNetWeightMg, 
        COUNT(id) AS itemCount 
      FROM items
      WHERE firm_id = ${firmId} 
        AND status = 'AVAILABLE'
      GROUP BY metal_source, metal
      ORDER BY metal ASC, totalNetWeightMg DESC
    `);
    return (result as unknown) as MetalSourceStockResult[];
  },

  async getDraftItems(firmId: string): Promise<ItemSearchResult[]> {
    const result = await db.all(sql`
      SELECT 
        i.id AS itemId, 
        i.sku, 
        i.huid,
        i.gross_weight_mg AS grossWeightMg,
        i.net_weight_mg AS netWeightMg, 
        i.purity_percent AS purityPercent,
        i.purity_karat AS purityKarat,
        i.metal,
        i.status,
        i.size_value AS sizeValue,
        i.size_unit AS sizeUnit,
        d.name AS designName, 
        c.name AS categoryName
      FROM items i
      JOIN designs d ON i.design_id = d.id
      JOIN categories c ON i.category_id = c.id
      WHERE i.firm_id = ${firmId} 
        AND i.status = 'DRAFT'
      ORDER BY i.created_at DESC
    `);
    return (result as unknown) as ItemSearchResult[];
  },

  async getDesignsByCategory(firmId: string, categoryId: string): Promise<DesignCategoryStockResult[]> {
    const result = await db.all(sql`
      SELECT 
        designs.id AS designId, 
        designs.name AS designName, 
        designs.metal, 
        items.purity_percent AS purityPercent, 
        items.purity_karat AS purityKarat, 
        COUNT(items.id) AS availableCount,
        SUM(items.net_weight_mg) AS totalNetWeightMg 
      FROM designs 
      JOIN items ON items.design_id = designs.id 
        AND items.status = 'AVAILABLE' 
        AND items.firm_id = ${firmId} 
        AND items.category_id = ${categoryId} 
      WHERE designs.firm_id = ${firmId}
      GROUP BY designs.id, items.purity_percent 
      ORDER BY designs.name ASC, items.purity_percent DESC
    `);
    return (result as unknown) as DesignCategoryStockResult[];
  },

  // FEAT-SCREEN-C-SIZE-1 (v2.13): Sort order purityPercent DESC, sizeValue ASC, created_at DESC
  async getItemsByDesign(firmId: string, designId: string, purityPercent?: number): Promise<ItemSearchResult[]> {
    const hasPurityFilter = purityPercent !== undefined && purityPercent !== null && !isNaN(purityPercent);
    const query = hasPurityFilter
      ? sql`
          SELECT 
            i.id AS itemId, 
            i.sku, 
            d.name AS designName, 
            c.name AS categoryName,
            i.metal, 
            i.gross_weight_mg AS grossWeightMg, 
            i.purity_percent AS purityPercent, 
            i.huid,
            i.status, 
            i.barcode, 
            i.net_weight_mg AS netWeightMg, 
            i.purity_karat AS purityKarat, 
            i.location,
            i.size_value AS sizeValue, 
            i.size_unit AS sizeUnit
          FROM items i
          JOIN designs d ON d.id = i.design_id
          JOIN categories c ON c.id = i.category_id
          WHERE i.design_id = ${designId} 
            AND i.firm_id = ${firmId} 
            AND i.status = 'AVAILABLE'
            AND ABS(i.purity_percent - ${purityPercent}) < 0.05
          ORDER BY i.purity_percent DESC, i.size_value ASC, i.created_at DESC
        `
      : sql`
          SELECT 
            i.id AS itemId, 
            i.sku, 
            d.name AS designName, 
            c.name AS categoryName,
            i.metal, 
            i.gross_weight_mg AS grossWeightMg, 
            i.purity_percent AS purityPercent, 
            i.huid,
            i.status, 
            i.barcode, 
            i.net_weight_mg AS netWeightMg, 
            i.purity_karat AS purityKarat, 
            i.location,
            i.size_value AS sizeValue, 
            i.size_unit AS sizeUnit
          FROM items i
          JOIN designs d ON d.id = i.design_id
          JOIN categories c ON c.id = i.category_id
          WHERE i.design_id = ${designId} 
            AND i.firm_id = ${firmId} 
            AND i.status = 'AVAILABLE'
          ORDER BY i.purity_percent DESC, i.size_value ASC, i.created_at DESC
        `;
    const result = await db.all(query);
    return (result as unknown) as ItemSearchResult[];
  },

  async getItemWithNames(firmId: string, itemId: string): Promise<any> {
    const result = await db.get(sql`
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
        i.invoice_id AS invoiceId,
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
      WHERE i.id = ${itemId} 
        AND i.firm_id = ${firmId}
      LIMIT 1
    `);
    return result || null;
  },

  async getItemTimeline(firmId: string, itemId: string): Promise<ItemTimelineEvent[]> {
    const result = await db.all(sql`
      SELECT 
        ie.id, 
        ie.event_type AS eventType, 
        ie.severity, 
        ie.timestamp, 
        ie.old_value AS oldValue, 
        ie.new_value AS newValue, 
        ie.reason, 
        ie.performed_by AS performedBy,
        al.payload
      FROM item_events ie
      LEFT JOIN audit_logs al 
        ON al.entity_id = ie.item_id 
        AND al.event_type = ie.event_type 
        AND al.firm_id = ie.firm_id
      WHERE ie.item_id = ${itemId} 
        AND ie.firm_id = ${firmId}
      ORDER BY ie.timestamp ASC
    `);

    return result.map((row: any) => {
      const event: ItemTimelineEvent = {
        id: row.id,
        eventType: row.eventType,
        severity: row.severity,
        timestamp: row.timestamp,
        oldValue: row.oldValue,
        newValue: row.newValue,
        reason: row.reason,
        performedBy: row.performedBy,
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
        } catch {}
      }
      return event;
    });
  }
};