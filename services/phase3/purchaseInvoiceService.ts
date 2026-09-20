// services/phase3/purchaseInvoiceService.ts — Phase 3 Purchase Invoice Engine
// Implements STEP 15 — PURCHASE INVOICE (v5.1, v5.4 GAP 1 & GAP 9, v5.8 GST compliance,
// v5.16 Tax Master, v5.21 FIX-V521-8 Option A, v5.22 FIX-V522-10, v5.26 FEAT-PURCHASE-AUTOSTOCK-1)

import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { resolveTransactionFyId } from '@/services/phase1/fyService';
import { generateInvoiceNumber } from '@/services/phase3/invoiceNumberService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { getGroupsWithTTL } from '@/store/phase3/taxGroupStore';
import { resolveFineWeightMg, computeFineGoldChargedMg } from '@/utils/purity.constants';
import { skuEngine } from '@/services/phase2/skuEngine';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}
import {
  purchaseInvoiceRepository,
  supplierRepository,
  ledgerRepository,
  auditRepository,
  designRepository,
  categoryRepository,
  itemRepository,
  itemEventRepository,
} from '@/repositories';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
  PostPurchaseInvoiceInput,
  PostPurchaseInvoiceResult,
} from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * STEP 15 — postPurchaseInvoice() Atomic Transaction
 * Legacy Step Numbering 30–39 per FIX-V522-10.
 * POSTED-only in Phase 3. Single atomic operation.
 */
export async function postPurchaseInvoice(
  input: PostPurchaseInvoiceInput
): Promise<PostPurchaseInvoiceResult> {
  // Step 30: Dual guard: await assertNoActiveLease() + assertNotInSafeMode()
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  // Validate taxableAmountPaise > 0 before entering transaction
  if (input.taxableAmountPaise === undefined || input.taxableAmountPaise === null || input.taxableAmountPaise <= 0) {
    throw new Error(ERR.TAXABLE_AMOUNT_ZERO);
  }

  // Validate items non-empty
  if (!input.items || input.items.length === 0) {
    throw new Error('Purchase invoice must contain at least one line item.');
  }

  const conn = getDb();
  const deviceId = input.deviceId || getSafeDeviceId();

  // Step 33: Compute cgstPaise and sgstPaise via calculateInvoice() using metalTaxGroupId and
  // makingTaxGroupId resolved from Tax Master (tax_groups). MUST NOT use hardcoded rates.
  const activeGroups = await getGroupsWithTTL(input.firmId);
  const metalGrp =
    (input.metalTaxGroupId
      ? activeGroups.find((g) => g.id === input.metalTaxGroupId && g.isActive === 1)
      : null) ||
    activeGroups.find((g) => g.groupName.includes('3%')) ||
    activeGroups[0];

  const makingGrp =
    (input.makingTaxGroupId
      ? activeGroups.find((g) => g.id === input.makingTaxGroupId && g.isActive === 1)
      : null) ||
    activeGroups.find((g) => g.groupName.includes('5%')) ||
    activeGroups[1] ||
    metalGrp;

  const calc = await accountingTruthService.calculateInvoice({
    firmId: input.firmId,
    metalValuePaise: input.taxableAmountPaise,
    makingChargesPaise: 0,
    stoneAmtPaise: 0,
    metalTaxGroupId: metalGrp?.id,
    makingTaxGroupId: makingGrp?.id,
  });

  const cgstPaise = input.cgstPaise !== undefined ? Math.round(input.cgstPaise) : calc.cgstPaise;
  const sgstPaise = input.sgstPaise !== undefined ? Math.round(input.sgstPaise) : calc.sgstPaise;

  // Step 34: Compute totalAmountPaise = taxableAmountPaise + cgstPaise + sgstPaise
  const totalAmountPaise = Math.round(input.taxableAmountPaise) + cgstPaise + sgstPaise;

  return conn.transaction(async (tx: any) => {
    // Step 31: Validate supplierId exists and belongs to firmId → throw SUPPLIER_NOT_FOUND (v5.4 GAP 9)
    const supplier = await supplierRepository.findById(input.firmId, input.supplierId, tx);
    if (!supplier || supplier.firmId !== input.firmId || supplier.isDeleted === 1) {
      throw new Error(ERR.SUPPLIER_NOT_FOUND);
    }

    // Step 35: Resolve fyId: fyId = await resolveTransactionFyId(firmId, input.supplierInvoiceDate)
    // Throws ENTRY_DATE_IN_CLOSED_FY if date in CLOSED FY. v5.8 FY-ROLLOVER-SAFETY.
    const fyId = resolveTransactionFyId(input.firmId, input.supplierInvoiceDate, tx);
    if (!fyId) {
      throw new Error(ERR.ENTRY_DATE_IN_CLOSED_FY);
    }

    // Generate sequential purchase invoice number: generateInvoiceNumber(tx, firmId, fyId, 'PURCHASE')
    const invoiceNumber = await generateInvoiceNumber(tx, input.firmId, fyId, 'PURCHASE');

    // Step 36: Insert purchase_invoices row with status = 'POSTED'
    const purchaseInvoice = purchaseInvoiceRepository.insert(tx, {
      firmId: input.firmId,
      fyId,
      supplierId: input.supplierId,
      supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate,
      invoiceNumber,
      status: 'POSTED',
      taxableAmountPaise: Math.round(input.taxableAmountPaise),
      cgstPaise,
      sgstPaise,
      totalAmountPaise,
      notes: input.notes ?? null,
    });

    const insertedLineItems: PurchaseInvoiceItem[] = [];
    const createdStockItemIds: string[] = [];

    // Step 36.5 (INSERT AFTER step 36): For each line item in input.items: insert purchase_invoice_items row
    for (const line of input.items) {
      const grossWeightMg = Math.round(line.grossWeightMg ?? 0);
      const purityPct = Number(line.purityPct ?? 0);
      const fineWeightMg =
        grossWeightMg > 0 && purityPct > 0 ? Math.round((grossWeightMg * purityPct) / 100) : 0;
      const ratePerGramPaise = Math.round(line.ratePerGramPaise ?? 0);
      const taxableAmountPaise = Math.round(line.taxableAmountPaise);

      // Resolve line GST (use explicit line cgst/sgst if provided, else compute from tax group bps)
      const lineCgstPaise =
        line.cgstPaise !== undefined
          ? Math.round(line.cgstPaise)
          : Math.round((taxableAmountPaise * (metalGrp?.cgstRate?.rateBps ?? 150)) / 10000);
      const lineSgstPaise =
        line.sgstPaise !== undefined
          ? Math.round(line.sgstPaise)
          : Math.round((taxableAmountPaise * (metalGrp?.sgstRate?.rateBps ?? 150)) / 10000);
      const lineTotalPaise = taxableAmountPaise + lineCgstPaise + lineSgstPaise;

      const insertedItem = purchaseInvoiceRepository.insertItem(tx, {
        invoiceId: purchaseInvoice.id,
        itemDescription: line.itemDescription,
        metalType: line.metalType ?? null,
        grossWeightMg,
        purityPct,
        fineWeightMg,
        ratePerGramPaise,
        taxableAmountPaise,
        cgstPaise: lineCgstPaise,
        sgstPaise: lineSgstPaise,
        lineTotalPaise,
        hsnCode: line.hsnCode ?? null,
        createdItemId: null,
      });

      // Step 36.6 — FEAT-PURCHASE-AUTOSTOCK-1 (v5.26):
      // For each line item where BOTH designId AND categoryId are present (a "stock line"):
      // auto-create the Phase 2 item atomically.
      const hasDesign = Boolean(line.designId && line.designId.trim().length > 0);
      const hasCategory = Boolean(line.categoryId && line.categoryId.trim().length > 0);

      if ((hasDesign && !hasCategory) || (!hasDesign && hasCategory)) {
        throw new Error(ERR.PURCHASE_STOCK_LINE_INCOMPLETE);
      }

      if (hasDesign && hasCategory) {
        // (a) Validate design exists and belongs to firmId → DESIGN_NOT_FOUND_OR_WRONG_FIRM
        const design = designRepository.getById(tx, line.designId!, input.firmId);
        if (!design || design.firmId !== input.firmId) {
          throw new Error(ERR.DESIGN_NOT_FOUND_OR_WRONG_FIRM);
        }

        // (b) Validate category exists and belongs to firmId → CATEGORY_NOT_FOUND_OR_WRONG_FIRM
        const category = categoryRepository.getById(tx, line.categoryId!, input.firmId);
        if (!category || category.firmId !== input.firmId) {
          throw new Error(ERR.CATEGORY_NOT_FOUND_OR_WRONG_FIRM);
        }

        // (c) Validate grossWeightMg > 0, purityPct > 0 and <= 100
        if (grossWeightMg <= 0) {
          throw new Error(ERR.ITEM_GROSS_WEIGHT_INVALID);
        }
        if (purityPct <= 0 || purityPct > 100) {
          throw new Error(ERR.ITEM_PURITY_PERCENT_INVALID);
        }

        // (d) netWeightMg = grossWeightMg − (stoneWeightMg ?? 0) − (beadsWeightMg ?? 0); throw ITEM_NET_WEIGHT_INVALID if <= 0
        const stoneWeightMg = Math.round(line.stoneWeightMg ?? 0);
        const beadsWeightMg = Math.round(line.beadsWeightMg ?? 0);
        const netWeightMg = grossWeightMg - stoneWeightMg - beadsWeightMg;
        if (netWeightMg <= 0) {
          throw new Error(ERR.ITEM_NET_WEIGHT_INVALID);
        }

        // (e) { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(netWeightMg, purityPct, design.metal)
        const { fineWeightMg: itemFineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(
          netWeightMg,
          purityPct,
          design.metal
        );

        // (f) fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purityPct, wastagePercent ?? 0)
        const wastagePercent = Number(line.wastagePercent ?? 0);
        const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purityPct, wastagePercent);

        // (g) sku = skuEngine.generateSKU(tx, design, firmId)
        const entryDateOnly = input.supplierInvoiceDate.split('T')[0];
        const sku = skuEngine.generateSKU(tx, design, input.firmId, entryDateOnly);

        // (h) metalSource = 'SUPPLIER_PURCHASE'
        const metalSource = 'SUPPLIER_PURCHASE';

        // (i) HUID format + duplicate check if provided
        const cleanHuid =
          line.huid && line.huid.trim().length > 0 ? line.huid.trim().toUpperCase() : null;
        if (cleanHuid != null) {
          if (!/^[A-Z0-9]{6}$/.test(cleanHuid)) {
            throw new Error(ERR.HUID_INVALID);
          }
          const dup = itemRepository.findByHUID(tx, cleanHuid);
          if (dup) {
            throw new Error(ERR.HUID_ALREADY_EXISTS);
          }
        }

        const effectiveHsn = line.hsnCode || design.defaultHsn || '7113';

        // Insert Phase 2 Item with status: 'DRAFT'
        const createdItem = itemRepository.insert(tx, {
          id: Crypto.randomUUID(),
          sku,
          barcode: sku,
          designId: line.designId!,
          firmId: input.firmId,
          categoryId: line.categoryId!,
          primaryStoneId: line.primaryStoneId ?? null,
          grossWeightMg,
          stoneWeightMg,
          beadsWeightMg,
          netWeightMg,
          fineWeightMg: itemFineWeightMg,
          purityRoundingDeltaMg,
          purityPercent: purityPct,
          purityKarat:
            line.purityKarat ??
            (purityPct ? Math.round((purityPct / 100) * 24 * 10) / 10 : 22),
          wastagePercent,
          fineGoldChargedMg,
          purchaseRatePaise: line.ratePerGramPaise ? Math.round(line.ratePerGramPaise) : null,
          makingChargePaise: null,
          stoneCostPaise: null,
          location: line.location ?? null,
          saleInvoiceId: null,
          purchaseInvoiceId: purchaseInvoice.id,
          phantomStockId: null,
          hsnCode: effectiveHsn,
          huid: cleanHuid,
          metalSource,
          barcodeReprintRequired: 0,
          status: 'DRAFT',
          metal: design.metal,
          sizeValue: null,
          sizeUnit: null,
          entryDate: (line as any).entryDate || input.supplierInvoiceDate || now().split('T')[0],
          createdAt: now(),
          updatedAt: now(),
        } as any);

        // (j) itemEventRepository.insert(tx, { eventType: 'CREATED', ... })
        itemEventRepository.insert(tx, {
          id: Crypto.randomUUID(),
          itemId: createdItem.id,
          firmId: input.firmId,
          eventType: 'CREATED',
          severity: 'INFO',
          performedBy: deviceId,
          reason: `Purchased via Invoice ${invoiceNumber}`,
          oldValue: null,
          newValue: null,
          timestamp: now(),
        });

        // (k) Update the purchase_invoice_items row from STEP 36.5 for this line: createdItemId = newly created item's id
        purchaseInvoiceRepository.updateItemCreatedItemId(tx, insertedItem.id, createdItem.id);
        insertedItem.createdItemId = createdItem.id;

        createdStockItemIds.push(createdItem.id);
      }

      insertedLineItems.push(insertedItem);
    }

    // Step 37: Insert CREDIT ledger entry for supplier:
    // partyType=SUPPLIER, type=CREDIT, amountPaise=totalAmountPaise, linkedEntityType=INVOICE
    ledgerRepository.insert(tx, {
      firmId: input.firmId,
      fyId,
      partyId: input.supplierId,
      partyType: 'SUPPLIER',
      type: 'CREDIT',
      amountPaise: totalAmountPaise,
      linkedEntityType: 'INVOICE',
      linkedEntityId: purchaseInvoice.id,
      description: `Purchase Invoice ${invoiceNumber}`,
      notes: input.notes ?? null,
      createdAt: now(),
    });

    // Step 38: auditRepo.log: eventType = PURCHASE_INVOICE_POSTED, deviceId: getDeviceId() (v5.4 GAP 1 FIX)
    auditRepository.log(tx, {
      eventType: 'PURCHASE_INVOICE_POSTED',
      firmId: input.firmId,
      entityId: purchaseInvoice.id,
      deviceId,
      payload: {
        invoiceNumber,
        supplierId: input.supplierId,
        totalAmountPaise,
        itemCount: input.items.length,
        autoCreatedItemCount: createdStockItemIds.length,
      },
    });

    // Invalidate MMKV balance cache for this supplier
    accountingTruthService.invalidateCache(input.firmId, 'SUPPLIER', input.supplierId);

    // Step 39: Return posted purchase invoice, line items, and created stock item IDs
    return {
      invoice: purchaseInvoice,
      items: insertedLineItems,
      createdStockItemIds,
    };
  });
}

/**
 * Fetches a purchase invoice with its line items.
 */
export async function getPurchaseInvoiceById(
  id: string
): Promise<{ invoice: PurchaseInvoice; items: PurchaseInvoiceItem[] } | null> {
  const invoice = await purchaseInvoiceRepository.getById(id);
  if (!invoice) return null;
  const items = await purchaseInvoiceRepository.getItemsByInvoiceId(id);
  return { invoice, items };
}

/**
 * Lists purchase invoices for a firm, optionally filtered by supplier.
 */
export async function listPurchaseInvoices(
  firmId: string,
  supplierId?: string
): Promise<PurchaseInvoice[]> {
  if (supplierId) {
    return purchaseInvoiceRepository.listBySupplier(firmId, supplierId);
  }
  return purchaseInvoiceRepository.listByFirm(firmId);
}

/**
 * Fetches line items for a purchase invoice.
 */
export async function getPurchaseInvoiceItems(
  invoiceId: string
): Promise<PurchaseInvoiceItem[]> {
  return purchaseInvoiceRepository.getItemsByInvoiceId(invoiceId);
}

export const purchaseInvoiceService = {
  postPurchaseInvoice,
  getPurchaseInvoiceById,
  listPurchaseInvoices,
  getPurchaseInvoiceItems,
};
