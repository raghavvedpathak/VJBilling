// services/itemService.ts
import { db } from '../db/client';
import { itemRepository } from '../repositories/itemRepository';
import { designRepository } from '../repositories/designRepository';
import { categoryRepository } from '../repositories/categoryRepository';
import { hsnMasterRepository } from '../repositories/hsnMasterRepository';
import * as skuEngine from './skuEngine';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { designCategoryMapRepository } from '../repositories/designCategoryMapRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import type { CreatePhantomItemInput, Item, CreateItemInput, UpdateableItemDraftFields, StockStatus } from '../types/phase2.types';
import { ALLOWED_TRANSITIONS } from '../types/phase2.types';
import { format } from 'date-fns';
import { eq } from 'drizzle-orm';
import { sequenceCounters } from '../db/schema';

export const itemService = {
  async createPhantomItem(input: CreatePhantomItemInput, firmId: string): Promise<Item> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const design = await designRepository.getById(tx, input.designId);
      if (!design || design.firmId !== firmId) throw new Error('DESIGN_NOT_FOUND_OR_WRONG_FIRM');

      const category = await categoryRepository.getById(tx, input.categoryId);
      if (!category || category.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');

      await hsnMasterRepository.findByCode(tx, firmId, input.hsnCode);

      if (input.grossWeightMg <= 0) throw new Error('ITEM_GROSS_WEIGHT_INVALID');
      if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error('ITEM_PURITY_PERCENT_INVALID');

      const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
      if (netWeightMg <= 0) throw new Error('ITEM_NET_WEIGHT_INVALID');

      const sku = await skuEngine.generateSKU(tx, design, firmId);
      const fineWeightMg = Math.round(netWeightMg * input.purityPercent / 100);

      const item = await itemRepository.insert(tx, {
        id: Crypto.randomUUID(), sku, barcode: sku, designId: input.designId, firmId, categoryId: input.categoryId,
        primaryStoneId: input.primaryStoneId ?? null,
        grossWeightMg: input.grossWeightMg, stoneWeightMg: input.stoneWeightMg ?? 0,
        beadsWeightMg: input.beadsWeightMg ?? 0, netWeightMg, fineWeightMg,
        purityPercent: input.purityPercent, purityKarat: input.purityKarat,
        wastagePercent: 0, fineGoldChargedMg: null, metal: design.metal,
        purchaseRatePaise: null, makingChargePaise: null, stoneCostPaise: null,
        location: input.location ?? null, invoiceId: null, phantomStockId: null,
        hsnCode: input.hsnCode, metalSource: 'PURCHASE', 
        barcodeReprintRequired: 0, status: 'PHANTOM_AVAILABLE', huid: null,
        createdAt: now(), updatedAt: now(), fyId: '' 
      });

      item.metalSource = 'PURCHASE';

      await itemEventRepository.insert(tx, {
        itemId: item.id, firmId,
        eventType: 'PHANTOM_CREATED',
        severity: 'WARNING',
        performedBy: await getDeviceId(),
        reason: 'Billed without prior stock entry',
        oldValue: null, newValue: null,
        timestamp: now()
      });

      await auditRepository.log(tx, {
        eventType: 'PHANTOM_ITEM_CREATED', firmId, entityId: item.id,
        deviceId: await getDeviceId(), payload: JSON.stringify({
          sku, designId: item.designId, categoryId: item.categoryId,
          netWeightMg, fineWeightMg, purityPercent: item.purityPercent, hsnCode: item.hsnCode,
          reason: 'Stock not yet entered — billed in advance'
        })
      });

      await designCategoryMapRepository.insert(tx, {
        designId: item.designId, categoryId: item.categoryId,
        firmId
      });

      return item;
    });
  },

  async reconcilePhantomItem(phantomItemId: string, realItemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const phantom = await itemRepository.getById(tx, phantomItemId);
      if (!phantom || phantom.firmId !== firmId) throw new Error('PHANTOM_ITEM_NOT_FOUND');
      if (phantom.status !== 'PHANTOM_SOLD') throw new Error('PHANTOM_NOT_YET_SOLD');
      if (phantom.phantomStockId !== null) throw new Error('PHANTOM_ALREADY_RECONCILED');

      const real = await itemRepository.getById(tx, realItemId);
      if (!real || real.firmId !== firmId) throw new Error('REAL_ITEM_NOT_FOUND');
      if (real.status !== 'AVAILABLE') throw new Error('REAL_ITEM_NOT_AVAILABLE_FOR_RECONCILE');
      if (real.phantomStockId !== null) throw new Error('REAL_ITEM_ALREADY_USED_FOR_RECONCILE');

      if (phantom.designId !== real.designId) throw new Error('RECONCILE_DESIGN_MISMATCH');
      if (phantom.netWeightMg !== real.netWeightMg) throw new Error('RECONCILE_WEIGHT_MISMATCH');
      if (Math.abs(phantom.purityPercent - real.purityPercent) > 0.01) throw new Error('RECONCILE_PURITY_MISMATCH');

      await itemRepository.update(tx, phantomItemId, { phantomStockId: realItemId, updatedAt: now() });
      await itemRepository.updateStatus(tx, firmId, realItemId, 'SOLD');
      await itemRepository.update(tx, realItemId, { invoiceId: phantom.invoiceId, phantomStockId: phantomItemId, updatedAt: now() });

      await itemEventRepository.insert(tx, {
        itemId: phantomItemId, firmId, eventType: 'PHANTOM_RECONCILED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: 'Backdated real stock entry matched',
        oldValue: JSON.stringify({ phantomStockId: null }),
        newValue: JSON.stringify({ phantomStockId: realItemId }),
        timestamp: now()
      });

      await itemEventRepository.insert(tx, {
        itemId: realItemId, firmId, eventType: 'PHANTOM_RECONCILED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: 'This stock entry reconciles a phantom bill',
        oldValue: JSON.stringify({ status: 'AVAILABLE' }),
        newValue: JSON.stringify({ status: 'SOLD', phantomStockId: phantomItemId }),
        timestamp: now()
      });

      await auditRepository.log(tx, {
        eventType: 'PHANTOM_RECONCILED', firmId, entityId: phantomItemId,
        deviceId: await getDeviceId(), payload: JSON.stringify({
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

    return db.transaction(async (tx) => {
      const design = await designRepository.getById(tx, input.designId);
      if (!design || design.firmId !== firmId) throw new Error('DESIGN_NOT_FOUND_OR_WRONG_FIRM');

      const category = await categoryRepository.getById(tx, input.categoryId);
      if (!category || category.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');

      const hsnCode = input.hsnCode;
      await hsnMasterRepository.findByCode(tx, firmId, hsnCode);

      if (input.grossWeightMg <= 0) throw new Error('ITEM_GROSS_WEIGHT_INVALID');
      if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error('ITEM_PURITY_PERCENT_INVALID');

      const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
      if (netWeightMg <= 0) throw new Error('ITEM_NET_WEIGHT_INVALID');

      const sku = await skuEngine.generateSKU(tx, design, firmId);
      const fineWeightMg = Math.round(netWeightMg * input.purityPercent / 100);

      // FIX: Database logic now exactly matches "Touch" Wholesale Math (Purity + Wastage)
      const wastagePercent = input.wastagePercent ?? 0;
      const totalTouchPercent = input.purityPercent + wastagePercent;
      const fineGoldChargedMg = wastagePercent > 0
        ? Math.round(netWeightMg * totalTouchPercent / 100)
        : null;

      const item = await itemRepository.insert(tx, {
        id: Crypto.randomUUID(), sku, barcode: sku,
        designId: input.designId, firmId, categoryId: input.categoryId,
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
        fyId: '',
        createdAt: now(), updatedAt: now(),
      });

      await itemEventRepository.insert(tx, {
        itemId: item.id, firmId,
        eventType: 'CREATED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: null,
        oldValue: null, newValue: null,
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_CREATED', firmId, entityId: item.id,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({
          sku, designId: item.designId, categoryId: item.categoryId,
          netWeightMg, fineWeightMg,
          wastagePercent, fineGoldChargedMg,
          purchaseRatePaise: item.purchaseRatePaise,
          purityPercent: item.purityPercent,
          makingChargePaise: item.makingChargePaise,
          stoneCostPaise: item.stoneCostPaise,
          location: item.location,
          metalSource: item.metalSource,
          hsnCode: item.hsnCode,
          huid: item.huid,
        }),
      });

      await designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });

      return item;
    });
  },

  // RESTORED: Original adjustWeight function (with Wholesale Touch math updated just in case it's used!)
  async adjustWeight(
    itemId: string, firmId: string,
    newGrossWeightMg: number, newStoneWeightMg: number, newBeadsWeightMg: number,
    reason: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (newGrossWeightMg <= 0) throw new Error('ITEM_GROSS_WEIGHT_INVALID');
    const newNetWeightMg = newGrossWeightMg - newStoneWeightMg - newBeadsWeightMg;
    if (newNetWeightMg <= 0) throw new Error('ITEM_NET_WEIGHT_INVALID');

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      if (item.status !== 'DRAFT') throw new Error('WEIGHT_EDIT_AFTER_DRAFT_FORBIDDEN');

      const oldGrossWeightMg = item.grossWeightMg;
      const newFineWeightMg = Math.round(newNetWeightMg * item.purityPercent / 100);

      // Math updated to match Touch Calculation
      const totalTouchPercent = item.purityPercent + (item.wastagePercent ?? 0);
      const newFineGoldChargedMg = (item.wastagePercent ?? 0) > 0
        ? Math.round(newNetWeightMg * totalTouchPercent / 100)
        : null;

      await itemRepository.update(tx, itemId, {
        grossWeightMg: newGrossWeightMg, stoneWeightMg: newStoneWeightMg,
        beadsWeightMg: newBeadsWeightMg, netWeightMg: newNetWeightMg,
        fineWeightMg: newFineWeightMg,
        fineGoldChargedMg: newFineGoldChargedMg,
        updatedAt: now(),
      });

      await itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'WEIGHT_ADJUSTED',
        severity: 'WARNING',
        performedBy: await getDeviceId(),
        reason: reason ?? null,
        oldValue: String(oldGrossWeightMg),
        newValue: String(newGrossWeightMg),
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'WEIGHT_ADJUSTED', firmId, entityId: itemId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ itemId, sku: item.sku, oldGrossWeightMg, newGrossWeightMg,
        newNetWeightMg, newFineWeightMg, newFineGoldChargedMg, reason }),
      });
    });
  },

  // RESTORED: Original updateItem function
  async updateItem(
    itemId: string,
    firmId: string,
    input: UpdateableItemDraftFields,
    reason?: string,
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    const EDITABLE: (keyof UpdateableItemDraftFields)[] = [
      'purityPercent', 'purityKarat', 'primaryStoneId',
      'location', 'makingChargePaise', 'stoneCostPaise', 'purchaseRatePaise',
    ];

    const presentFields = EDITABLE.filter(k => k in input);
    if (presentFields.length === 0) return;

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      if (item.status !== 'DRAFT') throw new Error('WEIGHT_EDIT_AFTER_DRAFT_FORBIDDEN');

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

      await itemRepository.update(tx, itemId, updateData);

      await itemEventRepository.insert(tx, {
        itemId, firmId,
        eventType: 'ITEM_EDITED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: reason ?? null,
        oldValue: JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.old]))),
        newValue: JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.new]))),
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_EDITED',
        firmId,
        entityId: itemId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({
          itemId,
          sku: item.sku,
          changes,
          reason: reason ?? null,
        }),
      });
    });
  },

  // NEW: Comprehensive Update Function for Edit Draft Screen (Includes all fields & Touch Math)
  async updateDraftDetails(
    itemId: string, 
    firmId: string, 
    input: any
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (input.grossWeightMg <= 0) throw new Error('ITEM_GROSS_WEIGHT_INVALID');
    
    const newNetWeightMg = input.grossWeightMg - (input.stoneWeightMg || 0) - (input.beadsWeightMg || 0);
    if (newNetWeightMg <= 0) throw new Error('ITEM_NET_WEIGHT_INVALID');

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');
      if (item.status !== 'DRAFT') throw new Error('EDIT_AFTER_DRAFT_FORBIDDEN');

      const newFineWeightMg = Math.round(newNetWeightMg * (input.purityPercent / 100));

      // FIX: Wholesale Touch Math matching DB
      const totalTouchPercent = input.purityPercent + (input.wastagePercent || 0);
      const newFineGoldChargedMg = (input.wastagePercent || 0) > 0
        ? Math.round(newNetWeightMg * totalTouchPercent / 100)
        : null;

      await itemRepository.update(tx, itemId, {
        grossWeightMg: input.grossWeightMg,
        stoneWeightMg: input.stoneWeightMg,
        beadsWeightMg: input.beadsWeightMg,
        netWeightMg: newNetWeightMg,
        fineWeightMg: newFineWeightMg,
        purityPercent: input.purityPercent,
        purityKarat: input.purityKarat,
        wastagePercent: input.wastagePercent,
        fineGoldChargedMg: newFineGoldChargedMg,
        purchaseRatePaise: input.purchaseRatePaise,
        makingChargePaise: input.makingChargePaise,
        stoneCostPaise: input.stoneCostPaise,
        location: input.location,
        huid: input.huid,
        updatedAt: now(),
      });

      await itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_EDITED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: input.reason ?? 'Draft details updated',
        oldValue: JSON.stringify({ grossWeightMg: item.grossWeightMg, netWeightMg: item.netWeightMg, purityPercent: item.purityPercent }),
        newValue: JSON.stringify({ grossWeightMg: input.grossWeightMg, netWeightMg: newNetWeightMg, purityPercent: input.purityPercent }),
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_EDITED', firmId, entityId: itemId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ itemId, sku: item.sku, updates: input, reason: input.reason }),
      });
    });
  },

  async createItemsBulk(inputs: CreateItemInput[], firmId: string): Promise<Item[]> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (inputs.length === 0) return [];
    if (inputs.length > 50) throw new Error('BULK_ITEM_MAX_EXCEEDED');

    return db.transaction(async (tx) => {
      const mmyy = format(new Date(), 'MMyy');
      const counterId = `${firmId}_${mmyy}`;
      const [existing] = await tx.select().from(sequenceCounters).where(eq(sequenceCounters.id, counterId)).limit(1);
      
      let nextSeq = existing ? existing.currentSeq : 0;
      let startSeq = nextSeq;

      const results: Item[] = [];
      for (const input of inputs) {
        const design = await designRepository.getById(tx, input.designId);
        if (!design || design.firmId !== firmId) throw new Error('DESIGN_NOT_FOUND_OR_WRONG_FIRM');
        const category = await categoryRepository.getById(tx, input.categoryId);
        if (!category || category.firmId !== firmId) throw new Error('CATEGORY_NOT_FOUND_OR_WRONG_FIRM');
        
        await hsnMasterRepository.findByCode(tx, firmId, input.hsnCode);
        
        if (input.grossWeightMg <= 0) throw new Error('ITEM_GROSS_WEIGHT_INVALID');
        if (input.purityPercent <= 0 || input.purityPercent > 100) throw new Error('ITEM_PURITY_PERCENT_INVALID');
        
        const netWeightMg = input.grossWeightMg - (input.stoneWeightMg ?? 0) - (input.beadsWeightMg ?? 0);
        if (netWeightMg <= 0) throw new Error('ITEM_NET_WEIGHT_INVALID');

        nextSeq++;
        const metalCode = design.metal === 'GOLD' ? 'G' : 'S';
        const desPrefix = skuEngine.generateDesignPrefix(design.name, design.metal);
        const sku = `${metalCode}${desPrefix}${mmyy}${String(nextSeq).padStart(4, '0')}`;
        
        const fineWeightMg = Math.round(netWeightMg * input.purityPercent / 100);
        
        // FIX: Bulk Database logic now exactly matches "Touch" Wholesale Math
        const wastagePercent = input.wastagePercent ?? 0;
        const totalTouchPercent = input.purityPercent + wastagePercent;
        const fineGoldChargedMg = wastagePercent > 0 
          ? Math.round(netWeightMg * totalTouchPercent / 100) 
          : null;

        const item = await itemRepository.insert(tx, {
          id: Crypto.randomUUID(), sku, barcode: sku, designId: input.designId, firmId, categoryId: input.categoryId,
          primaryStoneId: input.primaryStoneId ?? null,
          grossWeightMg: input.grossWeightMg, stoneWeightMg: input.stoneWeightMg ?? 0,
          beadsWeightMg: input.beadsWeightMg ?? 0, netWeightMg, fineWeightMg,
          purityPercent: input.purityPercent, purityKarat: input.purityKarat,
          wastagePercent, fineGoldChargedMg, purchaseRatePaise: input.purchaseRatePaise ?? null,
          makingChargePaise: input.makingChargePaise ?? null, stoneCostPaise: input.stoneCostPaise ?? null,
          location: input.location ?? null, invoiceId: null, phantomStockId: null, hsnCode: input.hsnCode,
          huid: input.huid ? input.huid.toUpperCase() : null,
          metalSource: input.metalSource ?? 'SUPPLIER_PURCHASE',
          barcodeReprintRequired: 0, status: 'DRAFT', metal: design.metal, fyId: '', createdAt: now(), updatedAt: now(),
        });

        await itemEventRepository.insert(tx, {
          itemId: item.id, firmId,
          eventType: 'CREATED',
          severity: 'INFO',
          performedBy: await getDeviceId(),
          reason: null, oldValue: null, newValue: null,
          timestamp: now(),
        });

        await auditRepository.log(tx, {
          eventType: 'ITEM_CREATED', firmId, entityId: item.id,
          deviceId: await getDeviceId(),
          payload: JSON.stringify({
            sku, designId: item.designId,
            categoryId: item.categoryId, netWeightMg, fineWeightMg,
            wastagePercent, fineGoldChargedMg, purchaseRatePaise: item.purchaseRatePaise,
            purityPercent: item.purityPercent, hsnCode: item.hsnCode,
            huid: item.huid, 
            metalSource: item.metalSource, bulkInsert: true
          }),
        });

        await designCategoryMapRepository.insert(tx, { designId: item.designId, categoryId: item.categoryId, firmId });
        results.push(item);
      }

      if (nextSeq > startSeq) {
        if (!existing) {
          await tx.insert(sequenceCounters).values({ id: counterId, firmId, month: mmyy, year: format(new Date(), 'yyyy'), currentSeq: nextSeq, lastUsedAt: now() });
        } else {
          await tx.update(sequenceCounters).set({ currentSeq: nextSeq, lastUsedAt: now() }).where(eq(sequenceCounters.id, counterId));
        }
      }

      return results;
    });
  },

  async discardDraftItem(itemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');
      if (item.status !== 'DRAFT') throw new Error('ITEM_NOT_DRAFT');

      await itemEventRepository.deleteByItemId(tx, itemId);
      await itemRepository.delete(tx, itemId);

      await auditRepository.log(tx, {
        eventType: 'DRAFT_ITEM_DISCARDED',
        firmId,
        entityId: itemId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ sku: item.sku, designId: item.designId }),
      });
    });
  },

  async updateItemStatus(
    itemId: string, firmId: string, newStatus: StockStatus, reason?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      const allowed = ALLOWED_TRANSITIONS[item.status as StockStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new Error(`INVALID_TRANSITION: ${item.status} -> ${newStatus}`);
      }

      const oldStatus = item.status;
      await itemRepository.updateStatus(tx, firmId, itemId, newStatus);

      await itemEventRepository.insert(tx, {
        itemId, firmId, eventType: 'ITEM_STATUS_CHANGED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: reason ?? null,
        oldValue: oldStatus,
        newValue: newStatus,
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'ITEM_STATUS_CHANGED', firmId, entityId: itemId,
        deviceId: await getDeviceId(), payload: JSON.stringify({ itemId, oldStatus, newStatus, sku: item.sku }),
      });
    });
  }
};