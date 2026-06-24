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
    const urd = await urdPurchaseRepository.getById(id);
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
      const urd = await urdPurchaseRepository.getById(urdId);
      if (!urd || urd.firmId !== firmId) throw new Error('URD_NOT_FOUND_OR_WRONG_FIRM');
      if (urd.status !== 'DRAFT') throw new Error('URD_ALREADY_CONFIRMED');

      // PHASE 1 ALIGNMENT LIMIT: Max value ₹99,99,999.99 to prevent amountToWords overflow
      if (urd.totalValuePaise > 999999999) throw new Error('URD_AMOUNT_EXCEEDS_MAX');

      const seq = await sequenceCounterRepository.nextVal(tx, firmId, urd.fyId, 'URD');
      
      const fy = await financialYearRepository.getById(tx, urd.fyId);
      if (!fy) throw new Error('FY_NOT_FOUND');
      const fyLabel = fy.label;

      const urdNumber = `URD/${fyLabel}/${String(seq).padStart(4, '0')}`;

      await urdPurchaseRepository.update(tx, urdId, {
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
    const urd = await urdPurchaseRepository.getById(urdId);
    if (!urd || urd.firmId !== firmId) throw new Error('URD_NOT_FOUND_OR_WRONG_FIRM');
    if (urd.status !== 'CONFIRMED') throw new Error('URD_NOT_CONFIRMED');

    const firm = await firmRepository.getById(firmId);
    if (!firm) throw new Error('FIRM_NOT_FOUND');

    const symbol = getCurrencySymbol();
    
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; border: 2px solid #000; padding: 0; box-sizing: border-box; background: white;">
  
  <!-- Header Section -->
  <div style="padding: 10px; text-align: center; position: relative;">
    <div style="position: absolute; top: 10px; right: 10px; font-size: 10px;">
      <div style="margin-bottom: 5px;">Subject to ${firm.city || 'Local'} Jurisdiction</div>
      <div style="display: flex; gap: 5px; font-weight: bold; justify-content: flex-end;">
        <div style="border: 1px solid #000; padding: 2px 15px;">CASH ${urd.paymentMode === 'CASH' ? '✓' : ''}</div>
        <div style="border: 1px solid #000; padding: 2px 15px;">CREDIT ${urd.paymentMode !== 'CASH' ? '✓' : ''}</div>
      </div>
    </div>
    <div style="margin-top: 10px; color: red; font-size: 14px; font-weight: bold;">|| Shri ||</div>
    <div style="color: red; font-size: 24px; font-weight: bold; margin: 5px 0;">${firm.name}</div>
    <div style="color: red; font-size: 14px; margin: 5px 0;">${firm.addressLine1 || ''}</div>
    <div style="color: red; font-size: 14px; font-weight: bold; margin: 5px 0;">${firm.ownerName ? firm.ownerName + ' - ' : ''}${firm.phone1 || ''}</div>
  </div>

  <!-- Bill Title -->
  <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; text-align: center; padding: 5px;">
    <div style="color: red; font-size: 18px; font-weight: bold;">URD PURCHASE BILL</div>
  </div>

  <!-- Declarations & Tax Row -->
  <div style="border-bottom: 1px solid #000; padding: 5px; font-size: 10px; text-align: center;">
    *As per Serial No 4 & 5 of Annexure to Rule No.138 (14) of CGST Rules, 2017, E-way bill is not required to be generated for items included in this invoice.*
  </div>
  <div style="display: flex; border-bottom: 1px solid #000; font-size: 12px; font-weight: bold;">
    <div style="flex: 1; padding: 5px; border-right: 1px solid #000;">Tax is Payable on Reverse Charge - (No)</div>
    <div style="flex: 1; padding: 5px; display: flex; justify-content: space-between;">
      <span>State Code : ${firm.stateCode || '27'} (${firm.state || 'Maharashtra'})</span>
      <span style="color: red; font-size: 14px;">GSTIN: ${firm.gstin || ''}</span>
    </div>
  </div>

  <!-- Bill Meta -->
  <div style="display: flex; border-bottom: 1px solid #000; font-size: 12px;">
    <div style="flex: 1; padding: 5px; border-right: 1px solid #000;">URD Purchase Bill No. : <strong>${urd.urdNumber}</strong></div>
    <div style="flex: 1; padding: 5px;">URD Purchase Bill Date : <strong>${urd.purchaseDate}</strong></div>
  </div>

  <!-- Seller Details -->
  <div style="padding: 10px 5px; font-size: 12px; border-bottom: 1px solid #000; line-height: 1.8;">
    <strong>Details of Seller (Customer Name)</strong><br>
    <div style="display: flex;">
      <span style="width: 80px;">Name</span>
      <span style="flex: 1; border-bottom: 1px dotted #000;">${urd.customerName}</span>
    </div>
    <div style="display: flex; margin-top: 5px;">
      <span style="width: 80px;">Address</span>
      <span style="flex: 1; border-bottom: 1px dotted #000;">${urd.customerAddress || ''}</span>
    </div>
    <div style="display: flex; margin-top: 5px;">
      <span style="width: 80px;">Mobile No</span>
      <span style="flex: 1; border-bottom: 1px dotted #000;">${urd.customerMobile || ''}</span>
    </div>
    <div style="display: flex; margin-top: 5px; align-items: center;">
      <span style="width: 80px;">PAN No.</span>
      <div style="display: flex; margin-right: 20px;">
        ${(urd.customerPAN ? urd.customerPAN.padEnd(10, ' ') : '          ').split('').map(char => '<div style="width: 15px; height: 20px; border: 1px solid #000; text-align: center; line-height: 20px; text-transform: uppercase;">' + (char === ' ' ? '' : char) + '</div>').join('')}
      </div>
      <span>Aadhar Card No. : </span>
      <span style="flex: 1; border-bottom: 1px dotted #000; margin-left: 10px;">${urd.customerAadhaar || ''}</span>
    </div>
  </div>

  <!-- Table -->
  <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 12px;">
    <thead>
      <tr style="border-bottom: 1px solid #000;">
        <th style="border-right: 1px solid #000; padding: 5px; width: 40px;">Sr.<br>No.</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Description of Goods</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Carat</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Purity</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Qty.</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Weight<br>in Gram</th>
        <th style="border-right: 1px solid #000; padding: 5px;">Rate<br>Per Gram</th>
        <th style="padding: 5px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr style="height: 150px; vertical-align: top;">
        <td style="border-right: 1px solid #000; padding: 5px;">1</td>
        <td style="border-right: 1px solid #000; padding: 5px;">Old ${urd.metalType} Jewellery</td>
        <td style="border-right: 1px solid #000; padding: 5px;">${Math.round(urd.purityPercent / 100 * 24)}K</td>
        <td style="border-right: 1px solid #000; padding: 5px;">${urd.purityPercent}%</td>
        <td style="border-right: 1px solid #000; padding: 5px;">1</td>
        <td style="border-right: 1px solid #000; padding: 5px;">${(urd.grossWeightMg / 1000).toFixed(3)}</td>
        <td style="border-right: 1px solid #000; padding: 5px;">${(urd.ratePerGramPaise / 100).toFixed(2)}</td>
        <td style="padding: 5px;">${(urd.totalValuePaise / 100).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Footer Sections -->
  <div style="border-top: 1px solid #000; display: flex; font-size: 12px; height: 50px;">
    <div style="flex: 2; border-right: 1px solid #000; padding: 5px;">
      <div style="display: flex; justify-content: space-between;">
        <span><strong>Bank Details :</strong> Bank of :</span>
        <span>Branch :</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 5px;">
        <span>A/c. No. :</span>
        <span>IFSC Code :</span>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column;">
      <div style="flex: 1; border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 5px; font-weight: bold;">Discount</div>
      <div style="flex: 1; border-right: 1px solid #000; padding: 5px; font-weight: bold;">Purchase Value</div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column;">
      <div style="flex: 1; border-bottom: 1px solid #000; padding: 5px; text-align: right;">-</div>
      <div style="flex: 1; padding: 5px; text-align: right; font-weight: bold;">${(urd.totalValuePaise / 100).toFixed(2)}</div>
    </div>
  </div>

  <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; font-size: 12px;">
    Total Amount in words Rs. <strong>${amountToWords(urd.totalValuePaise)}</strong>
  </div>

  <!-- Declaration -->
  <div style="padding: 5px; font-size: 10px; line-height: 1.4; border-bottom: 1px solid #000;">
    <strong>Declaration</strong> 1) Verified that the Particulars given above are true and correct & the amount indicated Represent the price actually charge & that there is no flow additional consideration directly or indirectly from the buyer. 2) We are agreed on valuation done at the time of purchase.
  </div>

  <!-- Signatures -->
  <div style="display: flex; justify-content: space-between; padding: 10px 20px 40px 20px; font-size: 12px; font-weight: bold;">
    <div style="margin-top: 40px;">Customer's Signature</div>
    <div style="color: red;">For ${firm.name}</div>
  </div>

</div>
`;
    return html;
  }
};