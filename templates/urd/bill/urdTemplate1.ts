import type { URDTemplateParams } from '../urdTemplate.types';

/**
 * URD Template 1: Standard A5 Landscape URD Purchase Bill
 * Preserves exact original HTML/CSS styling word-for-word line-for-line, with adjustment (+/-) support.
 */
export function renderURDTemplate1(params: URDTemplateParams): string {
  const {
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
  } = params;

  return `
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
          <td style="font-weight: bold;">${symbol}${(hasAdjustment || hasDiscount) ? grossValueRupees : totalRupees}</td>
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
          ${hasAdjustment ? `
            <tr><td>GROSS TOTAL</td><td>${symbol}${grossValueRupees}</td></tr>
            <tr><td>Round Off</td><td>0.00</td></tr>
            <tr><td>Adjusted Amount</td><td>${adjustmentSign || '+'}${symbol}${adjustmentRupees}</td></tr>
          ` : (hasDiscount ? `
            <tr><td>GROSS TOTAL</td><td>${symbol}${grossValueRupees}</td></tr>
            <tr><td>Round Off</td><td>0.00</td></tr>
            <tr><td>Less: Discount</td><td>-${symbol}${discountRupees}</td></tr>
          ` : `
            <tr><td>GROSS TOTAL</td><td>${symbol}${grossValueRupees}</td></tr>
            <tr><td>Round Off</td><td>0.00</td></tr>
          `)}
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
}
