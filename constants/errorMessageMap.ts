// constants/errorMessageMap.ts — Phase 3 Canonical UI Error Message Registry
// Strictly implements STEP E Registry & UI Obligation (v5.26 / v5.47)
// "The raw error code string must never be displayed to the shop owner."

import { ERR, ErrorCode } from './errorCodes';

export const ERROR_MESSAGES: Record<string, string> = {
  // --- Phase 3 Step E Canonical User-Facing Error Messages ---
  [ERR.KARIGAR_NOT_FOUND]: 'Karigar not found. Please check the karigar details and try again.',
  [ERR.SETTLEMENT_WEIGHT_INVALID]: 'Settlement fine weight must be greater than zero.',
  [ERR.SETTLEMENT_RATE_INVALID]: 'Settlement rate must be greater than zero.',
  [ERR.LINKED_METAL_ENTRY_INVALID]: 'Linked metal entry is invalid or does not belong to this karigar.',
  [ERR.SETTLEMENT_EXCEEDS_METAL_BALANCE]: 'Cannot settle more metal than is outstanding for this karigar.',
  [ERR.DUPLICATE_INVOICE_NUMBER]: 'This invoice number already exists. Please choose a different number or let the system generate one.',
  [ERR.INVOICE_NOT_DRAFT]: 'Only draft invoices can be modified or discarded.',
  [ERR.ITEM_NOT_AVAILABLE]: 'This stock item is not available in stock.',
  [ERR.ITEM_ALREADY_SOLD]: 'This stock item has already been sold in another bill.',
  [ERR.CREDIT_NOTE_NOT_VALID]: 'This credit note is invalid or does not link to the selected bill.',
  [ERR.ITEM_NOT_SOLD]: 'This item cannot be returned because it has not been marked as sold.',
  [ERR.ITEM_NOT_RETURNED]: 'This item has not been marked as returned.',
  [ERR.BANK_ACCOUNT_REQUIRED]: 'Please select a bank account for Bank/UPI payment mode.',
  [ERR.SUPPLIER_NOT_FOUND]: 'Supplier not found. Please check the supplier details and try again.',
  [ERR.PURCHASE_STOCK_LINE_INCOMPLETE]: 'Stock line is incomplete. Both category and design must be selected together.',
  [ERR.CUSTOMER_SEARCH_QUERY_TOO_SHORT]: 'Please enter at least 2 characters to search customers.',
  [ERR.SUPPLIER_SEARCH_QUERY_TOO_SHORT]: 'Please enter at least 2 characters to search suppliers.',
  [ERR.RATE_NOT_CONFIGURED]: "Today's gold/silver rates have not been entered. Please configure rates before billing.",
  [ERR.RATE_ENGINE_INVALID_INPUT]: 'All rate inputs must be positive integers in rupees.',
  [ERR.URD_BANK_ACCOUNT_REQUIRED]: 'Please select a bank account for Bank/UPI payment mode.',
  [ERR.OLD_METAL_TYPE_INVALID]: 'Old metal type must be GOLD or SILVER.',
  [ERR.PHANTOM_ITEM_ALREADY_SOLD]: 'This item was already billed in another session. Please refresh and try again.',
  [ERR.PHANTOM_NOT_YET_SOLD]: 'This phantom item has not been billed yet. Bill it first, then reconcile.',
  [ERR.PHANTOM_ALREADY_RECONCILED]: 'This phantom item has already been reconciled with a real stock entry.',
  [ERR.REAL_ITEM_NOT_AVAILABLE_FOR_RECONCILE]: 'The selected stock item is not available for reconciliation. It may have already been sold.',
  [ERR.REAL_ITEM_ALREADY_USED_FOR_RECONCILE]: 'This stock item is already linked to another phantom entry. Choose a different item.',
  [ERR.RECONCILE_DESIGN_MISMATCH]: 'The selected item has a different design than the phantom entry. Please select a matching item.',
  [ERR.RECONCILE_WEIGHT_MISMATCH]: "The selected item's weight does not match the phantom entry. Please select a matching item.",
  [ERR.RECONCILE_PURITY_MISMATCH]: "The selected item's purity does not match the phantom entry. Please select a matching item.",
  [ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS]: 'You have unreconciled phantom items. Please reconcile all phantom inventory before closing the financial year.',
  [ERR.STALE_PHANTOM_ITEMS]: 'You have phantom items that have not been reconciled for over 30 days. Please review and reconcile them promptly.',
  [ERR.PHANTOM_ITEM_NOT_FOUND]: 'Phantom item not found. Please check the entry and try again.',
  [ERR.REAL_ITEM_NOT_FOUND]: 'Stock item not found. Please check the entry and try again.',
  [ERR.ENTRY_DATE_IN_CLOSED_FY]: 'This date belongs to a closed financial year. You cannot add entries to a closed FY. Use a reversal entry to correct prior-period transactions.',
  [ERR.PAYMENT_INVOICE_MISMATCH]: 'This payment cannot be linked to the selected bill. The bill does not belong to this party.',
  [ERR.BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH]: 'Bank account must not be provided for Cash payments.',
  [ERR.INVALID_PAYMENT_AMOUNT]: 'Payment amount must be greater than zero.',
  [ERR.SUPPLIER_METAL_PAYMENT_INVALID]: 'Please enter the metal purity and rate to record a metal payment.',
  [ERR.SUPPLIER_PAYMENT_NOTHING_TO_PAY]: 'Please enter a metal amount, a cash amount, or both to record a payment.',
  [ERR.KARIGAR_PAYMENT_NOTHING_TO_PAY]: 'Please enter a metal amount, a cash amount, or both to record a karigar payment.',
  [ERR.PHANTOM_RECONCILE_BROKEN]: 'A reconciled phantom item was returned. Both inventory links have been reset. Please verify stock.',
  [ERR.AMOUNT_WORDS_EMPTY]: 'Invoice PDF cannot be generated. Internal error: amount-in-words is empty.',
  [ERR.ESTIMATE_NOT_FOUND]: 'Estimate not found. It may have been deleted or does not belong to this account.',
  [ERR.ESTIMATE_EXPIRED]: 'This estimate has expired. Please create a new estimate with current prices.',
  [ERR.ESTIMATE_NOT_SAVED]: 'Only saved estimates can be converted to an invoice. Please save the estimate first.',
  [ERR.FIRM_NOT_FOUND]: 'Firm not found. Please restart the app and try again.',
  [ERR.INVOICE_NOT_FOUND]: 'Invoice not found. The original invoice may have been deleted or does not belong to this firm.',
  [ERR.FIRM_INVOICE_MISMATCH]: 'This invoice does not belong to your account.',
  [ERR.INVOICE_NOT_POSTED]: 'Debit notes can only be raised against posted invoices.',
  [ERR.DEBIT_NOTE_AMOUNT_ZERO]: 'Debit note amount must be greater than zero.',
  [ERR.DEBIT_NOTE_REASON_EMPTY]: 'Please enter a reason for the debit note.',
  [ERR.TAXABLE_AMOUNT_ZERO]: 'Taxable amount must be greater than zero.',
  [ERR.LOOSE_STOCK_DESIGN_TYPE_MISMATCH]: 'Design must have stock type LOOSE to be entered as loose stock.',
  [ERR.LOOSE_STOCK_QUANTITY_INVALID]: 'Piece count must be greater than zero.',
  [ERR.LOOSE_STOCK_WEIGHT_INVALID]: 'Total weight must be greater than zero.',
  [ERR.LOOSE_LOT_NOT_FOUND_OR_WRONG_FIRM]: 'Loose stock lot not found or does not belong to this firm.',
  [ERR.LOOSE_LOT_INSUFFICIENT_QUANTITY]: 'Quantity sold exceeds available pieces in this loose stock lot.',
  [ERR.LOOSE_LOT_INSUFFICIENT_WEIGHT]: 'Weight sold exceeds available weight in this loose stock lot.',

  // --- Step 0 Tax Master Messages ---
  [ERR.TAX_GROUP_INVALID_COMPONENTS]: 'Tax Group must contain exactly one CGST and one SGST component.',
  [ERR.TAX_GROUP_ASYMMETRIC_RATES]: 'CGST rate must equal SGST rate for intra-state GST.',
  [ERR.TAX_RATE_IN_USE]: 'Cannot deactivate tax rate that is currently in use by an active Tax Group.',
  [ERR.TAX_GROUP_IN_USE]: 'Cannot deactivate tax group that is referenced by past invoices.',
  [ERR.DUPLICATE_TAX_RATE_NAME]: 'A tax rate with this name already exists for your firm.',
  [ERR.RATE_BPS_IMMUTABLE]: 'Tax rate basis points are immutable once created.',

  // --- Step 19 Financial Integrity Checks (Checks 1 to 10) ---
  [ERR.CHECK_1_INVOICE_NO_LEDGER]: 'Posted invoice has no ledger entry. Customer receivable not recorded. System has entered Safe Mode.',
  [ERR.CHECK_2_MONEY_OUT_STALE_30_DAYS]: 'Pending MONEY_OUT payment has remained uncompleted for over 30 days. System has entered Safe Mode.',
  [ERR.CHECK_3_PAYMENT_ORPHAN_PARTY]: 'Payment record references an invalid or non-existent party.',
  [ERR.CHECK_4_OLD_METAL_LOT_NO_RECORD]: 'Old metal lot has no purchase record (missing saleInvoiceId and urdPurchaseId).',
  [ERR.CHECK_5_INVOICE_TAMPER]: 'Invoice net payable amount does not match recalculated value. Exact integer match required. System has entered Safe Mode.',
  [ERR.CHECK_6_DEBIT_NOTE_BAD_REF]: 'Debit note references an invalid or non-existent original invoice.',
  [ERR.CHECK_7_PARTIAL_CN_LOTS]: 'Partial Credit Note returned item was not reversed to inventory.',
  [ERR.CHECK_8_NEGATIVE_PAYABLE_NO_MONEY_OUT]: 'Data integrity violated: A posted invoice with negative net payable has no corresponding MONEY_OUT payment record. System has entered Safe Mode.',
  [ERR.CHECK_9_OLD_METAL_CREDIT_MISSING]: 'Old metal sale invoice is missing its matching customer CREDIT ledger entry. System has entered Safe Mode.',
  [ERR.CHECK_10_KARIGAR_METAL_AGGREGATE]: 'Karigar fine metal aggregate integrity violated: total fine metal returned or settled exceeds total fine metal issued. System has entered Safe Mode.',

  // --- Step 12 Old Metal & Excess Settlement Messages ---
  [ERR.EXCESS_SETTLEMENT_CHOICE_REQUIRED]: 'Old metal trade-in value exceeds the invoice total. Please choose whether to Pay Now or Pay Later before posting the invoice.',
  [ERR.BANK_NAME_REQUIRED]: 'Bank name is required.',
  [ERR.ACCOUNT_HOLDER_REQUIRED]: 'Account holder name is required.',
  [ERR.ACCOUNT_NUMBER_REQUIRED]: 'Account number is required.',
  [ERR.IFSC_REQUIRED]: 'IFSC code is required.',
  [ERR.IFSC_INVALID]: 'Invalid IFSC code. It must be an 11-character code (e.g., SBIN0001234).',
  [ERR.BANK_ACCOUNT_NOT_FOUND]: 'Bank account not found.',
  [ERR.BANK_ACCOUNT_ALREADY_ARCHIVED]: 'This bank account is already archived.',
  [ERR.DEFAULT_BANK_ACCOUNT_CANNOT_BE_ARCHIVED]: 'The default bank account cannot be archived while other active accounts exist. Please set another default bank account first.',
  [ERR.INVALID_SHARE_METHOD]: 'Invalid share method specified. Supported methods are WhatsApp, Email, or Print.',
  [ERR.EMAIL_NOT_AVAILABLE]: 'Email service is not available or configured on this device.',
};

/**
 * Returns a human-friendly, user-facing error message for any error or error code.
 * Ensures the raw error string constant is NEVER shown to the shop owner.
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  let code = '';

  if (typeof error === 'string') {
    code = error.trim();
  } else if (error instanceof Error) {
    code = error.message.trim();
  } else if (typeof error === 'object' && 'message' in (error as any)) {
    code = String((error as any).message).trim();
  }

  // Handle prefix patterns like "ILLEGAL_OPERATION: CODE" or "ERROR: CODE"
  if (code.includes(':')) {
    const parts = code.split(':');
    const potentialCode = parts[parts.length - 1].trim();
    if (ERROR_MESSAGES[potentialCode]) {
      return ERROR_MESSAGES[potentialCode];
    }
    const prefixCode = parts[0].trim();
    if (ERROR_MESSAGES[prefixCode]) {
      return ERROR_MESSAGES[prefixCode];
    }
  }

  if (ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  // Fallback to error message if it's already a full sentence, or generic message
  if (typeof error === 'object' && error instanceof Error && error.message.length > 20 && error.message.includes(' ')) {
    return error.message;
  }

  return 'An unexpected error occurred. Please check the details and try again.';
}
