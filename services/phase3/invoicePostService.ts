// services/phase3/invoicePostService.ts — Phase 3 Invoice Post Service (v4.0, v5.8, v5.20, v5.21, v5.35, v5.47)
// STEP 9 — INVOICE POST SERVICE: Atomic 12-Step Transaction Execution

import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { resolveTransactionFyId } from '@/services/phase1/fyService';
import { generateInvoiceNumber } from '@/services/phase3/invoiceNumberService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { looseStockLotRepository } from '@/repositories/phase2/looseStockLotRepository';
import { sellFromLooseLot } from '@/services/phase2/itemService';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { paymentRepository } from '@/repositories/phase3/paymentRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { resolveFineWeightMg } from '@/utils/purity.constants';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import {
  buildInvoiceCalculationInput,
  previewInvoice,
  PreviewInvoiceOptions,
} from '@/services/phase3/invoicePreviewService';
import type {
  PostInvoiceInput,
  CreateOldMetalInSaleInput,
  SaleInvoiceWithItems,
} from '@/types/phase3/phase3.types';
import type { OldMetalLot } from '@/types/phase2/phase2.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

/**
 * Creates an in-sale old metal lot atomically linked to the sale invoice.
 * Validates metal is strictly 'GOLD' or 'SILVER' (FIX-OLDMETALINSALE-GUARD-1 v5.47).
 * Computes fineWeightMg & purityRoundingDeltaMg via resolveFineWeightMg().
 */
export function createOldMetalInSale(
  tx: any,
  input: CreateOldMetalInSaleInput
): OldMetalLot {
  if (input.metal !== 'GOLD' && input.metal !== 'SILVER') {
    throw new Error(ERR.OLD_METAL_TYPE_INVALID);
  }
  if (!input.grossWeightMg || input.grossWeightMg <= 0) {
    throw new Error(ERR.OLD_METAL_GROSS_WEIGHT_INVALID);
  }
  if (!input.purityPct || input.purityPct <= 0 || input.purityPct > 100) {
    throw new Error(ERR.OLD_METAL_PURITY_PERCENT_INVALID);
  }

  const { fineWeightMg, purityRoundingDeltaMg } = resolveFineWeightMg(
    input.grossWeightMg,
    input.purityPct,
    input.metal as 'GOLD' | 'SILVER'
  );

  const timestamp = now();
  const receivedDate = input.receivedDate || timestamp.split('T')[0];

  const lot = oldMetalLotRepository.insert(tx, {
    id: Crypto.randomUUID(),
    firmId: input.firmId!,
    receivedFrom: 'CUSTOMER',
    receivedDate,
    grossWeightMg: input.grossWeightMg,
    metal: input.metal as 'GOLD' | 'SILVER',
    purityPercent: input.purityPct,
    metalSource: 'CUSTOMER',
    notes: input.notes ?? null,
    status: 'RECEIVED',
    customerId: input.customerId ?? null,
    saleInvoiceId: input.saleInvoiceId ?? null,
    urdPurchaseId: null,
    fineWeightMg,
    purityRoundingDeltaMg,
    purchaseRatePaise: null,
    totalAmountPaise: input.valuePaise ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // FIX v4.4: createOldMetalInSale() MUST create a CREDIT ledger entry equal to old metal valuePaise
  if (input.valuePaise && input.valuePaise > 0 && input.customerId && input.firmId) {
    ledgerRepository.insert(tx, {
      firmId: input.firmId,
      fyId: input.fyId ?? null,
      partyId: input.customerId,
      partyType: 'CUSTOMER',
      type: 'CREDIT',
      amountPaise: input.valuePaise,
      linkedEntityType: 'INVOICE',
      linkedEntityId: input.saleInvoiceId ?? lot.id,
      description: `Old metal trade-in (${input.metal} ${input.grossWeightMg}mg)`,
      createdAt: timestamp,
    });
  }

  return lot;
}

export const invoicePostService = {
  /**
   * Posts a draft invoice with atomic all-or-nothing 12-step execution.
   */
  async postInvoice(input: PostInvoiceInput, customTx?: any): Promise<SaleInvoiceWithItems> {
    // 1. Dual guard (concurrency lease + safe mode)
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error(ERR.FIRM_ID_REQUIRED);
    }

    const draftInvoiceId = input.draftInvoiceId || input.invoiceId;
    if (!draftInvoiceId) {
      throw new Error(ERR.INVOICE_NOT_FOUND);
    }

    const deviceId = getSafeDeviceId();

    return executeTransaction(async (tx) => {
      // 2. Load draft — verify DRAFT and items
      const invoice = await invoiceRepository.getById(draftInvoiceId, tx);
      if (!invoice) {
        throw new Error(ERR.INVOICE_NOT_FOUND);
      }
      if (invoice.firmId !== input.firmId) {
        throw new Error(ERR.FIRM_INVOICE_MISMATCH);
      }
      if (invoice.status !== 'DRAFT') {
        throw new Error(ERR.INVOICE_NOT_DRAFT);
      }

      const items = await invoiceRepository.getItemsByInvoiceId(draftInvoiceId, tx);
      if (!items || items.length === 0) {
        throw new Error('INVOICE_HAS_NO_ITEMS');
      }

      // 3. Verify stock availability: AVAILABLE or PHANTOM_AVAILABLE
      for (const item of items) {
        if (item.lineType === 'LOOSE_LOT') {
          const looseLot = looseStockLotRepository.getById(tx, invoice.firmId, item.stockLotId);
          if (!looseLot || looseLot.firmId !== invoice.firmId || looseLot.status !== 'ACTIVE') {
            throw new Error(ERR.LOOSE_LOT_NOT_FOUND_OR_WRONG_FIRM);
          }
          if (!item.qtySold || item.qtySold <= 0 || item.qtySold > looseLot.pieceCount) {
            throw new Error(ERR.LOOSE_LOT_INSUFFICIENT_QUANTITY);
          }
          if (!item.weightSoldMg || item.weightSoldMg <= 0 || item.weightSoldMg > looseLot.totalWeightMg) {
            throw new Error(ERR.LOOSE_LOT_INSUFFICIENT_WEIGHT);
          }
        } else {
          // Standard / serialized stock item
          const lot =
            (await itemRepository.getById(tx, invoice.firmId, item.stockLotId)) ||
            (await itemRepository.getById(item.stockLotId, invoice.firmId));
          if (!lot || lot.firmId !== invoice.firmId) {
            throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);
          }
          if (lot.status === 'PHANTOM_SOLD') {
            throw new Error(ERR.PHANTOM_ITEM_ALREADY_SOLD);
          }
          if (lot.status !== 'AVAILABLE' && lot.status !== 'PHANTOM_AVAILABLE') {
            throw new Error(ERR.ITEM_ALREADY_SOLD);
          }
        }
      }

      // 4. calculateInvoice() -> final amounts (IDENTICAL call to previewInvoice)
      const firm = await firmRepository.findById(invoice.firmId);
      const calcInput = await buildInvoiceCalculationInput(invoice, items, firm, {
        oldMetal: input.oldMetal ? { valuePaise: input.oldMetal.valuePaise } : undefined,
      });
      const calculated = await accountingTruthService.calculateInvoice(calcInput);

      // 5. Resolve fyId and allocate sequential invoiceNumber
      // Confirms FY ACTIVE at POST time; throws ENTRY_DATE_IN_CLOSED_FY if closed
      const resolvedFyId = await resolveTransactionFyId(invoice.firmId, invoice.invoiceDate, tx);
      const invoiceNumber = await generateInvoiceNumber(tx, invoice.firmId, resolvedFyId, 'SALE');

      // 6. Update sale_invoices to POSTED with full financial snapshot
      const postedAt = now();
      await invoiceRepository.markPosted(
        invoice.id,
        {
          invoiceNumber,
          fyId: resolvedFyId,
          postedAt,
          taxableMetalAmtPaise: calculated.metalValuePaise,
          taxableMakingAmtPaise: calculated.makingChargesPaise,
          stoneAmtPaise: calculated.stoneAmtPaise,
          cgstPaise: calculated.cgstPaise,
          sgstPaise: calculated.sgstPaise,
          oldMetalDeductionPaise: calculated.oldMetalDeductionPaise,
          discountPaise: calculated.discountPaise,
          roundOffPaise: calculated.roundOffPaise,
          netPayablePaise: calculated.netPayablePaise,
        },
        tx
      );

      // Snapshot tax group IDs on each item line (FIX-V521-2)
      for (const itm of items) {
        await invoiceRepository.updateItemSnapshot(
          itm.id,
          {
            metalTaxGroupId: itm.metalTaxGroupId || calcInput.metalTaxGroupId || null,
            makingTaxGroupId: itm.makingTaxGroupId || calcInput.makingTaxGroupId || null,
          },
          tx
        );
      }

      // 7 & 8. Item status transition and event logging
      for (const itm of items) {
        if (itm.lineType === 'LOOSE_LOT') {
          sellFromLooseLot(
            tx,
            itm.stockLotId,
            invoice.firmId,
            itm.qtySold!,
            itm.weightSoldMg!,
            invoice.id,
            deviceId
          );
        } else {
          // Standard serialized item
          const lot =
            (await itemRepository.getById(tx, invoice.firmId, itm.stockLotId)) ||
            (await itemRepository.getById(itm.stockLotId, invoice.firmId));
          const currentStatus = lot?.status || 'AVAILABLE';
          const nextStatus = currentStatus === 'PHANTOM_AVAILABLE' ? 'PHANTOM_SOLD' : 'SOLD';

          itemRepository.updateStatus(tx, invoice.firmId, itm.stockLotId, nextStatus);

          // 8. Log StockLotEvent and Audit
          itemEventRepository.insert(tx, {
            id: Crypto.randomUUID(),
            itemId: itm.stockLotId,
            firmId: invoice.firmId,
            eventType: 'ITEM_STATUS_CHANGED',
            severity: 'INFO',
            performedBy: deviceId,
            reason: 'SALE',
            oldValue: currentStatus,
            newValue: nextStatus,
            timestamp: now(),
          });

          auditRepository.log(tx, {
            eventType: 'ITEM_STATUS_CHANGED',
            firmId: invoice.firmId,
            entityId: itm.stockLotId,
            deviceId,
            payload: {
              itemId: itm.stockLotId,
              oldStatus: currentStatus,
              newStatus: nextStatus,
              sku: itm.sku,
              invoiceNumber,
            },
          });
        }
      }

      // 9. If old metal: createOldMetalInSale
      if (input.oldMetal) {
        createOldMetalInSale(tx, {
          ...input.oldMetal,
          firmId: invoice.firmId,
          fyId: resolvedFyId,
          customerId: invoice.customerId,
          saleInvoiceId: invoice.id,
          receivedDate: invoice.invoiceDate,
        });
      }

      // 10. DEBIT ledger entry written to ledger_entries for customer receivable
      // When old metal trade-in is present, invoice debits total pre-trade-in amount;
      // createOldMetalInSale credits old metal trade-in amount (FIX v4.4).
      const oldMetalCreditPaise = input.oldMetal?.valuePaise ?? calculated.oldMetalDeductionPaise ?? 0;
      const invoiceDebitPaise = calculated.netPayablePaise + oldMetalCreditPaise;

      ledgerRepository.insert(tx, {
        firmId: invoice.firmId,
        fyId: resolvedFyId,
        partyId: invoice.customerId,
        partyType: 'CUSTOMER',
        type: 'DEBIT',
        amountPaise: invoiceDebitPaise,
        linkedEntityType: 'INVOICE',
        linkedEntityId: invoice.id,
        description: `Sale Invoice ${invoiceNumber}`,
        createdAt: now(),
      });

      // 10B. STEP 12: NEGATIVE PAYABLE — EXCESS SETTLEMENT (FIX-OLD-GOLD-UI-1 v5.15)
      // When netPayablePaise < 0, system MUST auto-create MoneyTransaction (payments) record
      let excessPaymentRecord: any = null;
      if (calculated.netPayablePaise < 0) {
        if (!input.excessSettlement || !input.excessSettlement.choice) {
          throw new Error(ERR.EXCESS_SETTLEMENT_CHOICE_REQUIRED);
        }

        const excessAmountPaise = Math.abs(calculated.netPayablePaise);
        const reason = calculated.excessType === 'DISCOUNT_EXCESS' ? 'DISCOUNT_EXCESS' : 'OLD_METAL_EXCESS';
        const isPayNow = input.excessSettlement.choice === 'PAY_NOW';
        const status = isPayNow ? 'PAID' : 'PENDING';
        const mode = isPayNow ? (input.excessSettlement.mode || 'CASH') : 'CASH';
        let bankAccountId: string | null = null;

        if (isPayNow) {
          if (mode === 'BANK' || mode === 'UPI') {
            if (!input.excessSettlement.bankAccountId) {
              throw new Error(ERR.BANK_ACCOUNT_REQUIRED);
            }
            bankAccountId = input.excessSettlement.bankAccountId;
          } else if (mode === 'CASH') {
            if (input.excessSettlement.bankAccountId) {
              throw new Error(ERR.BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH);
            }
          }
        }

        excessPaymentRecord = paymentRepository.insert(tx, {
          id: Crypto.randomUUID(),
          firmId: invoice.firmId,
          fyId: resolvedFyId,
          partyId: invoice.customerId,
          partyType: 'CUSTOMER',
          type: 'MONEY_OUT',
          amountPaise: excessAmountPaise,
          mode,
          bankAccountId,
          status,
          reason,
          linkedInvoiceId: invoice.id,
          notes: input.excessSettlement.notes ?? `Excess settlement (${reason}) for Invoice ${invoiceNumber}`,
          createdAt: postedAt,
        });

        // (●) Pay Now -> deduct from cash drawer or bank account -> MONEY_OUT.status -> PAID
        // and record matching DEBIT entry in customer ledger to net balance to 0
        if (isPayNow) {
          ledgerRepository.insert(tx, {
            firmId: invoice.firmId,
            fyId: resolvedFyId,
            partyId: invoice.customerId,
            partyType: 'CUSTOMER',
            type: 'DEBIT',
            amountPaise: excessAmountPaise,
            linkedEntityType: 'PAYMENT',
            linkedEntityId: excessPaymentRecord.id,
            description: `Excess payout (${reason}) for Invoice ${invoiceNumber}`,
            createdAt: postedAt,
          });
        }
        // (○) Pay Later -> MONEY_OUT.status stays 'PENDING' -> customer ledger retains credit balance (payable to customer)
      }

      // Invalidate MMKV cache immediately after ledger write
      accountingTruthService.invalidatePartyBalanceCache(invoice.firmId, invoice.customerId);

      // 11. Log audit event: INVOICE_POSTED
      auditRepository.log(tx, {
        eventType: 'INVOICE_POSTED',
        firmId: invoice.firmId,
        entityId: invoice.id,
        deviceId,
        payload: {
          invoiceId: invoice.id,
          invoiceNumber,
          customerId: invoice.customerId,
          netPayablePaise: calculated.netPayablePaise,
          itemCount: items.length,
          postedAt,
          ...(excessPaymentRecord
            ? {
                excessPaymentId: excessPaymentRecord.id,
                excessReason: excessPaymentRecord.reason,
                excessStatus: excessPaymentRecord.status,
                excessAmountPaise: excessPaymentRecord.amountPaise,
              }
            : {}),
        },
      });

      if (excessPaymentRecord) {
        auditRepository.log(tx, {
          eventType: 'PAYMENT_RECORDED',
          firmId: invoice.firmId,
          entityId: excessPaymentRecord.id,
          deviceId,
          payload: {
            paymentId: excessPaymentRecord.id,
            partyId: invoice.customerId,
            partyType: 'CUSTOMER',
            type: 'MONEY_OUT',
            amountPaise: excessPaymentRecord.amountPaise,
            mode: excessPaymentRecord.mode,
            status: excessPaymentRecord.status,
            reason: excessPaymentRecord.reason,
            linkedInvoiceId: invoice.id,
          },
        });
      }

      // 12. Return posted invoice with items
      const postedInvoice = await invoiceRepository.getWithItems(invoice.id, tx);
      return postedInvoice!;
    }, customTx);
  },
  previewInvoice,
};

export const postInvoice = invoicePostService.postInvoice.bind(invoicePostService);

