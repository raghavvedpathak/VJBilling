// services/phase3/draftInvoiceService.ts — Phase 3 Draft Engine (v4.0, v4.3, v5.21, v5.35)
// STEP 7 — DRAFT ENGINE: Zero Inventory Lock during DRAFT

import db, { db as dbNamed } from '@/db/client';

function getDb(): any {
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { looseStockLotRepository } from '@/repositories/phase2/looseStockLotRepository';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import type {
  SaleInvoice,
  SaleInvoiceWithItems,
  SaleInvoiceItem,
  MakingChargesMode,
} from '@/types/phase3/phase3.types';
import type { Item, ItemSearchResult } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

export interface CreateDraftInvoiceInput {
  firmId: string;
  fyId: string;
  customerId: string;
  invoiceDate?: string;
  metalRatePaisePerGram?: number;
  isManualRate?: number;
  notes?: string | null;
  metalTaxGroupId?: string;
  makingTaxGroupId?: string;
}

export interface AddSerializedItemInput {
  invoiceId: string;
  item: ItemSearchResult | Item;
  makingChargesMode?: MakingChargesMode | undefined;
  makingRatePaise?: number | undefined;
  customMakingPaise?: number | undefined;
  stoneAmountPaise?: number | undefined;
  metalTaxGroupId?: string | undefined;
  makingTaxGroupId?: string | undefined;
}

export interface AddLooseStockItemInput {
  invoiceId: string;
  designId: string;
  purityPercent: number;
  qtySold: number;
  weightSoldMg: number;
  itemName?: string | undefined;
  hsnCode?: string | undefined;
  metal?: string | undefined;
  makingChargesMode?: MakingChargesMode | undefined;
  makingRatePaise?: number | undefined;
  customMakingPaise?: number | undefined;
  stoneAmountPaise?: number | undefined;
  metalTaxGroupId?: string | undefined;
  makingTaxGroupId?: string | undefined;
}

export interface UpdateDraftDetailsInput {
  customerId?: string | undefined;
  discountPaise?: number | undefined;
  oldMetalDeductionPaise?: number | undefined;
  oldMetalWeightMg?: number | undefined;
  oldMetalNotes?: string | undefined;
  notes?: string | undefined;
  metalRatePaisePerGram?: number | undefined;
  isManualRate?: number | undefined;
}

export const draftInvoiceService = {
  /**
   * Creates a new draft invoice.
   * If metalRatePaisePerGram is omitted, resolves from rateEngineService.
   */
  async createDraft(input: CreateDraftInvoiceInput): Promise<SaleInvoice> {
    if (!input.firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!input.fyId) throw new Error(ERR.FY_ID_REQUIRED);
    if (!input.customerId) throw new Error(ERR.CUSTOMER_NOT_FOUND);

    let metalRate = input.metalRatePaisePerGram;
    let isManual = input.isManualRate ?? 0;

    if (!metalRate || metalRate <= 0) {
      const rates = await rateEngineService.getCurrentRates(input.firmId);
      // Default to 24K gold base rate (paise per gram) or 22K rate if available
      metalRate = rates?.gold24BasePerGramPaise || rates?.gold22BasePerGramPaise || 720000;
      isManual = 0;
    }

    const todayStr = input.invoiceDate || new Date().toISOString().split('T')[0];

    const draft = await invoiceRepository.createDraft({
      firmId: input.firmId,
      fyId: input.fyId,
      customerId: input.customerId,
      invoiceDate: todayStr,
      metalRatePaisePerGram: metalRate || 720000,
      isManualRate: isManual,
      notes: input.notes ?? null,
    });

    return draft;
  },

  /**
   * Adds a serialized stock item to the draft.
   * 🔴 LOCK MODEL INVARIANT: Item status is NEVER changed during DRAFT.
   * Remains AVAILABLE or PHANTOM_AVAILABLE in items table.
   */
  async addSerializedItem(input: AddSerializedItemInput): Promise<SaleInvoiceItem> {
    const invoice = await invoiceRepository.getById(input.invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    const rawItemId = 'itemId' in input.item ? (input.item as ItemSearchResult).itemId : (input.item as Item).id;
    const itemInDb = await itemRepository.getById(rawItemId, invoice.firmId);
    if (!itemInDb) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (itemInDb.status !== 'AVAILABLE' && itemInDb.status !== 'PHANTOM_AVAILABLE') {
      throw new Error(ERR.ITEM_NOT_AVAILABLE);
    }

    // Metal Value calculation
    const netWeight = itemInDb.netWeightMg ?? itemInDb.grossWeightMg ?? 0;
    const metalValuePaise = Math.round((netWeight * invoice.metalRatePaisePerGram) / 1000);

    // Making Charges calculation
    const mode = input.makingChargesMode ?? 'PER_GRAM';
    let makingChargesPaise = 0;
    if (input.customMakingPaise !== undefined) {
      makingChargesPaise = input.customMakingPaise;
    } else if (input.makingRatePaise) {
      if (mode === 'PER_GRAM') {
        makingChargesPaise = Math.round((netWeight * input.makingRatePaise) / 1000);
      } else if (mode === 'FLAT') {
        makingChargesPaise = input.makingRatePaise;
      }
    }

    const stoneAmtPaise = input.stoneAmountPaise ?? 0;

    // GST calculation
    const firm = await firmRepository.findById(invoice.firmId);
    let lineCgst = 0;
    let lineSgst = 0;

    if (firm?.gstin) {
      const activeGroups = await taxMasterService.getActiveTaxGroups(invoice.firmId);
      const metalGrp = activeGroups.find(g => g.id === input.metalTaxGroupId) || activeGroups.find(g => g.groupName.includes('3%')) || activeGroups[0];
      const makingGrp = activeGroups.find(g => g.id === input.makingTaxGroupId) || activeGroups.find(g => g.groupName.includes('5%')) || activeGroups[0];

      if (metalGrp) {
        const metalCgstBps = metalGrp.cgstRate.rateBps ?? 150;
        const metalSgstBps = metalGrp.sgstRate.rateBps ?? 150;
        lineCgst += Math.round((metalValuePaise * metalCgstBps) / 10000);
        lineSgst += Math.round((metalValuePaise * metalSgstBps) / 10000);
      }

      if (makingGrp) {
        const makingCgstBps = makingGrp.cgstRate.rateBps ?? 250;
        const makingSgstBps = makingGrp.sgstRate.rateBps ?? 250;
        lineCgst += Math.round((makingChargesPaise * makingCgstBps) / 10000);
        lineSgst += Math.round((makingChargesPaise * makingSgstBps) / 10000);
      }
    }

    const lineGstPaise = lineCgst + lineSgst;
    const lineTotalPaise = metalValuePaise + makingChargesPaise + stoneAmtPaise + lineGstPaise;

    // Snapshot onto sale_invoice_items
    const lineItem = await invoiceRepository.addItem({
      invoiceId: invoice.id,
      stockLotId: itemInDb.id,
      sku: itemInDb.sku,
      itemName: 'designName' in input.item ? (input.item as ItemSearchResult).designName : 'Jewellery Item',
      metal: itemInDb.metal,
      purityPct: itemInDb.purityPercent,
      grossWeightMg: itemInDb.grossWeightMg,
      stoneWeightMg: itemInDb.stoneWeightMg ?? 0,
      netWeightMg: itemInDb.netWeightMg,
      fineWeightMg: itemInDb.fineWeightMg,
      hsnCode: itemInDb.hsnCode || '7113',
      stoneAmountPaise: stoneAmtPaise,
      metalValuePaise,
      makingChargesPaise,
      lineGstPaise,
      lineTotalPaise,
      metalTaxGroupId: input.metalTaxGroupId ?? null,
      makingTaxGroupId: input.makingTaxGroupId ?? null,
      lineType: 'SERIALIZED_ITEM',
    });

    // NOTE: itemInDb remains in its current status (AVAILABLE / PHANTOM_AVAILABLE).
    // NO DB UPDATE TO items TABLE IS PERFORMED HERE.

    // Recalculate draft header totals
    await this.recalculateDraftTotals(invoice.id);

    return lineItem;
  },

  /**
   * Adds a loose stock line to the draft (FEAT-LOOSE-STOCK-SALE-1 v5.35).
   * 🔴 Invariant: Does NOT decrement piece count or weight from loose_stock_lots during DRAFT.
   */
  async addLooseStockItem(input: AddLooseStockItemInput): Promise<SaleInvoiceItem> {
    const invoice = await invoiceRepository.getById(input.invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    if (input.qtySold <= 0) throw new Error('Quantity sold must be greater than 0');
    if (input.weightSoldMg <= 0) throw new Error('Weight sold must be greater than 0');

    const lot = await looseStockLotRepository.getByDesignAndPurity(
      input.designId,
      input.purityPercent,
      invoice.firmId
    );

    if (!lot) throw new Error('Loose stock lot not found for design and purity');
    if (input.qtySold > lot.pieceCount) {
      throw new Error(`Insufficient loose stock: available ${lot.pieceCount} pcs, requested ${input.qtySold}`);
    }
    if (input.weightSoldMg > lot.totalWeightMg) {
      throw new Error(`Insufficient loose stock: available ${lot.totalWeightMg} mg, requested ${input.weightSoldMg} mg`);
    }

    // Metal Value calculation on weighed weightSoldMg
    const metalValuePaise = Math.round((input.weightSoldMg * invoice.metalRatePaisePerGram) / 1000);

    // Making Charges
    const mode = input.makingChargesMode ?? 'PER_GRAM';
    let makingChargesPaise = 0;
    if (input.customMakingPaise !== undefined) {
      makingChargesPaise = input.customMakingPaise;
    } else if (input.makingRatePaise) {
      if (mode === 'PER_GRAM') {
        makingChargesPaise = Math.round((input.weightSoldMg * input.makingRatePaise) / 1000);
      } else if (mode === 'FLAT') {
        makingChargesPaise = input.makingRatePaise;
      }
    }

    const stoneAmtPaise = input.stoneAmountPaise ?? 0;

    // GST
    const firm = await firmRepository.findById(invoice.firmId);
    let lineCgst = 0;
    let lineSgst = 0;

    if (firm?.gstin) {
      const activeGroups = await taxMasterService.getActiveTaxGroups(invoice.firmId);
      const metalGrp = activeGroups.find(g => g.id === input.metalTaxGroupId) || activeGroups.find(g => g.groupName.includes('3%')) || activeGroups[0];
      const makingGrp = activeGroups.find(g => g.id === input.makingTaxGroupId) || activeGroups.find(g => g.groupName.includes('5%')) || activeGroups[0];

      if (metalGrp) {
        const metalCgstBps = metalGrp.cgstRate.rateBps ?? 150;
        const metalSgstBps = metalGrp.sgstRate.rateBps ?? 150;
        lineCgst += Math.round((metalValuePaise * metalCgstBps) / 10000);
        lineSgst += Math.round((metalValuePaise * metalSgstBps) / 10000);
      }

      if (makingGrp) {
        const makingCgstBps = makingGrp.cgstRate.rateBps ?? 250;
        const makingSgstBps = makingGrp.sgstRate.rateBps ?? 250;
        lineCgst += Math.round((makingChargesPaise * makingCgstBps) / 10000);
        lineSgst += Math.round((makingChargesPaise * makingSgstBps) / 10000);
      }
    }

    const lineGstPaise = lineCgst + lineSgst;
    const lineTotalPaise = metalValuePaise + makingChargesPaise + stoneAmtPaise + lineGstPaise;

    const lineItem = await invoiceRepository.addItem({
      invoiceId: invoice.id,
      stockLotId: lot.id, // Overloaded to loose_stock_lots.id
      sku: null,
      itemName: input.itemName || 'Loose Stock Lot Item',
      metal: input.metal || 'GOLD',
      purityPct: input.purityPercent,
      grossWeightMg: null,
      stoneWeightMg: 0,
      netWeightMg: null,
      fineWeightMg: null,
      hsnCode: input.hsnCode || '7113',
      stoneAmountPaise: stoneAmtPaise,
      metalValuePaise,
      makingChargesPaise,
      lineGstPaise,
      lineTotalPaise,
      metalTaxGroupId: input.metalTaxGroupId ?? null,
      makingTaxGroupId: input.makingTaxGroupId ?? null,
      lineType: 'LOOSE_LOT',
      qtySold: input.qtySold,
      weightSoldMg: input.weightSoldMg,
    });

    // NOTE: looseStockLots count & weight are NOT decremented in DRAFT.
    await this.recalculateDraftTotals(invoice.id);

    return lineItem;
  },

  /**
   * Removes a line item from the draft invoice.
   */
  async removeItem(invoiceId: string, lineItemId: string): Promise<void> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    await invoiceRepository.removeItem(lineItemId);
    await this.recalculateDraftTotals(invoiceId);
  },

  /**
   * Updates draft details such as customer, discount, old metal deduction, notes, or rate override.
   */
  async updateDraftDetails(invoiceId: string, updates: UpdateDraftDetailsInput): Promise<SaleInvoice> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    const updatePayload: Partial<SaleInvoice> = {};
    if (updates.customerId !== undefined) updatePayload.customerId = updates.customerId;
    if (updates.discountPaise !== undefined) updatePayload.discountPaise = updates.discountPaise;
    if (updates.oldMetalDeductionPaise !== undefined) updatePayload.oldMetalDeductionPaise = updates.oldMetalDeductionPaise;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.metalRatePaisePerGram !== undefined) updatePayload.metalRatePaisePerGram = updates.metalRatePaisePerGram;
    if (updates.isManualRate !== undefined) updatePayload.isManualRate = updates.isManualRate;

    await invoiceRepository.updateDraft(invoiceId, updatePayload);
    return this.recalculateDraftTotals(invoiceId);
  },

  /**
   * Recalculates all draft invoice totals across all lines, discount, and old metal deduction.
   */
  async recalculateDraftTotals(invoiceId: string): Promise<SaleInvoice> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    const items = await invoiceRepository.getItemsByInvoiceId(invoiceId);

    let taxableMetalAmtPaise = 0;
    let taxableMakingAmtPaise = 0;
    let stoneAmtPaise = 0;
    let totalLineGstPaise = 0;

    for (const item of items) {
      taxableMetalAmtPaise += item.metalValuePaise || 0;
      taxableMakingAmtPaise += item.makingChargesPaise || 0;
      stoneAmtPaise += item.stoneAmountPaise || 0;
      totalLineGstPaise += item.lineGstPaise || 0;
    }

    const cgstPaise = Math.floor(totalLineGstPaise / 2);
    const sgstPaise = totalLineGstPaise - cgstPaise;
    const subtotalPaise = taxableMetalAmtPaise + taxableMakingAmtPaise + stoneAmtPaise + totalLineGstPaise;

    const discountPaise = invoice.discountPaise || 0;
    const oldMetalDeductionPaise = invoice.oldMetalDeductionPaise || 0;

    // Old metal deduction and discount are applied strictly AFTER GST:
    const netPayablePaise = Math.max(0, subtotalPaise - discountPaise - oldMetalDeductionPaise);

    return invoiceRepository.updateDraft(invoiceId, {
      taxableMetalAmtPaise,
      taxableMakingAmtPaise,
      stoneAmtPaise,
      cgstPaise,
      sgstPaise,
      netPayablePaise,
    });
  },

  /**
   * Discards the draft invoice and deletes all cascading line items.
   */
  async discardDraft(invoiceId: string): Promise<void> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    await invoiceRepository.deleteDraft(invoiceId);
  },

  /**
   * Retrieves draft invoice with items.
   */
  async getDraft(invoiceId: string): Promise<SaleInvoiceWithItems | null> {
    return invoiceRepository.getWithItems(invoiceId);
  },

  /**
   * Alias for createDraft (Step T test suite compatibility).
   */
  async createDraftInvoice(input: CreateDraftInvoiceInput): Promise<SaleInvoice> {
    return this.createDraft(input);
  },

  /**
   * Helper alias to add item by stockLotId or item object (Step T test suite compatibility).
   */
  async addItemToDraft(input: {
    invoiceId: string;
    stockLotId?: string;
    item?: any;
    firmId?: string;
    metalRatePaisePerGram?: number;
    makingChargesPaise?: number;
    hsnCode?: string;
    metalTaxGroupId?: string;
    makingTaxGroupId?: string;
    makingChargesMode?: MakingChargesMode;
  }): Promise<SaleInvoiceItem> {
    const itemObj = input.item || { id: input.stockLotId, itemId: input.stockLotId };
    return this.addSerializedItem({
      invoiceId: input.invoiceId,
      item: itemObj,
      makingChargesMode: input.makingChargesMode ?? 'FLAT',
      customMakingPaise: input.makingChargesPaise,
      metalTaxGroupId: input.metalTaxGroupId,
      makingTaxGroupId: input.makingTaxGroupId,
    });
  },

  /**
   * Discards the draft invoice and deletes all cascading line items,
   * logging DRAFT_INVOICE_DISCARDED audit log BEFORE deletion (Step T test suite compatibility).
   */
  async discardDraftInvoice(invoiceId: string, firmId?: string): Promise<void> {
    const invoice = await invoiceRepository.getById(invoiceId);
    if (!invoice) throw new Error(ERR.INVOICE_NOT_FOUND);
    if (invoice.status !== 'DRAFT') throw new Error(ERR.INVOICE_NOT_DRAFT);

    let devId = 'DEV-DEVICE-ID';
    try {
      devId = getDeviceId();
    } catch {}

    const conn = getDb();
    await conn.transaction(async (tx: any) => {
      auditRepository.log(tx, {
        eventType: 'DRAFT_INVOICE_DISCARDED',
        firmId: firmId || invoice.firmId,
        entityId: invoiceId,
        deviceId: devId,
        payload: { action: 'DISCARD_DRAFT', invoiceId },
      });

      await invoiceRepository.deleteDraft(invoiceId, tx);
    });
  },
};
