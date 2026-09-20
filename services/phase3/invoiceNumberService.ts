// services/phase3/invoiceNumberService.ts — Phase 3 Invoice Number Generation Service
// Strictly adheres to STEP 4 Specification:
// INVOICE NUMBER FORMAT: [PREFIX]/[FY]/[SEQUENCE] e.g. VJ/24-25/0001
// Resets per FY. Never goes backward.
// Call-Site Guard (v4.8 FIX): tx argument is NON-OPTIONAL.
// Step E Error Registry: DUPLICATE_INVOICE_NUMBER.
// FIX-V523-3 (v5.23): EST docType added.

import { eq } from 'drizzle-orm';
import { ERR } from '@/constants/errorCodes';
import { invoiceNumberRepository } from '@/repositories/phase3/invoiceNumberRepository';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { financialYears } from '@/db/schema/phase1_core';
import db, { db as dbNamed } from '@/db/client';
import { DocType, InvoiceNumberConfig } from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Derives financial year short code (e.g. '24-25') from financial_years row.
 * Handles both startDate/endDate ('2024-04-01' -> '24', '2025-03-31' -> '25')
 * and label formats ('FY 2024-25' / '2024-25' / '24-25').
 */
export async function fyShortCode(fyId: string, tx?: any): Promise<string> {
  if (!fyId) return '00-00';
  const trimmed = fyId.trim();

  // If already a short code format (e.g. '24-25'), return directly
  if (/^\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const conn = getDb(tx);
  let fyRow: any = null;

  try {
    const rows = conn
      .select()
      .from(financialYears)
      .where(eq(financialYears.id, trimmed))
      .limit(1)
      .all();
    if (rows && rows.length > 0) {
      fyRow = rows[0];
    }
  } catch {
    // Fallback if table query fails
  }

  if (fyRow) {
    // 1. From startDate / endDate (e.g. '2024-04-01', '2025-03-31')
    if (fyRow.startDate && fyRow.endDate) {
      const startYearShort = String(fyRow.startDate).slice(2, 4);
      const endYearShort = String(fyRow.endDate).slice(2, 4);
      if (startYearShort && endYearShort) {
        return `${startYearShort}-${endYearShort}`;
      }
    }

    // 2. From label (e.g. 'FY 2024-25', '2024-25', '24-25')
    if (fyRow.label) {
      const match4 = String(fyRow.label).match(/20(\d{2})[-/](\d{2})/);
      if (match4) {
        return `${match4[1]}-${match4[2]}`;
      }
      const match2 = String(fyRow.label).match(/(\d{2})[-/](\d{2})/);
      if (match2) {
        return `${match2[1]}-${match2[2]}`;
      }
    }
  }

  // Fallback: search for 4-digit / 2-digit years in fyId itself e.g. 'fy-2024-2025' -> '24-25'
  const fourYearMatch = trimmed.match(/20(\d{2})[-_]?20?(\d{2})/);
  if (fourYearMatch) {
    return `${fourYearMatch[1]}-${fourYearMatch[2]}`;
  }

  const idMatch = trimmed.match(/(\d{2})[-_]?(\d{2})/);
  if (idMatch) {
    return `${idMatch[1]}-${idMatch[2]}`;
  }

  return '24-25';
}

/**
 * ✅ v4.8 FIX — CALL-SITE GUARD
 * generateInvoiceNumber() must ONLY be called with an active transaction context.
 * The tx argument is non-optional — any call site missing tx throws compile/runtime error.
 *
 * Sequence allocation per docType (SALE, PURCHASE, CN, DN, EST).
 * Formats: [PREFIX]/[FY]/[SEQUENCE] (e.g. VJ/24-25/0001).
 * Resets every FY. Never goes backward.
 */
export async function generateInvoiceNumber(
  tx: any, // non-optional: must be inside a transaction
  firmId: string,
  fyId: string,
  docType: DocType // 'SALE' | 'PURCHASE' | 'CN' | 'DN' | 'EST'
): Promise<string> {
  // Call-site guard: tx is strictly non-optional
  if (!tx || typeof tx !== 'object') {
    throw new Error('TRANSACTION_REQUIRED: generateInvoiceNumber must be called within an active transaction');
  }
  if (!firmId) {
    throw new Error('FIRM_ID_REQUIRED');
  }
  if (!fyId) {
    throw new Error('FY_ID_REQUIRED');
  }
  if (!docType) {
    throw new Error('DOC_TYPE_REQUIRED');
  }

  // Lock row or auto-bootstrap if first invoice of FY (FIX-V520-10)
  const config = await invoiceNumberRepository.lockForUpdate(tx, firmId, fyId, docType);
  const nextSeq = config.lastSequence + 1;
  const shortCode = await fyShortCode(fyId, tx);
  const number = `${config.prefix}/${shortCode}/${String(nextSeq).padStart(4, '0')}`;

  // Duplicate protection (Step E error registry)
  if (await invoiceRepository.existsByNumber(tx, firmId, number)) {
    throw new Error(ERR.DUPLICATE_INVOICE_NUMBER);
  }

  // Increment sequence and update timestamp (v5.4 GAP 7 FIX)
  await invoiceNumberRepository.incrementSequence(tx, config.id, nextSeq);

  return number;
}

/**
 * Parses an invoice number into prefix, financial year short code, and numeric sequence.
 * Returns null if format does not match [PREFIX]/[FY]/[SEQUENCE].
 */
export function parseInvoiceNumber(invoiceNumber: string): {
  prefix: string;
  fyShortCode: string;
  fyCode: string;
  sequence: number;
  fullNumber: string;
} | null {
  const parts = String(invoiceNumber || '').split('/');
  if (parts.length !== 3) {
    return null;
  }

  const prefix = parts[0].trim();
  const shortCode = parts[1].trim();
  const sequence = parseInt(parts[2].trim(), 10);

  if (!prefix || !shortCode || isNaN(sequence)) {
    return null;
  }

  return {
    prefix,
    fyShortCode: shortCode,
    fyCode: shortCode,
    sequence,
    fullNumber: invoiceNumber,
  };
}

export const invoiceNumberService = {
  generateInvoiceNumber,
  fyShortCode,
  parseInvoiceNumber,

  async getConfigs(firmId: string, fyId: string, tx?: any): Promise<InvoiceNumberConfig[]> {
    return invoiceNumberRepository.getConfigsByFirmAndFy(tx, firmId, fyId);
  },

  /**
   * Flexible updatePrefix supporting:
   * 1. (tx, configId, newPrefix)
   * 2. (configId, newPrefix, tx?)
   * 3. (firmId, fyId, docType, newPrefix, tx?)
   * 4. (tx, firmId, fyId, docType, newPrefix)
   */
  async updatePrefix(
    arg1: any,
    arg2: any,
    arg3?: any,
    arg4?: any,
    arg5?: any
  ): Promise<void> {
    // Case 1: (tx, configId, newPrefix)
    if (typeof arg1 === 'object' && typeof arg2 === 'string' && typeof arg3 === 'string' && !arg4) {
      return invoiceNumberRepository.updatePrefix(arg1, arg2, arg3);
    }

    // Case 2: (configId, newPrefix, tx?)
    if (typeof arg1 === 'string' && typeof arg2 === 'string' && (!arg3 || typeof arg3 === 'object')) {
      return invoiceNumberRepository.updatePrefix(arg3, arg1, arg2);
    }

    // Case 3: (firmId, fyId, docType, newPrefix, tx?)
    if (typeof arg1 === 'string' && typeof arg2 === 'string' && typeof arg3 === 'string' && typeof arg4 === 'string') {
      const config = await invoiceNumberRepository.getByFirmAndDocType(arg5, arg1, arg2, arg3 as DocType);
      if (!config) {
        throw new Error('INVOICE_CONFIG_NOT_FOUND');
      }
      return invoiceNumberRepository.updatePrefix(arg5, config.id, arg4);
    }

    // Case 4: (tx, firmId, fyId, docType, newPrefix)
    if (typeof arg1 === 'object' && typeof arg2 === 'string' && typeof arg3 === 'string' && typeof arg4 === 'string' && typeof arg5 === 'string') {
      const config = await invoiceNumberRepository.getByFirmAndDocType(arg1, arg2, arg3, arg4 as DocType);
      if (!config) {
        throw new Error('INVOICE_CONFIG_NOT_FOUND');
      }
      return invoiceNumberRepository.updatePrefix(arg1, config.id, arg5);
    }

    throw new Error('INVALID_UPDATE_PREFIX_ARGUMENTS');
  },
};

