import { db } from '../db/client';
import { itemRepository } from '../repositories/itemRepository';
import { designRepository } from '../repositories/designRepository';
import { categoryRepository } from '../repositories/categoryRepository';
import { hsnMasterRepository } from '../repositories/hsnMasterRepository';
import { fyRepository } from '../repositories/fyRepository';
import * as skuEngine from './skuEngine';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { designCategoryMapRepository } from '../repositories/designCategoryMapRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import { resolveFineWeightMg, computeFineGoldChargedMg, computeEffectivePricePerGram, computeEstTotalCostPaise } from '../utils/calculations';
import * as Crypto from 'expo-crypto';
import { ERR } from '../constants';
import type { CreatePhantomItemInput, Item, CreateItemInput, UpdateableItemDraftFields, StockStatus, MetalSource } from '../types/phase2.types';
import { ALLOWED_TRANSITIONS, TERMINAL_ITEM_STATUSES } from '../types/phase2.types';
import { format, parseISO } from 'date-fns';
import { eq } from 'drizzle-orm';
import { sequenceCounters } from '../db/schema';

export const itemService = {
  async createPhantomItem(input: CreatePhantomItemInput, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, input.designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const category = categoryRepository.getById(tx, firmId, input.categoryId);
      if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      hsnMasterRepository.findByCode(tx, firmId, input.hsnCode);

      if (input.grossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
      if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);

      const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
      if (netWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

      const sku = skuEngine.generateSKU(tx, design, firmId);
      const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal);

      const item = itemRepository.insert(tx, {
        id: Crypto.randomUUID(), sku, barcode: sku, designId: input.designId, firmId, categoryId: input.categoryId,
        primaryStoneId: input.primaryStoneId ?? null,
        grossWeightMg: input.grossWeightMg, stoneWeightMg: input.stoneWeightMg ?? 0,
        beadsWeightMg: input.beadsWeightMg ?? 0, netWeightMg, fineWeightMg,
        purityPercent: input.purityPercent, purityKarat: input.purityKarat,
        purityRoundingDeltaMg,
        wastagePercent: 0, fineGoldChargedMg: null, metal: design.metal,
        purchaseRatePaise: null, makingChargePaise: null, stoneCostPaise: null,
        location: input.location ?? null, invoiceId: null, phantomStockId: null,
        hsnCode: input.hsnCode, metalSource: 'SUPPLIER_PURCHASE', 
        barcodeReprintRequired: 0, status: 'PHANTOM_AVAILABLE', huid: null,
        createdAt: now(), updatedAt: now(), fyId: '' 
      });

      itemEventRepository.insert(tx, {
        itemId: item.id, firmId,
        eventType: 'PHANTOM_CREATED',
        severity: 'WARNING',
        performedBy: deviceId,
        reason: 'Billed without prior stock entry',
        oldValue: null, newValue: null,
        timestamp: now()
      });

      auditRepository.log(tx, {
        eventType: 'PHANTOM_ITEM_CREATED', firmId, entityId: item.id,
        deviceId, payload: JSON.stringify({
          sku, designId: item.designId, categoryId: item.categoryId,
          netWeightMg, fineWeightMg, purityPercent: item.purityPercent, hsnCode: item.hsnCode,
          purityRoundingDeltaMg: item.purityRoundingDeltaMg,
          reason: 'Stock not yet entered — billed in advance'
        })
      });

      designCategoryMapRepository.insert(tx, {
        designId: item.designId, categoryId: item.categoryId,
        firmId
      });

      return item;
    });
  },

  async reconcilePhantomItem(phantomItemId: string, realItemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const phantom = itemRepository.getById(tx, firmId, phantomItemId);
      if (!phantom || phantom.firmId !== firmId) throw new Error(ERR.PHANTOM_ITEM_NOT_FOUND);
      if (phantom.status !== 'PHANTOM_SOLD') throw new Error(ERR.PHANTOM_NOT_YET_SOLD);
      if (phantom.phantomStockId !== null) throw new Error(ERR.PHANTOM_ALREADY_RECONCILED);

      const real = itemRepository.getById(tx, firmId, realItemId);
      if (!real || real.firmId !== firmId) throw new Error(ERR.REAL_ITEM_NOT_FOUND);
      if (real.status !== 'AVAILABLE') throw new Error(ERR.REAL_ITEM_NOT_AVAILABLE_FOR_RECONCILE);
      if (real.phantomStockId !== null) throw new Error(ERR.REAL_ITEM_ALREADY_USED_FOR_RECONCILE);

      if (phantom.designId !== real.designId) throw new Error(ERR.RECONCILE_DESIGN_MISMATCH);
      if (phantom.netWeightMg !== real.netWeightMg) throw new Error(ERR.RECONCILE_WEIGHT_MISMATCH);
      if (Math.abs(phantom.purityPercent - real.purityPercent) > 0.01) throw new Error(ERR.RECONCILE_PURITY_MISMATCH);

      itemRepository.update(tx, firmId, phantomItemId, { phantomStockId: realItemId, updatedAt: now() });
      itemRepository.updateStatus(tx, firmId, realItemId, 'SOLD');
      itemRepository.update(tx, firmId, realItemId, { invoiceId: phantom.invoiceId, phantomStockId: phantomItemId, updatedAt: now() });

      itemEventRepository.insert(tx, {
        itemId: phantomItemId, firmId, eventType: 'PHANTOM_RECONCILED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: 'Backdated real stock entry matched',
        oldValue: JSON.stringify({ phantomStockId: null }),
        newValue: JSON.stringify({ phantomStockId: realItemId }),
        timestamp: now()
      });

      itemEventRepository.insert(tx, {
        itemId: realItemId, firmId, eventType: 'PHANTOM_RECONCILED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: 'This stock entry reconciles a phantom bill',
        oldValue: JSON.stringify({ status: 'AVAILABLE' }),
        newValue: JSON.stringify({ status: 'SOLD', phantomStockId: phantomItemId }),
        timestamp: now()
      });

      auditRepository.log(tx, {
        eventType: 'PHANTOM_RECONCILED', firmId, entityId: phantomItemId,
        deviceId, payload: JSON.stringify({
          phantomItemId, phantomSku: phantom.sku, realItemId, realItemSku: real.sku,
          netWeightMg: phantom.netWeightMg, fineWeightMg: phantom.fineWeightMg,
          invoiceId: phantom.invoiceId, reconciledAt: now()
        })
      });
    });
  },

  async createItem(input: CreateItemInput, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    // FIX-GAP-P2-BACKDATE-1 (v1.76): resolve + validate entry date
    const todayIso = now().split('T')[0];
    const entryDate = input.entryDate ?? todayIso;
    if (entryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
    
    const fyId = fyRepository.resolveTransactionFyId(firmId, entryDate);

    return db.transaction((tx) => {
      const design = designRepository.getById(tx, firmId, input.designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const category = categoryRepository.getById(tx, firmId, input.categoryId);
      if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      // Enforce sizeValue and sizeUnit pairing guard
      if ((input.sizeValue != null && input.sizeUnit == null) || (input.sizeValue == null && input.sizeUnit != null)) {
        throw new Error(ERR.ITEM_SIZE_PAIRING_INVALID);
      }

      const hsnCode = input.hsnCode;
      hsnMasterRepository.findByCode(tx, firmId, hsnCode);

      if (input.grossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
      if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);
      const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
      if (netWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

      // FEAT-HUID-CREATE-1 (v1.87)
      if (input.huid != null) {
        if (!/^[A-Z0-9]{6}$/.test(input.huid)) throw new Error(ERR.HUID_INVALID);
        const dup = itemRepository.findByHUID(tx, input.huid);
        if (dup) throw new Error(ERR.HUID_ALREADY_EXISTS);
      }

      const sku = skuEngine.generateSKU(tx, design, firmId, entryDate);
      const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal);

      // FIX-WAST-2 (v1.26): Supplier cost truth — gold actually billed
      const wastagePercent = input.wastagePercent ?? 0;
      const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, input.purityPercent, wastagePercent, design.metal);

      const item = itemRepository.insert(tx, {
        id: Crypto.randomUUID(), sku, barcode: sku,
        designId: input.designId, firmId, categoryId: input.categoryId,
        primaryStoneId: input.primaryStoneId ?? null,
        grossWeightMg: input.grossWeightMg,
        stoneWeightMg: input.stoneWeightMg ?? 0,
        beadsWeightMg: input.beadsWeightMg ?? 0,
        netWeightMg,
        fineWeightMg,
        purityRoundingDeltaMg,
        purityPercent: input.purityPercent,
        purityKarat: input.purityKarat,
        wastagePercent,
        fineGoldChargedMg,
        purchaseRatePaise: input.purchaseRatePaise ?? null,
        makingChargePaise: input.makingChargePaise ?? null,
        stoneCostPaise: input.stoneCostPaise ?? null,
        location: input.location ?? null,
        invoiceId: null,
        phantomStockId: null,
        hsnCode,
        huid: input.huid ? input.huid.toUpperCase() : null,
        metalSource: input.metalSource ?? 'SUPPLIER_PURCHASE',
        barcodeReprintRequired: 0,
        status: 'DRAFT',
        metal: design.metal,
        fyId, // FIX-GAP-P2-BACKDATE-1: Assign resolved fyId
        sizeValue: input.sizeValue ?? null,
        sizeUnit: input.sizeUnit ?? null,
        createdAt: `${entryDate}T${now().split('T')[1]}`, updatedAt: now(),
      });

      itemEventRepository.insert(tx, {
        itemId: item.id, firmId,
        eventType: 'CREATED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: null,
        oldValue: null, newValue: null,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_CREATED', firmId, entityId: item.id,
        deviceId,
        payload: JSON.stringify({
          sku, designId: item.designId, categoryId: item.categoryId,
          netWeightMg, fineWeightMg,
          wastagePercent, fineGoldChargedMg,
          purchaseRatePaise: item.purchaseRatePaise,
          purityPercent: item.purityPercent,
          purityRoundingDeltaMg: item.purityRoundingDeltaMg,
          makingChargePaise: item.makingChargePaise,
          stoneCostPaise: item.stoneCostPaise,
          location: item.location,
          metalSource: item.metalSource,
          hsnCode: item.hsnCode,
          huid: item.huid,
          sizeValue: item.sizeValue,
          sizeUnit: item.sizeUnit,
          entryDate, // FIX-GAP-P2-BACKDATE-2 (v1.76)
        }),
      });

      designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });

      return item;
    });
  },

  async adjustWeight(
    itemId: string, firmId: string,
    newGrossWeightMg: number, newStoneWeightMg: number, newBeadsWeightMg: number,
    reason: string,
    newWastagePercent?: number
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (newGrossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
    const newNetWeightMg = newGrossWeightMg - newStoneWeightMg - newBeadsWeightMg;
    if (newNetWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);

      const oldGrossWeightMg = item.grossWeightMg;
      const { fineWeightMg: newFineWeightMg, purityRoundingDeltaMg: newPurityRoundingDeltaMg } = resolveFineWeightMg(newNetWeightMg, item.purityPercent, item.metal);

      // FIX-ADJ-WAST-1 (v1.29) & v1.88 extensions
      const effectiveWastagePercent = newWastagePercent ?? item.wastagePercent ?? 0;
      const newFineGoldChargedMg = effectiveWastagePercent > 0
        ? Math.round(newNetWeightMg * ((item.purityPercent + effectiveWastagePercent) / 100))
        : null;

      itemRepository.update(tx, firmId, itemId, {
        grossWeightMg: newGrossWeightMg, stoneWeightMg: newStoneWeightMg,
        beadsWeightMg: newBeadsWeightMg, netWeightMg: newNetWeightMg,
        fineWeightMg: newFineWeightMg,
        purityRoundingDeltaMg: newPurityRoundingDeltaMg,
        wastagePercent: effectiveWastagePercent,
        fineGoldChargedMg: newFineGoldChargedMg,
        updatedAt: now(),
      });

      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'WEIGHT_ADJUSTED',
        severity: 'WARNING',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: String(oldGrossWeightMg),
        newValue: String(newGrossWeightMg),
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'WEIGHT_ADJUSTED', firmId, entityId: itemId,
        deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku, oldGrossWeightMg, newGrossWeightMg,
        newNetWeightMg, newFineWeightMg, newPurityRoundingDeltaMg, newFineGoldChargedMg,
        newWastagePercent: effectiveWastagePercent, reason }),
      });
    });
  },

// updateItem() — Canonical Service Body (FIX-UPDATE-ITEM-BODY-1 v1.46)
  async updateItem(
 itemId: string,
 firmId: string,
 input: UpdateableItemDraftFields,
 reason?: string,
): Promise<void> {
 await leaseService.assertNoActiveLease(); // GUARD 1
 safeModeService.assertNotInSafeMode(); // GUARD 2
 const EDITABLE: (keyof UpdateableItemDraftFields)[] = [
 'purityPercent', 'purityKarat', 'primaryStoneId',
 'location', 'makingChargePaise', 'stoneCostPaise', 'purchaseRatePaise',
 'sizeValue', 'sizeUnit', // GAP-P2-SIZE-EDIT-1 (v1.78): added — was missing since v1.76
 ];
 // NO-OP: no editable fields present → return immediately, no DB write, no audit
 const presentFields = EDITABLE.filter(k => k in input);
 if (presentFields.length === 0) return;
 const deviceId = await getDeviceId();
 return db.transaction((tx) => {
 const item = itemRepository.getById(tx, firmId, itemId);
 if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
 // TERMINAL-STATUS guard (FIX-UPDATE-ITEM-1 v1.45, AMENDED FEAT-ITEM-POSTPUBLISH-EDIT-1 v1.77 — was DRAFT-ONLY)
 // NOTE (v1.77): ITEM_EDIT_LOCKED_TERMINAL_STATUS replaces WEIGHT_EDIT_AFTER_DRAFT_FORBIDDEN as the throw site here, for consistency with adjustWeight(). WEIGHT_EDIT_AFTER_DRAFT_FORBIDDEN is now DEPRECATED — kept in ERR enum only, never thrown. // GAP-I7 (v1.73), UPDATED (v1.77): Phase 3 UI error map for ITEM_EDIT_LOCKED_TERMINAL_STATUS MUST display a generic message // ("Item cannot be edited once sold, melted, or returned") — NOT a weight-specific message. // This error code is thrown for ANY field rejection in updateItem(), not just weight fields.
 // This guard rejects ALL TERMINAL-status items regardless of field type (v1.77; was ALL non-DRAFT items) — the error code is the same as adjustWeight() by design. Do not change it.
 if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS); // (v1.77) was: if (item.status !== 'DRAFT') throw new Error(ERR.WEIGHT_EDIT_AFTER_DRAFT_FORBIDDEN);
 // GAP-P2-SIZE-EDIT-1 (v1.78): pairing guard — mirrors the DB-level CHECK
 // added in FIX-GAP-P2-SIZE-2 (v1.76), so a partial patch never reaches the DB.
 if ('sizeValue' in input || 'sizeUnit' in input) {
 const effSizeValue = 'sizeValue' in input ? input.sizeValue : item.sizeValue;
 const effSizeUnit = 'sizeUnit' in input ? input.sizeUnit : item.sizeUnit;
 const paired = (effSizeValue === null) === (effSizeUnit === null);
 if (!paired) throw new Error(ERR.ITEM_SIZE_PAIRING_INVALID);
 }
 // Build sparse changes map — only fields whose value actually changed
 const changes: Record<string, { old: unknown; new: unknown }> = {};
 const updateData: Record<string, unknown> = { updatedAt: now() };
 for (const key of presentFields) {
 const oldVal = (item as any)[key];
 const newVal = (input as Record<string, unknown>)[key];
 if (oldVal !== newVal) {
 changes[key] = { old: oldVal, new: newVal };
 updateData[key] = newVal;
 }
 }
 // NO-OP: all submitted fields identical to current values
 if (Object.keys(changes).length === 0) return;
 itemRepository.update(tx, firmId, itemId, updateData);
 // item_events row — ITEM_EDITED
 itemEventRepository.insert(tx, {
 itemId, firmId,
 eventType: 'ITEM_EDITED',
 severity: 'INFO',
 performedBy: deviceId,
 reason: reason ?? null,
 oldValue: JSON.stringify(
 Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.old]))
 ),
 newValue: JSON.stringify(
 Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.new]))
 ),
 timestamp: now(),
 });
 // audit_logs row — ITEM_EDITED with sparse changes map
 auditRepository.log(tx, {
 eventType: 'ITEM_EDITED',
 firmId,
 entityId: itemId,
 deviceId,
 payload: JSON.stringify({
 itemId,
 sku: item.sku,
 // sparse map: { fieldName: { old, new } } — only changed fields
 changes,
 reason: reason ?? null,
 }),
 });
 });
 },

  async createItemsBulk(inputs: CreateItemInput[], firmId: string): Promise<Item[]> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    const BULK_ITEM_MAX = 50;
    if (inputs.length === 0) return [];
    if (inputs.length > BULK_ITEM_MAX) throw new Error(ERR.BULK_ITEM_MAX_EXCEEDED);

    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const results: Item[] = [];
      for (const input of inputs) {
        // Full validation per item — same pipeline as createItem()
        const design = designRepository.getById(tx, firmId, input.designId);
        if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);
        const category = categoryRepository.getById(tx, firmId, input.categoryId);
        if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

        // Enforce sizeValue and sizeUnit pairing guard
        if ((input.sizeValue != null && input.sizeUnit == null) || (input.sizeValue == null && input.sizeUnit != null)) {
          throw new Error(ERR.ITEM_SIZE_PAIRING_INVALID);
        }

        hsnMasterRepository.findByCode(tx, firmId, input.hsnCode); // throws ITEM_HSN_MISSING
        if (input.grossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
        if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);

        const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
        if (netWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

        // Resolve entry date and fyId per item in bulk
        const todayIso = now().split('T')[0];
        const entryDate = input.entryDate ?? todayIso;
        if (entryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
        const fyId = fyRepository.resolveTransactionFyId(firmId, entryDate);

        const sku = skuEngine.generateSKU(tx, design, firmId, entryDate); // unique seq per item

        const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal); // FEAT-PURITY-ROUND-1 (v1.90)
        
        const wastagePercent = input.wastagePercent ?? 0;
        const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, input.purityPercent, wastagePercent, design.metal);

        // FIX-UI-TOTAL-1 (v1.51): UI display — Total Purchase Amount = (fineGoldChargedMg ?? fineWeightMg) / 1000 * purchaseRatePerGram
        // FIX-PPG-DISPLAY-1 (v1.52): UI display — Price Per Gram = (fineGoldChargedMg ?? fineWeightMg) / fineWeightMg * purchaseRatePerGram
        // Both fields: DISPLAY ONLY — never stored. Show when purchaseRatePaise is entered. Update live.
        // Show — when purchaseRatePaise is null.
        // Metal and money remain separate. Same per-item logic applies in bulk table per row.
        // DISPLAY ONLY — never stored on items table. Metal and money tracked separately.
        
        const item = itemRepository.insert(tx, {
          id: Crypto.randomUUID(), sku, barcode: sku, designId: input.designId, firmId, categoryId: input.categoryId,
          primaryStoneId: input.primaryStoneId ?? null,
          grossWeightMg: input.grossWeightMg, stoneWeightMg: input.stoneWeightMg ?? 0,
          beadsWeightMg: input.beadsWeightMg ?? 0, netWeightMg, fineWeightMg,
          purityPercent: input.purityPercent, purityKarat: input.purityKarat,
          wastagePercent, fineGoldChargedMg, purityRoundingDeltaMg, purchaseRatePaise: input.purchaseRatePaise ?? null, // FEAT-PURITY-ROUND-1 (v1.90)
          makingChargePaise: input.makingChargePaise ?? null, stoneCostPaise: input.stoneCostPaise ?? null,
          location: input.location ?? null, invoiceId: null, phantomStockId: null, hsnCode: input.hsnCode,
          metalSource: input.metalSource ?? 'SUPPLIER_PURCHASE', sizeValue: input.sizeValue ?? null, sizeUnit: input.sizeUnit ?? null,
          barcodeReprintRequired: 0, status: 'DRAFT', metal: design.metal, fyId,
          createdAt: `${entryDate}T${now().split('T')[1]}`, updatedAt: now(),
        });
        
        itemEventRepository.insert(tx, { itemId: item.id, firmId,
          eventType: 'CREATED', severity: 'INFO', performedBy: deviceId,
          reason: null, oldValue: null, newValue: null, timestamp: now() });
          
        auditRepository.log(tx, { eventType: 'ITEM_CREATED', firmId, entityId: item.id,
          deviceId, payload: JSON.stringify({ sku, designId: item.designId,
          categoryId: item.categoryId, netWeightMg, fineWeightMg,
          wastagePercent, fineGoldChargedMg, purityRoundingDeltaMg: item.purityRoundingDeltaMg,
          purchaseRatePaise: item.purchaseRatePaise, // FEAT-PURITY-ROUND-1 (v1.90)
          purityPercent: item.purityPercent, hsnCode: item.hsnCode,
          metalSource: item.metalSource, bulkInsert: true }) });

        // FIX-DCM-CREATEITEM-BODY (v1.58): Insert into design_category_map per FIX-DCM-WRITE-1 (v1.46).
        // INSERT OR IGNORE semantics.
        designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });
        
        results.push(item);
      } // end for loop
      return results;
    }); // end transaction
  },

  // deleteItem() --- Canonical Service Body (FEAT-ITEM-CORRECTION-1 v1.88)
  // Supersedes discardDraftItem(). TRUE hard delete for any non-terminal-status item.
  async deleteItem(
    itemId: string, firmId: string, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED); // new
    const deviceId = await getDeviceId();
    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM); // unchanged
      // WIDENED (v1.88): was 'if (item.status !== DRAFT) throw ITEM_NOT_DRAFT'
      if (TERMINAL_ITEM_STATUSES.includes(item.status)) {
        throw new Error(ERR.ITEM_DELETE_LOCKED_TERMINAL_STATUS); // new error code
      }
      // CRITICAL ORDER: itemEvents MUST be deleted before item (FK constraint) --- unchanged from discardDraftItem()
      itemEventRepository.deleteByItemId(tx, firmId, itemId);
      itemRepository.delete(tx, firmId, itemId);
      auditRepository.log(tx, {
        eventType: 'ITEM_DELETED', // supersedes DRAFT_ITEM_DISCARDED
        firmId, entityId: itemId, deviceId,
        payload: JSON.stringify({ sku: item.sku, designId: item.designId, priorStatus: item.status, reason }),
      });
    });
  },

  async updateItemStatus(
    itemId: string, firmId: string, newStatus: StockStatus, reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      // FIX-EXCEPTION2-PHANTOM-1 (v1.70): Explicit phantom isolation
      if (item.status.startsWith('PHANTOM_') || newStatus.startsWith('PHANTOM_')) {
        throw new Error(ERR.INVALID_TRANSITION);
      }

      const allowed = ALLOWED_TRANSITIONS[item.status as StockStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new Error(`${ERR.INVALID_TRANSITION}: ${item.status} -> ${newStatus}`);
      }

      const oldStatus = item.status;
      itemRepository.updateStatus(tx, firmId, itemId, newStatus);

      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_STATUS_CHANGED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: reason ?? null,
        oldValue: oldStatus,
        newValue: newStatus,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        eventType: 'ITEM_STATUS_CHANGED', firmId, entityId: itemId,
        deviceId, payload: JSON.stringify({ itemId, oldStatus, newStatus, sku: item.sku }),
      });
    });
  },

  async addHUID(
    itemId: string, firmId: string, huid: string
  ): Promise<Item> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
      if (item.huid !== null) throw new Error(ERR.HUID_ALREADY_SET);
      if (!/^[A-Z0-9]{6}$/.test(huid)) throw new Error(ERR.HUID_INVALID);

      const dup = itemRepository.findByHUID(tx, huid);
      if (dup) throw new Error(ERR.HUID_ALREADY_EXISTS);

      itemRepository.update(tx, firmId, itemId, { huid, barcodeReprintRequired: 1, updatedAt: now() } as any);

      itemEventRepository.insert(tx, {
        itemId, 
        firmId, 
        eventType: 'HUID_ADDED',
        severity: 'INFO', 
        performedBy: deviceId, 
        reason: null,
        oldValue: null,
        newValue: null,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        firmId, 
        entityId: itemId, 
        eventType: 'HUID_ADDED',
        deviceId, 
        payload: JSON.stringify({ itemId, sku: item.sku, huid }),
      });

      return { ...item, huid, barcodeReprintRequired: 1 } as unknown as Item;
    });
  },

  // correctMetalSource() --- Canonical Service Body (FEAT-ITEM-CORRECTION-1 v1.88)
  // DRAFT-status ONLY. Reuses ITEM_NOT_DRAFT (originally discardDraftItem()'s guard code).
  async correctMetalSource(
    itemId: string, firmId: string, metalSource: MetalSource, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
      if (item.status !== 'DRAFT') throw new Error(ERR.ITEM_NOT_DRAFT); // DRAFT-only, tighter than others
      const oldMetalSource = item.metalSource;

      itemRepository.update(tx, firmId, itemId, { metalSource, updatedAt: now() }); // bypasses UpdateableItemFields on purpose
      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'METAL_SOURCE_CORRECTED',
        severity: 'INFO', performedBy: deviceId, timestamp: now(), reason,
        oldValue: oldMetalSource, newValue: metalSource
      });
      auditRepository.log(tx, {
        eventType: 'METAL_SOURCE_CORRECTED', firmId, entityId: itemId, deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku, oldMetalSource, newMetalSource: metalSource, reason })
      });
    });
  },

  // correctHUID() --- Canonical Service Body (FEAT-ITEM-CORRECTION-1 v1.88)
  // For items where huid is already set. addHUID() remains the null-> value path, unchanged.
  async correctHUID(
    itemId: string, firmId: string, huid: string, reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED); // new
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
      if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
      if (item.huid === null) throw new Error(ERR.HUID_NOT_SET); // new --- use addHUID() instead
      if (!/^[A-Z0-9]{6}$/.test(huid)) throw new Error(ERR.HUID_INVALID); // same regex as addHUID()
      
      const dup = itemRepository.findByHUID(tx, huid); // global, cross-firm, same as addHUID()
      if (dup && dup.id !== itemId) throw new Error(ERR.HUID_ALREADY_EXISTS);
      
      const oldHuid = item.huid;
      // SQLite stores boolean 1/0
      itemRepository.update(tx, firmId, itemId, { huid, barcodeReprintRequired: 1, updatedAt: now() } as any);
      
      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'HUID_CORRECTED', severity: 'INFO',
        performedBy: deviceId, timestamp: now()
      });
      
      auditRepository.log(tx, {
        eventType: 'HUID_CORRECTED', firmId, entityId: itemId, deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku, oldHuid, newHuid: huid, reason }),
      });
    });
  },



  // GAP-P2-DATE-SKU-EDIT-1 (v1.79): dedicated correction function
  async correctItemEntryDate(
    itemId: string, newEntryDate: string, firmId: string
  ): Promise<Item> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2
    
    const todayISODate = () => format(new Date(), 'yyyy-MM-dd');
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
      if (TERMINAL_ITEM_STATUSES.includes(item.status)) {
        throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
      }
      if (newEntryDate > todayISODate()) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
      
      fyRepository.resolveTransactionFyId(firmId, newEntryDate, tx);
      // ^ throws ENTRY_DATE_IN_CLOSED_FY if newEntryDate falls in a closed FY —
      // identical gate to createItem()'s FIX-GAP-P2-BACKDATE-1 (v1.76).
      
      const oldDate = item.createdAt.slice(0, 10);
      const timeOfDay = item.createdAt.split('T')[1] || '00:00:00Z'; // fallback just in case
      const newCreatedAt = `${newEntryDate}T${timeOfDay}`;
      const oldMmyy = format(parseISO(oldDate), 'MMyy');
      const newMmyy = format(parseISO(newEntryDate), 'MMyy');
      
      if (oldMmyy === newMmyy) {
        // Same month — day-only correction. SKU/barcode untouched.
        itemRepository.updateCreatedAt(tx, itemId, newCreatedAt);
        auditRepository.log(tx, {
          eventType: 'ITEM_ENTRY_DATE_CORRECTED', firmId, entityId: item.id,
          deviceId,
          payload: JSON.stringify({ oldCreatedAt: item.createdAt, newCreatedAt, skuChanged: false }),
        });
        return { ...item, createdAt: newCreatedAt } as unknown as Item;
      }
      
      // Different month — regenerate SKU/barcode from the corrected date's sequence.
      // Reuses skuEngine.generateSKU() exactly as createItem() does (FIX-GAP-P2-BACKDATE-1,
      // v1.76) — no new SKU mechanism. The old month's sequence slot is never reclaimed;
      // this is an accepted, audited gap (see Architect A2 below).
      const design = designRepository.getById(tx, firmId, item.designId);
      if (!design) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);
      
      const newSku = skuEngine.generateSKU(tx, design, firmId, newEntryDate);
      const oldSku = item.sku;
      const reprintNowRequired = item.status !== 'DRAFT';
      // ^ DRAFT items have no physical label yet (Section STEP 5 PRINT FLOW prints only
      // after DRAFT -> AVAILABLE confirmation) — nothing to reprint.
      
      itemRepository.updateSkuAndDate(tx, itemId, {
        sku: newSku, barcode: newSku, createdAt: newCreatedAt,
        barcodeReprintRequired: reprintNowRequired,
      });
      
      itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'SKU_CHANGED', severity: 'INFO',
        performedBy: deviceId, timestamp: now(),
      });
      
      auditRepository.log(tx, {
        eventType: 'SKU_CHANGED', firmId, entityId: item.id, deviceId,
        payload: JSON.stringify({ 
          oldSku, newSku, oldCreatedAt: item.createdAt, newCreatedAt, reason: 'ENTRY_DATE_CORRECTION' 
        }),
      });
      
      return {
        ...item, sku: newSku, barcode: newSku, createdAt: newCreatedAt,
        barcodeReprintRequired: reprintNowRequired ? 1 : 0,
      } as unknown as Item;
    });
  },

  // RETIRED v1.88, superseded not deleted (FIX-V189-RETIRE-1): discardDraftItem() below is kept for historical reference
  // only. It is NOT a live call site — do not implement or call it. Every caller must use deleteItem() (Section 6.7.1), which
  // supersedes it with a widened non-terminal-status scope and the ITEM_DELETED audit event (replacing
  // DRAFT_ITEM_DISCARDED). This body is functionally frozen as of v1.87 and receives no further fixes.
  async discardDraftItem(itemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode(); // GUARD 2
    const deviceId = await getDeviceId();
    
    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId); // FIX-GETBYID-TX-1 (v1.56): tx overload required inside transaction
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
      if (item.status !== 'DRAFT') throw new Error(ERR.ITEM_NOT_DRAFT);
      
      // CRITICAL ORDER: itemEvents MUST be deleted before item (FK constraint)
      itemEventRepository.deleteByItemId(tx, firmId, itemId);
      itemRepository.delete(tx, firmId, itemId);
      
      auditRepository.log(tx, {
        eventType: 'DRAFT_ITEM_DISCARDED' as any, firmId, entityId: itemId,
        deviceId, payload: JSON.stringify({ sku: item.sku, designId: item.designId }),
      });
    });
  }
};