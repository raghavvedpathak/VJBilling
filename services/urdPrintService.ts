import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../db/client';
import { urdPurchaseRepository } from '../repositories/urdPurchaseRepository';
import { firmRepository } from '../repositories/firmRepository';
import { bisLogoRepository } from '../repositories/bisLogoRepository';
import { ERR } from '../constants';
import { amountToWords, getCurrencySymbol, formatWeightMg } from '../utils/calculations';
import { formatDate } from '../utils/formatDate';

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
   * Generates standard URD Purchase Bill HTML
   */
  async generateURDPurchaseBill(urdId: string, firmId: string): Promise<string> {
    const urd = await urdPurchaseRepository.getById(db as any, firmId, urdId);
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

    const html = `
<!DOCTYPE html>
<html lang="mr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>URD Purchase Bill - ${urd.urdNumber || 'DRAFT'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi&family=Poppins:wght@400;500;600;700&display=swap');
  @page {
    size: A5 landscape;
    margin: 4mm;
  }
  body {
    font-family: 'Poppins', 'Tiro Devanagari Marathi', Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .watermark {
      opacity: 0.25 !important;
      display: block !important;
      visibility: visible !important;
    }
  }
  .bill-container {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    border: 1.5px solid #000;
    box-sizing: border-box;
    position: relative;
    background: #fff;
    overflow: hidden;
  }
  .maroon-banner {
    background-color: #8b2538;
    color: #ffffff;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .banner-left {
    font-size: 8.5px;
    line-height: 1.3;
    width: 28%;
  }
  .banner-center {
    text-align: center;
    width: 44%;
  }
  .banner-center .voucher-title {
    font-size: 10px;
    letter-spacing: 1px;
    font-weight: bold;
    color: #f7d273;
  }
  .banner-center .firm-name-dev {
    font-family: 'Tiro Devanagari Marathi', serif;
    font-size: 24px;
    font-weight: bold;
    margin: 1px 0;
    line-height: 1.1;
  }
  .banner-center .firm-addr {
    font-size: 9px;
  }
  .banner-right {
    font-size: 8.5px;
    text-align: right;
    line-height: 1.3;
    width: 28%;
  }
  .cust-grid {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid #000;
    font-size: 10px;
    background: transparent;
  }
  .cust-left, .cust-right {
    width: 48%;
  }
  .cust-row {
    display: flex;
    margin-bottom: 2px;
  }
  .cust-label {
    font-weight: bold;
    width: 75px;
  }
  .cust-val {
    font-weight: 500;
    padding-left: 4px;
  }
  table.items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
    position: relative;
    z-index: 2;
  }
  table.items-table th {
    background-color: #e5e7eb;
    border-bottom: 1px solid #000;
    border-right: 1px solid #000;
    padding: 4px;
    font-weight: bold;
    color: #000;
    text-align: center;
  }
  table.items-table th:last-child {
    border-right: none;
  }
  table.items-table td {
    border-right: 1px solid #000;
    border-bottom: 1px solid #e5e7eb;
    padding: 4px;
    text-align: center;
    height: 18px;
  }
  table.items-table td:last-child {
    border-right: none;
  }
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.22;
    text-align: center;
    pointer-events: none;
    z-index: 1;
    width: 100%;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .watermark-circle {
    width: 140px;
    height: 140px;
    border: 3px solid #8b2538;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 60px;
    font-weight: bold;
    color: #8b2538;
    margin: 0 auto 5px auto;
  }
  .watermark-text {
    font-size: 16px;
    font-weight: bold;
    color: #8b2538;
    letter-spacing: 2px;
  }
  .summary-grid {
    display: flex;
    border-top: 1px solid #000;
    font-size: 9.5px;
    position: relative;
    z-index: 2;
    background: transparent;
  }
  .summary-left {
    width: 55%;
    border-right: 1px solid #000;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .pay-table {
    width: 100%;
    border-collapse: collapse;
  }
  .pay-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #e5e7eb;
  }
  .pay-table td:first-child {
    font-weight: bold;
    width: 40%;
    border-right: 1px solid #000;
  }
  .pay-table td:last-child {
    text-align: right;
  }
  .words-row {
    padding: 5px 8px;
    border-top: 1px solid #000;
    font-size: 9px;
    font-weight: bold;
  }
  .summary-right {
    width: 45%;
  }
  .totals-table {
    width: 100%;
    border-collapse: collapse;
  }
  .totals-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #000;
  }
  .totals-table td:first-child {
    font-weight: bold;
    border-right: 1px solid #000;
    text-align: left;
  }
  .totals-table td:last-child {
    text-align: right;
    font-weight: bold;
  }
  .totals-table tr.highlight-net {
    background-color: #f9fafb;
  }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 8px 12px 4px 12px;
    font-size: 9.5px;
    font-weight: bold;
    background: transparent;
  }
</style>
</head>
<body>
  <div class="bill-container">

    <!-- WATERMARK -->
    <div class="watermark">
      ${firmLogoUri ? `
        <img src="${firmLogoUri}" alt="Watermark Logo" style="max-width: 260px; max-height: 150px; object-fit: contain; display: block; margin: 0 auto; opacity: 1; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;" />
      ` : `
        <svg width="180" height="140" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="90" stroke="#8b2538" stroke-width="2" stroke-dasharray="4 4" fill="none"/>
          <circle cx="100" cy="100" r="75" stroke="#8b2538" stroke-width="1.5" fill="none"/>
          <circle cx="100" cy="100" r="45" stroke="#8b2538" stroke-width="2" fill="none"/>
          <text x="100" y="118" font-size="52" fill="#8b2538" font-weight="bold" text-anchor="middle">${firm.name.charAt(0)}</text>
        </svg>
      `}
    </div>

    <!-- MAROON HEADER BANNER -->
    <div class="maroon-banner">
      <div class="banner-left">
        <div>Subject to ${firm.city || 'Local'} Jurisdiction</div>
        ${firm.gstin ? `<div style="font-weight: bold; margin-top: 1px;">GSTIN ${firm.gstin}</div>` : ''}
        ${bisLogoUri ? `<div style="margin-top: 4px;"><img src="${bisLogoUri}" alt="BIS Logo" style="max-height: 38px; max-width: 60px; object-fit: contain;" /></div>` : ''}
      </div>
      <div class="banner-center">
        <div class="voucher-title">URD PURCHASE BILL</div>
        <div class="firm-name-dev">${firm.name}</div>
        <div class="firm-addr" style="color: #f7d273; font-size: 10px; font-weight: 500; margin-top: 2px;">${firm.addressLine1 || ''}, ${firm.city || ''}, ${firm.stateName || ''}</div>
      </div>
      <div class="banner-right">
        <div style="font-weight: bold; font-size: 10.5px; color: #f7d273;">प्रोप्रा. ${firm.proprietor || firm.name}</div>
        <div style="font-weight: 500;">Mo. ${firm.phone1}</div>
        ${firm.phone2 ? `<div style="font-weight: 500;">${firm.phone2}</div>` : ''}
      </div>
    </div>

    <!-- CUSTOMER & BILL DETAILS -->
    <div class="cust-grid">
      <div class="cust-left">
        <div class="cust-row"><span class="cust-label">Name:</span><span class="cust-val">${urd.customerName}</span></div>
        <div class="cust-row"><span class="cust-label">Address:</span><span class="cust-val">${urd.customerAddress || '-'}</span></div>
        <div class="cust-row"><span class="cust-label">Mob:</span><span class="cust-val">${urd.customerMobile || '-'}</span></div>
        ${idProofHtml}
      </div>
      <div class="cust-right" style="text-align: right;">
        <div class="cust-row" style="justify-content: flex-end;"><span class="cust-label" style="text-align: right; width: auto; margin-right: 4px;">Date:</span><span class="cust-val">${formattedDate}</span></div>
        <div class="cust-row" style="justify-content: flex-end;"><span class="cust-label" style="text-align: right; width: auto; margin-right: 4px;">Invoice No.:</span><span class="cust-val">${urd.urdNumber || 'DRAFT'}</span></div>
      </div>
    </div>

    <!-- TABLE OF ITEMS -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 4%;">#</th>
          <th style="width: 32%;">Description</th>
          <th style="width: 10%;">HSN</th>
          <th style="width: 14%;">Net Wt (g)</th>
          <th style="width: 12%;">Purity</th>
          <th style="width: 14%;">Rate (${symbol})</th>
          <th style="width: 14%;">Amount (${symbol})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td style="text-align: left; font-weight: 600;">OLD ${urd.metalType} ORNAMENT - Fine: ${fineGrams}g</td>
          <td>7113</td>
          <td>${grossGrams}</td>
          <td>${urd.purityPercent}%</td>
          <td>${symbol}${rateRupees}</td>
          <td style="font-weight: bold;">${symbol}${totalRupees}</td>
        </tr>
      </tbody>
    </table>

    <!-- SUMMARY & TOTALS SECTION -->
    <div class="summary-grid">
      <div class="summary-left">
        <table class="pay-table">
          <tr><td>CASH</td><td>${symbol}${cashAmt}</td></tr>
          <tr><td>NEFT</td><td>${symbol}${bankAmt}</td></tr>
          <tr><td>CHEQUE</td><td>${symbol}${chequeAmt}</td></tr>
          <tr><td>UPI/MOBILE</td><td>${symbol}${upiAmt}</td></tr>
        </table>
        <div class="words-row">
          Amt. In Words : <span style="font-weight: normal;">${words}</span>
        </div>
      </div>
      <div class="summary-right">
        <table class="totals-table">
          <tr><td>NET TOTAL</td><td>${symbol}${totalRupees}</td></tr>
          <tr><td>Round Off</td><td>0.00</td></tr>
          <tr class="highlight-net"><td>NET AMOUNT</td><td>${symbol}${totalRupees}</td></tr>
          <tr><td>AMT RECEIVED</td><td>${symbol}${totalRupees}</td></tr>
          <tr><td>BALANCE</td><td>${symbol}0.00</td></tr>
        </table>
      </div>
    </div>

    <!-- FOOTER SIGNATURES -->
    <div class="footer-row" style="margin-top: 35px; padding-top: 10px;">
      <div style="min-height: 45px; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="border-top: 1px dotted #000; width: 120px; margin-bottom: 4px;"></div>
        <div>Customer Signature</div>
      </div>
      <div style="font-size: 11px; font-weight: bold; align-self: flex-end; margin-bottom: 4px;">! Thank You !</div>
      <div style="min-height: 45px; display: flex; flex-direction: column; justify-content: space-between; text-align: right;">
        <div>तर्फे : ${firm.name}</div>
        <div style="margin-top: 25px;">Authorised Signatory</div>
      </div>
    </div>

  </div>
</body>
</html>`;
    return html;
  },

  /**
   * Generates Official Marathi Customer Declaration / Affidavit ("जुने किंवा वापरलेल्या दागिन्यांच्या मालकीबाबत घोषणापत्र / शपथपत्र")
   */
  async generateURDCustomerDeclaration(urdId: string, firmId: string): Promise<string> {
    const urd = await urdPurchaseRepository.getById(db as any, firmId, urdId);
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

    const html = `
<!DOCTYPE html>
<html lang="mr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>घोषणापत्र / शपथपत्र</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi&family=Poppins:wght@400;600;700&display=swap');
  @page {
    size: A4 portrait;
    margin: 8mm;
  }
  body {
    font-family: 'Tiro Devanagari Marathi', 'Poppins', Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: #000;
    line-height: 1.4;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .watermark {
      opacity: 0.25 !important;
      display: block !important;
      visibility: visible !important;
    }
  }
  .page {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    box-sizing: border-box;
  }
  .border-box {
    border: 1.5px solid #000;
    padding: 16px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.22;
    text-align: center;
    pointer-events: none;
    z-index: 1;
  }
  .watermark-text {
    font-size: 18px;
    font-weight: bold;
    color: #8b2538;
    letter-spacing: 2px;
  }
  .firm-box {
    border: 1.5px solid #000;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-bottom: 12px;
    position: relative;
    z-index: 2;
  }
  .firm-title {
    font-size: 22px;
    font-weight: bold;
  }
  .firm-sub {
    font-size: 13px;
    margin-top: 2px;
  }
  .top-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 10px;
    position: relative;
    z-index: 2;
  }
  .center-header {
    text-align: center;
    margin-bottom: 10px;
    position: relative;
    z-index: 2;
  }
  .doc-sub {
    font-size: 13px;
  }
  .doc-main-title {
    font-size: 22px;
    font-weight: bold;
    margin: 2px 0;
  }
  .part-tag {
    font-size: 15px;
    font-weight: bold;
  }
  .part-sub {
    font-size: 12px;
  }
  .clause-text {
    font-size: 13px;
    margin-bottom: 8px;
    text-align: justify;
    position: relative;
    z-index: 2;
  }
  .field-row {
    font-size: 13.5px;
    margin-bottom: 6px;
    display: flex;
    position: relative;
    z-index: 2;
  }
  .field-label {
    font-weight: bold;
    white-space: nowrap;
  }
  .field-line {
    flex: 1;
    border-bottom: 1px dotted #000;
    padding-left: 8px;
    font-weight: normal;
  }
  table.form-table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 13px;
    position: relative;
    z-index: 2;
  }
  table.form-table th, table.form-table td {
    border: 1px solid #000;
    padding: 6px 8px;
    text-align: center;
    background-color: rgba(255,255,255,0.85);
  }
  table.form-table th {
    background-color: #f9f9f9;
  }
  .sig-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 40px;
    font-size: 14px;
    position: relative;
    z-index: 2;
  }
  .witness-left {
    line-height: 1.8;
  }
  .customer-right {
    text-align: right;
    font-weight: bold;
  }
  .page-break {
    page-break-before: always;
  }
</style>
</head>
<body>

  <!-- PAGE 1: भाग - १ -->
  <div class="page">
    <div class="border-box">
      <!-- WATERMARK -->
      <div class="watermark">
        ${firmLogoUri ? `
          <img src="${firmLogoUri}" alt="Watermark Logo" style="max-width: 300px; max-height: 220px; object-fit: contain; display: block; margin: 0 auto 6px auto; opacity: 1;" />
        ` : `
          <div style="font-size: 56px; font-weight: bold; color: #8b2538; opacity: 0.25;">${firm.name.charAt(0)}</div>
        `}
      </div>

      <div class="firm-box">
        ${firmLogoUri ? `<img src="${firmLogoUri}" alt="Firm Logo" style="max-height: 50px; max-width: 85px; object-fit: contain;" />` : ''}
        <div style="text-align: center;">
          <div class="firm-title">${firm.name}</div>
          <div class="firm-sub">${firm.addressLine1 || ''}, ${firm.city || ''}, ${firm.stateName || ''} | मो. ${firm.phone1}</div>
        </div>
      </div>

      <div class="top-meta-row">
        <div>अनु.क्र. : <span style="border-bottom: 1px dotted #000; padding: 0 20px;">${urd.urdNumber || 'DRAFT'}</span></div>
        <div>दिनांक : <span style="border-bottom: 1px dotted #000; padding: 0 20px;">${formattedDate}</span></div>
      </div>

      <div class="center-header">
        <div class="doc-sub">जुने किंवा वापरलेल्या दागिन्यांच्या मालकीबाबत...</div>
        <div class="doc-main-title">घोषणापत्र / शपथपत्र</div>
        <div class="part-tag">भाग - १</div>
        <div class="part-sub">(खालील नियम वाचून ग्राहकांनी भरवायची माहिती)</div>
      </div>

      <div class="clause-text">
        <b>१)</b> मी या घोषणापत्र/शपथपत्राद्वारे प्रमाणित करतो की, खाली नमूद केलेल्या वर्णनाचे दागिने माझ्या स्वतःच्या / कुटुंबातील व्यक्ती (नांव <span style="border-bottom: 1px dotted #000; padding: 0 30px;">${urd.customerName}</span> ) पूर्ण मालकीचे आहेत. सदर वर्णनाचे दागिने मी/कुटुंबातील व्यक्तीने कायदेशीररित्या मिळवले असून मालकी हक्काबाबत भविष्यात काही कायदेशीर कारवाई झाली तर त्याला सर्वस्वी मी व माझे कुटुंब जबाबदार असेल.
      </div>
      <div class="clause-text">
        <b>२)</b> खाली नमूद सर्व दागिने माझ्या स्वतःच्या तसेच कुटुंबातील सर्वांच्या संमतीने तुम्हास विकत आहे. त्याबाबत कोणतीही तक्रार मी व माझ्या कुटुंबाकडून येणार नाही.
      </div>
      <div class="clause-text">
        <b>३)</b> भविष्यामध्ये मी विकत असलेल्या खालील दागिन्यांमुळे सदर ज्वेलर्सवरती कोणत्याही प्रकारची कायदेशीर कारवाई झाली आणि आर्थिक नुकसान झाले तर नुकसान भरपाईसाठी सर्वस्वी मी व माझे कुटुंब जबाबदार असेल.
      </div>

      <div style="margin-top: 10px; position: relative; z-index: 2;">
        <div class="field-row"><span class="field-label">ग्राहकाचे नांव :</span> <span class="field-line">${urd.customerName}</span></div>
        <div class="field-row"><span class="field-label">पत्ता :</span> <span class="field-line">${urd.customerAddress || ''}</span></div>
        <div class="field-row"><span class="field-label">मोबाईल नंबर :</span> <span class="field-line">${urd.customerMobile || ''}</span></div>
        <div class="field-row"><span class="field-label">ओळखपत्र पुरावा (उदा. पॅन/आधार कार्ड) :</span> <span class="field-line">${idProofType}</span></div>
        <div class="field-row"><span class="field-label">ओळखपत्र पुरावा नंबर (उदा. पॅन/आधार कार्ड नं.) :</span> <span class="field-line">${idProofNumber}</span></div>
        <div class="field-row"><span class="field-label">दागिना खरेदी केलेल्या पावतीचा तपशील :</span> <span class="field-line">URD पावती क्र. ${urd.urdNumber || 'DRAFT'}</span></div>
        <div class="field-row"><span class="field-label">खरेदी पावती नसल्याचे कारण :</span> <span class="field-line">जुने कौटुंबिक दागिने</span></div>
      </div>

      <div style="text-align: center; font-weight: bold; font-size: 14px; margin-top: 12px; position: relative; z-index: 2;">✽ दागिन्यांचे वर्णन ✽</div>
      <table class="form-table">
        <thead>
          <tr>
            <th style="width: 10%;">अ.क्र.</th>
            <th>दागिन्यांचे वर्णन</th>
            <th style="width: 20%;">वजन (ग्रॅम)</th>
            <th style="width: 20%;">दर (प्रति ग्रॅम)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>१</td>
            <td style="text-align: left;">जुने ${urd.metalType === 'GOLD' ? 'सोने' : 'चांदी'} दागिने (${urd.purityPercent}% शुद्धता)</td>
            <td>${grossGrams} g</td>
            <td>${symbol}${ratePerGram} /g</td>
          </tr>
        </tbody>
      </table>

      <div class="sig-container">
        <div class="witness-left">
          <b>साक्षीदार : १)</b> __________________________________<br/>
          <b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;२)</b> __________________________________
        </div>
        <div class="customer-right">
          <br/><br/>
          ________________________<br/>
          <b>ग्राहकाची सही</b>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 2: भाग - २ -->
  <div class="page page-break">
    <div class="border-box">
      <!-- WATERMARK -->
      <div class="watermark">
        ${firmLogoUri ? `
          <img src="${firmLogoUri}" alt="Watermark Logo" style="max-width: 300px; max-height: 220px; object-fit: contain; display: block; margin: 0 auto 6px auto; opacity: 1;" />
        ` : `
          <div style="font-size: 56px; font-weight: bold; color: #8b2538; opacity: 0.25;">${firm.name.charAt(0)}</div>
        `}
      </div>

      <div class="center-header" style="margin-bottom: 12px;">
        <div class="part-tag" style="font-size: 18px;">भाग - २</div>
        <div class="part-sub">(ज्वेलर्सच्या वतीने भरावयाची माहिती)</div>
      </div>

      <div class="field-row" style="margin-bottom: 12px;">
        <span class="field-label">जुने दागिने खरेदी पावती क्रमांक :</span> <span class="field-line"><b>${urd.urdNumber || 'DRAFT'}</b> (दिनांक : ${formattedDate})</span>
      </div>

      <table class="form-table">
        <thead>
          <tr>
            <th style="width: 8%;">अ.क्र.</th>
            <th>दागिन्यांचे वर्णन</th>
            <th style="width: 16%;">ढोबळ (g)</th>
            <th style="width: 16%;">निव्वळ (g)</th>
            <th style="width: 18%;">दर / ग्रॅम</th>
            <th style="width: 20%;">किंमत</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>१</td>
            <td style="text-align: left;">जुने ${urd.metalType === 'GOLD' ? 'सोने' : 'चांदी'} (${urd.purityPercent}%)</td>
            <td>${grossGrams}</td>
            <td>${fineGrams}</td>
            <td>${symbol}${ratePerGram}</td>
            <td>${symbol}${totalRupees}</td>
          </tr>
          <tr>
            <td colspan="2" style="text-align: right; font-weight: bold;">एकूण ग्रॅम</td>
            <td style="font-weight: bold;">${grossGrams} g</td>
            <td style="font-weight: bold;">${fineGrams} g</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold;">एकूण खरेदी किंमत</td>
            <td style="font-weight: bold; font-size: 15px;">${symbol}${totalRupees}</td>
          </tr>
        </tbody>
      </table>

      <div style="font-size: 12.5px; margin: 12px 0;">
        <b>* टीप :</b><br/>
        १) दागिन्यांची किंमत हजर बाजारभावच्या सोन्याच्या किंमतीवर आधारित आहे.<br/>
        २) तूटीची टक्केवारी वजा केल्यावर खरेदी किंमत काढली जाते.
      </div>

      <div style="margin-top: 15px;">
        <div class="field-row"><b>ज्वेलर्सच्या वतीने दागिने तपासलेल्या व्यक्तीकडून व्यवहाराचा भरावयाचा तपशील :</b></div>
        <div class="field-row" style="margin-top: 6px;"><span class="field-label">तपासणी केलेल्या व्यक्तीचे नांव :</span> <span class="field-line">${firm.proprietor || firm.name}</span></div>
        <div class="field-row"><span class="field-label">स्वाक्षरी :</span> <span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">तारीख :</span> <span class="field-line">${formattedDate}</span> <span class="field-label" style="margin-left: 20px;">वेळ :</span> <span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">खरेदी केलेल्या दागिन्यांच्या पेमेंटचा तपशील :</span> <span class="field-line">${urd.paymentMode}</span></div>
        <div class="field-row"><span class="field-label">चेकने पेमेंट केल्यास चेक क्रमांक :</span> <span class="field-line">${urd.bankAccountId || ''}</span></div>
      </div>

      <div style="margin-top: 20px; text-align: center;">
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">
          ग्राहकाकडून दागिन्यांच्या केलेल्या व्हॅल्युएशनबाबत घोषणापत्र / शपथपत्र
        </div>
        <div class="clause-text" style="text-align: center; font-size: 12.5px;">
          भाग-२ मध्ये केलेल्या आमच्या सर्व दागिन्यांचे व्हॅल्युएशन आम्हाला मान्य असून त्याबाबत कोणतीही तक्रार नाही. व्यवहारानुसार आम्हाला आमच्या दागिन्यांची पूर्ण रक्कम मिळाली आहे आणि ती आम्हाला मान्य आहे.
        </div>
        <div style="text-align: right; font-size: 13px; font-weight: bold; margin-top: 8px;">
          दिनांक : <span style="border-bottom: 1px dotted #000; padding: 0 15px;">${formattedDate}</span>
        </div>
      </div>

      <div class="sig-container">
        <div class="witness-left">
          <b>साक्षीदार : १)</b> __________________________________<br/>
          <b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;२)</b> __________________________________
        </div>
        <div class="customer-right">
          <br/><br/>
          ________________________<br/>
          <b>ग्राहकाची सही</b>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
    return html;
  }
};
