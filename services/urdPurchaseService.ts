import { db } from '../db/client';
import { urdPurchaseRepository } from '../repositories/urdPurchaseRepository';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
import { sequenceCounterRepository } from '../repositories/sequenceCounterRepository';
import { auditRepository } from '../repositories/auditRepository';
import { financialYearRepository } from '../repositories/fyRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { fyService } from './fyService';
import type { CreateURDPurchaseInput, URDPurchase } from '../types/phase2.types';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { firmRepository } from '../repositories/firmRepository';
import { amountToWords, getCurrencySymbol } from '../utils/currency';

function uuid() {
  return Crypto.randomUUID();
}

export const urdPurchaseService = {
  // PUBLIC EXPORT — Phase 3 cross-phase seam. Phase 3 MUST call this;
  // NEVER call urdPurchaseRepository.getById() from Phase 3 directly.
  async getById(
    id: string,
    firmId: string,
  ): Promise<URDPurchase | null> {
    const urd = await urdPurchaseRepository.getById(db as any, firmId, id);
    if (!urd || urd.firmId !== firmId) return null;
    return urd;
  },

  async createURDPurchase(
    input: CreateURDPurchaseInput,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.customerName?.trim()) throw new Error('URD_CUSTOMER_NAME_REQUIRED');
    if (input.grossWeightMg <= 0) throw new Error('URD_GROSS_WEIGHT_INVALID');
    if (input.purityPercent <= 0 || input.purityPercent > 100)
      throw new Error('URD_PURITY_PERCENT_INVALID');
    if (input.ratePerGramPaise <= 0) throw new Error('URD_RATE_INVALID');

    if ((input.paymentMode === 'BANK' || input.paymentMode === 'UPI') && !input.bankAccountId)
      throw new Error('URD_BANK_ACCOUNT_REQUIRED');
    if (input.paymentMode === 'CASH' && input.bankAccountId)
      throw new Error('URD_BANK_ACCOUNT_MUST_BE_NULL_FOR_CASH');

    const fineWeightMg = Math.round(input.grossWeightMg * input.purityPercent / 100);
    const totalValuePaise = Math.round((fineWeightMg / 1000) * input.ratePerGramPaise);

    const fyId = await fyService.resolveTransactionFyId(firmId, input.purchaseDate);

    return db.transaction(async (tx) => {
      const lot = await oldGoldLotRepository.insert(tx, {
        id: uuid(),
        firmId,
        receivedFrom: input.customerName,
        customerId: input.customerId ?? null,
        receivedDate: input.purchaseDate,
        grossWeightMg: input.grossWeightMg,
        purityPercent: input.purityPercent,
        metalSource: 'CUSTOMER',
        fineWeightMg,
        purchaseRatePaise: input.ratePerGramPaise,
        totalAmountPaise: totalValuePaise,
        notes: input.notes ?? null,
        status: 'RECEIVED',
        createdAt: now(), updatedAt: now(),
      });

      const urd = await urdPurchaseRepository.insert(tx, {
        id: uuid(),
        firmId,
        fyId,
        urdNumber: null,
        purchaseDate: input.purchaseDate,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerAddress: input.customerAddress ?? null,
        customerMobile: input.customerMobile ?? null,
        customerAadhaar: input.customerAadhaar ?? null,
        customerPAN: input.customerPAN ?? null,
        metalType: input.metalType,
        grossWeightMg: input.grossWeightMg,
        purityPercent: input.purityPercent,
        fineWeightMg,
        ratePerGramPaise: input.ratePerGramPaise,
        totalValuePaise,
        paymentMode: input.paymentMode,
        bankAccountId: input.bankAccountId ?? null,
        oldGoldLotId: lot.id,
        status: 'DRAFT',
        notes: input.notes ?? null,
        createdAt: now(), updatedAt: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CREATED', firmId, entityId: urd.id,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({
          urdId: urd.id, lotId: lot.id,
          customerName: urd.customerName, customerId: urd.customerId,
          grossWeightMg: input.grossWeightMg, purityPercent: input.purityPercent,
          fineWeightMg, totalValuePaise,
        }),
      });

      return urd;
    });
  },

  async confirmURDPurchase(
    urdId: string,
    firmId: string
  ): Promise<URDPurchase> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return db.transaction(async (tx) => {
      const urd = await urdPurchaseRepository.getById(tx, firmId, urdId);
      if (!urd || urd.firmId !== firmId) throw new Error('URD_NOT_FOUND_OR_WRONG_FIRM');
      if (urd.status !== 'DRAFT') throw new Error('URD_ALREADY_CONFIRMED');

      // PHASE 1 ALIGNMENT LIMIT: Max value ₹99,99,999.99 to prevent amountToWords overflow
      if (urd.totalValuePaise > 999999999) throw new Error('URD_AMOUNT_EXCEEDS_MAX');

      const seq = await sequenceCounterRepository.nextVal(tx, firmId, urd.fyId, 'URD');
      
      const fy = await financialYearRepository.getById(tx, firmId, urd.fyId);
      if (!fy) throw new Error('FY_NOT_FOUND');
      const fyLabel = fy.label;

      const urdNumber = `URD/${fyLabel}/${String(seq).padStart(4, '0')}`;

      await urdPurchaseRepository.update(tx, firmId, urdId, {
        status: 'CONFIRMED',
        urdNumber,
        updatedAt: now(),
      });

      await auditRepository.log(tx, {
        eventType: 'URD_PURCHASE_CONFIRMED', firmId, entityId: urdId,
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ urdId, urdNumber, totalValuePaise: urd.totalValuePaise }),
      });

      return { ...urd, status: 'CONFIRMED', urdNumber };
    });
  },

  async generateURDPurchaseBill(urdId: string, firmId: string): Promise<string> {
    const urd = await urdPurchaseRepository.getById(db as any, firmId, urdId);
    if (!urd || urd.firmId !== firmId) throw new Error('URD_NOT_FOUND_OR_WRONG_FIRM');
    if (urd.status !== 'CONFIRMED') throw new Error('URD_NOT_CONFIRMED');

    const firm = await firmRepository.getById(firmId);
    if (!firm) throw new Error('FIRM_NOT_FOUND');

    const symbol = getCurrencySymbol();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
  @page {
    size: A5 portrait;
    margin: 5mm;
  }
  body {
    font-family: 'Poppins', Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #f0f0f0;
  }
  .invoice-container {
    width: 100%;
    max-width: 148mm;
    min-height: auto;
    margin: 0 auto;
    background: white;
    border: 1px solid #ccc;
    box-sizing: border-box;
    position: relative;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
  }
  .header {
    background-color: #8b2538;
    color: white;
    padding: 15px 15px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header-left {
    font-size: 9px;
    line-height: 1.4;
  }
  .header-center {
    text-align: center;
    flex-grow: 1;
    padding: 0 10px;
  }
  .header-center h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 1px;
    line-height: 1.1;
  }
  .header-center p {
    margin: 5px 0 0 0;
    font-size: 11px;
    opacity: 0.9;
  }
  .header-center .tax-invoice {
    font-size: 11px;
    color: #f7d273;
    margin-bottom: 3px;
    font-weight: 600;
    letter-spacing: 1px;
  }
  .header-right {
    font-size: 9px;
    text-align: right;
    line-height: 1.4;
  }
  .info-section {
    display: flex;
    justify-content: space-between;
    padding: 10px 15px;
    border-bottom: 1.5px solid #8b2538;
    font-size: 10px;
    font-weight: 600;
  }
  .info-left, .info-right {
    display: grid;
    grid-template-columns: 70px 1fr;
    gap: 4px;
    width: 48%;
  }
  .info-val {
    font-weight: 400;
    border-bottom: 1px dotted #ccc;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    position: relative;
    z-index: 2;
  }
  th {
    background-color: #fcfcfc;
    border: 1px solid #000;
    padding: 8px 4px;
    text-align: center;
    color: #333;
  }
  td {
    border: 1px solid #000;
    padding: 8px 4px;
    text-align: center;
    vertical-align: top;
  }
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.04;
    z-index: 1;
    font-size: 250px;
    font-weight: bold;
    color: #8b2538;
    pointer-events: none;
    font-family: serif;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1fr 180px;
    border-top: 1.5px solid #8b2538;
    font-size: 10px;
  }
  .amount-words {
    padding: 10px 15px;
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    font-weight: 600;
  }
  .totals-table {
    width: 100%;
    border-collapse: collapse;
  }
  .totals-table td {
    border: none;
    border-bottom: 1px solid #000;
    padding: 6px 10px;
    text-align: right;
  }
  .totals-table tr td:first-child {
    border-right: 1px solid #000;
  }
  .signatures {
    display: flex;
    justify-content: space-between;
    padding: 40px 10px 20px 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .signatures > div {
    text-align: center;
  }
</style>
</head>
<body>
  <div class="invoice-container">
    <div class="watermark">${firm.name.charAt(0)}</div>
    
    <div class="header">
      <div class="header-left">
        <div>Subject to ${firm.city || 'Local'} Jurisdiction</div>
        <div>GSTIN: ${firm.gstin || 'Unregistered'}</div>
      </div>
      <div class="header-center">
        <div class="tax-invoice">PURCHASE VOUCHER</div>
        <h1>${firm.name}</h1>
        <p>${firm.addressLine1 || ''}, ${firm.city || ''}, ${firm.stateName || ''}</p>
      </div>
      <div class="header-right">
        <div>For: ${firm.proprietor || 'Proprietor'}</div>
        <div>Mo. ${firm.phone1}</div>
        ${firm.phone2 ? `<div>Mo. ${firm.phone2}</div>` : ''}
      </div>
    </div>

    <div class="info-section">
      <div class="info-left">
        <div>Name:</div>
        <div class="info-val">${urd.customerName}</div>
        <div>Address:</div>
        <div class="info-val">${urd.customerAddress || '-'}</div>
        <div>Mob:</div>
        <div class="info-val">${urd.customerMobile || '-'}</div>
        <div>PAN/Aadhar:</div>
        <div class="info-val">${urd.customerPAN || urd.customerAadhaar || '-'}</div>
      </div>
      <div class="info-right">
        <div>Date:</div>
        <div class="info-val">${urd.purchaseDate}</div>
        <div>Invoice No:</div>
        <div class="info-val">${urd.urdNumber}</div>
        <div>Pay Mode:</div>
        <div class="info-val">${urd.paymentMode}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 35%;">Description</th>
          <th style="width: 10%;">Purity</th>
          <th style="width: 15%;">Net Wt (g)</th>
          <th style="width: 15%;">Rate</th>
          <th style="width: 20%;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr style="height: auto;">
          <td style="padding-bottom: 25px;">1</td>
          <td style="text-align: left; padding-bottom: 25px;">Old ${urd.metalType} Jewellery</td>
          <td style="padding-bottom: 25px;">${urd.purityPercent}%</td>
          <td style="padding-bottom: 25px;">${(urd.grossWeightMg / 1000).toFixed(3)}</td>
          <td style="padding-bottom: 25px;">${(urd.ratePerGramPaise / 100).toFixed(2)}</td>
          <td style="padding-bottom: 25px;">${(urd.totalValuePaise / 100).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-grid">
      <div style="display: flex; flex-direction: column; justify-content: space-between;">
        <div class="amount-words">
          Amt. In Words: <span style="font-weight: normal; margin-left: 5px;">Rupees ${amountToWords(urd.totalValuePaise)} Only</span>
        </div>
        <div class="signatures">
          <div>Customer Signature</div>
          <div>! Thank You !</div>
          <div style="text-align: center;">
            <div style="margin-bottom: 30px;">For: ${firm.name}</div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      </div>
      <div>
        <table class="totals-table">
          <tr>
            <td style="width: 50%;">NET TOTAL</td>
            <td>${(urd.totalValuePaise / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Round Off</td>
            <td>0.00</td>
          </tr>
          <tr>
            <td style="font-weight: bold; font-size: 14px;">GRAND TOTAL</td>
            <td style="font-weight: bold; font-size: 14px;">${(urd.totalValuePaise / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td>NET AMOUNT</td>
            <td>${(urd.totalValuePaise / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td>AMT PAID</td>
            <td>${(urd.totalValuePaise / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="border-bottom: none;">BALANCE</td>
            <td style="border-bottom: none;">0.00</td>
          </tr>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
`;
    return html;
  }
};