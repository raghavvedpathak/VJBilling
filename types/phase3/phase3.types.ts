// types/phase3/phase3.types.ts — Phase 3 Money Truth Layer Domain Types
// Strictly implements STEP 0 Contract (v5.25 / v5.41)

export type TaxComponent = 'CGST' | 'SGST';

export interface TaxRate {
  id: string;
  firmId: string;
  taxName: string;
  rateBps: number; // basis points: 150 = 1.50%
  taxType: TaxComponent;
  isActive: number; // 1=active, 0=inactive
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface NewTaxRate {
  id?: string;
  firmId: string;
  taxName: string;
  rateBps: number;
  taxType: TaxComponent;
  isActive?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTaxRateInput {
  name: string;
  rateBps: number;
  taxComponent: TaxComponent;
}

export interface TaxGroup {
  id: string;
  firmId: string;
  groupName: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTaxGroup {
  id?: string;
  firmId: string;
  groupName: string;
  isActive?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTaxGroupInput {
  name: string;
  cgstRateId: string;
  sgstRateId: string;
}

export interface TaxGroupComponent {
  id: string;
  taxGroupId: string;
  taxRateId: string;
}

export interface NewTaxGroupComponent {
  id?: string;
  taxGroupId: string;
  taxRateId: string;
}

export interface TaxGroupWithRates {
  id: string;
  firmId: string;
  groupName: string;
  isActive: number;
  cgstRate: TaxRate;
  sgstRate: TaxRate;
  combinedRateBps: number;
  combinedRatePercent: number;
}

// =============================================================================
// Phase 3 Audit Payload Discriminated Union (v5.25, FIX-AUDITPAYLOAD-1)
// Exactly 17 members verbatim from Step 0 specification
// =============================================================================

export type Phase3AuditPayload =
  | { eventType: 'RATE_UPDATED'; payload: Record<string, unknown> }
  | { eventType: 'CUSTOMER_CREATED'; payload: Record<string, unknown> }
  | { eventType: 'KARIGAR_METAL_SETTLED'; payload: Record<string, unknown> }
  | { eventType: 'KARIGAR_MIXED_PAYMENT_RECORDED'; payload: Record<string, unknown> }
  | { eventType: 'INVOICE_PRINT_SETTINGS_UPDATED'; payload: Record<string, unknown> }
  | { eventType: 'ESTIMATE_CONVERTED'; payload: Record<string, unknown> }
  | { eventType: 'DRAFT_CREATED'; payload: Record<string, unknown> }
  | { eventType: 'DRAFT_ITEM_ADDED'; payload: Record<string, unknown> }
  | { eventType: 'INVOICE_POSTED'; payload: Record<string, unknown> }
  | { eventType: 'PAYMENT_RECORDED'; payload: Record<string, unknown> }
  | { eventType: 'SUPPLIER_METAL_PAYMENT_RECORDED'; payload: Record<string, unknown> }
  | { eventType: 'CREDIT_NOTE_CREATED'; payload: Record<string, unknown> }
  | { eventType: 'ITEM_RETURNED'; payload: Record<string, unknown> }
  | { eventType: 'ITEM_RETURN_APPROVED'; payload: Record<string, unknown> }
  | { eventType: 'PURCHASE_INVOICE_POSTED'; payload: Record<string, unknown> }
  | { eventType: 'INVOICE_SHARED'; payload: Record<string, unknown> }
  | { eventType: 'DEBIT_NOTE_CREATED'; payload: Record<string, unknown> }
  | { eventType: 'ESTIMATE_PDF_GENERATED'; payload: Record<string, unknown> }
  | { eventType: 'PDF_GENERATED'; payload: Record<string, unknown> }
  | { eventType: 'PHANTOM_RECONCILE_BROKEN'; payload: Record<string, unknown> };

// =============================================================================
// Accounting Truth Foundation Types (Step 0 / Step 8 / Step 19)
// =============================================================================

// Locked reason for negative payable excess money-out records (v5.22 FIX-V522-10)
export type MoneyOutExcessReason = 'OLD_METAL_EXCESS' | 'DISCOUNT_EXCESS';

export interface InvoiceCalculationInput {
  firmId: string;
  metalValuePaise?: number | undefined;
  makingChargesPaise?: number | undefined;
  stoneAmtPaise?: number | undefined; // always exempt (0% GST)
  metalTaxGroupId?: string | undefined; // FK → tax_groups.id [NEW v5.16]
  makingTaxGroupId?: string | undefined; // FK → tax_groups.id [NEW v5.16]
  oldMetalDeductionPaise?: number | undefined; // Step 9
  discountPaise?: number | undefined; // Step 10

  // Direct calculation inputs (for single-item shortcuts & T14 worked example)
  fineWeightMg?: number | undefined; // Step 1: fineWeightMg / 1_000 * metalRatePaisePerGram
  metalRatePaisePerGram?: number | undefined; // Step 1
  makingChargesMode?: 'FLAT' | 'PER_GRAM' | undefined; // Step 2
  makingRatePaisePerGram?: number | undefined; // Step 2: (netWeightMg / 1_000) * ratePerGram
  netWeightMg?: number | undefined; // Step 2

  // Optional / backward-compatibility fields for legacy callers
  hasGstin?: boolean | undefined;
  items?: Array<{
    netWeightMg?: number | undefined;
    fineWeightMg?: number | undefined;
    fineGoldChargedMg?: number | null | undefined; // FIX-NULL-CONTRACT-1: fallback to fineWeightMg if null
    ratePerGramPaise?: number | undefined;
    metalRatePaisePerGram?: number | undefined;
    makingChargePaise?: number | undefined;
    makingChargesPaise?: number | undefined;
    makingChargesMode?: 'FLAT' | 'PER_GRAM' | undefined;
    makingRatePaisePerGram?: number | undefined;
    stoneCostPaise?: number | undefined;
    stoneAmountPaise?: number | undefined;
    taxGroupId?: string | undefined;
    metalTaxGroupId?: string | undefined;
    makingTaxGroupId?: string | undefined;
    discountPaise?: number | undefined;
  }> | undefined;
  oldMetalAdjustmentPaise?: number | undefined;
  advanceAdjustmentPaise?: number | undefined;
}

export interface InvoiceCalculationItem {
  metalValuePaise: number;
  makingChargePaise: number;
  stoneCostPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
  fineWeightMg?: number | undefined;
  fineGoldChargedMg?: number | undefined; // FIX-NULL-CONTRACT-1: fineGoldChargedMg ?? fineWeightMg
  netWeightMg?: number | undefined;
  metalTaxGroupId?: string | undefined;
  makingTaxGroupId?: string | undefined;
}

export interface InvoiceCalculation {
  invoiceType: 'TAX_INVOICE' | 'BILL_OF_SUPPLY';
  metalValuePaise: number; // Step 1
  makingChargesPaise: number; // Step 2
  stoneAmtPaise: number; // Step 3
  metalTaxGroupId?: string | undefined;
  makingTaxGroupId?: string | undefined;
  metalCgstBps: number;
  metalSgstBps: number;
  makingCgstBps: number;
  makingSgstBps: number;
  cgstMetal: number; // Step 4
  sgstMetal: number; // Step 5
  cgstMaking: number; // Step 6
  sgstMaking: number; // Step 7
  cgstPaise: number; // cgstMetal + cgstMaking
  sgstPaise: number; // sgstMetal + sgstMaking
  totalGstPaise: number; // cgstPaise + sgstPaise
  subtotalPaise: number; // Step 8: metalValue + makingCharges + stoneAmt + cgstMetal + sgstMetal + cgstMaking + sgstMaking
  oldMetalDeductionPaise: number; // Step 9
  discountPaise: number; // Step 10: Discount applied AFTER old metal (never reduces GST base)
  roundOffPaise: number; // Step 11: Round-off = nearest rupee (100 paise)
  netPayablePaise: number; // Step 12: Subtotal - oldMetalDeduction - discount + roundOff

  // FIX-V522-10: Excess tracking when payable goes negative (DO NOT silently clamp to 0)
  excessType: 'NONE' | 'OLD_METAL_EXCESS' | 'DISCOUNT_EXCESS';
  excessPaise: number; // Math.abs(netPayablePaise) when netPayablePaise < 0, else 0

  grandTotalPaise: number; // Subtotal - oldMetalDeduction - discount + roundOff (matches netPayablePaise)

  // Backward-compatibility aliases for legacy / item-level callers:
  totalMetalValuePaise?: number;
  totalMakingPaise?: number;
  totalStoneCostPaise?: number;
  totalTaxablePaise?: number;
  totalCgstPaise?: number;
  totalSgstPaise?: number;
  grossAmountPaise?: number;
  oldMetalAdjustmentPaise?: number;
  advanceAdjustmentPaise?: number;
  items?: InvoiceCalculationItem[];
}

// =============================================================================
// Rate Engine Types (STEP RE)
// Storage strictly in INTEGER PAISE.
// RateEngineOutput is derived in-memory and NEVER persisted (FIX-V520-14).
// =============================================================================

export interface RateEngineConfig {
  id: string;
  firmId: string;
  gold24BasePer10gPaise: number;
  gold22BasePer10gPaise: number;
  goldCashPer10gPaise: number;
  silverCashPerKgPaise: number;
  lastUpdatedAt: string;
}

export interface RateEngineInput {
  gold24BasePer10g_rupees: number; // integer rupees from UI
  gold22BasePer10g_rupees: number; // integer rupees from UI
  goldCashPer10g_rupees: number; // integer rupees from UI
  silverCashPerKg_rupees: number; // integer rupees from UI
}

export interface RateEngineOutput {
  gold24BasePerGramPaise: number;
  gold24GstPerGramPaise: number;
  gold24WithGstPerGramPaise: number;
  gold22BasePerGramPaise: number;
  gold22GstPerGramPaise: number;
  gold22WithGstPerGramPaise: number;
  goldCashPerGramPaise: number;
  silverCashPerGramPaise: number;
  silverCashPer10gPaise: number; // v5.6 NEW — derived display only
}

// =============================================================================
// Customer Master Types (STEP 1)
// Firm-scoped identity. Soft delete only.
// aadhaarNumber & panNumber are optional for URD pre-fill (FIX-CUSTOMER-URD-1 v5.9).
// Balance is derived at query time across all FYs.
// =============================================================================

export interface Customer {
  id: string;
  firmId: string;
  fyId: string; // FY of first creation ONLY — NOT a scope limiter (v4.8)
  name: string;
  mobile: string | null;
  gstin: string | null;
  address: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  isDeleted: number; // 0 = active, 1 = soft deleted
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface NewCustomer {
  id?: string;
  firmId: string;
  fyId: string;
  name: string;
  mobile?: string | null;
  gstin?: string | null;
  address?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  isDeleted?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCustomerInput {
  firmId: string;
  fyId?: string | undefined;
  name: string;
  mobile?: string | null | undefined;
  gstin?: string | null | undefined;
  address?: string | null | undefined;
  aadhaarNumber?: string | null | undefined; // OPTIONAL — for URD Purchase Bill pre-fill (FIX-CUSTOMER-URD-1 v5.9)
  panNumber?: string | null | undefined; // OPTIONAL — for URD Purchase Bill pre-fill (FIX-CUSTOMER-URD-1 v5.9)
}

export interface UpdateCustomerInput {
  name?: string | undefined;
  mobile?: string | null | undefined;
  gstin?: string | null | undefined;
  address?: string | null | undefined;
  aadhaarNumber?: string | null | undefined;
  panNumber?: string | null | undefined;
}

// =============================================================================
// Supplier Master Types (STEP 2)
// External purchase parties only. Bank details.
// CONSTITUTIONAL RULE: KARIGAR IS A SEPARATE ENTITY (Step 3).
// Types: SUPPLIER | REFINERY | VENDOR
// =============================================================================

export type SupplierType = 'SUPPLIER' | 'REFINERY' | 'VENDOR';

export interface Supplier {
  id: string;
  firmId: string;
  name: string;
  mobile: string | null;
  gstin: string | null;
  address: string | null;
  type: SupplierType;
  bankName: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  isArchived: number; // 0 | 1
  isDeleted: number; // 0 | 1
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface NewSupplier {
  id?: string | undefined;
  firmId: string;
  name: string;
  mobile?: string | null | undefined;
  gstin?: string | null | undefined;
  address?: string | null | undefined;
  type?: SupplierType | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
  isArchived?: number | undefined;
  isDeleted?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface CreateSupplierInput {
  firmId: string;
  name: string;
  mobile?: string | null | undefined;
  gstin?: string | null | undefined;
  address?: string | null | undefined;
  type?: SupplierType | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
}

export interface UpdateSupplierInput {
  name?: string | undefined;
  mobile?: string | null | undefined;
  gstin?: string | null | undefined;
  address?: string | null | undefined;
  type?: SupplierType | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
}

// =============================================================================
// Karigar Master & Dual Ledger Types (STEP 3)
// Job work party. Metal + Money dual ledger.
// CONSTITUTIONAL RULE: Independent party type — NOT a subtype of Supplier.
// Balances are firm-wide lifetime aggregates (v5.17 FIX-KARIGAR-CROSSFY-1).
// =============================================================================

export type KarigarLedgerType =
  | 'METAL_OUT'
  | 'METAL_IN'
  | 'LABOUR_PAYABLE'
  | 'LABOUR_PAID'
  | 'METAL_SETTLED_AS_MONEY'
  | 'LABOUR_IN_GOLD';

export interface Karigar {
  id: string;
  firmId: string;
  name: string;
  mobile: string | null;
  address: string | null;
  speciality: string | null;
  bankName: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  isArchived: number; // 0 | 1
  isDeleted: number; // 0 | 1
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface NewKarigar {
  id?: string | undefined;
  firmId: string;
  name: string;
  mobile?: string | null | undefined;
  address?: string | null | undefined;
  speciality?: string | null | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
  isArchived?: number | undefined;
  isDeleted?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface CreateKarigarInput {
  firmId: string;
  name: string;
  mobile?: string | null | undefined;
  address?: string | null | undefined;
  speciality?: string | null | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
}

export interface UpdateKarigarInput {
  name?: string | undefined;
  mobile?: string | null | undefined;
  address?: string | null | undefined;
  speciality?: string | null | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  ifsc?: string | null | undefined;
}

export interface KarigarLedgerEntry {
  id: string;
  firmId: string;
  fyId: string | null;
  karigarId: string;
  type: KarigarLedgerType;
  weightMg: number;
  purityPct: number;
  amountPaise: number;
  ratePaisePerGram: number; // v4.7
  isManualRate: number; // v4.7
  linkedEntityId: string | null;
  linkedJobWorkId: string | null; // v5.14 FIX-LINKEDJOBWORK-COL-1
  notes: string | null;
  createdAt: string; // ISO-8601
}

export interface NewKarigarLedgerEntry {
  id?: string | undefined;
  firmId: string;
  fyId?: string | null | undefined;
  karigarId: string;
  type: KarigarLedgerType;
  weightMg?: number | undefined;
  purityPct?: number | undefined;
  amountPaise?: number | undefined;
  ratePaisePerGram?: number | undefined;
  isManualRate?: number | undefined;
  linkedEntityId?: string | null | undefined;
  linkedJobWorkId?: string | null | undefined;
  notes?: string | null | undefined;
  createdAt?: string | undefined;
}

export interface KarigarBalanceSummary {
  metalBalanceMg: number; // fine mg outstanding (positive = karigar owes firm metal)
  moneyBalancePaise: number; // paise outstanding (positive = firm owes karigar labour/cash)
}

export interface SettleKarigarMetalInput {
  firmId: string;
  fyId?: string | null | undefined;
  karigarId: string;
  fineWeightMg?: number | undefined; // Step 3B canonical: fine milligrams being settled (> 0)
  settleWeightMg?: number | undefined; // alias for fineWeightMg
  ratePaisePerGram: number; // bhav rate per gram in paise (> 0)
  linkedMetalEntryId?: string | undefined; // Step 3B canonical: ID of METAL_OUT karigar_ledger row
  linkedEntityId?: string | undefined; // alias for linkedMetalEntryId
  linkedJobWorkId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface RecordJobWorkIssueInput {
  firmId: string;
  fyId?: string | null | undefined;
  karigarId: string;
  weightMg: number; // gross weight in mg
  purityPct: number; // metal purity e.g. 91.6
  linkedJobWorkId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface RecordJobWorkReceiptInput {
  firmId: string;
  fyId?: string | null | undefined;
  karigarId: string;
  weightMg: number; // gross weight of ornaments received in mg
  purityPct: number; // ornament purity e.g. 91.6
  labourAmountPaise?: number | undefined; // labour payable in paise
  linkedJobWorkId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface RecordLabourPaymentInput {
  firmId: string;
  fyId?: string | null | undefined;
  karigarId: string;
  amountPaise: number; // payment in paise
  paymentDate?: string | undefined;
  paymentMode?: string | undefined;
  linkedJobWorkId?: string | null | undefined;
  notes?: string | null | undefined;
}

// =============================================================================
// Karigar Mixed Payment (STEP 3C — v5.13 / v5.14 / v5.18 / v5.20)
// Pure Metal, Pure Money, or Mixed. Atomic dual-row write if mixed.
// =============================================================================

export interface RecordKarigarMixedPaymentInput {
  karigarId: string;
  firmId: string;
  paymentDate: string; // ISO 8601 text
  fineWeightMg: number; // integer >= 0
  ratePaisePerGram?: number | undefined; // integer >= 0 (required when fineWeightMg > 0)
  moneyAmountPaise: number; // integer >= 0
  linkedMetalEntryId?: string | undefined; // ID of METAL_OUT karigar_ledger row (required when fineWeightMg > 0)
  linkedJobWorkId?: string | null | undefined; // ID of job work order row being settled
  notes?: string | null | undefined;
}

export interface RecordKarigarMixedPaymentResult {
  metalSettlementEntry: KarigarLedgerEntry | null;
  labourPaidEntry: KarigarLedgerEntry | null;
  fyId: string;
}

// =============================================================================
// Invoice Number Generation Types (STEP 4 — v4.8 / v4.9 / v5.4 / v5.23)
// Document sequences: SALE | PURCHASE | CN | DN | EST.
// Resets per FY. Never goes backward.
// =============================================================================

export type DocType = 'SALE' | 'PURCHASE' | 'CN' | 'DN' | 'EST';

export interface InvoiceNumberConfig {
  id: string;
  firmId: string;
  fyId: string;
  docType: DocType;
  prefix: string;
  lastSequence: number;
  allowManualOverride: number; // 0 | 1
  createdAt: string; // ISO 8601 (v5.4 GAP 7 FIX)
  updatedAt: string; // ISO 8601 (v5.4 GAP 7 FIX)
}

export interface NewInvoiceNumberConfig {
  id?: string | undefined;
  firmId: string;
  fyId: string;
  docType: DocType;
  prefix: string;
  lastSequence?: number | undefined;
  allowManualOverride?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

// =============================================================================
// Invoice Print Settings Types (STEP 4 — FIX-INVOICE-PRINT-1 v5.19)
// Supports A4 / A5 in Portrait / Landscape.
// Terms and Conditions toggle + text.
// =============================================================================

export type PaperSize = 'A4' | 'A5';
export type PageOrientation = 'PORTRAIT' | 'LANDSCAPE';

export interface InvoicePrintSettings {
  id: string; // '{firmId}_print_settings'
  firmId: string;
  paperSize: PaperSize;
  orientation: PageOrientation;
  showTermsAndConditions: boolean;
  termsAndConditionsText: string;
  updatedAt: string; // ISO 8601
}

export interface NewInvoicePrintSettings {
  id: string;
  firmId: string;
  paperSize: PaperSize;
  orientation: PageOrientation;
  showTermsAndConditions: number; // 0 | 1 in DB
  termsAndConditionsText: string;
  updatedAt: string;
}

export interface InvoicePrintSettingsInput {
  paperSize: PaperSize;
  orientation: PageOrientation;
  showTermsAndConditions: boolean;
  termsAndConditionsText?: string | undefined;
}

export interface GenerateInvoicePDFOptions {
  isReprint?: boolean | undefined;
  templateId?: string | undefined;
}

// =============================================================================
// Sale Invoice Domain Model Types (STEP 6 — v4.0 / v4.3 / v5.21 / v5.35)
// State machine: DRAFT -> POSTED -> VOID
// All amounts strictly in integer paise.
// Dual line types: SERIALIZED_ITEM | LOOSE_LOT
// =============================================================================

export type SaleInvoiceStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type MakingChargesMode = 'FLAT' | 'PER_GRAM';
export type InvoiceLineType = 'SERIALIZED_ITEM' | 'LOOSE_LOT';

export interface SaleInvoice {
  id: string;
  firmId: string;
  fyId: string;
  customerId: string;
  invoiceNumber: string | null;
  invoiceDate: string; // ISO 8601
  status: SaleInvoiceStatus;
  metalRatePaisePerGram: number;
  isManualRate: number; // 0 | 1
  makingChargesMode: MakingChargesMode;
  makingChargesPaise: number;
  taxableMetalAmtPaise: number;
  taxableMakingAmtPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  stoneAmtPaise: number;
  oldMetalDeductionPaise: number;
  discountPaise: number;
  roundOffPaise: number;
  netPayablePaise: number;
  notes: string | null;
  createdAt: string; // ISO 8601
  postedAt: string | null; // ISO 8601
}

export interface NewSaleInvoice {
  id?: string;
  firmId: string;
  fyId: string;
  customerId: string;
  invoiceNumber?: string | null;
  invoiceDate: string;
  status?: SaleInvoiceStatus;
  metalRatePaisePerGram: number;
  isManualRate?: number;
  makingChargesMode?: MakingChargesMode;
  makingChargesPaise?: number;
  taxableMetalAmtPaise?: number;
  taxableMakingAmtPaise?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  stoneAmtPaise?: number;
  oldMetalDeductionPaise?: number;
  discountPaise?: number;
  roundOffPaise?: number;
  netPayablePaise?: number;
  notes?: string | null;
  createdAt?: string;
  postedAt?: string | null;
}

export interface SaleInvoiceItem {
  id: string;
  invoiceId: string;
  stockLotId: string;
  sku: string | null;
  huid?: string | null | undefined;
  itemName: string;
  metal: string;
  purityPct: number;
  grossWeightMg: number | null;
  stoneWeightMg: number | null;
  netWeightMg: number | null;
  fineWeightMg: number | null;
  hsnCode: string | null;
  stoneAmountPaise: number;
  metalValuePaise: number;
  makingChargesPaise: number;
  lineGstPaise: number;
  lineTotalPaise: number;
  metalTaxGroupId: string | null;
  makingTaxGroupId: string | null;
  lineType: InvoiceLineType;
  qtySold: number | null;
  weightSoldMg: number | null;
}

export interface NewSaleInvoiceItem {
  id?: string;
  invoiceId: string;
  stockLotId: string;
  sku?: string | null;
  itemName: string;
  metal: string;
  purityPct: number;
  grossWeightMg?: number | null;
  stoneWeightMg?: number | null;
  netWeightMg?: number | null;
  fineWeightMg?: number | null;
  hsnCode?: string | null;
  stoneAmountPaise?: number;
  metalValuePaise?: number;
  makingChargesPaise?: number;
  lineGstPaise?: number;
  lineTotalPaise?: number;
  metalTaxGroupId?: string | null;
  makingTaxGroupId?: string | null;
  lineType?: InvoiceLineType;
  qtySold?: number | null;
  weightSoldMg?: number | null;
}

export interface SaleInvoiceWithItems extends SaleInvoice {
  items: SaleInvoiceItem[];
}

// =============================================================================
// Ledger & Post Invoice Domain Types (STEP 9 / STEP 10)
// =============================================================================

export type LedgerEntryType = 'DEBIT' | 'CREDIT';
export type LedgerPartyType = 'CUSTOMER' | 'SUPPLIER';
export type LedgerLinkedEntityType =
  | 'INVOICE'
  | 'PAYMENT'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'SUPPLIER_METAL_PAYMENT'
  | 'OLD_METAL';

export interface LedgerEntry {
  id: string;
  firmId: string;
  fyId?: string | null;
  partyId: string;
  partyType: LedgerPartyType;
  type: LedgerEntryType;
  amountPaise: number;
  linkedEntityType?: LedgerLinkedEntityType | string | null;
  linkedEntityId?: string | null;
  description?: string | null;
  createdAt: string;
  // Backward compatibility fields
  debitPaise?: number;
  creditPaise?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface NewLedgerEntry {
  id?: string;
  firmId: string;
  fyId?: string | null;
  partyId: string;
  partyType: LedgerPartyType;
  type?: LedgerEntryType;
  amountPaise?: number;
  linkedEntityType?: LedgerLinkedEntityType | string | null;
  linkedEntityId?: string | null;
  description?: string | null;
  createdAt?: string;
  // Backward compatibility fields
  debitPaise?: number;
  creditPaise?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface LedgerStatementLine extends LedgerEntry {
  runningBalancePaise: number;
}

export interface LedgerStatement {
  firmId: string;
  partyId: string;
  partyType: LedgerPartyType;
  openingBalancePaise: number;
  closingBalancePaise: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
  entries: LedgerStatementLine[];
}

export interface CreateOldMetalInSaleInput {
  firmId?: string | undefined;
  fyId?: string | null | undefined;
  grossWeightMg: number;
  purityPct: number;
  valuePaise?: number | undefined;
  metal: 'GOLD' | 'SILVER' | string;
  metalSource?: 'CUSTOMER' | undefined;
  customerId?: string | null | undefined;
  saleInvoiceId?: string | null | undefined;
  receivedDate?: string | null | undefined;
  notes?: string | null | undefined;
}

// STEP 12 / FIX-OLD-GOLD-UI-1 (v5.15): Settlement Choice for Negative Net Payable
export type ExcessSettlementChoice = 'PAY_NOW' | 'PAY_LATER';

export interface ExcessSettlementInput {
  choice: ExcessSettlementChoice;
  mode?: PaymentMode | null | undefined;
  bankAccountId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface PostInvoiceInput {
  invoiceId?: string | undefined;
  draftInvoiceId?: string | undefined;
  firmId: string;
  oldMetal?: CreateOldMetalInSaleInput | undefined;
  excessSettlement?: ExcessSettlementInput | undefined;
}

// FIX-V522-13: MoneyTransaction is a TypeScript type alias for the payments table row
export type MoneyTransaction = Payment;

// =============================================================================
// Estimate Engine Domain Types (STEP 7B — v4.2 / v5.5 / v5.10 / v5.21 / v5.23)
// Status lifecycle: DRAFT -> SAVED -> CONVERTED -> EXPIRED
// Zero financial impact: no stock movement, no ledger entries.
// =============================================================================

export type EstimateStatus = 'DRAFT' | 'SAVED' | 'CONVERTED' | 'EXPIRED';

export interface EstimateInvoice {
  id: string; // UUID
  firmId: string;
  fyId: string;
  customerId: string | null; // nullable for walk-in / guest estimates
  estimateNumber: string | null; // NULL until saved — format: EST/{fyLabel}/{seq}
  estimateDate: string; // ISO 8601
  status: EstimateStatus;
  metalRatePaisePerGram: number;
  isManualRate: number; // 0 | 1
  makingChargesMode: MakingChargesMode;
  makingChargesPaise: number;
  netPayablePaise: number; // estimated only — NOT binding
  notes: string | null;
  convertedInvoiceId: string | null; // FK -> sale_invoices.id (nullable)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface NewEstimateInvoice {
  id?: string;
  firmId: string;
  fyId: string;
  customerId?: string | null;
  estimateNumber?: string | null;
  estimateDate: string;
  status?: EstimateStatus;
  metalRatePaisePerGram: number;
  isManualRate?: number;
  makingChargesMode?: MakingChargesMode;
  makingChargesPaise?: number;
  netPayablePaise?: number;
  notes?: string | null;
  convertedInvoiceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EstimateItem {
  id: string; // UUID
  estimateId: string;
  stockLotId: string; // reference only — NOT reserved
  sku: string | null;
  itemName: string;
  metal: string;
  purityPct: number;
  grossWeightMg: number | null;
  stoneWeightMg: number | null;
  netWeightMg: number | null;
  fineWeightMg: number | null;
  hsnCode: string | null;
  metalValuePaise: number;
  makingChargesPaise: number;
  lineTotalPaise: number;
}

export interface NewEstimateItem {
  id?: string;
  estimateId: string;
  stockLotId: string;
  sku?: string | null;
  itemName: string;
  metal: string;
  purityPct: number;
  grossWeightMg?: number | null;
  stoneWeightMg?: number | null;
  netWeightMg?: number | null;
  fineWeightMg?: number | null;
  hsnCode?: string | null;
  metalValuePaise?: number;
  makingChargesPaise?: number;
  lineTotalPaise?: number;
}

export interface EstimateWithItems extends EstimateInvoice {
  items: EstimateItem[];
}

export interface CreateEstimateInput {
  firmId: string;
  fyId?: string;
  customerId?: string | null;
  estimateDate?: string;
  metalRatePaisePerGram?: number;
  isManualRate?: number;
  makingChargesMode?: MakingChargesMode;
  makingChargesPaise?: number;
  notes?: string | null;
}

export interface AddEstimateItemInput {
  estimateId: string;
  stockLotId: string;
  makingChargesMode?: MakingChargesMode;
  makingRatePaise?: number;
  customMakingPaise?: number;
  makingChargesPaise?: number;
}

export interface ConvertEstimateInput {
  estimateId: string;
  firmId: string;
  entryDate: string;
  metalRatePaisePerGram?: number;
  isManualRate?: boolean | number;
}

export interface ConvertEstimateResult {
  draftInvoice: SaleInvoice;
  estimateNumber: string;
}

// =============================================================================
// Step 11 — Payment Engine Types
// =============================================================================

export type PaymentMode = 'CASH' | 'BANK' | 'UPI';
export type PaymentPartyType = 'CUSTOMER' | 'SUPPLIER';
export type PaymentType = 'MONEY_IN' | 'MONEY_OUT';
export type PaymentStatus = 'PAID' | 'PENDING';

export interface Payment {
  id: string;
  firmId: string;
  fyId: string | null;
  partyId: string;
  partyType: PaymentPartyType;
  type: PaymentType;
  amountPaise: number;
  mode: PaymentMode;
  bankAccountId: string | null;
  status: PaymentStatus;
  reason: string | null;
  linkedInvoiceId: string | null;
  notes: string | null;
  createdAt: string; // ISO 8601
}

export interface NewPayment {
  id?: string;
  firmId: string;
  fyId?: string | null;
  partyId: string;
  partyType: PaymentPartyType;
  type: PaymentType;
  amountPaise: number;
  mode: PaymentMode;
  bankAccountId?: string | null;
  status?: PaymentStatus;
  reason?: string | null;
  linkedInvoiceId?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface RecordPaymentInput {
  firmId: string;
  partyId: string;
  partyType: PaymentPartyType;
  amountPaise: number;
  mode: PaymentMode;
  bankAccountId?: string | null | undefined;
  paymentDate: string;
  linkedInvoiceId?: string | null;
  notes?: string | null;
  reason?: string | null;
  type?: PaymentType;
}

export interface RecordPaymentResult {
  payment: Payment;
  ledgerEntry: LedgerEntry;
}

export interface InvoicePaymentSummary {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceTotalPaise: number;
  paidPaise: number;
  remainingPaise: number;
  paymentCount: number;
  payments: Payment[];
}

export interface OutstandingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  netPayablePaise: number;
  paidPaise: number;
  remainingPaise: number;
}

// =============================================================================
// Step 11A — Supplier Metal Payment Types
// =============================================================================

export interface SupplierMetalPayment {
  id: string;
  firmId: string;
  fyId: string;
  supplierId: string;
  paymentDate: string;
  metalWeightMg: number;
  metalPurityPct: number;
  metalFineWeightMg: number;
  metalRatePaisePerGram: number;
  metalValuePaise: number;
  moneyAmountPaise: number;
  moneyMode: PaymentMode | null;
  bankAccountId: string | null;
  totalValuePaise: number;
  linkedPurchaseInvoiceId: string | null;
  notes: string | null;
  createdAt: string; // ISO 8601
}

export interface NewSupplierMetalPayment {
  id?: string;
  firmId: string;
  fyId: string;
  supplierId: string;
  paymentDate: string;
  metalWeightMg?: number;
  metalPurityPct?: number;
  metalFineWeightMg?: number;
  metalRatePaisePerGram?: number;
  metalValuePaise?: number;
  moneyAmountPaise?: number;
  moneyMode?: PaymentMode | null;
  bankAccountId?: string | null;
  totalValuePaise: number;
  linkedPurchaseInvoiceId?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface RecordSupplierPaymentInput {
  firmId: string;
  supplierId: string;
  paymentDate: string;
  metalWeightMg?: number;
  metalPurityPct?: number;
  metalRatePaisePerGram?: number;
  moneyAmountPaise?: number;
  moneyMode?: PaymentMode | null | undefined;
  bankAccountId?: string | null | undefined;
  linkedPurchaseInvoiceId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface RecordSupplierPaymentResult {
  payment: SupplierMetalPayment;
  ledgerEntry: LedgerEntry;
}

// =============================================================================
// Step 13 — Credit Note Types (v5.1 / v5.4 GAP 6 / v4.8 / v5.20)
// =============================================================================

export interface CreditNote {
  id: string;
  firmId: string;
  fyId: string;
  originalInvoiceId: string;
  cnNumber: string;
  cnDate: string; // ISO 8601
  reason: string;
  returnedItemIds: string; // JSON string of sale_invoice_item IDs
  creditAmountPaise: number;
  isPartial: number; // 0 | 1
  remainingOldMetalCreditPaise: number;
  status: 'POSTED';
  createdAt: string; // ISO 8601
}

export interface NewCreditNote {
  id?: string | undefined;
  firmId: string;
  fyId: string;
  originalInvoiceId: string;
  cnNumber: string;
  cnDate: string;
  reason: string;
  returnedItemIds: string;
  creditAmountPaise: number;
  isPartial?: number | undefined;
  remainingOldMetalCreditPaise?: number | undefined;
  status?: 'POSTED' | undefined;
  createdAt?: string | undefined;
}

export interface CreateCreditNoteInput {
  firmId: string;
  originalInvoiceId: string;
  returnedItemIds: string[]; // sale_invoice_item IDs
  reason: string;
  cnDate?: string | undefined;
}

export interface RestoreItemFromSaleInput {
  stockLotId: string;
  creditNoteId: string;
  firmId: string;
}

export interface ApproveReturnedItemInput {
  stockLotId: string;
  firmId: string;
}

// =============================================================================
// Step 14 — Debit Note Types (v5.22 FIX-V522-11 / v5.23 FIX-V523-1)
// =============================================================================

export interface DebitNote {
  id: string;
  firmId: string;
  fyId: string;
  customerId: string;
  originalInvoiceId: string;
  dnNumber: string;
  entryDate: string; // ISO 8601 (FIX-V523-1)
  reason: string;
  additionalAmountPaise: number;
  status: 'POSTED';
  createdAt: string; // ISO 8601
}

export interface NewDebitNote {
  id?: string | undefined;
  firmId: string;
  fyId: string;
  customerId: string;
  originalInvoiceId: string;
  dnNumber: string;
  entryDate: string;
  reason: string;
  additionalAmountPaise: number;
  status?: 'POSTED' | undefined;
  createdAt?: string | undefined;
}

export interface CreateDebitNoteInput {
  firmId: string;
  originalInvoiceId: string;
  reason: string;
  additionalAmountPaise: number;
  entryDate: string;
}

export interface CreateDebitNoteResult {
  debitNote: DebitNote;
  ledgerEntry: LedgerEntry;
  dnNumber: string;
}

// =============================================================================
// Step 15 — Purchase Invoice & Line Items Types
// =============================================================================

export type PurchaseInvoiceStatus = 'POSTED' | 'VOID';

export interface PurchaseInvoice {
  id: string;
  firmId: string;
  fyId: string;
  supplierId: string;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string; // ISO 8601
  invoiceNumber: string;
  status: PurchaseInvoiceStatus;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalAmountPaise: number;
  notes: string | null;
  createdAt: string;
  postedAt: string;
}

export type NewPurchaseInvoice = Omit<PurchaseInvoice, 'id' | 'createdAt' | 'postedAt'> & {
  id?: string | undefined;
  createdAt?: string | undefined;
  postedAt?: string | undefined;
};

export interface PurchaseInvoiceItem {
  id: string;
  invoiceId: string;
  itemDescription: string;
  metalType: string | null; // GOLD | SILVER | OTHER
  grossWeightMg: number;
  purityPct: number;
  fineWeightMg: number;
  ratePerGramPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  lineTotalPaise: number;
  hsnCode: string | null;
  createdItemId: string | null;
}

export type NewPurchaseInvoiceItem = Omit<PurchaseInvoiceItem, 'id'> & {
  id?: string | undefined;
};

export interface PurchaseInvoiceItemInput {
  itemDescription: string;
  metalType?: 'GOLD' | 'SILVER' | 'OTHER' | string | null | undefined;
  grossWeightMg?: number | undefined;
  purityPct?: number | undefined;
  ratePerGramPaise?: number | undefined;
  taxableAmountPaise: number;
  cgstPaise?: number | undefined;
  sgstPaise?: number | undefined;
  lineTotalPaise?: number | undefined;
  hsnCode?: string | null | undefined;
  // FEAT-PURCHASE-AUTOSTOCK-1 (v5.26): stock line fields
  designId?: string | null | undefined;
  categoryId?: string | null | undefined;
  stoneWeightMg?: number | undefined;
  beadsWeightMg?: number | undefined;
  wastagePercent?: number | undefined;
  purityKarat?: number | undefined;
  primaryStoneId?: string | null | undefined;
  huid?: string | null | undefined;
  location?: string | null | undefined;
}

export interface PostPurchaseInvoiceInput {
  firmId: string;
  supplierId: string;
  supplierInvoiceNumber?: string | null | undefined;
  supplierInvoiceDate: string; // ISO 8601
  taxableAmountPaise: number;
  metalTaxGroupId?: string | undefined;
  makingTaxGroupId?: string | undefined;
  cgstPaise?: number | undefined;
  sgstPaise?: number | undefined;
  totalAmountPaise?: number | undefined;
  notes?: string | null | undefined;
  deviceId?: string | undefined;
  items: PurchaseInvoiceItemInput[];
}

export interface PostPurchaseInvoiceResult {
  invoice: PurchaseInvoice;
  items: PurchaseInvoiceItem[];
  createdStockItemIds: string[];
}

// =============================================================================
// Step 16 — Bank Account Master Types
// Firm bank accounts. One default per firm.
// =============================================================================

export interface BankAccount {
  id: string;
  firmId: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch: string | null;
  upiIds: string | null; // JSON array string of UPI handles
  isDefault: number; // 0 | 1
  isArchived: number; // 0 | 1
  createdAt: string; // ISO 8601
}

export type NewBankAccount = Omit<BankAccount, 'id' | 'createdAt'> & {
  id?: string | undefined;
  createdAt?: string | undefined;
};

export interface CreateBankAccountInput {
  firmId: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch?: string | null | undefined;
  upiIds?: string[] | string | null | undefined;
  isDefault?: number | boolean | undefined;
  deviceId?: string | undefined;
}

export interface UpdateBankAccountInput {
  bankName?: string | undefined;
  accountHolder?: string | undefined;
  accountNumber?: string | undefined;
  ifsc?: string | undefined;
  branch?: string | null | undefined;
  upiIds?: string[] | string | null | undefined;
  isDefault?: number | boolean | undefined;
  deviceId?: string | undefined;
}

// =============================================================================
// STEP 20: Transaction Share Service Types
// =============================================================================

export type ShareMethod = 'WHATSAPP' | 'EMAIL' | 'PRINT';

export interface ShareInvoiceOptions {
  firmId?: string | undefined;
  recipientEmail?: string | undefined;
  subject?: string | undefined;
  body?: string | undefined;
  message?: string | undefined;
  title?: string | undefined;
  isReprint?: boolean | undefined;
  customTx?: any;
}

export interface ShareInvoiceResult {
  success: boolean;
  shareMethod: ShareMethod;
  pdfUri: string;
  shareResult?: any;
}
