// services/phase3/karigarMasterService.ts — Phase 3 Karigar Master & Dual Ledger Service
// Adheres strictly to STEP 3 Specification:
// Independent party type — NOT a subtype of Supplier.
// Dual Ledger: Metal Balance (fine mg) & Money Balance (paise).
// Metal-to-Money Settlement (v4.7).
// Cross-FY Lifetime Carryforward (v5.17 FIX-KARIGAR-CROSSFY-1).
// v4.9 purityPct:0 NO-MULTIPLY RULE.

import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { karigarMasterRepository } from '@/repositories/phase3/karigarMasterRepository';
import {
  karigarLedgerRepository,
  getMetalBalance,
} from '@/repositories/phase3/karigarLedgerRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { fyService } from '@/services/phase1/fyService';
import { getDeviceId } from '@/utils/deviceId';
import {
  Karigar,
  CreateKarigarInput,
  UpdateKarigarInput,
  KarigarLedgerEntry,
  KarigarBalanceSummary,
  SettleKarigarMetalInput,
  RecordJobWorkIssueInput,
  RecordJobWorkReceiptInput,
  RecordLabourPaymentInput,
  RecordKarigarMixedPaymentInput,
  RecordKarigarMixedPaymentResult,
} from '@/types/phase3/phase3.types';

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

export const karigarMasterService = {
  /**
   * Creates a new karigar.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * CONSTITUTIONAL GUARD: Karigar is strictly an independent party type.
   */
  async createKarigar(input: CreateKarigarInput, customTx?: any): Promise<Karigar> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('KARIGAR_NAME_REQUIRED');
    }

    return executeTransaction(async (tx) => {
      // Soft-unique mobile check: warn, do NOT block
      if (input.mobile && input.mobile.trim()) {
        const dup = karigarMasterRepository.findByMobile(tx, input.firmId, input.mobile.trim());
        if (dup) {
          console.warn(
            `[karigarMasterService] Soft duplicate mobile warning: A karigar with mobile ${input.mobile} already exists (${dup.name}). Allowing creation.`
          );
        }
      }

      const created = karigarMasterRepository.insert(tx, {
        id: crypto.randomUUID(),
        firmId: input.firmId,
        name: input.name.trim(),
        mobile: input.mobile?.trim() || null,
        address: input.address?.trim() || null,
        speciality: input.speciality?.trim() || null,
        bankName: input.bankName?.trim() || null,
        bankAccount: input.bankAccount?.trim() || null,
        ifsc: input.ifsc?.trim()?.toUpperCase() || null,
        isArchived: 0,
        isDeleted: 0,
      });

      // Canonical Audit Log
      auditRepository.log(tx, {
        eventType: 'KARIGAR_CREATED',
        firmId: input.firmId,
        entityId: created.id,
        deviceId: getSafeDeviceId(),
        payload: {
          name: created.name,
          speciality: created.speciality ?? null,
          mobile: created.mobile ?? null,
        },
      });

      return created;
    }, customTx);
  },

  /**
   * SEARCH-P3 (v5.5): Typeahead search by karigar name or mobile.
   * READ-ONLY — no dual guards — no audit write — no tx.
   * If query is less than 2 characters, returns empty list.
   */
  async searchKarigars(firmId: string, query: string): Promise<Karigar[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }
    return karigarMasterRepository.searchByNameOrMobile(firmId, query.trim());
  },

  /**
   * Gets a karigar by ID within a firm.
   * READ-ONLY lookup.
   */
  async getKarigarById(firmId: string, id: string): Promise<Karigar | null> {
    if (!firmId || !id) return null;
    return karigarMasterRepository.findById(firmId, id);
  },

  /**
   * Lists all active karigars for a firm.
   * READ-ONLY lookup.
   */
  async listKarigars(firmId: string): Promise<Karigar[]> {
    if (!firmId) return [];
    return karigarMasterRepository.listByFirm(firmId);
  },

  /**
   * Gets current dual balance summary for a karigar (Metal fine mg & Money paise).
   * Lifetime firm-wide aggregates (v5.17 FIX-KARIGAR-CROSSFY-1).
   * READ-ONLY lookup.
   */
  async getKarigarBalances(firmId: string, karigarId: string): Promise<KarigarBalanceSummary> {
    if (!firmId || !karigarId) {
      return { metalBalanceMg: 0, moneyBalancePaise: 0 };
    }
    return karigarLedgerRepository.getBalanceSummary(firmId, karigarId);
  },

  /**
   * Retrieves all ledger entries for a karigar.
   * READ-ONLY lookup.
   */
  async getKarigarLedgerEntries(firmId: string, karigarId: string): Promise<KarigarLedgerEntry[]> {
    if (!firmId || !karigarId) return [];
    return karigarLedgerRepository.getEntriesByKarigar(firmId, karigarId);
  },

  /**
   * Updates an existing karigar.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   */
  async updateKarigar(
    firmId: string,
    id: string,
    updates: UpdateKarigarInput,
    customTx?: any
  ): Promise<Karigar> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) {
      throw new Error(ERR.KARIGAR_NOT_FOUND);
    }

    return executeTransaction(async (tx) => {
      const existing = karigarMasterRepository.findById(tx, firmId, id);
      if (!existing) {
        throw new Error(ERR.KARIGAR_NOT_FOUND);
      }

      return karigarMasterRepository.update(tx, firmId, id, updates);
    }, customTx);
  },

  /**
   * Soft-archives a karigar.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * Hard delete is structurally prevented.
   */
  async archiveKarigar(firmId: string, id: string, customTx?: any): Promise<boolean> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) {
      throw new Error(ERR.KARIGAR_NOT_FOUND);
    }

    return executeTransaction(async (tx) => {
      const existing = karigarMasterRepository.findById(tx, firmId, id);
      if (!existing) {
        throw new Error(ERR.KARIGAR_NOT_FOUND);
      }

      return karigarMasterRepository.archive(tx, firmId, id);
    }, customTx);
  },

  /**
   * STEP 3B / v4.7 — settleKarigarMetalAsMoney() FULL SERVICE SPECIFICATION
   * Settles outstanding fine metal as payable money at a shop-owner-entered bhav rate.
   *
   * SERVICE CONTRACT — Input:
   * • karigarId: string — must exist and be firm-scoped
   * • firmId: string
   * • fyId?: string — for day-book audit
   * • fineWeightMg: integer — fine milligrams being settled (> 0)
   * • ratePaisePerGram: integer — bhav rate entered by shop owner (> 0)
   * • linkedMetalEntryId: string — ID of the METAL_OUT karigar_ledger row selected by owner (mandatory, not nullable)
   * • notes?: text — optional but recommended
   *
   * VALIDATIONS (Strict sequence before any DB write):
   * (6) Dual guard: await leaseService.assertNoActiveLease() + safeModeService.assertNotInSafeMode()
   * (1) karigar does not exist or does not belong to firmId -> throw KARIGAR_NOT_FOUND
   * (2) fineWeightMg <= 0 -> throw SETTLEMENT_WEIGHT_INVALID (v5.1 fix)
   * (3) ratePaisePerGram <= 0 -> throw SETTLEMENT_RATE_INVALID (v5.1 fix)
   * (4) linkedMetalEntryId does not reference a valid karigar_ledger row with type = METAL_OUT,
   *     karigarId matching, firmId matching -> throw LINKED_METAL_ENTRY_INVALID
   * (5) Aggregate balance check INSIDE transaction (v4.8 / v5.20 FIX-V520-13):
   *     current fineOutstandingMg < fineWeightMg -> throw SETTLEMENT_EXCEEDS_METAL_BALANCE
   *
   * WRITES (All inside ONE db.transaction()):
   * (1) karigar_ledger.insert: type = METAL_SETTLED_AS_MONEY, weightMg = fineWeightMg,
   *     amountPaise = Math.round(fineWeightMg / 1000 * ratePaisePerGram), ratePaisePerGram,
   *     isManualRate = 1, linkedEntityId = linkedMetalEntryId, purityPct = 0 (v4.9 rule)
   * (2) auditRepo.log: eventType = KARIGAR_METAL_SETTLED, deviceId = getDeviceId(),
   *     payload captures all key fields (v5.4 GAP 1 FIX)
   */
  async settleKarigarMetalAsMoney(
    input: SettleKarigarMetalInput,
    customTx?: any
  ): Promise<{ entry: KarigarLedgerEntry; newBalance: KarigarBalanceSummary }> {
    // (6) Dual guard
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.karigarId) {
      throw new Error(ERR.KARIGAR_NOT_FOUND);
    }

    const fineWeightMg = input.fineWeightMg ?? input.settleWeightMg ?? 0;
    // (2) fineWeightMg <= 0 -> throw SETTLEMENT_WEIGHT_INVALID
    if (fineWeightMg <= 0) {
      throw new Error(ERR.SETTLEMENT_WEIGHT_INVALID);
    }

    // (3) ratePaisePerGram <= 0 -> throw SETTLEMENT_RATE_INVALID
    if (!input.ratePaisePerGram || input.ratePaisePerGram <= 0) {
      throw new Error(ERR.SETTLEMENT_RATE_INVALID);
    }

    const linkedMetalEntryId = (input.linkedMetalEntryId ?? input.linkedEntityId ?? '').trim();
    // (4) linkedMetalEntryId must be provided
    if (!linkedMetalEntryId) {
      throw new Error(ERR.LINKED_METAL_ENTRY_INVALID);
    }

    return executeTransaction(async (tx) => {
      // (1) Karigar does not exist or does not belong to firmId -> throw KARIGAR_NOT_FOUND
      const party = karigarMasterRepository.findById(tx, input.firmId, input.karigarId);
      if (!party) {
        throw new Error(ERR.KARIGAR_NOT_FOUND);
      }

      // (4) linkedMetalEntryId does not reference a valid karigar_ledger row with type = METAL_OUT,
      // karigarId matching, firmId matching -> throw LINKED_METAL_ENTRY_INVALID
      const linkedEntry = karigarLedgerRepository.findById(tx, linkedMetalEntryId);
      if (
        !linkedEntry ||
        linkedEntry.type !== 'METAL_OUT' ||
        linkedEntry.karigarId !== input.karigarId ||
        linkedEntry.firmId !== input.firmId
      ) {
        throw new Error(ERR.LINKED_METAL_ENTRY_INVALID);
      }

      // (5) Aggregate balance check INSIDE transaction (v4.8 / v5.20 FIX-V520-13):
      // getMetalBalance() is called with active tx parameter before writes
      const balance = await getMetalBalance(tx, input.karigarId, input.firmId);
      if (balance.fineOutstandingMg < fineWeightMg) {
        throw new Error(ERR.SETTLEMENT_EXCEEDS_METAL_BALANCE);
      }

      // Calculate rupee/paise amount
      const amountPaise = Math.round((fineWeightMg / 1000) * input.ratePaisePerGram);

      // (1) Insert append-only ledger row
      const entry = karigarLedgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId: input.fyId ?? null,
        karigarId: input.karigarId,
        type: 'METAL_SETTLED_AS_MONEY',
        weightMg: fineWeightMg, // Fine weight settled (v4.9: purityPct: 0)
        purityPct: 0,
        amountPaise,
        ratePaisePerGram: input.ratePaisePerGram,
        isManualRate: 1,
        linkedEntityId: linkedMetalEntryId,
        linkedJobWorkId: input.linkedJobWorkId?.trim() || linkedEntry.linkedJobWorkId || null,
        notes: input.notes?.trim() || `Settled ${fineWeightMg}mg fine metal at ₹${input.ratePaisePerGram / 100}/g`,
      });

      // (2) Canonical Audit Log (v5.4 GAP 1 FIX)
      auditRepository.log(tx, {
        eventType: 'KARIGAR_METAL_SETTLED',
        firmId: input.firmId,
        entityId: entry.id,
        deviceId: getSafeDeviceId(),
        payload: {
          karigarId: input.karigarId,
          settleWeightMg: fineWeightMg,
          fineWeightMg,
          ratePaisePerGram: input.ratePaisePerGram,
          amountPaise,
          linkedEntityId: linkedMetalEntryId,
          linkedMetalEntryId,
          linkedJobWorkId: input.linkedJobWorkId?.trim() || linkedEntry.linkedJobWorkId || null,
        },
      });

      const newBalance = karigarLedgerRepository.getBalanceSummary(tx, input.firmId, input.karigarId);

      return { entry, newBalance };
    }, customTx);
  },

  /**
   * Records issuance of raw metal to a karigar (METAL_OUT).
   * Increases karigar's fine metal balance.
   */
  async recordJobWorkIssue(
    input: RecordJobWorkIssueInput,
    customTx?: any
  ): Promise<KarigarLedgerEntry> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) throw new Error('FIRM_ID_REQUIRED');
    if (!input.karigarId) throw new Error(ERR.KARIGAR_NOT_FOUND);
    if (!input.weightMg || input.weightMg <= 0) throw new Error('WEIGHT_REQUIRED');
    if (input.purityPct === undefined || input.purityPct <= 0) throw new Error('PURITY_REQUIRED');

    return executeTransaction(async (tx) => {
      const karigarRecord = karigarMasterRepository.findById(tx, input.firmId, input.karigarId);
      if (!karigarRecord) throw new Error(ERR.KARIGAR_NOT_FOUND);

      return karigarLedgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId: input.fyId ?? null,
        karigarId: input.karigarId,
        type: 'METAL_OUT',
        weightMg: input.weightMg,
        purityPct: input.purityPct,
        amountPaise: 0,
        ratePaisePerGram: 0,
        isManualRate: 0,
        linkedJobWorkId: input.linkedJobWorkId || null,
        notes: input.notes || null,
      });
    }, customTx);
  },

  /**
   * Records return of ornaments from a karigar (METAL_IN + optional LABOUR_PAYABLE).
   * Decreases karigar's fine metal balance; adds to labour payable.
   */
  async recordJobWorkReceipt(
    input: RecordJobWorkReceiptInput,
    customTx?: any
  ): Promise<{ metalInEntry: KarigarLedgerEntry; labourEntry?: KarigarLedgerEntry }> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) throw new Error('FIRM_ID_REQUIRED');
    if (!input.karigarId) throw new Error(ERR.KARIGAR_NOT_FOUND);
    if (!input.weightMg || input.weightMg <= 0) throw new Error('WEIGHT_REQUIRED');
    if (input.purityPct === undefined || input.purityPct <= 0) throw new Error('PURITY_REQUIRED');

    return executeTransaction(async (tx) => {
      const karigarRecord = karigarMasterRepository.findById(tx, input.firmId, input.karigarId);
      if (!karigarRecord) throw new Error(ERR.KARIGAR_NOT_FOUND);

      const metalInEntry = karigarLedgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId: input.fyId ?? null,
        karigarId: input.karigarId,
        type: 'METAL_IN',
        weightMg: input.weightMg,
        purityPct: input.purityPct,
        amountPaise: 0,
        ratePaisePerGram: 0,
        isManualRate: 0,
        linkedJobWorkId: input.linkedJobWorkId || null,
        notes: input.notes || null,
      });

      let labourEntry: KarigarLedgerEntry | undefined = undefined;

      if (input.labourAmountPaise && input.labourAmountPaise > 0) {
        labourEntry = karigarLedgerRepository.insert(tx, {
          firmId: input.firmId,
          fyId: input.fyId ?? null,
          karigarId: input.karigarId,
          type: 'LABOUR_PAYABLE',
          weightMg: 0,
          purityPct: 0,
          amountPaise: input.labourAmountPaise,
          ratePaisePerGram: 0,
          isManualRate: 0,
          linkedJobWorkId: input.linkedJobWorkId || null,
          notes: input.notes || 'Labour payable on ornament receipt',
        });
      }

      return labourEntry ? { metalInEntry, labourEntry } : { metalInEntry };
    }, customTx);

  },

  /**
   * Records labour payment to a karigar (LABOUR_PAID).
   * Decreases money balance owed to karigar.
   */
  async recordLabourPayment(
    input: RecordLabourPaymentInput,
    customTx?: any
  ): Promise<KarigarLedgerEntry> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) throw new Error('FIRM_ID_REQUIRED');
    if (!input.karigarId) throw new Error(ERR.KARIGAR_NOT_FOUND);
    if (!input.amountPaise || input.amountPaise <= 0) {
      throw new Error(ERR.KARIGAR_PAYMENT_NOTHING_TO_PAY);
    }

    return executeTransaction(async (tx) => {
      const karigarRecord = karigarMasterRepository.findById(tx, input.firmId, input.karigarId);
      if (!karigarRecord) throw new Error(ERR.KARIGAR_NOT_FOUND);

      return karigarLedgerRepository.insert(tx, {
        firmId: input.firmId,
        fyId: input.fyId ?? null,
        karigarId: input.karigarId,
        type: 'LABOUR_PAID',
        weightMg: 0,
        purityPct: 0,
        amountPaise: input.amountPaise,
        ratePaisePerGram: 0,
        isManualRate: 0,
        linkedJobWorkId: input.linkedJobWorkId || null,
        notes: input.notes || null,
      });
    }, customTx);
  },

  /**
   * Alias for recordLabourPayment (Step T requirement)
   */
  async payLabourToKarigar(
    input: RecordLabourPaymentInput,
    customTx?: any
  ): Promise<KarigarLedgerEntry> {
    return this.recordLabourPayment(input, customTx);
  },

  /**
   * STEP 3C — recordKarigarMixedPayment() — FULL SERVICE SPECIFICATION
   * v5.13 NEW — Pay karigar with: pure metal, pure money, or mixed (fine metal at bhav rate + remaining balance in cash).
   * Atomic single db.transaction(). Bill-linkable via linkedJobWorkId. Extends Step 3A/3B settlement model.
   *
   * Validations (throw before any DB write):
   * (1) karigar does not exist or does not belong to firmId -> throw KARIGAR_NOT_FOUND
   * (2) fineWeightMg = 0 AND moneyAmountPaise = 0 -> throw KARIGAR_PAYMENT_NOTHING_TO_PAY
   * (3) If fineWeightMg > 0:
   *     - ratePaisePerGram <= 0 -> throw SETTLEMENT_RATE_INVALID
   *     - linkedMetalEntryId must reference a valid METAL_OUT row -> throw LINKED_METAL_ENTRY_INVALID
   *     - Aggregate balance check INSIDE transaction: fineOutstandingMg < fineWeightMg -> throw SETTLEMENT_EXCEEDS_METAL_BALANCE
   *
   * Writes (all inside ONE db.transaction()):
   * (1) Dual guard: await leaseService.assertNoActiveLease() + safeModeService.assertNotInSafeMode()
   * (2) FIX-V520-6 (v5.20): fyId = await resolveTransactionFyId(input.firmId, input.paymentDate) — FIRST line of service body after dual guard.
   *     Throws ENTRY_DATE_IN_CLOSED_FY if no ACTIVE FY covers paymentDate.
   * (3) If fineWeightMg > 0: karigar_ledger.insert type = METAL_SETTLED_AS_MONEY, weightMg = fineWeightMg,
   *     amountPaise = Math.round(fineWeightMg / 1000 * ratePaisePerGram), ratePaisePerGram, isManualRate = 1,
   *     linkedEntityId = linkedMetalEntryId, linkedJobWorkId = linkedJobWorkId (if provided).
   * (4) If moneyAmountPaise > 0: karigar_ledger.insert type = LABOUR_PAID, amountPaise = moneyAmountPaise,
   *     linkedJobWorkId = linkedJobWorkId (if provided).
   * (5) auditRepo.log: eventType = KARIGAR_MIXED_PAYMENT_RECORDED, deviceId = getDeviceId(),
   *     payload = { karigarId, fineWeightMg, ratePaisePerGram, moneyAmountPaise, linkedJobWorkId }.
   */
  async recordKarigarMixedPayment(
    input: RecordKarigarMixedPaymentInput,
    customTx?: any
  ): Promise<RecordKarigarMixedPaymentResult> {
    // (1) Dual guard
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.karigarId) {
      throw new Error(ERR.KARIGAR_NOT_FOUND);
    }
    if (!input.paymentDate) {
      throw new Error('PAYMENT_DATE_REQUIRED');
    }

    const fineWeightMg = input.fineWeightMg ?? 0;
    const moneyAmountPaise = input.moneyAmountPaise ?? 0;

    // Validation 2: fineWeightMg = 0 AND moneyAmountPaise = 0 -> throw KARIGAR_PAYMENT_NOTHING_TO_PAY
    if (fineWeightMg === 0 && moneyAmountPaise === 0) {
      throw new Error(ERR.KARIGAR_PAYMENT_NOTHING_TO_PAY);
    }
    if (fineWeightMg < 0 || moneyAmountPaise < 0) {
      throw new Error(ERR.KARIGAR_PAYMENT_NOTHING_TO_PAY);
    }

    // Validation 3 (pre-checks for fineWeightMg > 0)
    let ratePaisePerGram = 0;
    let linkedMetalEntryId = '';
    if (fineWeightMg > 0) {
      ratePaisePerGram = input.ratePaisePerGram ?? 0;
      if (ratePaisePerGram <= 0) {
        throw new Error(ERR.SETTLEMENT_RATE_INVALID);
      }
      linkedMetalEntryId = (input.linkedMetalEntryId ?? '').trim();
      if (!linkedMetalEntryId) {
        throw new Error(ERR.LINKED_METAL_ENTRY_INVALID);
      }
    }

    return executeTransaction(async (tx) => {
      // FIX-V520-6 (v5.20): fyId = await resolveTransactionFyId(input.firmId, input.paymentDate) — FIRST line of service body after dual guard.
      // Throws ENTRY_DATE_IN_CLOSED_FY if no ACTIVE FY covers paymentDate.
      const fyId = await fyService.resolveTransactionFyId(input.firmId, input.paymentDate, tx);

      // Validation 1: karigar does not exist or does not belong to firmId -> throw KARIGAR_NOT_FOUND
      const party = karigarMasterRepository.findById(tx, input.firmId, input.karigarId);
      if (!party || party.isDeleted === 1) {
        throw new Error(ERR.KARIGAR_NOT_FOUND);
      }

      // If fineWeightMg > 0, validate linkedMetalEntryId row and aggregate metal balance
      let metalSettlementEntry: KarigarLedgerEntry | null = null;
      if (fineWeightMg > 0) {
        const linkedEntry = karigarLedgerRepository.findById(tx, linkedMetalEntryId);
        if (
          !linkedEntry ||
          linkedEntry.type !== 'METAL_OUT' ||
          linkedEntry.karigarId !== input.karigarId ||
          linkedEntry.firmId !== input.firmId
        ) {
          throw new Error(ERR.LINKED_METAL_ENTRY_INVALID);
        }

        // Aggregate balance check INSIDE transaction
        const balance = await getMetalBalance(tx, input.karigarId, input.firmId);
        if (balance.fineOutstandingMg < fineWeightMg) {
          throw new Error(ERR.SETTLEMENT_EXCEEDS_METAL_BALANCE);
        }

        const amountPaise = Math.round((fineWeightMg / 1000) * ratePaisePerGram);
        metalSettlementEntry = karigarLedgerRepository.insert(tx, {
          firmId: input.firmId,
          fyId,
          karigarId: input.karigarId,
          type: 'METAL_SETTLED_AS_MONEY',
          weightMg: fineWeightMg,
          purityPct: 0,
          amountPaise,
          ratePaisePerGram,
          isManualRate: 1,
          linkedEntityId: linkedMetalEntryId,
          linkedJobWorkId: input.linkedJobWorkId?.trim() || linkedEntry.linkedJobWorkId || null,
          notes: input.notes?.trim() || null,
          createdAt: input.paymentDate,
        });
      }

      // If moneyAmountPaise > 0, insert LABOUR_PAID row
      let labourPaidEntry: KarigarLedgerEntry | null = null;
      if (moneyAmountPaise > 0) {
        labourPaidEntry = karigarLedgerRepository.insert(tx, {
          firmId: input.firmId,
          fyId,
          karigarId: input.karigarId,
          type: 'LABOUR_PAID',
          weightMg: 0,
          purityPct: 0,
          amountPaise: moneyAmountPaise,
          ratePaisePerGram: 0,
          isManualRate: 0,
          linkedEntityId: null,
          linkedJobWorkId: input.linkedJobWorkId?.trim() || null,
          notes: input.notes?.trim() || null,
          createdAt: input.paymentDate,
        });
      }

      // Audit Log
      auditRepository.log(
        {
          firmId: input.firmId,
          eventType: 'KARIGAR_MIXED_PAYMENT_RECORDED',
          entityId: input.karigarId,
          deviceId: getSafeDeviceId(),
          payload: {
            karigarId: input.karigarId,
            fineWeightMg,
            ratePaisePerGram: fineWeightMg > 0 ? ratePaisePerGram : 0,
            moneyAmountPaise,
            linkedJobWorkId: input.linkedJobWorkId?.trim() || null,
          },
        },
        tx
      );

      return {
        metalSettlementEntry,
        labourPaidEntry,
        fyId,
      };
    }, customTx);
  },

  /**
   * CHECK 10 (STEP 3A / v4.7):
   * Verifies fine metal aggregate integrity for a karigar.
   * Formula: SUM(METAL_OUT fine mg) >= SUM(METAL_IN fine mg) + SUM(METAL_SETTLED_AS_MONEY.weightMg) + SUM(LABOUR_IN_GOLD.weightMg)
   * READ-ONLY inspection.
   */
  async checkAggregateIntegrity(firmId: string, karigarId: string) {
    if (!firmId || !karigarId) {
      return {
        isValid: true,
        fineIssuedMg: 0,
        fineReturnedMg: 0,
        fineSettledMg: 0,
        fineLabourGoldMg: 0,
        fineDeductedMg: 0,
        deficitMg: 0,
      };
    }
    return karigarLedgerRepository.verifyAggregateIntegrity(firmId, karigarId);
  },

  /**
   * ✅ v4.9 FIX — getMetalBalance() FULL TYPESCRIPT SIGNATURE
   * (fyId param REMOVED v5.17 — FIX-KARIGAR-CROSSFY-1)
   */
  async getMetalBalance(tx: any | null, karigarId: string, firmId: string) {
    return getMetalBalance(tx, karigarId, firmId);
  },
};

export { getMetalBalance };

