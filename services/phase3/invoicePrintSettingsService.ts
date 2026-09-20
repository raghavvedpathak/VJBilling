// services/phase3/invoicePrintSettingsService.ts — Phase 3 Invoice Print Settings Service
// FIX-INVOICE-PRINT-1 (v5.19)
// Paper sizes: A4 | A5; Orientations: PORTRAIT | LANDSCAPE.
// Terms & Conditions toggle + Sanitized multiline text editor (FIX-SANITIZE-1, v5.25).
// CONSTITUTIONAL RULE: Has ZERO effect on accounting data or Phase 1 app_settings.

import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { invoicePrintSettingsRepository } from '@/repositories/phase3/invoicePrintSettingsRepository';
import { getDeviceId } from '@/utils/deviceId';
import { sanitizeText } from '@/utils/sanitize';
import {
  InvoicePrintSettings,
  InvoicePrintSettingsInput,
  PaperSize,
  PageOrientation,
} from '@/types/phase3/phase3.types';
import db, { db as dbNamed } from '@/db/client';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

export const invoicePrintSettingsService = {
  /**
   * READ-ONLY — no tx, no dual guards, no audit write.
   * If no record exists, returns canonical defaults:
   * { paperSize: 'A5', orientation: 'LANDSCAPE', showTermsAndConditions: false, termsAndConditionsText: '' }
   */
  async getPrintSettings(firmId: string): Promise<InvoicePrintSettings> {
    if (!firmId) {
      return {
        id: '',
        firmId: '',
        paperSize: 'A5',
        orientation: 'LANDSCAPE',
        showTermsAndConditions: false,
        termsAndConditionsText: '',
        updatedAt: '',
      };
    }

    const row = invoicePrintSettingsRepository.getByFirmId(firmId);
    if (!row) {
      return {
        id: `${firmId}_print_settings`,
        firmId,
        paperSize: 'A5',
        orientation: 'LANDSCAPE',
        showTermsAndConditions: false,
        termsAndConditionsText: '',
        updatedAt: '',
      };
    }

    return row;
  },

  /**
   * WRITE — dual guard + audit write.
   * 1. await assertNoActiveLease(); assertNotInSafeMode()
   * 2. Validate: paperSize in {'A4','A5'}; orientation in {'PORTRAIT','LANDSCAPE'}
   * 3. If showTermsAndConditions=true AND text.trim()='' -> force false (UI guards first)
   * 3b. termsAndConditionsText = sanitizeText(input.termsAndConditionsText, { allowNewlines: true })
   *     — throw INVALID_TEXT_CONTENT if sanitizeText() rejects it (FIX-SANITIZE-1, v5.25)
   * 4. INSERT OR REPLACE invoice_print_settings (id = firmId + '_print_settings', using sanitized text)
   * 5. auditRepo.log: eventType=INVOICE_PRINT_SETTINGS_UPDATED, firmId, entityId:firmId, deviceId:getDeviceId(),
   *    payload:{paperSize,orientation,showTermsAndConditions}
   */
  async savePrintSettings(
    input: InvoicePrintSettingsInput,
    firmId: string,
    customTx?: any
  ): Promise<InvoicePrintSettings> {
    // 1. Dual guard
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }

    // 2. Validate paperSize and orientation
    const validSizes: PaperSize[] = ['A4', 'A5'];
    const validOrientations: PageOrientation[] = ['PORTRAIT', 'LANDSCAPE'];

    if (!validSizes.includes(input.paperSize)) {
      throw new Error('INVALID_PAPER_SIZE: Must be A4 or A5');
    }
    if (!validOrientations.includes(input.orientation)) {
      throw new Error('INVALID_PAGE_ORIENTATION: Must be PORTRAIT or LANDSCAPE');
    }

    // 3b. Sanitize text with allowNewlines: true (FIX-SANITIZE-1, v5.25)
    let sanitizedText = '';
    if (input.termsAndConditionsText && typeof input.termsAndConditionsText === 'string') {
      // sanitizeText throws INVALID_TEXT_CONTENT if invalid / completely stripped
      sanitizedText = sanitizeText(input.termsAndConditionsText, { allowNewlines: true });
    }

    // 3. If showTermsAndConditions=true AND text.trim()='' -> force false
    let showTerms = Boolean(input.showTermsAndConditions);
    if (showTerms && sanitizedText.trim().length === 0) {
      showTerms = false;
    }

    return executeTransaction(async (tx) => {
      // 4. INSERT OR REPLACE invoice_print_settings
      const saved = invoicePrintSettingsRepository.upsert(
        {
          firmId,
          paperSize: input.paperSize,
          orientation: input.orientation,
          showTermsAndConditions: showTerms,
          termsAndConditionsText: sanitizedText,
        },
        tx
      );

      // 5. Audit log
      auditRepository.log(
        {
          firmId,
          eventType: 'INVOICE_PRINT_SETTINGS_UPDATED',
          entityId: firmId,
          deviceId: getSafeDeviceId(),
          payload: {
            paperSize: input.paperSize,
            orientation: input.orientation,
            showTermsAndConditions: showTerms,
          },
        },
        tx
      );

      return saved;
    }, customTx);
  },
};
