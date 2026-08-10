import type { URDTemplateParams } from '../urdTemplate.types';

/**
 * English Customer Declaration / Affidavit Template (Template 2 - 2-Page Legal Document)
 * Preserves exact text, structure, tables, and disclaimer word-for-word from formal legal format.
 */
export function renderURDTemplate2(params: URDTemplateParams): string {
  const {
    urd,
    firm,
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
    formattedDate,
  } = params;

  let idProofTypeLabel = 'PAN / Aadhaar / Other';
  let idProofNumberLabel = '-';
  if (urd.customerAadhaar) {
    idProofTypeLabel = 'Aadhaar Card';
    idProofNumberLabel = urd.customerAadhaar;
  } else if (urd.customerPAN) {
    idProofTypeLabel = 'PAN Card';
    idProofNumberLabel = urd.customerPAN;
  }

  const receiptNo = urd.urdNumber || 'DRAFT';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>DECLARATION / AFFIDAVIT - URD Purchase (${receiptNo})</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Liberation+Sans:wght@400;600;700&display=swap');
  @page {
    size: A4 portrait;
    margin: 12mm 15mm;
  }
  body {
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-size: 11.5px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page {
    width: 100%;
    max-width: 190mm;
    margin: 0 auto;
    box-sizing: border-box;
    background: #fff;
    position: relative;
  }
  .page-break {
    page-break-after: always;
    margin-bottom: 20px;
  }
  .header-title {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .header-subtitle {
    text-align: center;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .header-note {
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 14px;
  }
  p.declaration-text {
    margin-top: 0;
    margin-bottom: 10px;
    text-align: justify;
    font-size: 11px;
    color: #222;
  }
  .section-heading {
    font-size: 12.5px;
    font-weight: 700;
    text-transform: uppercase;
    margin-top: 14px;
    margin-bottom: 6px;
    letter-spacing: 0.3px;
  }
  table.form-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 11px;
  }
  table.form-table td, table.form-table th {
    border: 1px solid #b0b0b0;
    padding: 6px 8px;
    vertical-align: middle;
  }
  table.form-table td.label-cell {
    font-weight: 400;
    color: #222;
  }
  table.form-table td.val-cell {
    font-weight: 600;
    color: #000;
  }
  table.grid-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 11px;
  }
  table.grid-table th {
    border: 1px solid #b0b0b0;
    padding: 6px 8px;
    background-color: #f3f4f6;
    font-weight: 700;
    text-align: left;
  }
  table.grid-table td {
    border: 1px solid #b0b0b0;
    padding: 8px;
    height: 22px;
  }
  .note-box {
    font-size: 10.5px;
    margin-top: 8px;
    margin-bottom: 12px;
  }
  .note-box span.note-tag {
    font-weight: 700;
  }
  .signature-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
    margin-bottom: 16px;
    font-size: 11px;
  }
  .signature-table td {
    border: 1px solid #b0b0b0;
    padding: 10px 12px;
    width: 50%;
    vertical-align: top;
  }
  .sig-line-row {
    margin-bottom: 8px;
  }
  .footer-disclaimer {
    font-size: 10px;
    line-height: 1.35;
    color: #333;
    margin-top: 18px;
    text-align: left;
  }
  .footer-disclaimer span.imp-tag {
    font-weight: 700;
  }
</style>
</head>
<body>

  <!-- PAGE 1 -->
  <div class="page page-break">
    <div class="header-title">DECLARATION / AFFIDAVIT</div>
    <div class="header-subtitle">Regarding Ownership and Sale of Old / Used Gold Jewellery</div>

    <div class="header-note">(Information to be filled in and confirmed by the Customer)</div>

    <p class="declaration-text">
      I hereby declare and confirm that the jewellery described below is owned by me and/or by a member of my family, and that I am authorised to sell the same. I further declare that the said jewellery has been lawfully acquired and that I/the concerned family member have valid ownership rights over it. If any legal action or dispute arises in future regarding the ownership or title of the jewellery, I and my family shall be solely responsible for the same.
    </p>

    <p class="declaration-text">
      I further confirm that the jewellery mentioned below is being sold to you with my own consent and with the consent of the concerned family members. Neither I nor any member of my family shall raise any claim or complaint against the jeweller in relation to this transaction.
    </p>

    <p class="declaration-text">
      If, in future, any legal proceedings are initiated against the jeweller in connection with the jewellery sold by me, and any financial loss is caused to the jeweller, I and my family shall be solely responsible for compensating such loss.
    </p>

    <div class="section-heading">CUSTOMER DETAILS</div>
    <table class="form-table">
      <tr>
        <td class="label-cell" style="width: 25%;">Customer Name:</td>
        <td class="val-cell" style="width: 25%;">${urd.customerName}</td>
        <td class="label-cell" style="width: 20%;">Address:</td>
        <td class="val-cell" style="width: 30%;">${urd.customerAddress || '-'}</td>
      </tr>
      <tr>
        <td class="label-cell">Mobile Number:</td>
        <td class="val-cell">${urd.customerMobile || '-'}</td>
        <td class="label-cell">Identity Proof:</td>
        <td class="val-cell">${idProofTypeLabel}</td>
      </tr>
      <tr>
        <td class="label-cell">Identity Proof No.:</td>
        <td class="val-cell">${idProofNumberLabel}</td>
        <td class="label-cell">Date:</td>
        <td class="val-cell">${formattedDate}</td>
      </tr>
      <tr>
        <td class="label-cell" colspan="2">Reason for non-availability of purchase receipt (if applicable):</td>
        <td class="val-cell" colspan="2">Old Family Jewellery / Non-availability of purchase bill</td>
      </tr>
    </table>

    <div class="section-heading">DESCRIPTION OF JEWELLERY</div>
    <table class="grid-table">
      <thead>
        <tr>
          <th style="width: 8%; text-align: center;">Sr. No.</th>
          <th style="width: 42%;">Description of Jewellery</th>
          <th style="width: 16%; text-align: center;">Gross Weight (g)</th>
          <th style="width: 16%; text-align: center;">Net Weight (g)</th>
          <th style="width: 18%; text-align: right;">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center;">1</td>
          <td style="font-weight: 600;">OLD ${urd.metalType} ORNAMENT (${urd.purityPercent}%)</td>
          <td style="text-align: center;">${grossGrams}</td>
          <td style="text-align: center;">${fineGrams}</td>
          <td style="text-align: right; font-weight: 600;">${symbol}${totalRupees}</td>
        </tr>
        <tr>
          <td style="text-align: center;">2</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: center;">3</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: center;">4</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: center;">5</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="section-heading">CUSTOMER'S DECLARATION REGARDING VALUATION</div>
    <p class="declaration-text">
      I confirm that the valuation of all jewellery described in Part 2 has been explained to me and is acceptable to me. I have no objection or complaint regarding the valuation or the amount agreed for the transaction.
    </p>
    <p class="declaration-text">
      I confirm that, as per the transaction, I have received the full and final amount payable to me for the jewellery, and the same is acceptable to me.
    </p>

    <div class="note-box">
      <span class="note-tag">Note:</span> The value of the jewellery is based on the prevailing market rate of gold on the date of the transaction. The purchase value is arrived at after deducting the applicable percentage of wastage / deduction, as agreed between the parties.
    </div>

    <div class="section-heading" style="margin-top: 18px;">VALUATION / PURCHASE SUMMARY</div>
  </div>

  <!-- PAGE 2 -->
  <div class="page">
    <table class="form-table" style="margin-top: 10px;">
      <tr>
        <td class="label-cell" style="width: 45%;">Old Jewellery Purchase Receipt No.:</td>
        <td class="val-cell" style="width: 55%;">${receiptNo}</td>
      </tr>
      <tr>
        <td class="label-cell">Total Gross Weight (g):</td>
        <td class="val-cell">${grossGrams}</td>
      </tr>
      <tr>
        <td class="label-cell">Total Net Weight (g):</td>
        <td class="val-cell">${fineGrams}</td>
      </tr>
      <tr>
        <td class="label-cell">Gross Valuation Amount:</td>
        <td class="val-cell">${symbol}${(hasAdjustment || hasDiscount) ? grossValueRupees : totalRupees}</td>
      </tr>
      ${hasAdjustment ? `
        <tr>
          <td class="label-cell">Adjusted Amount:</td>
          <td class="val-cell">${adjustmentSign || '+'}${symbol}${adjustmentRupees}</td>
        </tr>
      ` : (hasDiscount ? `
        <tr>
          <td class="label-cell">Less: Wastage / Deduction:</td>
          <td class="val-cell">-${symbol}${discountRupees}</td>
        </tr>
      ` : '')}
      <tr>
        <td class="label-cell" style="font-weight: 700;">Final Purchase Value:</td>
        <td class="val-cell" style="font-weight: 700; font-size: 12px;">${symbol}${totalRupees}</td>
      </tr>
    </table>

    <div class="section-heading" style="margin-top: 20px;">JEWELLER'S VERIFICATION / DECLARATION</div>
    <p class="declaration-text" style="margin-bottom: 12px;">
      On behalf of the jeweller, the transaction has been verified based on the information and documents provided by the person from whom the jewellery was purchased.
    </p>

    <table class="form-table">
      <tr>
        <td class="label-cell" style="width: 45%;">Name of person verified:</td>
        <td class="val-cell" style="width: 55%;">${urd.customerName}</td>
      </tr>
      <tr>
        <td class="label-cell">Signature:</td>
        <td class="val-cell"></td>
      </tr>
      <tr>
        <td class="label-cell">Date / Time:</td>
        <td class="val-cell">${formattedDate}</td>
      </tr>
      <tr>
        <td class="label-cell">Payment details:</td>
        <td class="val-cell">${urd.paymentMode} (${symbol}${totalRupees})</td>
      </tr>
      <tr>
        <td class="label-cell">Cheque payment, if any &ndash; Cheque No.:</td>
        <td class="val-cell">${urd.paymentMode === 'CHEQUE' ? (urd.bankAccountId || '-') : '-'}</td>
      </tr>
    </table>

    <table class="signature-table">
      <tr>
        <td>
          <div class="sig-line-row">Customer Signature: ______________________</div>
          <div class="sig-line-row">Name: ${urd.customerName}</div>
          <div class="sig-line-row">Date: ${formattedDate}</div>
        </td>
        <td>
          <div class="sig-line-row">Witness 1: ______________________</div>
          <div class="sig-line-row">Witness 2: ______________________</div>
          <div class="sig-line-row">Date: ${formattedDate}</div>
        </td>
      </tr>
    </table>

    <div class="footer-disclaimer">
      <span class="imp-tag">Important:</span> This English version has been prepared from the uploaded Marathi declaration/affidavit, preserving its structure and substantive points. It should be reviewed by the jeweller's legal/tax professional before use as a final legal document.
    </div>
  </div>

</body>
</html>
`;
}

export const renderURDCustomerDeclaration2 = renderURDTemplate2;
