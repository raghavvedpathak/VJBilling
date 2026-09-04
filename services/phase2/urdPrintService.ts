// services/phase2/urdPrintService.ts — Phase 2 v2.24 Canonical Service
// Aligned with STEP 12.12, URD-BILL-DECIMAL-SPEC & URD-AMOUNT-WORDS (v1.54)

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { bisLogoRepository } from '@/repositories/phase1/bisLogoRepository';
import { ERR } from '@/constants/errorCodes';
import { amountToWords, getCurrencySymbol, formatWeightMg } from '@/utils/calculations';
import { formatDate } from '@/utils/formatDate';
import { 
  renderURDTemplate1, 
  renderURDCustomerDeclaration1, 
  renderURDCustomerDeclaration2,
  getFirmURDBillTemplateId,
  getFirmURDDeclarationTemplateId,
  URD_PRINT_FORMATS,
  type URDBillTemplateId,
  type URDDeclarationTemplateId
} from '@/templates/urd';

async function getBase64ImageUri(fileUri: string | null | undefined): Promise<string | null> {
  if (!fileUri) return null;
  if (fileUri.startsWith('data:image')) return fileUri;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    let mimeType = 'image/jpeg';
    const lower = fileUri.toLowerCase();
    if (lower.endsWith('.png')) mimeType = 'image/png';
    else if (lower.endsWith('.webp')) mimeType = 'image/webp';
    else if (lower.endsWith('.svg')) mimeType = 'image/svg+xml';

    return `data:${mimeType};base64,${base64}`;
  } catch (e) {
    console.warn('[urdPrintService] Base64 image conversion failed:', e);
    return fileUri;
  }
}

function maskAadhaar(aadhaar: string): string {
  const clean = aadhaar.replace(/\s+/g, '');
  if (clean.length >= 4) {
    return 'XXXX-XXXX-' + clean.slice(-4);
  }
  return 'XXXX-XXXX-' + clean;
}

/**
 * Generates A5 URD Purchase Bill HTML
 * Enforces firmId scoping and loads firm-specific logos, preferences, and details.
 */
export async function generateURDPurchaseBill(
  urdId: string,
  firmId: string,
  templateId?: URDBillTemplateId
): Promise<string> {
  const activeTemplateId = templateId || getFirmURDBillTemplateId(firmId);
  const urd = await urdPurchaseRepository.getById(urdId, firmId);
  if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);

  const firm = await firmRepository.getById(firmId);
  if (!firm) throw new Error(ERR.FIRM_NOT_FOUND);

  const activeBisLogo = await bisLogoRepository.findActiveByFirmId(firmId);
  const bisLogoUri = await getBase64ImageUri(activeBisLogo?.fileRef);
  const firmLogoUri = await getBase64ImageUri(firm.firmLogoRef);

  const symbol = getCurrencySymbol();
  const grossGrams = formatWeightMg(urd.grossWeightMg);
  const fineGrams = formatWeightMg(urd.fineWeightMg);

  const grossValuePaise = Math.round((urd.fineWeightMg / 1000) * urd.ratePerGramPaise);
  const adjustmentPaise = urd.totalValuePaise - grossValuePaise;
  const hasAdjustment = adjustmentPaise !== 0;
  const adjustmentSign = adjustmentPaise > 0 ? '+' : '-';
  const adjustmentRupees = (Math.abs(adjustmentPaise) / 100).toFixed(2);
  const formattedAdjustment = `${adjustmentSign}${symbol}${adjustmentRupees}`;

  const grossValueRupees = (grossValuePaise / 100).toFixed(2);
  const discountPaise = Math.max(0, grossValuePaise - urd.totalValuePaise);
  const discountRupees = (discountPaise / 100).toFixed(2);
  const hasDiscount = discountPaise > 0;

  const totalRupees = (urd.totalValuePaise / 100).toFixed(2);
  const rateRupees = (urd.ratePerGramPaise / 100).toFixed(2);
  const words = amountToWords(urd.totalValuePaise);
  const formattedDate = formatDate(urd.purchaseDate);

  let idProofHtml = '';
  if (urd.customerAadhaar) {
    const masked = maskAadhaar(urd.customerAadhaar);
    idProofHtml = `<div class="cust-row"><span class="cust-label">Aadhaar:</span><span class="cust-val">${masked}</span></div>`;
  }
  if (urd.customerPAN) {
    idProofHtml += `<div class="cust-row"><span class="cust-label">PAN:</span><span class="cust-val">${urd.customerPAN}</span></div>`;
  }

  const isBankMode =
    urd.paymentMode === 'BANK' ||
    urd.paymentMode === 'BANK_TRANSFER' ||
    urd.paymentMode === 'NEFT' ||
    urd.paymentMode === 'RTGS';

  const cashAmt = urd.paymentMode === 'CASH' ? totalRupees : '0.00';
  const bankAmt = isBankMode ? totalRupees : '0.00';
  const chequeAmt = urd.paymentMode === 'CHEQUE' ? totalRupees : '0.00';
  const upiAmt = urd.paymentMode === 'UPI' ? totalRupees : '0.00';

  const templatePayload = {
    urd,
    firm,
    bisLogoUri,
    firmLogoUri,
    symbol,
    grossGrams,
    fineGrams,
    grossValueRupees,
    adjustmentRupees,
    hasAdjustment,
    adjustmentSign,
    formattedAdjustment,
    discountRupees,
    hasDiscount,
    totalRupees,
    rateRupees,
    words,
    formattedDate,
    idProofHtml,
    cashAmt,
    bankAmt,
    chequeAmt,
    upiAmt,
  };

  return renderURDTemplate1(templatePayload);
}

/**
 * Generates Customer Declaration / Affidavit HTML
 * Supports urdDeclaration1 (Marathi Undertaking) and urdDeclaration2 (English 2-page Affidavit)
 * Enforces firmId scoping and loads firm-specific logos and details.
 */
export async function generateURDCustomerDeclaration(
  urdId: string,
  firmId: string,
  templateId?: URDDeclarationTemplateId
): Promise<string> {
  const activeTemplateId = templateId || getFirmURDDeclarationTemplateId(firmId);
  const urd = await urdPurchaseRepository.getById(urdId, firmId);
  if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);

  const firm = await firmRepository.getById(firmId);
  if (!firm) throw new Error(ERR.FIRM_NOT_FOUND);

  const firmLogoUri = await getBase64ImageUri(firm.firmLogoRef);

  const symbol = getCurrencySymbol();
  const grossGrams = formatWeightMg(urd.grossWeightMg);
  const fineGrams = formatWeightMg(urd.fineWeightMg);
  const ratePerGram = (urd.ratePerGramPaise / 100).toFixed(2);
  const totalRupees = (urd.totalValuePaise / 100).toFixed(2);
  const formattedDate = formatDate(urd.purchaseDate);

  const grossValuePaise = Math.round((urd.fineWeightMg / 1000) * urd.ratePerGramPaise);
  const adjustmentPaise = urd.totalValuePaise - grossValuePaise;
  const hasAdjustment = adjustmentPaise !== 0;
  const adjustmentSign = adjustmentPaise > 0 ? '+' : '-';
  const adjustmentRupees = (Math.abs(adjustmentPaise) / 100).toFixed(2);
  const formattedAdjustment = `${adjustmentSign}${symbol}${adjustmentRupees}`;
  const grossValueRupees = (grossValuePaise / 100).toFixed(2);

  const idProofType = urd.customerAadhaar ? 'आधार कार्ड' : (urd.customerPAN ? 'पॅन कार्ड' : 'आधार / पॅन कार्ड');
  const idProofNumber = urd.customerAadhaar
    ? maskAadhaar(urd.customerAadhaar)
    : (urd.customerPAN || '-');

  if (activeTemplateId === 'urdDeclaration2') {
    return renderURDCustomerDeclaration2({
      urd,
      firm,
      firmLogoUri,
      symbol,
      grossGrams,
      fineGrams,
      grossValueRupees,
      adjustmentRupees,
      hasAdjustment,
      adjustmentSign,
      formattedAdjustment,
      discountRupees: '0.00',
      hasDiscount: false,
      totalRupees,
      rateRupees: ratePerGram,
      words: amountToWords(urd.totalValuePaise),
      formattedDate,
      idProofHtml: '',
      cashAmt: '',
      bankAmt: '',
      chequeAmt: '',
      upiAmt: '',
    });
  }

  return renderURDCustomerDeclaration1({
    urd,
    firm,
    firmLogoUri,
    symbol,
    grossGrams,
    fineGrams,
    ratePerGram,
    grossValueRupees,
    adjustmentRupees,
    hasAdjustment,
    adjustmentSign,
    formattedAdjustment,
    totalRupees,
    formattedDate,
    idProofType,
    idProofNumber,
  });
}

/**
 * Directly prints the URD Purchase Bill in A5 Landscape format (595x420 pt).
 */
export async function printURDPurchaseBill(
  urdId: string,
  firmId: string,
  templateId?: URDBillTemplateId
): Promise<void> {
  const html = await generateURDPurchaseBill(urdId, firmId, templateId);
  await Print.printAsync({
    html,
    width: URD_PRINT_FORMATS.BILL.width,
    height: URD_PRINT_FORMATS.BILL.height,
    orientation: URD_PRINT_FORMATS.BILL.orientation,
  });
}

/**
 * Directly prints the Customer Declaration in A4 Portrait format (595x842 pt).
 */
export async function printURDCustomerDeclaration(
  urdId: string,
  firmId: string,
  templateId?: URDDeclarationTemplateId
): Promise<void> {
  const html = await generateURDCustomerDeclaration(urdId, firmId, templateId);
  await Print.printAsync({
    html,
    width: URD_PRINT_FORMATS.DECLARATION.width,
    height: URD_PRINT_FORMATS.DECLARATION.height,
    orientation: URD_PRINT_FORMATS.DECLARATION.orientation,
  });
}

export const urdPrintService = {
  generateURDPurchaseBill,
  generateURDCustomerDeclaration,
  printURDPurchaseBill,
  printURDCustomerDeclaration,
};