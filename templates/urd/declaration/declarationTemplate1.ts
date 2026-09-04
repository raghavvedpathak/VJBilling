import type { URDCustomerDeclarationParams } from '../urdTemplate.types';

/**
 * Official Marathi Customer Declaration / Affidavit Template (Template 1)
 * Preserves exact original HTML/CSS styling word-for-word.
 */
export function renderURDCustomerDeclaration(params: URDCustomerDeclarationParams): string {
  const {
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
  } = params;

  const fullFirmAddress = [
    firm.addressLine1,
    firm.addressLine2,
    firm.city,
    firm.stateName ? (firm.pincode ? `${firm.stateName} - ${firm.pincode}` : firm.stateName) : firm.pincode,
  ]
    .filter((p) => p && String(p).trim().length > 0)
    .join(', ');

  return `
<!DOCTYPE html>
<html lang="mr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>घोषणापत्र / शपथपत्र</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi&family=Poppins:wght@400;600;700&display=swap');
  @page {
    size: 210mm 297mm;
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
    @page {
      size: 210mm 297mm;
      size: A4 portrait;
      margin: 8mm;
    }
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
          <div class="firm-sub">${fullFirmAddress} | मो. ${firm.phone1}</div>
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
            <td>${symbol}${hasAdjustment ? grossValueRupees : totalRupees}</td>
          </tr>
          <tr>
            <td colspan="2" style="text-align: right; font-weight: bold;">एकूण ग्रॅम</td>
            <td style="font-weight: bold;">${grossGrams} g</td>
            <td style="font-weight: bold;">${fineGrams} g</td>
            <td></td>
            <td></td>
          </tr>
          ${hasAdjustment ? `
            <tr>
              <td colspan="5" style="text-align: right; font-weight: bold;">ढोबळ एकूण (Gross Total)</td>
              <td style="font-weight: bold;">${symbol}${grossValueRupees}</td>
            </tr>
            <tr>
              <td colspan="5" style="text-align: right; font-weight: bold;">समायोजित रक्कम (Adjusted Amount)</td>
              <td style="font-weight: bold;">${adjustmentSign || '+'}${symbol}${adjustmentRupees}</td>
            </tr>
          ` : ''}
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold;">एकूण खरेदी किंमत (Net Amount)</td>
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
}

export const renderURDCustomerDeclaration1 = renderURDCustomerDeclaration;
