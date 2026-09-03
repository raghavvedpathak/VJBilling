// services/phase2/itemService.ts — Phase 2 v2.24 Canonical Service
// Aligned with FEAT-LOOSE-STOCK-1 (v2.23 / v2.24), FIX-ITEM-SALELINK-RENAME-1 (v2.17) & FIX-ITEM-PURCHASELINK-1 (v2.16)

import { db } from '@/db/client';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { hsnMasterRepository } from '@/repositories/phase2/hsnMasterRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { fyService } from '@/services/phase1/fyService';
import * as skuEngine from '@/services/phase2/skuEngine';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import { looseStockLotRepository } from '@/repositories/phase2/looseStockLotRepository';
import { looseStockEventRepository } from '@/repositories/phase2/looseStockEventRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import {
  resolveFineWeightMg,
  computeFineGoldChargedMg
} from '@/utils/purity.constants';
import * as Crypto from 'expo-crypto';
import { ERR } from '@/constants/errorCodes';
import type {
  CreatePhantomItemInput,
  Item,
  CreateItemInput,
  UpdateableItemDraftFields,
  StockStatus,
  MetalSource,
  AddLooseStockInput,
  LooseStockLot,
  LooseStockLotStatus,
  DrizzleTransaction
} from '@/types/phase2/phase2.types';
import { ALLOWED_TRANSITIONS, TERMINAL_ITEM_STATUSES } from '@/types/phase2/phase2.types';
import { format, parseISO } from 'date-fns';

// Helper for FY validation gate
function assertValidTransactionFy(firmId: string, entryDate: string): void {
  if (typeof (fyService as any)?.resolveTransactionFyId === 'function') {
    (fyService as any).resolveTransactionFyId(firmId, entryDate);
  } else if (typeof (fyRepository as any)?.resolveTransactionFyId === 'function') {
    (fyRepository as any).resolveTransactionFyId(firmId, entryDate);
  }
}

// --- createPhantomItem (FEAT-PHANTOM-INVENTORY-1 v1.67) ---
export async function createPhantomItem(input: CreatePhantomItemInput, firmId: string): Promise<Item> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, input.designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

    const category = categoryRepository.getById(tx, firmId, input.categoryId);
    if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

    hsnMasterRepository.findByCode(tx, firmId, input.hsnCode); // throws ITEM_HSN_MISSING

    if (input.grossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
    if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);

    const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
    if (netWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

    const sku = skuEngine.generateSKU(tx, design, firmId);
    const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal);

    const item = itemRepository.insert(tx, {
      id: Crypto.randomUUID(),
      sku,
      barcode: sku,
      designId: input.designId,
      firmId,
      categoryId: input.categoryId,
      primaryStoneId: input.primaryStoneId ?? null,
      grossWeightMg: input.grossWeightMg,
      stoneWeightMg: input.stoneWeightMg ?? 0,
      beadsWeightMg: input.beadsWeightMg ?? 0,
      netWeightMg,
      fineWeightMg,
      purityPercent: input.purityPercent,
      purityKarat: input.purityKarat,
      purityRoundingDeltaMg,
      wastagePercent: 0,
      fineGoldChargedMg: null,
      metal: design.metal, // FEAT-ITEM-METAL-DENORM-1 v1.95
      purchaseRatePaise: null,
      makingChargePaise: null,
      stoneCostPaise: null,
      location: input.location ?? null,
      saleInvoiceId: null, // FIX-ITEM-SALELINK-RENAME-1 (v2.17)
      purchaseInvoiceId: null, // FIX-ITEM-PURCHASELINK-1 (v2.16)
      phantomStockId: null,
      hsnCode: input.hsnCode,
      metalSource: 'SUPPLIER_PURCHASE',
      barcodeReprintRequired: 0,
      status: 'PHANTOM_AVAILABLE',
      huid: null,
      sizeValue: null,
      sizeUnit: null,
      createdAt: now(),
      updatedAt: now()
    });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: item.id,
      firmId,
      eventType: 'PHANTOM_CREATED',
      severity: 'WARNING',
      performedBy: deviceId,
      reason: 'Billed without prior stock entry',
      oldValue: null,
      newValue: null,
      timestamp: now()
    });

    auditRepository.log(tx, {
      eventType: 'PHANTOM_ITEM_CREATED',
      firmId,
      entityId: item.id,
      deviceId,
      payload: {
        sku,
        designId: item.designId,
        categoryId: item.categoryId,
        netWeightMg,
        fineWeightMg,
        purityPercent: item.purityPercent,
        hsnCode: item.hsnCode,
        purityRoundingDeltaMg: item.purityRoundingDeltaMg,
        reason: 'Stock not yet entered — billed in advance'
      }
    });

    designCategoryMapRepository.insert(tx, {
      designId: item.designId,
      categoryId: item.categoryId,
      firmId
    });

    return item;
  });
}

// --- reconcilePhantomItem (FEAT-PHANTOM-INVENTORY-1 v1.67 / v2.17) ---
export async function reconcilePhantomItem(phantomItemId: string, realItemId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

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

    // FIX-ITEM-SALELINK-RENAME-1 (v2.17): saleInvoiceId copied from phantom
    itemRepository.update(tx, firmId, phantomItemId, { phantomStockId: realItemId, updatedAt: now() });
    itemRepository.updateStatus(tx, firmId, realItemId, 'SOLD');
    itemRepository.update(tx, firmId, realItemId, { saleInvoiceId: phantom.saleInvoiceId, phantomStockId: phantomItemId, updatedAt: now() });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: phantomItemId,
      firmId,
      eventType: 'PHANTOM_RECONCILED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: 'Backdated real stock entry matched',
      oldValue: JSON.stringify({ phantomStockId: null }),
      newValue: JSON.stringify({ phantomStockId: realItemId }),
      timestamp: now()
    });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: realItemId,
      firmId,
      eventType: 'PHANTOM_RECONCILED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: 'This stock entry reconciles a phantom bill',
      oldValue: JSON.stringify({ status: 'AVAILABLE' }),
      newValue: JSON.stringify({ status: 'SOLD', phantomStockId: phantomItemId }),
      timestamp: now()
    });

    auditRepository.log(tx, {
      eventType: 'PHANTOM_RECONCILED',
      firmId,
      entityId: phantomItemId,
      deviceId,
      payload: {
        phantomItemId,
        phantomSku: phantom.sku,
        realItemId,
        realItemSku: real.sku,
        netWeightMg: phantom.netWeightMg,
        fineWeightMg: phantom.fineWeightMg,
        saleInvoiceId: phantom.saleInvoiceId,
        reconciledAt: now()
      }
    });
  });
}

// --- createItem (Step 6 / v2.16 / v2.17) ---
export async function createItem(input: CreateItemInput, firmId: string): Promise<Item> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

  // FIX-GAP-P2-BACKDATE-1 (v1.76): resolve + validate entry date
  const todayIso = now().split('T')[0];
  const entryDate = input.entryDate ?? todayIso;
  if (entryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);

  assertValidTransactionFy(firmId, entryDate); // Throws ENTRY_DATE_IN_CLOSED_FY if closed

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, input.designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

    const category = categoryRepository.getById(tx, firmId, input.categoryId);
    if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

    // Enforce sizeValue and sizeUnit pairing guard (FIX-GAP-P2-SIZE-2 v1.76)
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
    const cleanHuid = input.huid && input.huid.trim().length > 0 ? input.huid.trim().toUpperCase() : null;
    if (cleanHuid != null) {
      if (!/^[A-Z0-9]{6}$/.test(cleanHuid)) throw new Error(ERR.HUID_INVALID);
      const dup = itemRepository.findByHUID(tx, cleanHuid);
      if (dup) throw new Error(ERR.HUID_ALREADY_EXISTS);
    }

    const sku = skuEngine.generateSKU(tx, design, firmId, entryDate);
    const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal);

    // FIX-WAST-2 (v1.26) & FIX-WAST-CENTRALIZE-1 (v2.04)
    const wastagePercent = input.wastagePercent ?? 0;
    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, input.purityPercent, wastagePercent);

    const item = itemRepository.insert(tx, {
      id: Crypto.randomUUID(),
      sku,
      barcode: sku,
      designId: input.designId,
      firmId,
      categoryId: input.categoryId,
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
      saleInvoiceId: null, // FIX-ITEM-SALELINK-RENAME-1 (v2.17)
      purchaseInvoiceId: null, // FIX-ITEM-PURCHASELINK-1 (v2.16)
      phantomStockId: null,
      hsnCode,
      huid: cleanHuid,
      metalSource: input.metalSource ?? 'SUPPLIER_PURCHASE',
      barcodeReprintRequired: 0,
      status: 'DRAFT',
      metal: design.metal,
      sizeValue: input.sizeValue ?? null,
      sizeUnit: input.sizeUnit ?? null,
      createdAt: `${entryDate}T${now().split('T')[1]}`,
      updatedAt: now(),
    });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: item.id,
      firmId,
      eventType: 'CREATED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: null,
      oldValue: null,
      newValue: null,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'ITEM_CREATED',
      firmId,
      entityId: item.id,
      deviceId,
      payload: {
        sku,
        designId: item.designId,
        categoryId: item.categoryId,
        netWeightMg,
        fineWeightMg,
        wastagePercent,
        fineGoldChargedMg,
        purchaseRatePaise: item.purchaseRatePaise,
        purityPercent: item.purityPercent,
        purityRoundingDeltaMg: item.purityRoundingDeltaMg,
        makingChargePaise: item.makingChargePaise,
        stoneCostPaise: item.stoneCostPaise,
        location: item.location,
        metalSource: item.metalSource,
        hsnCode: item.hsnCode,
        huid: item.huid,
        entryDate,
      },
    });

    designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });

    return item;
  });
}

// --- adjustWeight (Step 6 / FIX-WA-1 v1.24 & v1.88) ---
export async function adjustWeight(
  itemId: string,
  firmId: string,
  newGrossWeightMg: number,
  newStoneWeightMg: number,
  newBeadsWeightMg: number,
  reason: string,
  newWastagePercent?: number
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  if (newGrossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
  const newNetWeightMg = newGrossWeightMg - newStoneWeightMg - newBeadsWeightMg;
  if (newNetWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);

    const oldGrossWeightMg = item.grossWeightMg;
    const { fineWeightMg: newFineWeightMg, purityRoundingDeltaMg: newPurityRoundingDeltaMg } = resolveFineWeightMg(newNetWeightMg, item.purityPercent, item.metal);

    // FIX-ADJ-WAST-1 (v1.29) & FIX-WAST-CENTRALIZE-1 (v2.04)
    const effectiveWastagePercent = newWastagePercent ?? item.wastagePercent ?? 0;
    const newFineGoldChargedMg = computeFineGoldChargedMg(newNetWeightMg, item.purityPercent, effectiveWastagePercent);

    itemRepository.update(tx, firmId, itemId, {
      grossWeightMg: newGrossWeightMg,
      stoneWeightMg: newStoneWeightMg,
      beadsWeightMg: newBeadsWeightMg,
      netWeightMg: newNetWeightMg,
      fineWeightMg: newFineWeightMg,
      purityRoundingDeltaMg: newPurityRoundingDeltaMg,
      wastagePercent: effectiveWastagePercent,
      fineGoldChargedMg: newFineGoldChargedMg,
      updatedAt: now(),
    });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      eventType: 'WEIGHT_ADJUSTED',
      severity: 'WARNING',
      performedBy: deviceId,
      reason: reason ?? null,
      oldValue: String(oldGrossWeightMg),
      newValue: String(newGrossWeightMg),
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'WEIGHT_ADJUSTED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: {
        itemId,
        sku: item.sku,
        oldGrossWeightMg,
        newGrossWeightMg,
        newNetWeightMg,
        newFineWeightMg,
        newPurityRoundingDeltaMg,
        newFineGoldChargedMg,
        reason
      },
    });
  });
}

// --- updateItem (Step 6.5 / FIX-UPDATE-ITEM-BODY-1 v1.46 & FEAT-ITEM-POSTPUBLISH-EDIT-1 v1.77) ---
export async function updateItem(
  itemId: string,
  firmId: string,
  input: UpdateableItemDraftFields,
  reason?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const EDITABLE: (keyof UpdateableItemDraftFields)[] = [
    'purityPercent', 'purityKarat', 'primaryStoneId',
    'location', 'makingChargePaise', 'stoneCostPaise', 'purchaseRatePaise',
    'sizeValue', 'sizeUnit', // GAP-P2-SIZE-EDIT-1 (v1.78)
  ];

  const presentFields = EDITABLE.filter(k => k in input);
  if (presentFields.length === 0) return;

  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);

    if ('sizeValue' in input || 'sizeUnit' in input) {
      const effSizeValue = 'sizeValue' in input ? input.sizeValue : item.sizeValue;
      const effSizeUnit = 'sizeUnit' in input ? input.sizeUnit : item.sizeUnit;
      const paired = (effSizeValue === null) === (effSizeUnit === null);
      if (!paired) throw new Error(ERR.ITEM_SIZE_PAIRING_INVALID);
    }

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

    if (Object.keys(changes).length === 0) return;

    itemRepository.update(tx, firmId, itemId, updateData);

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
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

    auditRepository.log(tx, {
      eventType: 'ITEM_EDITED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: {
        itemId,
        sku: item.sku,
        changes,
        reason: reason ?? null,
      },
    });
  });
}

// --- createItemsBulk (Step 6.6 / FIX-BULK-1 v1.51) ---
export async function createItemsBulk(inputs: CreateItemInput[], firmId: string): Promise<Item[]> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const BULK_ITEM_MAX = 50;
  if (inputs.length === 0) return [];
  if (inputs.length > BULK_ITEM_MAX) throw new Error(ERR.BULK_ITEM_MAX_EXCEEDED);

  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const results: Item[] = [];
    for (const input of inputs) {
      const design = designRepository.getById(tx, firmId, input.designId);
      if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);

      const category = categoryRepository.getById(tx, firmId, input.categoryId);
      if (!category || category.firmId !== firmId) throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);

      if ((input.sizeValue != null && input.sizeUnit == null) || (input.sizeValue == null && input.sizeUnit != null)) {
        throw new Error(ERR.ITEM_SIZE_PAIRING_INVALID);
      }

      hsnMasterRepository.findByCode(tx, firmId, input.hsnCode);

      if (input.grossWeightMg <= 0) throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
      if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);

      const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
      if (netWeightMg <= 0) throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);

      const todayIso = now().split('T')[0];
      const entryDate = input.entryDate ?? todayIso;
      if (entryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
      assertValidTransactionFy(firmId, entryDate);

      const sku = skuEngine.generateSKU(tx, design, firmId, entryDate);
      const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal);
      
      const wastagePercent = input.wastagePercent ?? 0;
      const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, input.purityPercent, wastagePercent);

      const item = itemRepository.insert(tx, {
        id: Crypto.randomUUID(),
        sku,
        barcode: sku,
        designId: input.designId,
        firmId,
        categoryId: input.categoryId,
        primaryStoneId: input.primaryStoneId ?? null,
        grossWeightMg: input.grossWeightMg,
        stoneWeightMg: input.stoneWeightMg ?? 0,
        beadsWeightMg: input.beadsWeightMg ?? 0,
        netWeightMg,
        fineWeightMg,
        purityPercent: input.purityPercent,
        purityKarat: input.purityKarat,
        wastagePercent,
        fineGoldChargedMg,
        purityRoundingDeltaMg,
        purchaseRatePaise: input.purchaseRatePaise ?? null,
        makingChargePaise: input.makingChargePaise ?? null,
        stoneCostPaise: input.stoneCostPaise ?? null,
        location: input.location ?? null,
        saleInvoiceId: null, // FIX-ITEM-SALELINK-RENAME-1 (v2.17)
        purchaseInvoiceId: null, // FIX-ITEM-PURCHASELINK-1 (v2.16)
        phantomStockId: null,
        hsnCode: input.hsnCode,
        huid: null,
        metalSource: input.metalSource ?? 'SUPPLIER_PURCHASE',
        sizeValue: input.sizeValue ?? null,
        sizeUnit: input.sizeUnit ?? null,
        barcodeReprintRequired: 0,
        status: 'DRAFT',
        metal: design.metal,
        createdAt: `${entryDate}T${now().split('T')[1]}`,
        updatedAt: now(),
      });
      
      itemEventRepository.insert(tx, {
        id: Crypto.randomUUID(),
        itemId: item.id,
        firmId,
        eventType: 'CREATED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: null,
        oldValue: null,
        newValue: null,
        timestamp: now()
      });
        
      auditRepository.log(tx, {
        eventType: 'ITEM_CREATED',
        firmId,
        entityId: item.id,
        deviceId,
        payload: {
          sku,
          designId: item.designId,
          categoryId: item.categoryId,
          netWeightMg,
          fineWeightMg,
          wastagePercent,
          fineGoldChargedMg,
          purityRoundingDeltaMg: item.purityRoundingDeltaMg,
          purchaseRatePaise: item.purchaseRatePaise,
          purityPercent: item.purityPercent,
          hsnCode: item.hsnCode,
          metalSource: item.metalSource,
          bulkInsert: true,
          entryDate,
        }
      });

      designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });
      
      results.push(item);
    }
    return results;
  });
}

// --- deleteItem (Step 6.7.1 / FEAT-ITEM-CORRECTION-1 v1.88 / FEAT-SCREEN-D-DELETE-1 v2.07) ---
export async function deleteItem(itemId: string, firmId: string, reason: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (TERMINAL_ITEM_STATUSES.includes(item.status)) {
      throw new Error(ERR.ITEM_DELETE_LOCKED_TERMINAL_STATUS);
    }

    itemEventRepository.deleteByItemId(tx, firmId, itemId);
    itemRepository.delete(tx, firmId, itemId);

    auditRepository.log(tx, {
      eventType: 'ITEM_DELETED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: { sku: item.sku, designId: item.designId, priorStatus: item.status, reason },
    });
  });
}

// --- updateItemStatus (Step 10.6) ---
export async function updateItemStatus(itemId: string, firmId: string, newStatus: StockStatus, reason?: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

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
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      eventType: 'ITEM_STATUS_CHANGED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: reason ?? null,
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'ITEM_STATUS_CHANGED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: { itemId, oldStatus, newStatus, sku: item.sku },
    });
  });
}

// --- addHUID (Step 5.2 / FEAT-HUID-ASSIGN-1 v1.85) ---
export async function addHUID(itemId: string, firmId: string, huid: string): Promise<Item> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
    if (item.huid !== null) throw new Error(ERR.HUID_ALREADY_SET);
    if (!/^[A-Z0-9]{6}$/.test(huid)) throw new Error(ERR.HUID_INVALID);

    const dup = itemRepository.findByHUID(tx, huid);
    if (dup) throw new Error(ERR.HUID_ALREADY_EXISTS);

    itemRepository.update(tx, firmId, itemId, { huid, barcodeReprintRequired: 1, updatedAt: now() });

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId, 
      firmId, 
      eventType: 'HUID_ADDED',
      severity: 'INFO', 
      performedBy: deviceId, 
      reason: null,
      oldValue: null,
      newValue: huid,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      firmId, 
      entityId: itemId, 
      eventType: 'HUID_ADDED',
      deviceId, 
      payload: { itemId, sku: item.sku, huid },
    });

    return { ...item, huid, barcodeReprintRequired: 1 } as Item;
  });
}

// --- correctMetalSource (Step 6.7.2 / v2.11 FIX-METALSOURCE-POSTPUBLISH-1) ---
export async function correctMetalSource(itemId: string, firmId: string, metalSource: MetalSource, reason: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
    
    // FIX-METALSOURCE-POSTPUBLISH-1 (v2.11): Widened from DRAFT-only to non-terminal-status
    if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
    
    const oldMetalSource = item.metalSource;

    itemRepository.update(tx, firmId, itemId, { metalSource, updatedAt: now() });
    
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      eventType: 'METAL_SOURCE_CORRECTED',
      severity: 'INFO',
      performedBy: deviceId,
      timestamp: now(),
      reason,
      oldValue: oldMetalSource,
      newValue: metalSource
    });

    auditRepository.log(tx, {
      eventType: 'METAL_SOURCE_CORRECTED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: { itemId, sku: item.sku, oldMetalSource, newMetalSource: metalSource, reason }
    });
  });
}

// --- correctHUID (Step 6.7.3 / FEAT-ITEM-CORRECTION-1 v1.88) ---
export async function correctHUID(itemId: string, firmId: string, huid: string, reason: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
    if (TERMINAL_ITEM_STATUSES.includes(item.status)) throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
    if (item.huid === null) throw new Error(ERR.HUID_NOT_SET);
    if (!/^[A-Z0-9]{6}$/.test(huid)) throw new Error(ERR.HUID_INVALID);
    
    const dup = itemRepository.findByHUID(tx, huid);
    if (dup && dup.id !== itemId) throw new Error(ERR.HUID_ALREADY_EXISTS);
    
    const oldHuid = item.huid;
    itemRepository.update(tx, firmId, itemId, { huid, barcodeReprintRequired: 1, updatedAt: now() });
    
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      eventType: 'HUID_CORRECTED',
      severity: 'INFO',
      performedBy: deviceId,
      reason,
      oldValue: oldHuid,
      newValue: huid,
      timestamp: now()
    });
    
    auditRepository.log(tx, {
      eventType: 'HUID_CORRECTED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: { itemId, sku: item.sku, oldHuid, newHuid: huid, reason },
    });
  });
}

// --- correctItemEntryDate (Step 6.7.8 / GAP-P2-DATE-SKU-EDIT-1 v1.79) ---
export async function correctItemEntryDate(itemId: string, newEntryDate: string, firmId: string): Promise<Item> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  
  const todayIso = now().split('T')[0];
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
    if (TERMINAL_ITEM_STATUSES.includes(item.status)) {
      throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
    }
    if (newEntryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
    
    assertValidTransactionFy(firmId, newEntryDate);
    
    const oldDate = item.createdAt.slice(0, 10);
    const timeOfDay = item.createdAt.includes('T') ? item.createdAt.split('T')[1] : '00:00:00.000Z';
    const dateOnly = newEntryDate.includes('T') ? newEntryDate.split('T')[0] : newEntryDate.slice(0, 10);
    const newCreatedAt = `${dateOnly}T${timeOfDay}`;
    const oldMmyy = format(parseISO(oldDate), 'MMyy');
    const newMmyy = format(parseISO(dateOnly), 'MMyy');
    
    if (oldMmyy === newMmyy) {
      // Same month — day-only correction
      itemRepository.updateCreatedAt(tx, itemId, newCreatedAt);
      auditRepository.log(tx, {
        eventType: 'ITEM_ENTRY_DATE_CORRECTED',
        firmId,
        entityId: item.id,
        deviceId,
        payload: { oldCreatedAt: item.createdAt, newCreatedAt, skuChanged: false },
      });
      return { ...item, createdAt: newCreatedAt };
    }
    
    // Different month — regenerate SKU
    const design = designRepository.getById(tx, firmId, item.designId);
    if (!design) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);
    
    const newSku = skuEngine.generateSKU(tx, design, firmId, newEntryDate);
    const oldSku = item.sku;
    const reprintNowRequired = item.status !== 'DRAFT';
    
    itemRepository.updateSkuAndDate(tx, itemId, {
      sku: newSku,
      barcode: newSku,
      createdAt: newCreatedAt,
      barcodeReprintRequired: reprintNowRequired,
    });
    
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      eventType: 'SKU_CHANGED',
      severity: 'INFO',
      performedBy: deviceId,
      oldValue: oldSku,
      newValue: newSku,
      reason: 'ENTRY_DATE_CORRECTION',
      timestamp: now(),
    });
    
    auditRepository.log(tx, {
      eventType: 'SKU_CHANGED',
      firmId,
      entityId: item.id,
      deviceId,
      payload: { oldSku, newSku, oldCreatedAt: item.createdAt, newCreatedAt, reason: 'ENTRY_DATE_CORRECTION' },
    });
    
    return {
      ...item,
      sku: newSku,
      barcode: newSku,
      createdAt: newCreatedAt,
      barcodeReprintRequired: reprintNowRequired ? 1 : 0,
    };
  });
}

// --- addLooseStock (STEP 6.9 / FEAT-LOOSE-STOCK-1 v2.23 / v2.24) ---
export async function addLooseStock(input: AddLooseStockInput, firmId: string): Promise<LooseStockLot> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();

  return db.transaction((tx) => {
    const design = designRepository.getById(tx, firmId, input.designId);
    if (!design || design.firmId !== firmId) throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);
    if (design.stockType !== 'LOOSE') throw new Error(ERR.LOOSE_STOCK_DESIGN_TYPE_MISMATCH);
    if (input.pieceCount <= 0) throw new Error(ERR.LOOSE_STOCK_QUANTITY_INVALID);
    if (input.totalWeightMg <= 0) throw new Error(ERR.LOOSE_STOCK_WEIGHT_INVALID);
    if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);

    const resolvedHsn = input.hsnCode ?? design.defaultHsn ?? null;
    if (!resolvedHsn) throw new Error(ERR.ITEM_HSN_MISSING);

    let lot = looseStockLotRepository.getByDesignAndPurity(tx, input.designId, input.purityPercent, firmId);
    if (!lot) {
      lot = looseStockLotRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId,
        designId: input.designId,
        purityPercent: input.purityPercent,
        purityKarat: input.purityKarat,
        metal: design.metal,
        pieceCount: input.pieceCount,
        totalWeightMg: input.totalWeightMg,
        hsnCode: resolvedHsn,
        status: 'ACTIVE',
        createdAt: now(),
        updatedAt: now(),
      });
    } else {
      // Merge-on-add policy: pool into existing ACTIVE lot
      looseStockLotRepository.updateCounts(
        tx,
        lot.id,
        lot.pieceCount + input.pieceCount,
        lot.totalWeightMg + input.totalWeightMg,
        'ACTIVE'
      );
    }

    looseStockEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      lotId: lot.id,
      firmId,
      eventType: 'STOCK_ADDED',
      pieceCountDelta: input.pieceCount,
      weightMgDelta: input.totalWeightMg,
      purchaseRatePaise: input.purchaseRatePaise ?? null,
      wastagePercent: input.wastagePercent ?? null,
      saleInvoiceId: null,
      performedBy: deviceId,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'LOOSE_STOCK_ADDED',
      firmId,
      entityId: lot.id,
      deviceId,
      payload: {
        lotId: lot.id,
        designId: input.designId,
        pieceCount: input.pieceCount,
        totalWeightMg: input.totalWeightMg,
      },
    });

    return lot;
  });
}

// --- sellFromLooseLot (STEP 6.9 / FEAT-LOOSE-STOCK-1 v2.23 / v2.24) ---
export function sellFromLooseLot(
  tx: DrizzleTransaction,
  lotId: string,
  firmId: string,
  qtySold: number,
  weightSoldMg: number,
  saleInvoiceId: string
): void {
  const lot = looseStockLotRepository.getById(tx, firmId, lotId);
  if (!lot || lot.firmId !== firmId) throw new Error(ERR.LOOSE_LOT_NOT_FOUND_OR_WRONG_FIRM);
  if (lot.status !== 'ACTIVE') throw new Error(ERR.LOOSE_LOT_NOT_FOUND_OR_WRONG_FIRM);
  if (qtySold <= 0 || qtySold > lot.pieceCount) throw new Error(ERR.LOOSE_LOT_INSUFFICIENT_QUANTITY);
  if (weightSoldMg <= 0 || weightSoldMg > lot.totalWeightMg) throw new Error(ERR.LOOSE_LOT_INSUFFICIENT_WEIGHT);

  const newPieceCount = lot.pieceCount - qtySold;
  const newTotalWeightMg = lot.totalWeightMg - weightSoldMg;
  const newStatus: LooseStockLotStatus = newPieceCount === 0 ? 'DEPLETED' : 'ACTIVE';

  looseStockLotRepository.updateCounts(tx, lot.id, newPieceCount, newTotalWeightMg, newStatus);

  looseStockEventRepository.insert(tx, {
    id: Crypto.randomUUID(),
    lotId: lot.id,
    firmId,
    eventType: newStatus === 'DEPLETED' ? 'LOT_DEPLETED' : 'STOCK_SOLD',
    pieceCountDelta: -qtySold,
    weightMgDelta: -weightSoldMg,
    purchaseRatePaise: null,
    wastagePercent: null,
    saleInvoiceId,
    performedBy: getDeviceId(),
    timestamp: now(),
  });

  auditRepository.log(tx, {
    eventType: 'LOOSE_STOCK_SOLD',
    firmId,
    entityId: lot.id,
    deviceId: getDeviceId(),
    payload: {
      lotId: lot.id,
      qtySold,
      weightSoldMg,
      saleInvoiceId,
    },
  });
}

// RETIRED v1.88: discardDraftItem (superseded by deleteItem)
export async function discardDraftItem(itemId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2
  const deviceId = getDeviceId();
  
  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
    if (item.status !== 'DRAFT') throw new Error(ERR.ITEM_NOT_DRAFT);
    
    itemEventRepository.deleteByItemId(tx, firmId, itemId);
    itemRepository.delete(tx, firmId, itemId);
    
    auditRepository.log(tx, {
      eventType: 'DRAFT_ITEM_DISCARDED' as any,
      firmId,
      entityId: itemId,
      deviceId,
      payload: { sku: item.sku, designId: item.designId },
    });
  });
}

export async function getItemById(firmId: string, itemId: string): Promise<Item | null> {
  return itemRepository.getById(firmId, itemId);
}

export const itemService = {
  createPhantomItem,
  reconcilePhantomItem,
  createItem,
  adjustWeight,
  updateItem,
  createItemsBulk,
  deleteItem,
  updateItemStatus,
  addHUID,
  correctMetalSource,
  correctHUID,
  correctItemEntryDate,
  addLooseStock,
  sellFromLooseLot,
  discardDraftItem,
  getItemBySku: (firmId: string, sku: string) => itemRepository.findBySku(firmId, sku),
  getItemById,
};