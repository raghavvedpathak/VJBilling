// services/itemService.ts — Phase 2 v2.11 Canonical Service

import { db } from '@/db/client';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { hsnMasterRepository } from '@/repositories/phase2/hsnMasterRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import * as skuEngine from '@/services/phase2/skuEngine';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
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
  MetalSource
} from '@/types/phase2/phase2.types';
import { ALLOWED_TRANSITIONS, TERMINAL_ITEM_STATUSES } from '@/types/phase2/phase2.types';
import { format, parseISO } from 'date-fns';

export const itemService = {
  // --- createPhantomItem (FEAT-PHANTOM-INVENTORY-1 v1.67) ---
  async createPhantomItem(input: CreatePhantomItemInput, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

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
      const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, input.purityPercent, design.metal); // FIX-PHANTOM-PURITY-1 v1.95

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
        invoiceId: null,
        phantomStockId: null,
        hsnCode: input.hsnCode,
        metalSource: 'SUPPLIER_PURCHASE',
        barcodeReprintRequired: 0,
        status: 'PHANTOM_AVAILABLE',
        huid: null,
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
  },

  // --- reconcilePhantomItem (FEAT-PHANTOM-INVENTORY-1 v1.67) ---
  async reconcilePhantomItem(phantomItemId: string, realItemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
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
          invoiceId: phantom.invoiceId,
          reconciledAt: now()
        }
      });
    });
  },

  // --- createItem (Step 6) ---
  async createItem(input: CreateItemInput, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

    // FIX-GAP-P2-BACKDATE-1 (v1.76): resolve + validate entry date
    const todayIso = now().split('T')[0];
    const entryDate = input.entryDate ?? todayIso;
    if (entryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);

    fyRepository.resolveTransactionFyId(firmId, entryDate); // Throws ENTRY_DATE_IN_CLOSED_FY if closed

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
      if (input.huid != null) {
        if (!/^[A-Z0-9]{6}$/.test(input.huid)) throw new Error(ERR.HUID_INVALID);
        const dup = itemRepository.findByHUID(tx, input.huid);
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
        invoiceId: null,
        phantomStockId: null,
        hsnCode,
        huid: input.huid ? input.huid.toUpperCase() : null,
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
          fineGoldChargedMg: fineGoldChargedMg!,
          purchaseRatePaise: item.purchaseRatePaise!,
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
  },

  // --- adjustWeight (Step 6 / FIX-WA-1 v1.24 & v1.88) ---
  async adjustWeight(
    itemId: string,
    firmId: string,
    newGrossWeightMg: number,
    newStoneWeightMg: number,
    newBeadsWeightMg: number,
    reason: string,
    newWastagePercent?: number
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

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
          newFineGoldChargedMg: newFineGoldChargedMg!,
          reason
        },
      });
    });
  },

  // --- updateItem (Step 6.5 / FIX-UPDATE-ITEM-BODY-1 v1.46 & FEAT-ITEM-POSTPUBLISH-EDIT-1 v1.77) ---
  async updateItem(
    itemId: string,
    firmId: string,
    input: UpdateableItemDraftFields,
    reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const EDITABLE: (keyof UpdateableItemDraftFields)[] = [
      'purityPercent', 'purityKarat', 'primaryStoneId',
      'location', 'makingChargePaise', 'stoneCostPaise', 'purchaseRatePaise',
      'sizeValue', 'sizeUnit', // GAP-P2-SIZE-EDIT-1 (v1.78)
    ];

    const presentFields = EDITABLE.filter(k => k in input);
    if (presentFields.length === 0) return;

    const deviceId = await getDeviceId();

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
  },

  // --- createItemsBulk (Step 6.6 / FIX-BULK-1 v1.51) ---
  async createItemsBulk(inputs: CreateItemInput[], firmId: string): Promise<Item[]> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2

    const BULK_ITEM_MAX = 50;
    if (inputs.length === 0) return [];
    if (inputs.length > BULK_ITEM_MAX) throw new Error(ERR.BULK_ITEM_MAX_EXCEEDED);

    const deviceId = await getDeviceId();

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
        fyRepository.resolveTransactionFyId(firmId, entryDate);

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
          invoiceId: null,
          phantomStockId: null,
          hsnCode: input.hsnCode,
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
            fineGoldChargedMg: fineGoldChargedMg!,
            purityRoundingDeltaMg: item.purityRoundingDeltaMg,
            purchaseRatePaise: item.purchaseRatePaise!,
            purityPercent: item.purityPercent,
            hsnCode: item.hsnCode,
            metalSource: item.metalSource,
          }
        });

        designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });
        
        results.push(item);
      }
      return results;
    });
  },

  // --- deleteItem (Step 6.7.1 / FEAT-ITEM-CORRECTION-1 v1.88 / FEAT-SCREEN-D-DELETE-1 v2.07) ---
  async deleteItem(itemId: string, firmId: string, reason: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
    const deviceId = await getDeviceId();

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
  },

  // --- updateItemStatus (Step 10.6) ---
  async updateItemStatus(itemId: string, firmId: string, newStatus: StockStatus, reason?: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

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
  },

  // --- addHUID (Step 5.2 / FEAT-HUID-ASSIGN-1 v1.85) ---
  async addHUID(itemId: string, firmId: string, huid: string): Promise<Item> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();

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
        newValue: null,
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
  },

  // --- correctMetalSource (Step 6.7.2 / v2.11 FIX-METALSOURCE-POSTPUBLISH-1) ---
  // Widened from DRAFT-only to non-terminal-status items (v2.11 Fix 411)
  async correctMetalSource(itemId: string, firmId: string, metalSource: MetalSource, reason: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
    const deviceId = await getDeviceId();

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
  },

  // --- correctHUID (Step 6.7.3 / FEAT-ITEM-CORRECTION-1 v1.88) ---
  async correctHUID(itemId: string, firmId: string, huid: string, reason: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
    const deviceId = await getDeviceId();

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
  },

  // --- correctItemEntryDate (Step 6.7.8 / GAP-P2-DATE-SKU-EDIT-1 v1.79) ---
  async correctItemEntryDate(itemId: string, newEntryDate: string, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    
    const todayIso = now().split('T')[0];
    const deviceId = await getDeviceId();

    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
      if (TERMINAL_ITEM_STATUSES.includes(item.status)) {
        throw new Error(ERR.ITEM_EDIT_LOCKED_TERMINAL_STATUS);
      }
      if (newEntryDate > todayIso) throw new Error(ERR.ENTRY_DATE_IN_FUTURE);
      
      fyRepository.resolveTransactionFyId(firmId, newEntryDate);
      
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
  },

  // RETIRED v1.88: discardDraftItem (superseded by deleteItem)
  async discardDraftItem(itemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease(); // GUARD 1
    safeModeService.assertNotInSafeMode();    // GUARD 2
    const deviceId = await getDeviceId();
    
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
};