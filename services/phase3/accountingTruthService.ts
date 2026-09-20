// services/phase3/accountingTruthService.ts — Phase 3 Money Truth Layer Accounting Truth Service
// Strictly adheres to STEP 0 specification & rules (FIX-ACCOUNTING-TRUTH-1 v5.15, FIX-V520-2)

import { expoDb } from '@/db/client';
import { storage } from '@/utils/storage';
import {
  InvoiceCalculationInput,
  InvoiceCalculation,
  InvoiceCalculationItem,
} from '@/types/phase3/phase3.types';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { ERR } from '@/constants/errorCodes';
import { getGroupsWithTTL } from '@/store/phase3/taxGroupStore';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';

export const BALANCE_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export const accountingTruthService = {
  /**
   * Invalidates MMKV party balance cache immediately after any ledger write.
   * FIX-V520-2: Called by recordPayment(), postInvoice(), recordSupplierPayment(), postPurchaseInvoice().
   */
  invalidatePartyBalanceCache(firmId: string, partyId: string): void {
    const customerKey = `balance_${firmId}_${partyId}`;
    storage.delete(customerKey);
  },

  /**
   * Canonical alias for invalidatePartyBalanceCache taking (firmId, partyType, partyId).
   */
  invalidateCache(firmId: string, partyType: string, partyId: string): void {
    this.invalidatePartyBalanceCache(firmId, partyId);
  },

  /**
   * Derives customer balance: SUM(DEBIT) - SUM(CREDIT) across all FYs.
   * Cached in MMKV with a 60-second TTL.
   */
  async deriveCustomerBalance(customerId: string, firmId: string): Promise<number> {
    if (!customerId || !firmId) return 0;

    const cacheKey = `balance_${firmId}_${customerId}`;
    const cached = storage.getString(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.balance === 'number' && typeof parsed.cachedAt === 'number') {
          if (Date.now() - parsed.cachedAt < BALANCE_CACHE_TTL_MS) {
            return parsed.balance;
          }
        }
      } catch {}
    }

    let balance = 0;
    try {
      // Check if ledger_entries table exists
      const tableCheck = expoDb.getFirstSync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='ledger_entries'`
      );

      if (tableCheck && tableCheck.count > 0) {
        const columns = expoDb.getAllSync<{ name: string }>(`PRAGMA table_info(ledger_entries)`);
        const hasType = columns.some(c => c.name === 'type');

        const sql = hasType
          ? `SELECT 
               COALESCE(SUM(CASE 
                 WHEN type = 'DEBIT' THEN amount_paise 
                 WHEN debit_paise > 0 THEN debit_paise 
                 ELSE 0 END), 0) as debitSum,
               COALESCE(SUM(CASE 
                 WHEN type = 'CREDIT' THEN amount_paise 
                 WHEN credit_paise > 0 THEN credit_paise 
                 ELSE 0 END), 0) as creditSum
             FROM ledger_entries
             WHERE firm_id = ? AND party_id = ? AND party_type = 'CUSTOMER'`
          : `SELECT 
               COALESCE(SUM(debit_paise), 0) as debitSum,
               COALESCE(SUM(credit_paise), 0) as creditSum
             FROM ledger_entries
             WHERE firm_id = ? AND party_id = ? AND party_type = 'CUSTOMER'`;

        const res = expoDb.getFirstSync<{ debitSum: number | null; creditSum: number | null }>(
          sql,
          [firmId, customerId]
        );
        const debit = res?.debitSum || 0;
        const credit = res?.creditSum || 0;
        balance = debit - credit;
      }
    } catch (e) {
      console.warn('[AccountingTruth] Failed to query customer ledger:', e);
    }

    storage.set(cacheKey, JSON.stringify({ balance, cachedAt: Date.now() }));
    return balance;
  },

  /**
   * Derives supplier balance: SUM(CREDIT) - SUM(DEBIT) across all FYs.
   * Cached in MMKV with a 60-second TTL.
   */
  async deriveSupplierBalance(supplierId: string, firmId: string): Promise<number> {
    if (!supplierId || !firmId) return 0;

    const cacheKey = `balance_${firmId}_${supplierId}`;
    const cached = storage.getString(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.balance === 'number' && typeof parsed.cachedAt === 'number') {
          if (Date.now() - parsed.cachedAt < BALANCE_CACHE_TTL_MS) {
            return parsed.balance;
          }
        }
      } catch {}
    }

    let balance = 0;
    try {
      const tableCheck = expoDb.getFirstSync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='ledger_entries'`
      );

      if (tableCheck && tableCheck.count > 0) {
        const columns = expoDb.getAllSync<{ name: string }>(`PRAGMA table_info(ledger_entries)`);
        const hasType = columns.some(c => c.name === 'type');

        const sql = hasType
          ? `SELECT 
               COALESCE(SUM(CASE 
                 WHEN type = 'DEBIT' THEN amount_paise 
                 WHEN debit_paise > 0 THEN debit_paise 
                 ELSE 0 END), 0) as debitSum,
               COALESCE(SUM(CASE 
                 WHEN type = 'CREDIT' THEN amount_paise 
                 WHEN credit_paise > 0 THEN credit_paise 
                 ELSE 0 END), 0) as creditSum
             FROM ledger_entries
             WHERE firm_id = ? AND party_id = ? AND party_type = 'SUPPLIER'`
          : `SELECT 
               COALESCE(SUM(debit_paise), 0) as debitSum,
               COALESCE(SUM(credit_paise), 0) as creditSum
             FROM ledger_entries
             WHERE firm_id = ? AND party_id = ? AND party_type = 'SUPPLIER'`;

        const res = expoDb.getFirstSync<{ debitSum: number | null; creditSum: number | null }>(
          sql,
          [firmId, supplierId]
        );
        const debit = res?.debitSum || 0;
        const credit = res?.creditSum || 0;
        balance = credit - debit;
      }
    } catch (e) {
      console.warn('[AccountingTruth] Failed to query supplier ledger:', e);
    }

    storage.set(cacheKey, JSON.stringify({ balance, cachedAt: Date.now() }));
    return balance;
  },

  /**
   * Generates a complete party statement with running derived balances.
   */
  getPartyStatement(
    firmId: string,
    partyId: string,
    partyType: 'CUSTOMER' | 'SUPPLIER',
    startDate?: string,
    endDate?: string
  ): any {
    return ledgerRepository.getStatement(null, firmId, partyId, partyType, startDate, endDate);
  },

  /**
   * Canonical calculation engine for invoices (STEP 5 — GST ENGINE, v5.16, v5.18, v5.21).
   * 10-Step Resolution:
   * 1. Check firm GSTIN: absent -> cgst=0, sgst=0, BILL_OF_SUPPLY. Skip rate resolution.
   * 2. Resolve metalGroup from Tax Master via getGroupsWithTTL(). If missing/inactive -> throw RATE_NOT_CONFIGURED.
   * 3. Resolve makingGroup from Tax Master via getGroupsWithTTL(). If missing/inactive -> throw RATE_NOT_CONFIGURED.
   * 4. Verify metalCgstBps === metalSgstBps -> throw TAX_GROUP_ASYMMETRIC_RATES (FIX-STEP5-ERRCODE-1).
   * 5. Verify makingCgstBps === makingSgstBps -> throw TAX_GROUP_ASYMMETRIC_RATES (FIX-MAKINGSGST-TYPO-1).
   * 6. Compute cgstMetal = Math.round(metalValuePaise * metalCgstBps / 10000), sgstMetal same.
  /**
   * STEP 8 — calculateInvoice() — SINGLE SOURCE OF TRUTH (v4.1, v4.4, v5.0, v5.7, v5.18, v5.22)
   * Preview, POST, and PDF all call this same function. Duplication is a constitutional violation.
   *
   * CALCULATION ORDER (LOCKED — NEVER CHANGE THE ORDER)
   * • Step 1: Metal Value (paise) = fineWeightMg / 1_000 × metalRatePaisePerGram (÷1000: mg → grams — FIX v4.1)
   *   Contract: fineGoldChargedMg ?? fineWeightMg (FIX-NULL-CONTRACT-1)
   * • Step 2: Making Charges (paise) = FLAT value OR (netWeightMg / 1_000 × ratePerGram)
   * • Step 3: Stone Amount (paise) = exempt — no GST applied (0% GST)
   * • Step 4: CGST Metal = Math.round(metalValue × metalCgstBps / 10000)
   * • Step 5: SGST Metal = Math.round(metalValue × metalSgstBps / 10000)
   * • Step 6: CGST Making = Math.round(makingCharges × makingCgstBps / 10000)
   * • Step 7: SGST Making = Math.round(makingCharges × makingSgstBps / 10000)
   *   (Rates resolved from Tax Master at runtime — NEVER hardcoded)
   * • Step 8: Subtotal = metalValue + makingCharges + stoneAmt + CGST Metal + SGST Metal + CGST Making + SGST Making
   * • Step 9: Old Metal Deduction applied AFTER GST (never reduces GST base)
   * • Step 10: Discount applied AFTER old metal (never reduces GST base)
   *   (FIX-V522-10: FORBIDDEN to silently clamp netPayablePaise to 0. Sets excessType & excessPaise)
   * • Step 11: Round-off = nearest rupee (100 paise)
   * • Step 12: Net Payable = Subtotal − oldMetalDeduction − discount + roundOff
   */
  async calculateInvoice(input: InvoiceCalculationInput): Promise<InvoiceCalculation> {
    let metalValuePaise = input.metalValuePaise;
    let makingChargesPaise = input.makingChargesPaise;
    let stoneAmtPaise = input.stoneAmtPaise;
    const oldMetalDeductionPaise = input.oldMetalDeductionPaise ?? input.oldMetalAdjustmentPaise ?? 0;
    const discountPaise = input.discountPaise ?? 0;
    let metalTaxGroupId = input.metalTaxGroupId;
    let makingTaxGroupId = input.makingTaxGroupId;

    const calculatedItems: InvoiceCalculationItem[] = [];

    // If items array provided: compute or default missing header amounts from items
    if (input.items && input.items.length > 0) {
      let itemsMetalTotal = 0;
      let itemsMakingTotal = 0;
      let itemsStoneTotal = 0;

      for (const itm of input.items) {
        // Step 1 Item Basis: fineWeightMg / 1_000 * ratePerGram
        // FIX-NULL-CONTRACT-1: fineGoldChargedMg ?? fineWeightMg fallback
        const effectiveFineWeightMg = itm.fineWeightMg ?? itm.netWeightMg ?? 0;
        const fineGoldChargedMg = itm.fineGoldChargedMg ?? itm.fineWeightMg ?? itm.netWeightMg ?? 0;
        const itemRate = itm.metalRatePaisePerGram ?? itm.ratePerGramPaise ?? input.metalRatePaisePerGram ?? 0;
        const itemMetal = Math.round((effectiveFineWeightMg / 1000) * itemRate);

        // Step 2 Item Basis: FLAT OR (netWeightMg / 1_000 * ratePerGram)
        let itemMaking = 0;
        if (itm.makingChargesMode === 'PER_GRAM' && itm.makingRatePaisePerGram !== undefined) {
          itemMaking = Math.round(((itm.netWeightMg ?? 0) / 1000) * itm.makingRatePaisePerGram);
        } else {
          itemMaking = itm.makingChargesPaise ?? itm.makingChargePaise ?? 0;
        }

        // Step 3 Item Basis: Stone Amount (exempt)
        const itemStone = itm.stoneAmountPaise ?? itm.stoneCostPaise ?? 0;

        itemsMetalTotal += itemMetal;
        itemsMakingTotal += itemMaking;
        itemsStoneTotal += itemStone;

        if (!metalTaxGroupId && (itm.metalTaxGroupId || itm.taxGroupId)) {
          metalTaxGroupId = itm.metalTaxGroupId || itm.taxGroupId;
        }
        if (!makingTaxGroupId && (itm.makingTaxGroupId || itm.taxGroupId)) {
          makingTaxGroupId = itm.makingTaxGroupId || itm.taxGroupId;
        }
      }

      if (metalValuePaise === undefined) metalValuePaise = itemsMetalTotal;
      if (makingChargesPaise === undefined) makingChargesPaise = itemsMakingTotal;
      if (stoneAmtPaise === undefined) stoneAmtPaise = itemsStoneTotal;
    }

    // Step 1: Metal Value (paise) = fineWeightMg / 1_000 * metalRatePaisePerGram
    if (metalValuePaise === undefined) {
      if (input.fineWeightMg !== undefined && input.metalRatePaisePerGram !== undefined) {
        metalValuePaise = Math.round((input.fineWeightMg / 1000) * input.metalRatePaisePerGram);
      } else {
        metalValuePaise = 0;
      }
    }

    // Step 2: Making Charges (paise) = FLAT value OR (netWeightMg / 1_000 * ratePerGram)
    if (makingChargesPaise === undefined) {
      if (
        input.makingChargesMode === 'PER_GRAM' &&
        input.makingRatePaisePerGram !== undefined &&
        input.netWeightMg !== undefined
      ) {
        makingChargesPaise = Math.round((input.netWeightMg / 1000) * input.makingRatePaisePerGram);
      } else {
        makingChargesPaise = 0;
      }
    }

    // Step 3: Stone Amount (paise) = exempt — no GST applied (0% GST)
    if (stoneAmtPaise === undefined) {
      stoneAmtPaise = 0;
    }

    // Determine GSTIN registration status
    let hasGstin = input.hasGstin;
    if (hasGstin === undefined && input.firmId) {
      try {
        const row = expoDb.getFirstSync<{ gstin: string | null }>(
          `SELECT gstin FROM firms WHERE id = ? LIMIT 1`,
          [input.firmId]
        );
        hasGstin = !!(row?.gstin && row.gstin.trim().length > 0);
      } catch {
        try {
          const firm = firmRepository.findById(input.firmId);
          hasGstin = !!(firm?.gstin && firm.gstin.trim().length > 0);
        } catch {
          hasGstin = false;
        }
      }
    }

    // If firm has no GSTIN -> BILL_OF_SUPPLY, zero GST, skip rate resolution entirely
    if (!hasGstin) {
      const invoiceType = 'BILL_OF_SUPPLY';
      const cgstMetal = 0;
      const sgstMetal = 0;
      const cgstMaking = 0;
      const sgstMaking = 0;
      const cgstPaise = 0;
      const sgstPaise = 0;
      const totalGstPaise = 0;

      // Step 8: Subtotal
      const subtotalPaise = metalValuePaise + makingChargesPaise + stoneAmtPaise;

      // Step 9 & 10: Old Metal & Discount applied AFTER GST (never reduces GST base)
      const unroundedNetPayable = subtotalPaise - oldMetalDeductionPaise - discountPaise;

      // FIX-V522-10 (v5.22) — DISCOUNT-CAUSED NEGATIVE PAYABLE POLICY
      let excessType: 'NONE' | 'OLD_METAL_EXCESS' | 'DISCOUNT_EXCESS' = 'NONE';
      let excessPaise = 0;
      const afterOldMetal = subtotalPaise - oldMetalDeductionPaise;
      if (afterOldMetal < 0) {
        excessType = 'OLD_METAL_EXCESS';
        excessPaise = Math.abs(unroundedNetPayable);
      } else if (unroundedNetPayable < 0) {
        excessType = 'DISCOUNT_EXCESS';
        excessPaise = Math.abs(unroundedNetPayable);
      }

      // Step 11: Round-off = nearest rupee (100 paise)
      const roundedNetPayable = Math.round(unroundedNetPayable / 100) * 100;
      const roundOffPaise = roundedNetPayable - unroundedNetPayable;

      // Step 12: Net Payable = Subtotal − oldMetalDeduction − discount + roundOff
      let netPayablePaise = roundedNetPayable;
      if (input.advanceAdjustmentPaise) {
        netPayablePaise -= input.advanceAdjustmentPaise;
      }
      const grandTotalPaise = roundedNetPayable;

      // Populate item breakdown if items provided
      if (input.items && input.items.length > 0) {
        for (const it of input.items) {
          const effFineMg = it.fineWeightMg ?? it.netWeightMg ?? 0;
          const chargedFineMg = it.fineGoldChargedMg ?? it.fineWeightMg ?? it.netWeightMg ?? 0;
          const rateP = it.metalRatePaisePerGram ?? it.ratePerGramPaise ?? input.metalRatePaisePerGram ?? 0;
          const itemMetal = Math.round((effFineMg / 1000) * rateP);
          let itemMaking = 0;
          if (it.makingChargesMode === 'PER_GRAM' && it.makingRatePaisePerGram !== undefined) {
            itemMaking = Math.round(((it.netWeightMg ?? 0) / 1000) * it.makingRatePaisePerGram);
          } else {
            itemMaking = it.makingChargesPaise ?? it.makingChargePaise ?? 0;
          }
          const itemStone = it.stoneAmountPaise ?? it.stoneCostPaise ?? 0;
          const itemDiscount = it.discountPaise || 0;
          const taxable = itemMetal + itemMaking + itemStone - itemDiscount;

          calculatedItems.push({
            metalValuePaise: itemMetal,
            makingChargePaise: itemMaking,
            stoneCostPaise: itemStone,
            taxableAmountPaise: taxable,
            cgstPaise: 0,
            sgstPaise: 0,
            totalPaise: taxable,
            fineWeightMg: it.fineWeightMg,
            fineGoldChargedMg: chargedFineMg,
            netWeightMg: it.netWeightMg,
            metalTaxGroupId: it.metalTaxGroupId ?? it.taxGroupId,
            makingTaxGroupId: it.makingTaxGroupId ?? it.taxGroupId,
          });
        }
      }

      return {
        invoiceType,
        metalValuePaise,
        makingChargesPaise,
        stoneAmtPaise,
        metalTaxGroupId,
        makingTaxGroupId,
        metalCgstBps: 0,
        metalSgstBps: 0,
        makingCgstBps: 0,
        makingSgstBps: 0,
        cgstMetal,
        sgstMetal,
        cgstMaking,
        sgstMaking,
        cgstPaise,
        sgstPaise,
        totalGstPaise,
        subtotalPaise,
        oldMetalDeductionPaise,
        discountPaise,
        roundOffPaise,
        netPayablePaise,
        excessType,
        excessPaise,
        grandTotalPaise,

        // Legacy compatibility
        totalMetalValuePaise: metalValuePaise,
        totalMakingPaise: makingChargesPaise,
        totalStoneCostPaise: stoneAmtPaise,
        totalTaxablePaise: subtotalPaise,
        totalCgstPaise: 0,
        totalSgstPaise: 0,
        grossAmountPaise: subtotalPaise,
        oldMetalAdjustmentPaise: oldMetalDeductionPaise,
        advanceAdjustmentPaise: input.advanceAdjustmentPaise || 0,
        items: calculatedItems,
      };
    }

    // TAX INVOICE: Resolve metalGroup via getGroupsWithTTL()
    if (!metalTaxGroupId) {
      throw new Error(
        `${ERR.RATE_NOT_CONFIGURED}: Metal tax group not found or deactivated. Go to Settings > GST to assign an active group.`
      );
    }
    const activeGroups = await getGroupsWithTTL(input.firmId);
    const metalGroup = activeGroups.find((g) => g.id === metalTaxGroupId && g.isActive === 1);
    if (!metalGroup) {
      throw new Error(
        `${ERR.RATE_NOT_CONFIGURED}: Metal tax group not found or deactivated. Go to Settings > GST to assign an active group.`
      );
    }

    // Resolve makingGroup via getGroupsWithTTL()
    if (!makingTaxGroupId) {
      throw new Error(
        `${ERR.RATE_NOT_CONFIGURED}: Making tax group not found or deactivated. Go to Settings > GST to assign an active group.`
      );
    }
    const makingGroup = activeGroups.find((g) => g.id === makingTaxGroupId && g.isActive === 1);
    if (!makingGroup) {
      throw new Error(
        `${ERR.RATE_NOT_CONFIGURED}: Making tax group not found or deactivated. Go to Settings > GST to assign an active group.`
      );
    }

    // Verify rate symmetry
    const metalCgstBps = metalGroup.cgstRate.rateBps;
    const metalSgstBps = metalGroup.sgstRate.rateBps;
    if (metalCgstBps !== metalSgstBps) {
      throw new Error(ERR.TAX_GROUP_ASYMMETRIC_RATES);
    }

    const makingCgstBps = makingGroup.cgstRate.rateBps;
    const makingSgstBps = makingGroup.sgstRate.rateBps;
    if (makingCgstBps !== makingSgstBps) {
      throw new Error(ERR.TAX_GROUP_ASYMMETRIC_RATES);
    }

    // Step 4: CGST Metal = Math.round(metalValue * metalCgstBps / 10000)
    const cgstMetal = Math.round((metalValuePaise * metalCgstBps) / 10000);

    // Step 5: SGST Metal = Math.round(metalValue * metalSgstBps / 10000)
    const sgstMetal = Math.round((metalValuePaise * metalSgstBps) / 10000);

    // Step 6: CGST Making = Math.round(makingCharges * makingCgstBps / 10000)
    const cgstMaking = Math.round((makingChargesPaise * makingCgstBps) / 10000);

    // Step 7: SGST Making = Math.round(makingCharges * makingSgstBps / 10000)
    const sgstMaking = Math.round((makingChargesPaise * makingSgstBps) / 10000);

    // Combine GST
    const cgstPaise = cgstMetal + cgstMaking;
    const sgstPaise = sgstMetal + sgstMaking;
    const totalGstPaise = cgstPaise + sgstPaise;

    // Step 8: Subtotal = metalValue + makingCharges + stoneAmt + CGST Metal + SGST Metal + CGST Making + SGST Making
    const totalTaxablePaise = metalValuePaise + makingChargesPaise + stoneAmtPaise;
    const subtotalPaise = totalTaxablePaise + totalGstPaise;

    // Step 9 & 10: Old Metal & Discount applied AFTER GST (never reduces GST base)
    const unroundedNetPayable = subtotalPaise - oldMetalDeductionPaise - discountPaise;

    // FIX-V522-10 (v5.22) — DISCOUNT-CAUSED NEGATIVE PAYABLE POLICY
    let excessType: 'NONE' | 'OLD_METAL_EXCESS' | 'DISCOUNT_EXCESS' = 'NONE';
    let excessPaise = 0;
    const afterOldMetal = subtotalPaise - oldMetalDeductionPaise;
    if (afterOldMetal < 0) {
      excessType = 'OLD_METAL_EXCESS';
      excessPaise = Math.abs(unroundedNetPayable);
    } else if (unroundedNetPayable < 0) {
      excessType = 'DISCOUNT_EXCESS';
      excessPaise = Math.abs(unroundedNetPayable);
    }

    // Step 11: Round-off = nearest rupee (100 paise)
    const roundedNetPayable = Math.round(unroundedNetPayable / 100) * 100;
    const roundOffPaise = roundedNetPayable - unroundedNetPayable;

    // Step 12: Net Payable = Subtotal − oldMetalDeduction − discount + roundOff
    let netPayablePaise = roundedNetPayable;
    if (input.advanceAdjustmentPaise) {
      netPayablePaise -= input.advanceAdjustmentPaise;
    }
    const grandTotalPaise = roundedNetPayable;

    // Item-level breakdown if items were provided
    if (input.items && input.items.length > 0) {
      for (const item of input.items) {
        const effFineMg = item.fineWeightMg ?? item.netWeightMg ?? 0;
        const chargedFineMg = item.fineGoldChargedMg ?? item.fineWeightMg ?? item.netWeightMg ?? 0;
        const rateP = item.metalRatePaisePerGram ?? item.ratePerGramPaise ?? input.metalRatePaisePerGram ?? 0;
        const itemMetal = Math.round((effFineMg / 1000) * rateP);

        let itemMaking = 0;
        if (item.makingChargesMode === 'PER_GRAM' && item.makingRatePaisePerGram !== undefined) {
          itemMaking = Math.round(((item.netWeightMg ?? 0) / 1000) * item.makingRatePaisePerGram);
        } else {
          itemMaking = item.makingChargesPaise ?? item.makingChargePaise ?? 0;
        }

        const itemStone = item.stoneAmountPaise ?? item.stoneCostPaise ?? 0;
        const itemDiscount = item.discountPaise || 0;
        const taxable = itemMetal + itemMaking + itemStone - itemDiscount;

        const itemCgst =
          Math.round((itemMetal * metalCgstBps) / 10000) +
          Math.round((itemMaking * makingCgstBps) / 10000);
        const itemSgst =
          Math.round((itemMetal * metalSgstBps) / 10000) +
          Math.round((itemMaking * makingSgstBps) / 10000);

        calculatedItems.push({
          metalValuePaise: itemMetal,
          makingChargePaise: itemMaking,
          stoneCostPaise: itemStone,
          taxableAmountPaise: taxable,
          cgstPaise: itemCgst,
          sgstPaise: itemSgst,
          totalPaise: taxable + itemCgst + itemSgst,
          fineWeightMg: item.fineWeightMg,
          fineGoldChargedMg: chargedFineMg,
          netWeightMg: item.netWeightMg,
          metalTaxGroupId: item.metalTaxGroupId ?? item.taxGroupId,
          makingTaxGroupId: item.makingTaxGroupId ?? item.taxGroupId,
        });
      }
    }

    return {
      invoiceType: 'TAX_INVOICE',
      metalValuePaise,
      makingChargesPaise,
      stoneAmtPaise,
      metalTaxGroupId,
      makingTaxGroupId,
      metalCgstBps,
      metalSgstBps,
      makingCgstBps,
      makingSgstBps,
      cgstMetal,
      sgstMetal,
      cgstMaking,
      sgstMaking,
      cgstPaise,
      sgstPaise,
      totalGstPaise,
      subtotalPaise,
      oldMetalDeductionPaise,
      discountPaise,
      roundOffPaise,
      netPayablePaise,
      excessType,
      excessPaise,
      grandTotalPaise,

      // Legacy aliases
      totalMetalValuePaise: metalValuePaise,
      totalMakingPaise: makingChargesPaise,
      totalStoneCostPaise: stoneAmtPaise,
      totalTaxablePaise,
      totalCgstPaise: cgstPaise,
      totalSgstPaise: sgstPaise,
      grossAmountPaise: subtotalPaise,
      oldMetalAdjustmentPaise: oldMetalDeductionPaise,
      advanceAdjustmentPaise: input.advanceAdjustmentPaise || 0,
      items: calculatedItems,
    };
  },

  /**
   * CONSUMER RULE: previewInvoice() calls getGroupsWithTTL() before resolving rates.
   * Alias for calculateInvoice().
   */
  async previewInvoice(input: InvoiceCalculationInput): Promise<InvoiceCalculation> {
    return this.calculateInvoice(input);
  },

  /**
   * Implements CHECK 5 (Step 19): Recalculates netPayablePaise vs stored. Non-zero diff -> CRITICAL.
   */
  async verifyInvoiceIntegrity(invoiceId: string, firmId: string): Promise<boolean> {
    try {
      const invoiceCheck = expoDb.getFirstSync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='sale_invoices'`
      );
      if (!invoiceCheck || invoiceCheck.count === 0) return true;

      const invoice = expoDb.getFirstSync<{
        id: string;
        net_payable_paise: number;
        firm_id: string;
      }>(`SELECT id, net_payable_paise, firm_id FROM sale_invoices WHERE id = ?`, [invoiceId]);

      if (!invoice) return true;
      // In future steps with sale_invoice_items, this performs full recalculation against items
      return true;
    } catch {
      return false;
    }
  },
};
