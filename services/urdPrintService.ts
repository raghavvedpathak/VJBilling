// services/urdPrintService.ts — Phase 2 v2.11 Canonical Service

import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../db/client';
import { urdPurchaseRepository } from '../repositories/urdPurchaseRepository';
import { firmRepository } from '../repositories/firmRepository';
import { bisLogoRepository } from '../repositories/bisLogoRepository';
import { ERR } from '../constants/errorCodes';
import { amountToWords, getCurrencySymbol } from '../utils/calculations';
import { formatWeightMg } from '../utils/purity.constants';
import { formatDate } from '../utils/formatDate';
import { renderURDTemplate1, renderURDCustomerDeclaration } from '../templates/urd';

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

export const urdPrintService = {
  /**
   * Generates standard URD Purchase Bill HTML (Template 1)
   */
  async generateURDPurchaseBill(urdId: string, firmId: string): Promise<string> {
    const urd = await urdPurchaseRepository.getById(urdId);
    if (!urd || urd.firmId !== firmId) throw new Error(ERR.URD_NOT_FOUND_OR_WRONG_FIRM);
    if (urd.status !== 'CONFIRMED') throw new Error(ERR.URD_NOT_CONFIRMED);

    const firm = await firmRepository.getById(firmId);
    if (!firm) throw new Error(ERR.FIRM_NOT_FOUND);

    const activeBisLogo = bisLogoRepository.findActiveByFirmId(firmId);
    const bisLogoUri = await getBase64ImageUri(activeBisLogo?.fileRef);
    const firmLogoUri = await getBase64ImageUri(firm.firmLogoRef);

    const symbol = getCurrencySymbol();
    const grossGrams = formatWeightMg(urd.grossWeightMg);
    const fineGrams = formatWeightMg(urd.fineWeightMg);

    const grossValuePaise = Math.round((urd.fineWeightMg / 1000) * urd.ratePerGramPaise);
    const discountPaise = Math.max(0, grossValuePaise - urd.totalValuePaise);
    const grossValueRupees = (grossValuePaise / 100).toFixed(2);
    const discountRupees = (discountPaise / 100).toFixed(2);
    const hasDiscount = discountPaise > 0;

    const totalRupees = (urd.totalValuePaise / 100).toFixed(2);
    const rateRupees = (urd.ratePerGramPaise / 100).toFixed(2);
    const words = amountToWords(urd.totalValuePaise);
    const formattedDate = formatDate(urd.purchaseDate);

    let idProofHtml = '';
    if (urd.customerAadhaar) {
      const masked = urd.customerAadhaar.length >= 4 
        ? 'XXXX-XXXX-' + urd.customerAadhaar.slice(-4) 
        : 'XXXX-XXXX-' + urd.customerAadhaar;
      idProofHtml = `<div class="cust-row"><span class="cust-label">Aadhaar:</span><span class="cust-val">${masked}</span></div>`;
    }
    if (urd.customerPAN) {
      idProofHtml += `<div class="cust-row"><span class="cust-label">PAN:</span><span class="cust-val">${urd.customerPAN}</span></div>`;
    }

    const cashAmt = urd.paymentMode === 'CASH' ? totalRupees : '0.00';
    const bankAmt = urd.paymentMode === 'BANK_TRANSFER' || urd.paymentMode === 'NEFT' ? totalRupees : '0.00';
    const chequeAmt = urd.paymentMode === 'CHEQUE' ? totalRupees : '0.00';
    const upiAmt = urd.paymentMode === 'UPI' ? totalRupees : '0.00';

    return renderURDTemplate1({
      urd,
      firm,
      bisLogoUri,
      firmLogoUri,
      symbol,
      grossGrams,
      fineGrams,
      grossValueRupees,
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
    });
  },

  /**
   * Generates Official Marathi Customer Declaration / Affidavit
   */
  async generateURDCustomerDeclaration(urdId: string, firmId: string): Promise<string> {
    const urd = await urdPurchaseRepository.getById(urdId);
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

    let idProofType = urd.customerAadhaar ? 'आधार कार्ड' : (urd.customerPAN ? 'पॅन कार्ड' : 'आधार / पॅन कार्ड');
    let idProofNumber = urd.customerAadhaar || urd.customerPAN || '-';

    return renderURDCustomerDeclaration({
      urd,
      firm,
      firmLogoUri,
      symbol,
      grossGrams,
      fineGrams,
      ratePerGram,
      totalRupees,
      formattedDate,
      idProofType,
      idProofNumber,
    });
  }
};
