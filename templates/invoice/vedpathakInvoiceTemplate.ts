// templates/invoice/vedpathakInvoiceTemplate.ts — Phase 3 STEP 18A: Invoice HTML Template Specification
// Exact Vedpathak Jewellers TAX INVOICE layout (FIX-INVOICE-PDFTEMPLATE-1 v5.15).
// All 11 sections locked. Auto-height item rows. Minimum 5 empty rows padding.
// AMOUNTS: display in rupees (paise / 100). WEIGHTS: display in grams (mg / 1000, 3 decimal places).
// Amount in Words: mandatory (G67-AMOUNTTOWORDS) with runtime AMOUNT_WORDS_EMPTY guard (FIX-V520-8).
// DUPLICATE watermark if reprint.
// FORBIDDEN: hardcoding shop name/GSTIN into template · omitting Amount in Words · fixed-height item rows.

import type { InvoiceTemplateParams } from './invoiceTemplate.types';
import { formatDate } from '@/utils/formatDate';
import { getCurrencySymbol, amountToWords } from '@/utils/currency';

function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '0.00';
  const rupees = paise / 100;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWeightGrams(mg: number | null | undefined): string {
  if (mg === null || mg === undefined) return '0.000';
  return (mg / 1000).toFixed(3);
}

export function renderVedpathakInvoiceTemplate(params: InvoiceTemplateParams): string {
  const {
    invoice,
    items,
    firm,
    customer,
    amountWords,
    customAmountWords,
    payments = [],
    oldMetalLot,
    oldMetalItems = [],
    defaultBank,
    printSettings,
    options,
  } = params;

  // SECTION 10 GUARD & RESOLUTION (G67-AMOUNTTOWORDS + FIX-V520-8)
  const resolvedAmountWords =
    customAmountWords !== undefined
      ? customAmountWords
      : amountWords !== undefined && amountWords !== ''
      ? amountWords
      : amountToWords(invoice.netPayablePaise);

  if (!resolvedAmountWords || resolvedAmountWords.trim() === '') {
    throw new Error('AMOUNT_WORDS_EMPTY');
  }

  const isGSTRegistered = Boolean(firm?.isGSTRegistered ?? (firm?.gstin && String(firm.gstin).trim() !== ''));
  const docTitle = isGSTRegistered ? 'TAX INVOICE' : 'BILL OF SUPPLY';
  const currencySymbol = getCurrencySymbol();
  const isReprint = Boolean(options?.isReprint ?? (params as any)?.isReprint);
  const firmName = firm?.firmName || firm?.name || 'Vedpathak Jewellers';
  const proprietor = firm?.proprietor || firm?.ownerName || '';

  // Formatting addresses
  const fullFirmAddress = [
    firm?.addressLine1,
    firm?.addressLine2,
    firm?.city,
    firm?.stateName ? (firm?.pincode ? `${firm.stateName} - ${firm.pincode}` : firm.stateName) : firm?.pincode,
  ]
    .filter((p) => p && String(p).trim().length > 0)
    .join(', ');

  const firmPhones = [firm?.phone1, firm?.phone2, firm?.phone3]
    .filter((p) => p && String(p).trim().length > 0)
    .join(', ');

  const formattedInvoiceDate = formatDate(invoice.invoiceDate);

  const inv = invoice as any;
  const cust = customer as any;

  // Customer contact & location
  const customerMobile = customer?.mobile || cust?.phone || '-';
  const customerAddress = customer?.address || '-';
  const customerGstin = customer?.gstin || 'URD / Unregistered';
  const placeOfSupply = cust?.stateCode
    ? `${cust.stateCode} - ${cust?.stateName || 'Maharashtra'}`
    : firm?.stateCode
    ? `${firm.stateCode} - ${firm?.stateName || 'Maharashtra'}`
    : '27 - Maharashtra';

  // SECTION 5: ITEMS ROWS with Auto-Height & Minimum 5 Rows Padding
  const renderedItemRows = items.map((item, idx) => {
    const grossGrams = formatWeightGrams(item.grossWeightMg ?? item.weightSoldMg);
    const netGrams = formatWeightGrams(item.netWeightMg ?? item.weightSoldMg);
    const rateRupees = formatPaise(invoice.metalRatePaisePerGram);
    const taxablePaise =
      (item as any).totalPricePaise !== undefined && (item as any).totalPricePaise !== null
        ? (item as any).totalPricePaise
        : item.lineTotalPaise !== undefined && item.lineTotalPaise !== null
        ? item.lineTotalPaise
        : (item.metalValuePaise || 0) + (item.makingChargesPaise || 0);
    const taxableRupees = formatPaise(taxablePaise);
    const itemHuid = item.huid || (item as any).huid;
    const huidOrSku = itemHuid && String(itemHuid).trim() !== '' ? String(itemHuid) : item.sku || '-';

    return `
      <tr class="item-row">
        <td class="col-center col-num">${idx + 1}</td>
        <td class="col-left col-name">
          <div class="item-title">${item.itemName}</div>
          ${item.sku && huidOrSku !== item.sku ? `<div class="item-sub">SKU: ${item.sku}</div>` : ''}
          ${item.fineWeightMg ? `<div class="item-sub">Fine Wt: ${formatWeightGrams(item.fineWeightMg)}g${item.purityPct ? ` (${item.purityPct}%)` : ''}</div>` : ''}
        </td>
        <td class="col-center col-huid">${huidOrSku}</td>
        <td class="col-center col-hsn">${item.hsnCode || '7113'}</td>
        <td class="col-right col-wt">${grossGrams}g</td>
        <td class="col-right col-wt">${netGrams}g</td>
        <td class="col-right col-rate">${currencySymbol}${rateRupees}/g</td>
        <td class="col-right col-amount">${currencySymbol}${taxableRupees}</td>
      </tr>
    `;
  });

  // Pad to at least 5 rows total
  const minRows = 5;
  const paddingRowsNeeded = Math.max(0, minRows - items.length);
  for (let i = 0; i < paddingRowsNeeded; i++) {
    renderedItemRows.push(`
      <tr class="item-row blank-row">
        <td class="col-center col-num">&nbsp;</td>
        <td class="col-left col-name">&nbsp;</td>
        <td class="col-center col-huid">&nbsp;</td>
        <td class="col-center col-hsn">&nbsp;</td>
        <td class="col-right col-wt">&nbsp;</td>
        <td class="col-right col-wt">&nbsp;</td>
        <td class="col-right col-rate">&nbsp;</td>
        <td class="col-right col-amount">&nbsp;</td>
      </tr>
    `);
  }

  // SECTION 6: TAX CALCULATIONS
  const taxableAmountPaise =
    inv.taxableAmountPaise ??
    (inv.subtotalPaise !== undefined
      ? inv.subtotalPaise - (inv.totalDiscountPaise || invoice.discountPaise || 0)
      : (invoice.taxableMetalAmtPaise || 0) + (invoice.taxableMakingAmtPaise || 0));

  const cgstPaise = inv.cgstAmountPaise ?? invoice.cgstPaise ?? 0;
  const sgstPaise = inv.sgstAmountPaise ?? invoice.sgstPaise ?? 0;
  const igstPaise = inv.igstAmountPaise ?? inv.igstPaise ?? 0;
  const totalTaxPaise = inv.totalTaxPaise ?? cgstPaise + sgstPaise + igstPaise;

  const isInterState = igstPaise > 0;
  const taxRowsHtml = isInterState
    ? `
      <tr>
        <td>IGST @ 3%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(taxableAmountPaise)}</td>
        <td style="text-align: center;">3.0%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(igstPaise)}</td>
      </tr>
    `
    : `
      <tr>
        <td>CGST @ 1.5%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(taxableAmountPaise)}</td>
        <td style="text-align: center;">1.5%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(cgstPaise)}</td>
      </tr>
      <tr>
        <td>SGST @ 1.5%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(taxableAmountPaise)}</td>
        <td style="text-align: center;">1.5%</td>
        <td style="text-align: right;">${currencySymbol}${formatPaise(sgstPaise)}</td>
      </tr>
    `;

  // SECTION 7: OLD ORNAMENTS (CONDITIONAL)
  const hasOldMetal = (invoice.oldMetalDeductionPaise || 0) > 0 || oldMetalItems.length > 0 || (oldMetalLot && oldMetalLot.grossWeightMg > 0);
  let oldOrnamentsHtml = '';
  if (hasOldMetal) {
    let rows = '';
    if (oldMetalItems.length > 0) {
      rows = oldMetalItems
        .map(
          (omi) => `
          <tr>
            <td>${omi.description || 'Old Gold Ornaments'}</td>
            <td style="text-align: right;">${omi.grossWeightMg ? `${formatWeightGrams(omi.grossWeightMg)}g` : '-'}</td>
            <td style="text-align: center;">${omi.purityPercent ? `${omi.purityPercent}%` : '-'}</td>
            <td style="text-align: right;">${omi.purchaseRatePaise ? `${currencySymbol}${formatPaise(omi.purchaseRatePaise)}/g` : '-'}</td>
            <td style="text-align: right; font-weight: 600;">${currencySymbol}${formatPaise(omi.netAmountPaise ?? invoice.oldMetalDeductionPaise)}</td>
          </tr>
        `
        )
        .join('');
    } else if (oldMetalLot) {
      const oldWt = oldMetalLot.grossWeightMg ? formatWeightGrams(oldMetalLot.grossWeightMg) : '-';
      const oldPurity = oldMetalLot.purityPercent ? `${oldMetalLot.purityPercent}%` : '-';
      const oldRate = oldMetalLot.purchaseRatePaise ? `${currencySymbol}${formatPaise(oldMetalLot.purchaseRatePaise)}/g` : '-';
      const oldAmount = formatPaise(invoice.oldMetalDeductionPaise);

      rows = `
        <tr>
          <td>Old Gold Ornaments</td>
          <td style="text-align: right;">${oldWt}${oldWt !== '-' ? 'g' : ''}</td>
          <td style="text-align: center;">${oldPurity}</td>
          <td style="text-align: right;">${oldRate}</td>
          <td style="text-align: right; font-weight: 600;">${currencySymbol}${oldAmount}</td>
        </tr>
      `;
    } else {
      rows = `
        <tr>
          <td>Old Gold Ornaments</td>
          <td style="text-align: right;">-</td>
          <td style="text-align: center;">-</td>
          <td style="text-align: right;">-</td>
          <td style="text-align: right; font-weight: 600;">${currencySymbol}${formatPaise(invoice.oldMetalDeductionPaise)}</td>
        </tr>
      `;
    }

    oldOrnamentsHtml = `
      <!-- SECTION 7: OLD ORNAMENTS TABLE (CONDITIONAL) -->
      <div class="old-ornaments-container" style="margin-top: 10px; margin-bottom: 10px;">
        <div style="font-weight: 700; font-size: 10px; text-transform: uppercase; color: #C0392B; margin-bottom: 4px;">Old Ornaments Details / जुने दागिने तपशील</div>
        <table class="data-table old-ornaments-table">
          <thead>
            <tr>
              <th style="width: 30%;">Description</th>
              <th style="width: 18%; text-align: right;">Gross Wt</th>
              <th style="width: 16%; text-align: center;">Purity %</th>
              <th style="width: 18%; text-align: right;">Rate</th>
              <th style="width: 18%; text-align: right;">Net Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // SECTION 8 & 9: PAYMENTS & SUMMARY
  const totalReceivedPaise =
    payments.length > 0
      ? payments.reduce((sum, p) => sum + (p.amountPaise || 0), 0)
      : inv.paidAmountPaise !== undefined
      ? inv.paidAmountPaise
      : invoice.netPayablePaise || 0;

  const balanceDuePaise =
    inv.balanceDuePaise !== undefined
      ? inv.balanceDuePaise
      : Math.max(0, (invoice.netPayablePaise || 0) - totalReceivedPaise);

  const paymentMode = inv.paymentMode || 'CASH';

  const paymentRowsHtml =
    payments.length > 0
      ? payments
          .map(
            (p) => `
          <tr>
            <td style="font-weight: 600;">${p.paymentMode || p.mode || 'CASH'}</td>
            <td>${p.referenceNumber || p.notes || `Payment received (${currencySymbol}${formatPaise(p.amountPaise)})`}</td>
            <td style="text-align: right; font-weight: 600;">${currencySymbol}${formatPaise(p.amountPaise)}</td>
          </tr>
        `
          )
          .join('')
      : `
          <tr>
            <td style="font-weight: 600;">${paymentMode}</td>
            <td>Payment received (${currencySymbol}${formatPaise(totalReceivedPaise)})</td>
            <td style="text-align: right; font-weight: 600;">${currencySymbol}${formatPaise(totalReceivedPaise)}</td>
          </tr>
        `;

  const paperSize = printSettings?.paperSize || 'A4';
  const orientation = printSettings?.orientation || 'PORTRAIT';
  const pageSizeRule = `${paperSize} ${orientation.toLowerCase()}`;

  const grossPaise = inv.subtotalPaise ?? taxableAmountPaise;
  const discountPaise = inv.totalDiscountPaise ?? invoice.discountPaise ?? 0;

  return `
<!DOCTYPE html>
<html lang="mr">
<head>
  <meta charset="utf-8">
  <title>${docTitle} - ${invoice.invoiceNumber || 'DRAFT'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi&family=Poppins:wght@400;500;600;700;800&display=swap');
    @page {
      size: ${pageSizeRule};
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Poppins', 'Tiro Devanagari Marathi', -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      font-size: 11px;
      color: #1e293b;
      background-color: #ffffff;
      line-height: 1.35;
    }
    .container {
      width: 100%;
      position: relative;
    }

    /* DUPLICATE WATERMARK */
    ${
      isReprint
        ? `
    .watermark {
      position: fixed;
      top: 35%;
      left: 10%;
      font-size: 72pt;
      font-weight: 900;
      color: rgba(192, 57, 43, 0.12);
      transform: rotate(-35deg);
      user-select: none;
      z-index: 9999;
      pointer-events: none;
      letter-spacing: 12px;
      text-transform: uppercase;
      font-family: 'Poppins', sans-serif;
    }
    `
        : ''
    }

    /* SECTION 1: BLESSING HEADER ROW */
    .blessing-row, .blessing-header {
      background-color: #C0392B;
      color: #ffffff;
      font-family: 'Tiro Devanagari Marathi', serif;
      font-weight: 700;
      font-size: 10pt;
      padding: 4px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      letter-spacing: 0.5px;
    }

    /* SECTION 2: GSTIN BAR */
    .gstin-bar {
      font-size: 9pt;
      font-weight: 700;
      color: #1e293b;
      padding: 3px 2px 2px 2px;
      text-align: left;
    }

    /* SECTION 3: SHOP TITLE BLOCK */
    .shop-title-block {
      text-align: center;
      padding: 4px 0 6px 0;
      border-bottom: 1.5px solid #C0392B;
      margin-bottom: 8px;
    }
    .doc-type-title {
      font-size: 11pt;
      font-weight: 800;
      color: #C0392B;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .firm-main-name {
      font-size: 18pt;
      font-weight: 800;
      color: #1A1A1A;
      letter-spacing: 0.5px;
      line-height: 1.15;
      margin-bottom: 2px;
    }
    .firm-address-line {
      font-size: 8pt;
      font-style: italic;
      color: #475569;
      margin-bottom: 3px;
    }
    .shop-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #334155;
      font-weight: 600;
      padding-top: 2px;
    }
    .proprietor-label {
      font-family: 'Tiro Devanagari Marathi', sans-serif;
    }

    /* SECTION 4: CUSTOMER + INVOICE DETAILS */
    .details-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #D0D0D0;
      margin-bottom: 10px;
      background-color: #fafaf9;
    }
    .details-table td {
      padding: 6px 10px;
      vertical-align: top;
      width: 50%;
    }
    .details-table td:first-child {
      border-right: 1px solid #D0D0D0;
    }
    .detail-heading {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #C0392B;
      margin-bottom: 3px;
    }
    .detail-row {
      margin-bottom: 2px;
      font-size: 11px;
    }
    .detail-row strong {
      color: #1e293b;
    }

    /* GENERAL TABLE STYLES */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .data-table th {
      background-color: #C0392B;
      color: #ffffff;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      padding: 5px 6px;
      border: 0.5px solid #991b1b;
      letter-spacing: 0.3px;
    }
    .data-table td {
      padding: 5px 6px;
      border: 0.5px solid #E0E0E0;
      font-size: 10.5px;
    }

    /* SECTION 5: ITEMS TABLE AUTO-HEIGHT */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    .items-table th {
      background-color: #C0392B;
      color: #ffffff;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      padding: 6px 6px;
      border: 0.5px solid #991b1b;
    }
    .items-table td {
      padding: 5px 6px;
      border: 0.5px solid #E0E0E0;
      font-size: 10.5px;
      /* Auto-height behavior: row height adjusts to content */
      height: auto;
    }
    .items-table tr:nth-child(even):not(.blank-row) {
      background-color: #FDF8F7;
    }
    .item-row.blank-row td {
      height: 22px;
    }
    .col-num { width: 30px; }
    .col-name { width: auto; }
    .col-huid { width: 90px; }
    .col-hsn { width: 55px; }
    .col-wt { width: 75px; }
    .col-rate { width: 95px; }
    .col-amount { width: 100px; }

    .col-center { text-align: center; }
    .col-left { text-align: left; }
    .col-right { text-align: right; }

    .item-title { font-weight: 600; color: #0f172a; }
    .item-sub { font-size: 9.5px; color: #64748b; }

    /* 2-COLUMN SECTION: SECTION 6 & 8 & 9 */
    .two-col-layout {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .two-col-layout > tbody > tr > td {
      vertical-align: top;
      padding: 0;
    }
    .left-col {
      width: 52%;
      padding-right: 12px !important;
    }
    .right-col {
      width: 48%;
    }

    /* SECTION 6: TAX SUMMARY TABLE */
    .tax-summary-table th {
      background-color: #e2e8f0;
      color: #334155;
      font-weight: 700;
      font-size: 9.5px;
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
    }
    .tax-summary-table td {
      font-size: 10px;
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
    }

    /* SECTION 8: PAYMENT SUMMARY (RIGHT-ALIGNED BLOCK) */
    .payment-summary-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #D0D0D0;
      background-color: #fafaf9;
    }
    .payment-summary-table td {
      padding: 4px 8px;
      font-size: 10.5px;
      border-bottom: 1px solid #e2e8f0;
    }
    .net-amount-row {
      font-weight: 800;
      font-size: 12pt;
      background-color: #fff1f2;
      border-top: 1.5px solid #C0392B;
      border-bottom: 1.5px solid #C0392B;
    }
    .net-amount-row td {
      color: #C0392B;
      padding: 6px 8px;
    }

    /* SECTION 9: PAYMENT MODE TABLE */
    .payment-mode-table {
      margin-top: 8px;
    }
    .payment-mode-table th {
      background-color: #e2e8f0;
      color: #334155;
      font-weight: 700;
      font-size: 9.5px;
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
    }
    .payment-mode-table td {
      font-size: 10px;
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
    }

    /* SECTION 10: AMOUNT IN WORDS */
    .amount-in-words-container, .amount-in-words {
      width: 100%;
      margin: 8px 0 12px 0;
      padding: 6px 10px;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #C0392B;
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.4;
    }

    /* BANK DETAILS & TERMS (SUPPLEMENTARY) */
    .bank-and-terms-box {
      margin-bottom: 12px;
      font-size: 9pt;
      color: #475569;
      line-height: 1.35;
    }

    /* SECTION 11: SIGNATURE ROW */
    .signature-row {
      width: 100%;
      border-top: 1px solid #cbd5e1;
      padding-top: 25px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 10pt;
      font-weight: 600;
      color: #1e293b;
    }
    .sign-col-left { text-align: left; width: 32%; }
    .sign-col-center { text-align: center; width: 36%; font-style: italic; color: #64748b; font-size: 9pt; }
    .sign-col-right { text-align: right; width: 32%; }
  </style>
</head>
<body>
  ${isReprint ? `<div class="watermark">DUPLICATE</div>` : ''}

  <div class="container">
    <!-- ━━ SECTION 1: BLESSING HEADER ROW ━━ -->
    <div class="blessing-row blessing-header">
      <span class="blessing-left">|| श्री भगवतंप्रसन्न ||</span>
      <span class="blessing-right">|| श्री गणेश प्रसन्न ||</span>
    </div>

    <!-- ━━ SECTION 2: GSTIN BAR ━━ -->
    ${
      isGSTRegistered && firm?.gstin
        ? `<div class="gstin-bar">GSTIN: <strong>${firm.gstin}</strong></div>`
        : `<div class="gstin-bar">&nbsp;</div>`
    }

    <!-- ━━ SECTION 3: SHOP TITLE BLOCK ━━ -->
    <div class="shop-title-block">
      <div class="doc-type-title">${docTitle}</div>
      <div class="firm-main-name">${firmName}</div>
      <div class="firm-address-line">${fullFirmAddress}</div>
      <div class="shop-meta-row">
        <div class="proprietor-label">${proprietor ? `प्रोप्रा. ${proprietor}` : ''}</div>
        <div>${firmPhones ? `Phone: ${firmPhones}` : ''}</div>
      </div>
    </div>

    <!-- ━━ SECTION 4: CUSTOMER + INVOICE DETAILS (2-column) ━━ -->
    <table class="details-table">
      <tr>
        <td>
          <div class="detail-heading">Customer Details:</div>
          <div class="detail-row"><strong>M/s / Shri:</strong> ${customer?.name || 'Walk-in Customer'}</div>
          <div class="detail-row"><strong>Address:</strong> ${customerAddress}</div>
          <div class="detail-row"><strong>Mobile:</strong> ${customerMobile}</div>
          <div class="detail-row"><strong>GSTIN:</strong> ${customerGstin}</div>
        </td>
        <td>
          <div class="detail-heading">Invoice Details:</div>
          <div class="detail-row"><strong>Invoice No:</strong> ${invoice.invoiceNumber || 'DRAFT'}</div>
          <div class="detail-row"><strong>Invoice Date:</strong> ${formattedInvoiceDate}</div>
          <div class="detail-row"><strong>Payment Mode:</strong> ${paymentMode}</div>
          <div class="detail-row"><strong>Place of Supply:</strong> ${placeOfSupply}</div>
        </td>
      </tr>
    </table>

    <!-- ━━ SECTION 5: ITEMS TABLE (AUTO-HEIGHT, MIN 5 ROWS) ━━ -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-name">Item Name / Description</th>
          <th class="col-huid">HUID</th>
          <th class="col-hsn">HSN</th>
          <th class="col-wt" style="text-align: right;">Gross Wt (g)</th>
          <th class="col-wt" style="text-align: right;">Net Wt (g)</th>
          <th class="col-rate" style="text-align: right;">Rate (₹/g)</th>
          <th class="col-amount" style="text-align: right;">Taxable Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${renderedItemRows.join('')}
      </tbody>
    </table>

    <!-- ━━ SECTION 6, 8, 9: TAX SUMMARY & PAYMENT BLOCK ━━ -->
    <table class="two-col-layout">
      <tbody>
        <tr>
          <!-- LEFT COLUMN: TAX SUMMARY & PAYMENT DETAILS -->
          <td class="left-col">
            <!-- ━━ SECTION 6: TAX SUMMARY TABLE ━━ -->
            <div style="font-weight: 700; font-size: 10px; text-transform: uppercase; color: #C0392B; margin-bottom: 4px;">Tax Summary</div>
            <table class="data-table tax-summary-table">
              <thead>
                <tr>
                  <th>Tax Type</th>
                  <th style="text-align: right;">Taxable Amount</th>
                  <th style="text-align: center;">Rate</th>
                  <th style="text-align: right;">Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                ${taxRowsHtml}
              </tbody>
              <tfoot>
                <tr style="font-weight: 700; background-color: #f1f5f9;">
                  <td colspan="3">Total Tax</td>
                  <td style="text-align: right;">${currencySymbol}${formatPaise(totalTaxPaise)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- ━━ SECTION 9: PAYMENT MODE TABLE ━━ -->
            <div style="font-weight: 700; font-size: 10px; text-transform: uppercase; color: #C0392B; margin-bottom: 4px; margin-top: 6px;">Payment Details</div>
            <table class="data-table payment-mode-table">
              <thead>
                <tr>
                  <th style="width: 25%;">Mode</th>
                  <th style="width: 50%;">Reference / Cheque No</th>
                  <th style="width: 25%; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${paymentRowsHtml}
              </tbody>
            </table>
          </td>

          <!-- RIGHT COLUMN: PAYMENT SUMMARY BLOCK -->
          <td class="right-col">
            <!-- ━━ SECTION 8: PAYMENT SUMMARY (RIGHT-ALIGNED BLOCK) ━━ -->
            <table class="payment-summary-table">
              <tr>
                <td>Gross Amount:</td>
                <td style="text-align: right;">${currencySymbol}${formatPaise(grossPaise)}</td>
              </tr>
              ${
                (invoice.taxableMetalAmtPaise || 0) > 0
                  ? `
              <tr style="font-size: 9.5px; color: #64748b;">
                <td style="padding-left: 12px;">Taxable Metal Amount:</td>
                <td style="text-align: right;">${currencySymbol}${formatPaise(invoice.taxableMetalAmtPaise)}</td>
              </tr>`
                  : ''
              }
              ${
                (invoice.taxableMakingAmtPaise || 0) > 0
                  ? `
              <tr style="font-size: 9.5px; color: #64748b;">
                <td style="padding-left: 12px;">Making Charges:</td>
                <td style="text-align: right;">${currencySymbol}${formatPaise(invoice.taxableMakingAmtPaise)}</td>
              </tr>`
                  : ''
              }
              ${
                (invoice.oldMetalDeductionPaise || 0) > 0
                  ? `
              <tr style="color: #15803d;">
                <td>Old Ornaments:</td>
                <td style="text-align: right;">-${currencySymbol}${formatPaise(invoice.oldMetalDeductionPaise)}</td>
              </tr>`
                  : ''
              }
              ${
                discountPaise > 0
                  ? `
              <tr style="color: #15803d;">
                <td>Discount:</td>
                <td style="text-align: right;">-${currencySymbol}${formatPaise(discountPaise)}</td>
              </tr>`
                  : ''
              }
              ${
                (invoice.roundOffPaise || 0) !== 0
                  ? `
              <tr>
                <td>Round Off:</td>
                <td style="text-align: right;">${invoice.roundOffPaise > 0 ? '+' : ''}${currencySymbol}${formatPaise(invoice.roundOffPaise)}</td>
              </tr>`
                  : ''
              }
              <tr class="net-amount-row">
                <td>Net Payable:</td>
                <td style="text-align: right;">${currencySymbol}${formatPaise(invoice.netPayablePaise)}</td>
              </tr>
              <tr>
                <td>Amount Received:</td>
                <td style="text-align: right; font-weight: 600; color: #15803d;">${currencySymbol}${formatPaise(totalReceivedPaise)}</td>
              </tr>
              <tr style="font-weight: 700; ${balanceDuePaise > 0 ? 'color: #b91c1c;' : 'color: #15803d;'}">
                <td>Balance Due:</td>
                <td style="text-align: right;">${currencySymbol}${formatPaise(balanceDuePaise)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- ━━ SECTION 7: OLD ORNAMENTS TABLE (CONDITIONAL) ━━ -->
    ${oldOrnamentsHtml}

    <!-- ━━ SECTION 10: AMOUNT IN WORDS ━━ -->
    <div class="amount-in-words-container amount-in-words">
      <strong>Amount in Words:</strong> ${resolvedAmountWords}
    </div>

    <!-- BANK DETAILS & TERMS AND CONDITIONS (SUPPLEMENTARY) -->
    ${
      defaultBank || (printSettings?.showTermsAndConditions && printSettings.termsAndConditionsText)
        ? `
    <div class="bank-and-terms-box">
      ${
        defaultBank
          ? `
      <div><strong>Bank Account Details:</strong> Bank: ${defaultBank.bankName} | A/C No: ${defaultBank.accountNumber} | IFSC: ${defaultBank.ifsc}${defaultBank.branch ? ` | Branch: ${defaultBank.branch}` : ''}</div>
      `
          : ''
      }
      ${
        printSettings?.showTermsAndConditions && printSettings.termsAndConditionsText
          ? `
      <div style="margin-top: 3px;"><strong>Terms & Conditions:</strong> ${printSettings.termsAndConditionsText.replace(/\n/g, ' ')}</div>
      `
          : ''
      }
    </div>
    `
        : ''
    }

    <!-- ━━ SECTION 11: SIGNATURE ROW ━━ -->
    <div class="signature-row">
      <div class="sign-col-left">
        <div>_______________________</div>
        <div style="margin-top: 3px;">Customer's Signature</div>
      </div>
      <div class="sign-col-center">
        Visit Again Thank You / पुन्हा भेट द्या, धन्यवाद!
      </div>
      <div class="sign-col-right">
        <div>For <strong>${firmName}</strong></div>
        <div style="margin-top: 25px;">Authorised Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
