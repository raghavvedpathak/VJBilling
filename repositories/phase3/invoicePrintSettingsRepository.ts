// repositories/phase3/invoicePrintSettingsRepository.ts — Phase 3 Invoice Print Settings Data Access Layer
// FIX-INVOICE-PRINT-1 (v5.19)
// Pattern: INSERT OR REPLACE on every save. One row per firm at all times.
// ID format: '{firmId}_print_settings'

import { eq } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { invoicePrintSettings } from '@/db/schema/phase3_money_truth';
import {
  InvoicePrintSettings,
  NewInvoicePrintSettings,
} from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const invoicePrintSettingsRepository = {
  /**
   * Retrieves print settings for a firm.
   * Returns null if no record exists.
   */
  getByFirmId(firmId: string, customTx?: any): InvoicePrintSettings | null {
    if (!firmId) return null;
    const conn = getDb(customTx);
    const expectedId = `${firmId}_print_settings`;

    const rows = conn
      .select()
      .from(invoicePrintSettings)
      .where(eq(invoicePrintSettings.id, expectedId))
      .limit(1)
      .all();

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      firmId: row.firmId,
      paperSize: row.paperSize as any,
      orientation: row.orientation as any,
      showTermsAndConditions: row.showTermsAndConditions === 1,
      termsAndConditionsText: row.termsAndConditionsText || '',
      updatedAt: row.updatedAt,
    };
  },

  /**
   * Persists print settings using INSERT OR REPLACE pattern.
   * Ensures exactly one row per firm at all times.
   */
  upsert(
    settings: {
      firmId: string;
      paperSize: 'A4' | 'A5';
      orientation: 'PORTRAIT' | 'LANDSCAPE';
      showTermsAndConditions: boolean;
      termsAndConditionsText: string;
    },
    customTx?: any
  ): InvoicePrintSettings {
    const conn = getDb(customTx);
    const id = `${settings.firmId}_print_settings`;
    const timestamp = now();

    const toPersist: NewInvoicePrintSettings = {
      id,
      firmId: settings.firmId,
      paperSize: settings.paperSize,
      orientation: settings.orientation,
      showTermsAndConditions: settings.showTermsAndConditions ? 1 : 0,
      termsAndConditionsText: settings.termsAndConditionsText,
      updatedAt: timestamp,
    };

    // Use INSERT OR REPLACE / ON CONFLICT
    try {
      conn
        .insert(invoicePrintSettings)
        .values(toPersist)
        .onConflictDoUpdate({
          target: invoicePrintSettings.id,
          set: {
            paperSize: toPersist.paperSize,
            orientation: toPersist.orientation,
            showTermsAndConditions: toPersist.showTermsAndConditions,
            termsAndConditionsText: toPersist.termsAndConditionsText,
            updatedAt: toPersist.updatedAt,
          },
        })
        .run();
    } catch {
      // Fallback for drivers without onConflictDoUpdate or raw execution
      conn
        .delete(invoicePrintSettings)
        .where(eq(invoicePrintSettings.id, id))
        .run();
      conn
        .insert(invoicePrintSettings)
        .values(toPersist)
        .run();
    }

    return {
      id,
      firmId: settings.firmId,
      paperSize: settings.paperSize,
      orientation: settings.orientation,
      showTermsAndConditions: settings.showTermsAndConditions,
      termsAndConditionsText: settings.termsAndConditionsText,
      updatedAt: timestamp,
    };
  },
};
