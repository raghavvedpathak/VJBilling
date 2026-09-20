// services/phase3/creditNoteService.ts — Phase 3 Credit Note & Return Governance Service
// Implements STEP 13 Specification (v5.1 / v5.4 GAP 6 / v5.14 / v5.18 / v5.20 / v5.25 / v4.5 / v4.6 / v4.8)
// RETURNED status governance, createCreditNote() atomic transaction spec,
// restoreItemFromSale() phantom-aware contract, approveReturnedItem().

import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { creditNoteRepository } from '@/repositories/phase3/creditNoteRepository';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { updateOldMetalLotStatus } from '@/services/phase2/oldGoldLotService';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { generateInvoiceNumber } from '@/services/phase3/invoiceNumberService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { sanitizeText } from '@/utils/sanitize';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import {
  CreditNote,
  CreateCreditNoteInput,
  RestoreItemFromSaleInput,
  ApproveReturnedItemInput,
  SaleInvoiceItem,
} from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}


type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Creates a Credit Note for an invoice reversal or partial return.
 * Executes the 12-step atomic transaction inside a single db.transaction().
 */
export async function createCreditNote(input: CreateCreditNoteInput): Promise<CreditNote> {
  // Step 1: Dual guard
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  if (!input.firmId) {
    throw new Error('FIRM_ID_REQUIRED');
  }
  if (!input.originalInvoiceId) {
    throw new Error('ORIGINAL_INVOICE_ID_REQUIRED');
  }

  // Step 5 sanitize check upfront: reason = sanitizeText(input.reason)
  // throw INVALID_TEXT_CONTENT if sanitizeText() rejects it (FIX-SANITIZE-1, v5.25)
  if (!input.reason || typeof input.reason !== 'string' || input.reason.trim().length === 0) {
    throw new Error(ERR.INVALID_TEXT_CONTENT);
  }
  const sanitizedReason = sanitizeText(input.reason);
  if (!sanitizedReason) {
    throw new Error(ERR.INVALID_TEXT_CONTENT);
  }

  const deviceId = getSafeDeviceId();
  const conn = getDb();

  return conn.transaction(async (tx: any) => {
    // Step 2: Load original invoice by originalInvoiceId — verify status === 'POSTED' and belongs to firmId
    const invoice = await invoiceRepository.getWithItems(input.originalInvoiceId, tx);
    if (!invoice || invoice.firmId !== input.firmId) {
      throw new Error(ERR.INVOICE_NOT_FOUND);
    }
    if (invoice.status !== 'POSTED') {
      throw new Error('INVOICE_NOT_POSTED: Only POSTED invoices can have credit notes issued');
    }

    // Step 3: Verify each returnedItemId belongs to the original invoice
    if (!input.returnedItemIds || !Array.isArray(input.returnedItemIds) || input.returnedItemIds.length === 0) {
      throw new Error('RETURNED_ITEMS_REQUIRED: At least one returned item must be specified');
    }

    const invoiceItems = invoice.items || [];
    const invoiceItemMap = new Map<string, SaleInvoiceItem>();
    for (const itm of invoiceItems) {
      invoiceItemMap.set(itm.id, itm);
    }

    const returnedItems: SaleInvoiceItem[] = [];
    for (const retId of input.returnedItemIds) {
      const itm = invoiceItemMap.get(retId);
      if (!itm) {
        throw new Error(`${ERR.CREDIT_NOTE_NOT_VALID}: Item ${retId} does not belong to invoice ${input.originalInvoiceId}`);
      }
      returnedItems.push(itm);
    }

    // Step 4: generateInvoiceNumber(tx, firmId, fyId, 'CN') → cnNumber
    const cnNumber = await generateInvoiceNumber(tx, input.firmId, invoice.fyId, 'CN');

    // Step 5: Insert credit_notes row.
    // FIX-V520-9 (v5.20) explicit computation rules:
    // isPartial = returnedItemIds.length < invoice.items.length ? 1 : 0
    // creditAmountPaise = sum(lineTotalPaise for returned items only)
    const isPartial = input.returnedItemIds.length < invoiceItems.length ? 1 : 0;
    const creditAmountPaise = returnedItems.reduce((sum, itm) => sum + (itm.lineTotalPaise || 0), 0);
    const nowIso = now();
    const cnDate = input.cnDate || nowIso;
    const creditNoteId = Crypto.randomUUID();

    // Step 9 & 10 remainingOldMetalCreditPaise rule
    let remainingOldMetalCreditPaise = 0;
    if (isPartial === 1) {
      // Step 10: PARTIAL CN: old metal CREDIT entry NOT reversed.
      remainingOldMetalCreditPaise = invoice.oldMetalDeductionPaise || 0;
    } else {
      // Step 9: FULL CN: remainingOldMetalCreditPaise = 0
      remainingOldMetalCreditPaise = 0;
    }

    creditNoteRepository.insert(tx, {
      id: creditNoteId,
      firmId: input.firmId,
      fyId: invoice.fyId,
      originalInvoiceId: invoice.id,
      cnNumber,
      cnDate,
      reason: sanitizedReason,
      returnedItemIds: JSON.stringify(input.returnedItemIds),
      creditAmountPaise,
      isPartial,
      remainingOldMetalCreditPaise,
      status: 'POSTED',
      createdAt: nowIso,
    });

    // Step 6: Update sale_invoice.status → 'VOID'
    await invoiceRepository.markVoid(invoice.id, tx);

    // Step 7: Insert CREDIT ledger entry for creditAmountPaise, linkedEntityType=CREDIT_NOTE
    ledgerRepository.insert(tx, {
      firmId: invoice.firmId,
      fyId: invoice.fyId,
      partyId: invoice.customerId,
      partyType: 'CUSTOMER',
      type: 'CREDIT',
      amountPaise: creditAmountPaise,
      linkedEntityType: 'CREDIT_NOTE',
      linkedEntityId: creditNoteId,
      description: `Credit Note ${cnNumber} (Reversal of ${invoice.invoiceNumber})`,
      createdAt: nowIso,
    });
    accountingTruthService.invalidatePartyBalanceCache(input.firmId, invoice.customerId);

    // Step 8: For each returned item (standard CN flow): stockLot.status → 'AVAILABLE' + StockLotEvent AVAILABLE
    for (const itm of returnedItems) {
      if (itm.stockLotId) {
        const lot =
          (await itemRepository.getById(tx, input.firmId, itm.stockLotId)) ||
          (await itemRepository.getById(itm.stockLotId, input.firmId));
        const currentStatus = lot?.status || 'SOLD';

        const nextStatus = currentStatus === 'PHANTOM_SOLD' ? 'PHANTOM_AVAILABLE' : 'AVAILABLE';
        itemRepository.updateStatus(tx, input.firmId, itm.stockLotId, nextStatus);

        itemEventRepository.insert(tx, {
          id: Crypto.randomUUID(),
          itemId: itm.stockLotId,
          firmId: input.firmId,
          eventType: 'ITEM_STATUS_CHANGED',
          severity: 'INFO',
          performedBy: deviceId,
          reason: 'CREDIT_NOTE',
          oldValue: currentStatus,
          newValue: nextStatus,
          timestamp: nowIso,
        });
      }
    }

    // Step 9: If FULL CN (isPartial=false) AND invoice had old metal:
    // insert DEBIT ledger entry for oldMetalPurchase.valuePaise.
    // Then: const lot = await oldMetalLotRepository.findBySaleInvoiceId(firmId, invoice.id);
    // if (lot) await updateOldMetalLotStatus(lot.id, firmId, 'VOIDED', 'Full credit note reversal')
    // If no lot is found, do not throw — treat as already-reconciled.
    // remainingOldMetalCreditPaise = 0
    if (isPartial === 0 && (invoice.oldMetalDeductionPaise > 0)) {
      const lot = await oldMetalLotRepository.findBySaleInvoiceId(input.firmId, invoice.id);
      const oldMetalValuePaise = invoice.oldMetalDeductionPaise || (lot ? lot.totalAmountPaise ?? 0 : 0);

      if (oldMetalValuePaise > 0) {
        ledgerRepository.insert(tx, {
          firmId: invoice.firmId,
          fyId: invoice.fyId,
          partyId: invoice.customerId,
          partyType: 'CUSTOMER',
          type: 'DEBIT',
          amountPaise: oldMetalValuePaise,
          linkedEntityType: 'CREDIT_NOTE',
          linkedEntityId: creditNoteId,
          description: `Old Metal Reversal on Credit Note ${cnNumber}`,
          createdAt: nowIso,
        });
        accountingTruthService.invalidatePartyBalanceCache(input.firmId, invoice.customerId);
      }

      if (lot) {
        await updateOldMetalLotStatus(lot.id, input.firmId, 'VOIDED', 'Full credit note reversal', tx);
      }
    }

    // Step 10: If PARTIAL CN (isPartial=true): old metal CREDIT entry NOT reversed.
    // remainingOldMetalCreditPaise = invoice.oldMetalDeductionPaise (handled in Step 5 insert).

    // Step 11: auditRepo.log: eventType = CREDIT_NOTE_CREATED, deviceId: getDeviceId(),
    // payload = { cnNumber, originalInvoiceId, isPartial, creditAmountPaise }
    auditRepository.log(tx, {
      eventType: 'CREDIT_NOTE_CREATED',
      firmId: input.firmId,
      entityId: creditNoteId,
      deviceId,
      payload: {
        cnNumber,
        originalInvoiceId: invoice.id,
        isPartial,
        creditAmountPaise,
      },
    });

    // Step 12: Return posted credit note
    const postedCn = await creditNoteRepository.getById(creditNoteId, tx);
    return postedCn!;
  });
}

/**
 * Restores a specific sold item as RETURNED for re-inspection, linked to a credit note.
 * FULL SERVICE CONTRACT (v4.8 FIX / FEAT-PHANTOM-INVENTORY-1 v1.67 / FIX-V520-5 v5.20)
 * Note: restoreItemFromSale is the ONLY function that may set item.status = 'RETURNED'.
 * For PHANTOM_SOLD items, transitions to 'PHANTOM_AVAILABLE' (never RETURNED).
 */
export async function restoreItemFromSale(input: RestoreItemFromSaleInput): Promise<void> {
  // Step 26: Dual guard
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const { stockLotId, creditNoteId, firmId } = input;
  if (!stockLotId || !creditNoteId || !firmId) {
    throw new Error('INVALID_INPUT: stockLotId, creditNoteId, and firmId are required');
  }

  const conn = getDb();
  const deviceId = getSafeDeviceId();

  return conn.transaction(async (tx: any) => {
    // Step 24: stockLot exists, belongs to firmId, and status === 'SOLD' or 'PHANTOM_SOLD'
    const stockLot =
      (await itemRepository.getById(tx, firmId, stockLotId)) ||
      (await itemRepository.getById(stockLotId, firmId));

    if (!stockLot || stockLot.firmId !== firmId) {
      throw new Error(ERR.ITEM_NOT_SOLD);
    }
    if (stockLot.status !== 'SOLD' && stockLot.status !== 'PHANTOM_SOLD') {
      throw new Error(ERR.ITEM_NOT_SOLD);
    }

    // Step 25: creditNote exists, belongs to firmId, and originalInvoiceId links to the invoice containing this stockLot
    const creditNote = await creditNoteRepository.getById(creditNoteId, tx);
    if (!creditNote || creditNote.firmId !== firmId) {
      throw new Error(ERR.CREDIT_NOTE_NOT_VALID);
    }

    const invoiceItems = await invoiceRepository.getItemsByInvoiceId(creditNote.originalInvoiceId, tx);
    const hasItem = invoiceItems.some((itm) => itm.stockLotId === stockLotId);
    if (!hasItem) {
      throw new Error(ERR.CREDIT_NOTE_NOT_VALID);
    }

    const nowIso = now();

    // Step 27: stockLot.status → phantom-aware:
    // If SOLD → 'RETURNED' (normal path)
    // If PHANTOM_SOLD → 'PHANTOM_AVAILABLE' (phantom returns to unreconciled debt state)
    if (stockLot.status === 'SOLD') {
      itemRepository.updateStatus(tx, firmId, stockLotId, 'RETURNED');
    } else if (stockLot.status === 'PHANTOM_SOLD') {
      itemRepository.updateStatus(tx, firmId, stockLotId, 'PHANTOM_AVAILABLE');

      // CRITICAL (FIX-V520-5 v5.20): if phantomStockId was already set (reconciled),
      // BOTH directions of the reconciliation link MUST be cleared:
      // (a) phantom.phantomStockId set to null
      // (b) realItem.phantomStockId set to null + realItem.status reset to AVAILABLE
      if (stockLot.phantomStockId) {
        const realItemId = stockLot.phantomStockId;

        // (a) Clear phantom side
        itemRepository.update(tx, firmId, stockLotId, {
          phantomStockId: null,
          updatedAt: nowIso,
        });

        // (b) Clear real item side and reset status to AVAILABLE
        const realItem =
          (await itemRepository.getById(tx, firmId, realItemId)) ||
          (await itemRepository.getById(realItemId, firmId));

        if (realItem) {
          itemRepository.updateStatus(tx, firmId, realItemId, 'AVAILABLE');
          itemRepository.update(tx, firmId, realItemId, {
            phantomStockId: null,
            updatedAt: nowIso,
          });
        }

        // Write PHANTOM_RECONCILE_BROKEN audit event
        auditRepository.log(tx, {
          eventType: 'PHANTOM_RECONCILE_BROKEN',
          firmId,
          entityId: stockLotId,
          deviceId,
          payload: {
            phantomItemId: stockLotId,
            realItemId,
            creditNoteId,
          },
        });
      }
    }

    // Step 28: StockLotEvent: { type: 'RETURNED', source: 'CREDIT_NOTE', linkedEntityId: creditNoteId }
    const nextStatus = stockLot.status === 'PHANTOM_SOLD' ? 'PHANTOM_AVAILABLE' : 'RETURNED';
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: stockLotId,
      firmId,
      eventType: 'ITEM_RETURNED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: `CREDIT_NOTE:${creditNoteId}`,
      oldValue: stockLot.status,
      newValue: nextStatus,
      timestamp: nowIso,
    });

    // Step 29: auditRepo.log: eventType = 'ITEM_RETURNED', deviceId: getDeviceId(), payload = { stockLotId, creditNoteId }
    auditRepository.log(tx, {
      eventType: 'ITEM_RETURNED',
      firmId,
      entityId: stockLotId,
      deviceId,
      payload: {
        stockLotId,
        creditNoteId,
      },
    });
  });
}

/**
 * Transitions a returned item from RETURNED to AVAILABLE after re-inspection.
 * Input: stockLotId, firmId
 * Validation: status === 'RETURNED' → throw ITEM_NOT_RETURNED if not.
 * Writes: stockLot.status → 'AVAILABLE' + StockLotEvent AVAILABLE + audit ITEM_RETURN_APPROVED.
 */
export async function approveReturnedItem(input: ApproveReturnedItemInput): Promise<void> {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const { stockLotId, firmId } = input;
  if (!stockLotId || !firmId) {
    throw new Error('INVALID_INPUT: stockLotId and firmId are required');
  }

  const conn = getDb();
  const deviceId = getSafeDeviceId();

  return conn.transaction(async (tx: any) => {
    const stockLot =
      (await itemRepository.getById(tx, firmId, stockLotId)) ||
      (await itemRepository.getById(stockLotId, firmId));

    if (!stockLot || stockLot.firmId !== firmId) {
      throw new Error(ERR.ITEM_NOT_RETURNED);
    }
    if (stockLot.status !== 'RETURNED') {
      throw new Error(ERR.ITEM_NOT_RETURNED);
    }

    const nowIso = now();

    // stockLot.status → 'AVAILABLE'
    itemRepository.updateStatus(tx, firmId, stockLotId, 'AVAILABLE');

    // StockLotEvent AVAILABLE
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId: stockLotId,
      firmId,
      eventType: 'ITEM_STATUS_CHANGED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: 'ITEM_RETURN_APPROVED',
      oldValue: 'RETURNED',
      newValue: 'AVAILABLE',
      timestamp: nowIso,
    });

    // audit ITEM_RETURN_APPROVED
    auditRepository.log(tx, {
      eventType: 'ITEM_RETURN_APPROVED',
      firmId,
      entityId: stockLotId,
      deviceId,
      payload: {
        stockLotId,
      },
    });
  });
}

/**
 * Gets a credit note by its ID.
 */
export async function getCreditNoteById(
  id: string,
  firmId?: string,
  customTx?: any
): Promise<CreditNote | null> {
  const note = await creditNoteRepository.getById(id, customTx);
  if (!note) return null;
  if (firmId && note.firmId !== firmId) return null;
  return note;
}

/**
 * Gets all credit notes issued against a specific original invoice.
 */
export async function getCreditNotesByInvoice(
  originalInvoiceId: string,
  firmId: string,
  customTx?: any
): Promise<CreditNote[]> {
  return creditNoteRepository.findByOriginalInvoiceId(firmId, originalInvoiceId, customTx);
}

/**
 * Lists all credit notes for a firm.
 */
export async function listCreditNotes(firmId: string, customTx?: any): Promise<CreditNote[]> {
  return creditNoteRepository.listByFirm(firmId, customTx);
}

export const creditNoteService = {
  createCreditNote,
  restoreItemFromSale,
  approveReturnedItem,
  getCreditNoteById,
  getCreditNotesByInvoice,
  listCreditNotes,
};
