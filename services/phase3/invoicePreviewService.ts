// services/phase3/invoicePreviewService.ts — Phase 3 STEP 17: Invoice Preview Engine
// Same calculateInvoice() as POST. No separate logic. Pure read + compute. Zero DB writes.

import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { taxGroupStore } from '@/store/phase3/taxGroupStore';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { ERR } from '@/constants/errorCodes';
import type {
  InvoiceCalculation,
  InvoiceCalculationInput,
} from '@/types/phase3/phase3.types';

export interface PreviewInvoiceOptions {
  oldMetal?: {
    valuePaise?: number | undefined;
    grossWeightMg?: number | undefined;
    purityPct?: number | undefined;
    metal?: string | undefined;
    notes?: string | undefined;
  } | undefined;
}

/**
 * Builds InvoiceCalculationInput from draft invoice, items, and firm.
 * Single source of truth shared between previewInvoice() and postInvoice()
 * to guarantee that Preview and POST produce identical results.
 */
export async function buildInvoiceCalculationInput(
  invoice: any,
  items: any[],
  firm: any,
  options?: PreviewInvoiceOptions
): Promise<InvoiceCalculationInput> {
  let metalTaxGroupId = items[0]?.metalTaxGroupId ?? undefined;
  let makingTaxGroupId = items[0]?.makingTaxGroupId ?? undefined;

  const isGSTRegistered = Boolean(firm?.gstin && firm.gstin.trim().length > 0);

  if (isGSTRegistered && (!metalTaxGroupId || !makingTaxGroupId)) {
    // FIX-PREVIEW-TAXSTORE-1 v5.18 & FIX-V520-7 v5.20:
    // Load active tax groups from Zustand taxGroupStore with loading guard
    let activeGroups = taxGroupStore.getState().groups;
    if (!activeGroups || activeGroups.length === 0 || taxGroupStore.getState().firmId !== invoice.firmId) {
      activeGroups = await taxMasterService.getActiveTaxGroups(invoice.firmId);
    }
    if (!metalTaxGroupId) {
      const mGrp = activeGroups.find((g) => g.groupName.includes('3%')) || activeGroups[0];
      metalTaxGroupId = mGrp?.id;
    }
    if (!makingTaxGroupId) {
      const mkGrp = activeGroups.find((g) => g.groupName.includes('5%')) || activeGroups[0];
      makingTaxGroupId = mkGrp?.id;
    }
  }

  return {
    firmId: invoice.firmId,
    metalRatePaisePerGram: invoice.metalRatePaisePerGram,
    metalTaxGroupId,
    makingTaxGroupId,
    discountPaise: invoice.discountPaise || 0,
    oldMetalDeductionPaise: options?.oldMetal?.valuePaise ?? invoice.oldMetalDeductionPaise ?? 0,
    items: items.map((it) => ({
      fineWeightMg: it.fineWeightMg ?? undefined,
      fineGoldChargedMg: (it as any).fineGoldChargedMg ?? it.fineWeightMg ?? undefined,
      netWeightMg: it.netWeightMg ?? (it.weightSoldMg ?? undefined),
      metalRatePaisePerGram: invoice.metalRatePaisePerGram,
      makingChargesMode: invoice.makingChargesMode as any,
      makingChargesPaise: it.makingChargesPaise,
      stoneAmountPaise: it.stoneAmountPaise,
      metalTaxGroupId: it.metalTaxGroupId ?? metalTaxGroupId,
      makingTaxGroupId: it.makingTaxGroupId ?? makingTaxGroupId,
    })),
  };
}

/**
 * STEP 17 — previewInvoice()
 * Executes the 5-step preview specification:
 * • Step 1: Load draft invoice + items from DB
 * • Step 2: Load firm.isGSTRegistered
 * • Step 3: Load active tax groups from Zustand taxGroupStore (FIX-PREVIEW-TAXSTORE-1 v5.18, FIX-V520-7 v5.20)
 * • Step 4: Call calculateInvoice() — IDENTICAL call to postInvoice()
 * • Step 5: Return InvoiceCalculation to UI. No DB writes. Pure read + compute.
 */
export async function previewInvoice(
  draftInvoiceIdOrInput: string | InvoiceCalculationInput,
  options?: PreviewInvoiceOptions
): Promise<InvoiceCalculation> {
  // Support direct InvoiceCalculationInput for backwards compatibility
  if (typeof draftInvoiceIdOrInput === 'object' && draftInvoiceIdOrInput !== null) {
    const input = { ...draftInvoiceIdOrInput } as InvoiceCalculationInput;
    if (input.firmId) {
      let storeGroups = taxGroupStore.getState().groups;
      if (!storeGroups || storeGroups.length === 0 || taxGroupStore.getState().firmId !== input.firmId) {
        storeGroups = await taxMasterService.getActiveTaxGroups(input.firmId);
      }
      if (!input.metalTaxGroupId && storeGroups && storeGroups.length > 0) {
        const mGrp = storeGroups.find((g) => g.groupName.includes('3%')) || storeGroups[0];
        if (mGrp) input.metalTaxGroupId = mGrp.id;
      }
      if (!input.makingTaxGroupId && storeGroups && storeGroups.length > 0) {
        const mkGrp = storeGroups.find((g) => g.groupName.includes('5%')) || storeGroups[0];
        if (mkGrp) input.makingTaxGroupId = mkGrp.id;
      }
    }
    return accountingTruthService.calculateInvoice(input);
  }

  const draftInvoiceId = draftInvoiceIdOrInput as string;
  if (!draftInvoiceId) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }

  // Step 1: Load draft invoice + items from DB
  const invoice = await invoiceRepository.getById(draftInvoiceId);
  if (!invoice) {
    throw new Error(ERR.INVOICE_NOT_FOUND);
  }
  if (invoice.status !== 'DRAFT') {
    throw new Error(ERR.INVOICE_NOT_DRAFT);
  }

  const items = await invoiceRepository.getItemsByInvoiceId(draftInvoiceId);
  if (!items || items.length === 0) {
    throw new Error('INVOICE_HAS_NO_ITEMS');
  }

  // Step 2: Load firm.isGSTRegistered
  const firm = await firmRepository.findById(invoice.firmId);

  // Step 3 & Step 4: Build identical calculation input (with FIX-V520-7 guard) and call calculateInvoice()
  const calcInput = await buildInvoiceCalculationInput(invoice, items, firm, options);
  const calculation = await accountingTruthService.calculateInvoice(calcInput);

  // Step 5: Return InvoiceCalculation to UI. No DB writes. Pure read + compute.
  return calculation;
}

export const invoicePreviewService = {
  previewInvoice,
  buildInvoiceCalculationInput,
};
