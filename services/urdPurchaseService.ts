import { db } from '../db/client';
import { urdPurchaseRepository } from '../repositories/urdPurchaseRepository';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
// IDE Cache trigger
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
<div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ccc;">
  <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 24px;">\${firm.name}</h1>
    <p style="margin: 5px 0;">\${firm.address || ''}</p>
    <p style="margin: 5px 0;">GSTIN: \${firm.gstin || 'N/A'} | Phone: \${firm.phone1 || 'N/A'}</p>
    <h2 style="margin: 15px 0 5px; text-decoration: underline;">URD PURCHASE BILL</h2>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div>
      <strong>URD Number:</strong> \${urd.urdNumber}<br>
      <strong>Purchase Date:</strong> \${urd.purchaseDate}
    </div>
  </div>

  <div style="margin-bottom: 20px; border: 1px solid #000; padding: 10px;">
    <h3 style="margin-top: 0; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Seller (Customer) Details</h3>
    <strong>Name:</strong> \${urd.customerName}<br>
    <strong>Address:</strong> \${urd.customerAddress || 'Not Provided'}<br>
    <strong>Mobile:</strong> \${urd.customerMobile || 'Not Provided'}<br>
    \${
      (!urd.customerAadhaar && !urd.customerPAN) 
        ? '<strong>Identity Proof:</strong> Not Provided<br>' 
        : ''
    }
    \${urd.customerAadhaar ? \`<strong>Aadhaar:</strong> XXXX-XXXX-\${urd.customerAadhaar.slice(-4)}<br>\` : ''}
    \${urd.customerPAN ? \`<strong>PAN:</strong> \${urd.customerPAN}<br>\` : ''}
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr>
        <th style="border: 1px solid #000; padding: 8px; text-align: left;">Description</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right;">Gross Wt (g)</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right;">Purity (%)</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right;">Fine Wt (g)</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right;">Rate/g</th>
        <th style="border: 1px solid #000; padding: 8px; text-align: right;">Total Value</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #000; padding: 8px;">Old \${urd.metalType} Jewellery (\${urd.purityPercent}%)</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">\${(urd.grossWeightMg / 1000).toFixed(3)}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">\${urd.purityPercent}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">\${(urd.fineWeightMg / 1000).toFixed(3)}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">\${symbol}\${(urd.ratePerGramPaise / 100).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">\${symbol}\${(urd.totalValuePaise / 100).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-bottom: 40px;">
    <strong>Amount Paid:</strong> \${symbol}\${(urd.totalValuePaise / 100).toFixed(2)}<br>
    <strong>In Words:</strong> \${amountToWords(urd.totalValuePaise)}<br>
    <strong>Payment Mode:</strong> \${urd.paymentMode} \${urd.bankAccountId ? '(Bank/UPI)' : ''}
  </div>

  <div style="display: flex; justify-content: space-between; margin-top: 50px; text-align: center;">
    <div style="width: 45%; border-top: 1px solid #000; padding-top: 5px;">
      Seller Signature<br>
      (\${urd.customerName})
    </div>
    <div style="width: 45%; border-top: 1px solid #000; padding-top: 5px;">
      Authorized Signatory<br>
      (\${firm.name})
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 20px; font-style: italic;">
    I confirm that I have sold the above article(s) and received the stated amount.
  </div>

  <div style="margin-top: 40px; font-size: 10px; color: #666; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
    This is a computer-generated URD Purchase Bill.<br>
    \${firm.address || ''}<br>
    Printed on: \${new Date().toLocaleString()}
  </div>
</div>
`;
    return html;
  }
};
