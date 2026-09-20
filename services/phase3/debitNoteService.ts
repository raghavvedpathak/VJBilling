// services/phase3/debitNoteService.ts — Phase 3 Debit Note Service
// Implements STEP 14 Specification (v5.22 FIX-V522-11 / v5.23 FIX-V523-1 / v5.25 FIX-SANITIZE-1 & FIX-AUDITSHAPE-1)
// Underbilling correction. Increases customer receivable. Single-operation POSTED-only.

import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { debitNoteRepository } from '@/repositories/phase3/debitNoteRepository';
import { invoiceRepository } from '@/repositories/phase3/invoiceRepository';
import { ledgerRepository } from '@/repositories/phase3/ledgerRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { resolveTransactionFyId } from '@/services/phase1/fyService';
import { generateInvoiceNumber } from '@/services/phase3/invoiceNumberService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { sanitizeText } from '@/utils/sanitize';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { ERR } from '@/constants/errorCodes';
import {
  DebitNote,
  CreateDebitNoteInput,
  CreateDebitNoteResult,
} from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Creates and posts a Debit Note for underbilling correction.
 * Increases customer receivable.
 * Executes all 10 steps inside a single atomic db.transaction().
 */
export async function createDebitNote(input: CreateDebitNoteInput): Promise<CreateDebitNoteResult> {
  // Dual Fortress Guards
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  if (!input.firmId) {
    throw new Error(ERR.FIRM_NOT_FOUND);
  }
  if (!input.entryDate) {
    throw new Error('ENTRY_DATE_REQUIRED');
  }

  // Step 4 Validations:
  // Validate input.additionalAmountPaise > 0 — throw DEBIT_NOTE_AMOUNT_ZERO if not
  if (!input.additionalAmountPaise || input.additionalAmountPaise <= 0) {
    throw new Error(ERR.DEBIT_NOTE_AMOUNT_ZERO);
  }

  // Validate input.reason is non-empty string — throw DEBIT_NOTE_REASON_EMPTY if not
  if (!input.reason || typeof input.reason !== 'string' || input.reason.trim().length === 0) {
    throw new Error(ERR.DEBIT_NOTE_REASON_EMPTY);
  }

  // reason = sanitizeText(input.reason) — throw INVALID_TEXT_CONTENT if sanitizeText() rejects it
  const sanitizedReason = sanitizeText(input.reason);
  if (!sanitizedReason) {
    throw new Error(ERR.INVALID_TEXT_CONTENT);
  }

  const conn = getDb();
  const deviceId = getSafeDeviceId();

  return conn.transaction(async (tx: any) => {
    // Step 1: DUAL GUARD — await firmRepository.getById(tx, input.firmId) ?? throw FIRM_NOT_FOUND
    const firm = firmRepository.getById(input.firmId, tx);
    if (!firm) {
      throw new Error(ERR.FIRM_NOT_FOUND);
    }

    // Step 2: fyId = await resolveTransactionFyId(input.firmId, input.entryDate)
    // Throws ENTRY_DATE_IN_CLOSED_FY if no ACTIVE FY covers entryDate.
    const fyId = resolveTransactionFyId(input.firmId, input.entryDate, tx);
    if (!fyId) {
      throw new Error(ERR.ENTRY_DATE_IN_CLOSED_FY);
    }

    // Step 3: Validate originalInvoice — await saleInvoiceRepository.getById(tx, input.originalInvoiceId) ?? throw INVOICE_NOT_FOUND
    const originalInvoice = await invoiceRepository.getById(input.originalInvoiceId, tx);
    if (!originalInvoice) {
      throw new Error(ERR.INVOICE_NOT_FOUND);
    }

    // Confirm invoice.firmId === input.firmId — throw FIRM_INVOICE_MISMATCH if not
    if (originalInvoice.firmId !== input.firmId) {
      throw new Error(ERR.FIRM_INVOICE_MISMATCH);
    }

    // Confirm invoice.status === 'POSTED' — throw INVOICE_NOT_POSTED if not
    if (originalInvoice.status !== 'POSTED') {
      throw new Error(ERR.INVOICE_NOT_POSTED);
    }

    // Step 5: dnNumber = await generateInvoiceNumber(tx, input.firmId, fyId, 'DN')
    const dnNumber = await generateInvoiceNumber(tx, input.firmId, fyId, 'DN');

    const debitNoteId = Crypto.randomUUID();
    const nowIso = now();
    const additionalAmountPaise = Math.round(input.additionalAmountPaise);

    // Step 6: INSERT into debit_notes
    // No DRAFT state — debit notes are single-operation POSTED-only (Rule 3)
    const debitNote = debitNoteRepository.insert(tx, {
      id: debitNoteId,
      firmId: input.firmId,
      fyId,
      customerId: originalInvoice.customerId,
      originalInvoiceId: originalInvoice.id,
      dnNumber,
      entryDate: input.entryDate,
      reason: sanitizedReason,
      additionalAmountPaise,
      status: 'POSTED',
      createdAt: nowIso,
    });

    // Step 7: INSERT into ledger_entries — DEBIT entry increases customer receivable
    const ledgerEntry = ledgerRepository.insert(tx, {
      id: Crypto.randomUUID(),
      firmId: input.firmId,
      fyId,
      partyId: originalInvoice.customerId,
      partyType: 'CUSTOMER',
      type: 'DEBIT',
      amountPaise: additionalAmountPaise,
      linkedEntityType: 'DEBIT_NOTE',
      linkedEntityId: debitNote.id,
      notes: sanitizedReason,
      description: `Debit Note ${dnNumber} (Adjustment on ${originalInvoice.invoiceNumber || originalInvoice.id})`,
      createdAt: nowIso,
    });

    // Step 8: auditRepo.log(tx, { eventType: 'DEBIT_NOTE_CREATED', firmId, entityId: debitNote.id, deviceId, payload })
    auditRepository.log(tx, {
      eventType: 'DEBIT_NOTE_CREATED',
      firmId: input.firmId,
      entityId: debitNote.id,
      deviceId,
      payload: {
        dnNumber,
        originalInvoiceId: originalInvoice.id,
        customerId: originalInvoice.customerId,
        additionalAmountPaise,
        reason: sanitizedReason,
      },
    });

    // Step 9: Invalidate MMKV balance cache for this customer
    accountingTruthService.invalidateCache(input.firmId, 'CUSTOMER', originalInvoice.customerId);

    // Step 10: COMMIT transaction. Return: { debitNote, ledgerEntry, dnNumber }
    return {
      debitNote,
      ledgerEntry,
      dnNumber,
    };
  });
}

/**
 * Gets a debit note by ID.
 */
export async function getDebitNoteById(
  id: string,
  firmId?: string,
  customTx?: any
): Promise<DebitNote | null> {
  const note = await debitNoteRepository.getById(id, customTx);
  if (!note) return null;
  if (firmId && note.firmId !== firmId) return null;
  return note;
}

/**
 * Gets all debit notes linked to a specific original invoice.
 */
export async function getDebitNotesByInvoice(
  originalInvoiceId: string,
  firmId: string,
  customTx?: any
): Promise<DebitNote[]> {
  return debitNoteRepository.findByOriginalInvoiceId(firmId, originalInvoiceId, customTx);
}

/**
 * Lists all debit notes for a firm.
 */
export async function listDebitNotes(
  firmId: string,
  customTx?: any
): Promise<DebitNote[]> {
  return debitNoteRepository.listByFirm(firmId, customTx);
}

/**
 * Lists all debit notes for a customer.
 */
export async function listDebitNotesByCustomer(
  firmId: string,
  customerId: string,
  customTx?: any
): Promise<DebitNote[]> {
  return debitNoteRepository.listByCustomer(firmId, customerId, customTx);
}

export const debitNoteService = {
  createDebitNote,
  getDebitNoteById,
  getDebitNotesByInvoice,
  listDebitNotes,
  listDebitNotesByCustomer,
};
