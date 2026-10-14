// services/phase4/karigarFlowService.ts
// Phase 4: Gold Intelligence — Karigar Flow Services
// Implements:
// - issueGoldToKarigar (DOMAIN-FIX-1 v1.7, FIX-ISSUE-WEIGHT v1.8, GAP-KARIGAR-LOOP v1.8, ISSUANCE-FINE-WEIGHT v1.9)
// - recordKarigarReturn (FIX-RETURN-TYPE v1.8, DECIMAL-FIX, WASTAGE-FIX v1.6)
// - recordLabourInGold (D2, P3-FIX-5 no-multiply rule, weightMg is fine mg)
// - reverseKarigarIssue (P3-FIX-3 build blocker, FIX-P4-SANITIZE-1, ALIGN-FIX-2)

import Decimal from 'decimal.js';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { karigarFlowRepository } from '@/repositories/phase4/karigarFlowRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { karigarLedgerRepository } from '@/repositories/phase3/karigarLedgerRepository';
import { karigarMasterRepository } from '@/repositories/phase3/karigarMasterRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import type {
  KarigarIssue,
  IssueGoldInput,
  ReturnInput,
  KarigarReturnResult,
} from '@/types/phase4/phase4.types';

function getSafeDeviceId(): string {
  try {
    const { getDeviceId } = require('@/utils/deviceId');
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

export const karigarFlowService = {
  /**
   * Issues gold lot to karigar.
   *
   * Guards:
   * - assertNoActiveLease() + assertNotInSafeMode()
   * - Validate input.issuedGrossWeightMg > 0 (KARIGAR_ISSUE_WEIGHT_INVALID)
   * - Validate sourceLot.status === 'RECEIVED' AND sourceLot.firmId === firmId
   * - DOMAIN-FIX-1 (v1.7): sourceLot.metalSource === 'MELT_OUTPUT' (INVALID_LOT_SOURCE)
   * - FIX-ISSUE-WEIGHT (v1.8): input.issuedGrossWeightMg <= sourceLot.grossWeightMg (KARIGAR_ISSUE_EXCEEDS_LOT)
   * - GAP-KARIGAR-LOOP (v1.8): lifetime returns for karigar+lot < 3 (KARIGAR_LOOP_LIMIT_EXCEEDED)
   *
   * Transaction:
   * 1. Compute issuedFineWeightMg via Decimal (ISSUANCE-FINE-WEIGHT v1.9)
   * 2. Insert karigar_issues row (status = 'ISSUED')
   * 3. Append karigar_ledger: type = 'METAL_OUT', weightMg = gross, purityPct = issuedPurityPct
   * 4. Update old_metal_lots.status -> 'ISSUED_TO_KARIGAR'
   * 5. Audit: KARIGAR_GOLD_ISSUED (live tx — G41)
   */
  async issueGoldToKarigar(
    input: IssueGoldInput,
    firmId: string,
    tx?: any
  ): Promise<KarigarIssue> {
    // Guards
    leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) {
      throw new Error(`${ERR.FIRM_ID_REQUIRED}: firmId is required`);
    }

    if (!input.karigarId) {
      throw new Error(`${ERR.KARIGAR_NOT_FOUND}: karigarId is required`);
    }

    if (!input.sourceLotId) {
      throw new Error(`${ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM}: sourceLotId is required`);
    }

    // FIX-ISSUE-WEIGHT v1.8: weight guards
    if (!input.issuedGrossWeightMg || input.issuedGrossWeightMg <= 0) {
      throw new Error(
        `${ERR.KARIGAR_ISSUE_WEIGHT_INVALID}: issuedGrossWeightMg must be greater than 0`
      );
    }

    if (
      input.issuedPurityPct === undefined ||
      input.issuedPurityPct <= 0 ||
      input.issuedPurityPct > 100
    ) {
      throw new Error(
        `${ERR.ITEM_PURITY_PERCENT_INVALID}: issuedPurityPct must be between 0 and 100`
      );
    }

    return executeTransaction(async (conn) => {
      // In-tx atomic re-validation against race conditions
      const sourceLot = oldMetalLotRepository.getById(conn, input.sourceLotId, firmId);
      if (!sourceLot || sourceLot.firmId !== firmId) {
        throw new Error(
          `${ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM}: Lot ${input.sourceLotId} not found or firm mismatch`
        );
      }

      if (sourceLot.status !== 'RECEIVED') {
        throw new Error(
          `${ERR.INVALID_TRANSITION}: Lot status must be RECEIVED, got ${sourceLot.status}`
        );
      }

      // DOMAIN-FIX-1 (v1.7): Raw old metal (CUSTOMER) MUST NOT be issued to karigar.
      // Karigar receives assayed fine gold only (MELT_OUTPUT).
      if (sourceLot.metalSource !== 'MELT_OUTPUT') {
        throw new Error(
          `${ERR.INVALID_LOT_SOURCE}: Only MELT_OUTPUT lots may be issued to karigar. Melt raw gold first.`
        );
      }

      // FIX-ISSUE-WEIGHT v1.8: weight exceeds lot
      if (input.issuedGrossWeightMg > sourceLot.grossWeightMg) {
        throw new Error(
          `${ERR.KARIGAR_ISSUE_EXCEEDS_LOT}: Issued gross weight (${input.issuedGrossWeightMg} mg) exceeds lot gross weight (${sourceLot.grossWeightMg} mg)`
        );
      }

      // GAP-KARIGAR-LOOP v1.8: loop guard across ALL issues for this karigar+lot lifetime
      const lifetimeReturns = karigarFlowRepository.countLifetimeReturns(
        conn,
        input.karigarId,
        input.sourceLotId,
        firmId
      );
      if (lifetimeReturns >= 3) {
        throw new Error(
          `${ERR.KARIGAR_LOOP_LIMIT_EXCEEDED}: Karigar has returned this lot 3 or more times total (${lifetimeReturns})`
        );
      }

      // ISSUANCE-FINE-WEIGHT v1.9: compute issuedFineWeightMg explicitly before insert
      const issuedFineWeightMg = new Decimal(input.issuedGrossWeightMg)
        .times(input.issuedPurityPct)
        .dividedBy(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();

      const issueDate = input.issueDate || now().slice(0, 10);

      // 1. Insert karigar_issues row
      const issue = karigarFlowRepository.insertIssue(conn, {
        firmId,
        karigarId: input.karigarId,
        sourceLotId: input.sourceLotId,
        issuedGrossWeightMg: input.issuedGrossWeightMg,
        issuedPurityPct: input.issuedPurityPct,
        issuedFineWeightMg,
        status: 'ISSUED',
        issueDate,
      });

      // 2. Append karigar_ledger: type = METAL_OUT, gross weight stored
      karigarLedgerRepository.insert(conn, {
        firmId,
        karigarId: input.karigarId,
        type: 'METAL_OUT',
        weightMg: input.issuedGrossWeightMg, // GROSS — purity applied at query time via CASE WHEN
        purityPct: input.issuedPurityPct,
        linkedEntityId: issue.id,
        notes: input.notes || null,
      });

      // 3. Update old_metal_lots.status -> ISSUED_TO_KARIGAR
      oldMetalLotRepository.updateStatus(conn, input.sourceLotId, firmId, 'ISSUED_TO_KARIGAR');

      // 4. Audit: KARIGAR_GOLD_ISSUED (live tx — G41)
      auditRepository.log(conn, {
        eventType: 'KARIGAR_GOLD_ISSUED',
        firmId,
        entityId: issue.id,
        payload: {
          issueId: issue.id,
          karigarId: input.karigarId,
          sourceLotId: input.sourceLotId,
          issuedGrossWeightMg: input.issuedGrossWeightMg,
          issuedPurityPct: input.issuedPurityPct,
          issuedFineWeightMg,
        },
      });

      return issue;
    }, tx);
  },

  /**
   * Records a return (partial or full) from karigar for an issue.
   *
   * FIX-RETURN-TYPE v1.8: returns Promise<KarigarReturnResult>
   * interface KarigarReturnResult { wasteExceeded: boolean; excessMg: number; }
   *
   * Guards:
   * - assertNoActiveLease() + assertNotInSafeMode()
   * - Pre: issue.status === 'ISSUED' | 'PARTIAL_RETURN'
   * - DECIMAL-FIX: fineWeightMg = round(grossWeightMg * purityPct / 100)
   * - WASTAGE-FIX: compute actualWastageMg and allowedWastageMg.
   *   If actualWastageMg > allowedWastageMg: audit KARIGAR_WASTAGE_EXCEEDED, wasteExceeded = true
   *
   * Transaction:
   * 1. Insert karigar_returns row
   * 2. Append karigar_ledger: type = METAL_IN, weightMg = gross, purityPct = purityPct
   * 3. If totalReturnedFine >= issuedFineWeightMg -> issue.status = CLOSED, else PARTIAL_RETURN
   * 4. Audit: KARIGAR_RETURN_RECORDED (live tx — G41)
   */
  async recordKarigarReturn(
    issueId: string,
    input: ReturnInput,
    firmId: string,
    tx?: any
  ): Promise<KarigarReturnResult> {
    // Guards
    leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) {
      throw new Error(`${ERR.FIRM_ID_REQUIRED}: firmId is required`);
    }

    if (!issueId) {
      throw new Error(`${ERR.KARIGAR_ISSUE_NOT_FOUND}: issueId is required`);
    }

    if (!input.grossWeightMg || input.grossWeightMg <= 0) {
      throw new Error(
        `${ERR.KARIGAR_RETURN_WEIGHT_INVALID}: returnGrossWeightMg must be greater than 0`
      );
    }

    if (
      input.purityPct === undefined ||
      input.purityPct <= 0 ||
      input.purityPct > 100
    ) {
      throw new Error(
        `${ERR.ITEM_PURITY_PERCENT_INVALID}: purityPct must be between 0 and 100`
      );
    }

    return executeTransaction(async (conn) => {
      const issue = karigarFlowRepository.getIssueById(conn, issueId, firmId);
      if (!issue || issue.firmId !== firmId) {
        throw new Error(
          `${ERR.KARIGAR_ISSUE_NOT_FOUND}: Karigar issue ${issueId} not found or firm mismatch`
        );
      }

      if (issue.status !== 'ISSUED' && issue.status !== 'PARTIAL_RETURN') {
        throw new Error(
          `${ERR.INVALID_KARIGAR_ISSUE_STATUS}: Issue status must be ISSUED or PARTIAL_RETURN, got ${issue.status}`
        );
      }

      // DECIMAL-FIX
      const returnFineWeightMg = new Decimal(input.grossWeightMg)
        .times(input.purityPct)
        .dividedBy(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();

      const returnDate = input.returnDate || now().slice(0, 10);

      // Prior returns
      const priorReturns = karigarFlowRepository.getReturnsByIssueId(conn, issueId);
      const priorFineMg = (priorReturns || []).reduce(
        (sum: number, r: any) => sum + (r.fineWeightMg || 0),
        0
      );
      const totalReturnedFine = priorFineMg + returnFineWeightMg;

      // WASTAGE-FIX: resolve allowed wastage from karigar master
      let allowedWastageMg = 0;
      if (input.allowedWastageMg !== undefined) {
        allowedWastageMg = input.allowedWastageMg;
      } else {
        const karigarRecord = karigarMasterRepository.findById(conn, firmId, issue.karigarId);
        if (karigarRecord) {
          if (karigarRecord.wastageType === 'FIXED_MG') {
            allowedWastageMg = karigarRecord.wastageFixedMg ?? 0;
          } else {
            allowedWastageMg = new Decimal(issue.issuedFineWeightMg)
              .times(karigarRecord.allowedWastagePct || 0)
              .dividedBy(100)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber();
          }
        }
      }

      // Compute actual wastage
      let actualWastageMg = 0;
      if (input.actualWastageMg !== undefined) {
        actualWastageMg = input.actualWastageMg;
      } else {
        actualWastageMg = Math.max(0, issue.issuedFineWeightMg - totalReturnedFine);
      }

      const wasteExceeded = actualWastageMg > allowedWastageMg;
      const excessMg = wasteExceeded ? actualWastageMg - allowedWastageMg : 0;

      // If wastage exceeded, record audit log
      if (wasteExceeded) {
        auditRepository.log(conn, {
          eventType: 'KARIGAR_WASTAGE_EXCEEDED',
          firmId,
          entityId: issueId,
          payload: {
            issueId,
            karigarId: issue.karigarId,
            actualWastageMg,
            allowedWastageMg,
            excessMg,
          },
        });
      }

      // 1. Insert karigar_returns row
      const returnRecord = karigarFlowRepository.insertReturn(conn, {
        issueId,
        grossWeightMg: input.grossWeightMg,
        purityPct: input.purityPct,
        fineWeightMg: returnFineWeightMg,
        returnDate,
      });

      // 2. Append karigar_ledger: type = METAL_IN
      // WEIGHT_MG SEMANTICS: METAL_IN stores gross weight and purityPct
      karigarLedgerRepository.insert(conn, {
        firmId,
        karigarId: issue.karigarId,
        type: 'METAL_IN',
        weightMg: input.grossWeightMg,
        purityPct: input.purityPct,
        linkedEntityId: returnRecord.id,
        notes: input.notes || null,
      });

      // 3. Update issue status: CLOSED if full return, else PARTIAL_RETURN
      const newStatus =
        totalReturnedFine >= issue.issuedFineWeightMg ? 'CLOSED' : 'PARTIAL_RETURN';

      karigarFlowRepository.updateIssue(conn, issueId, firmId, {
        status: newStatus,
      });

      // 4. Audit: KARIGAR_RETURN_RECORDED (live tx — G41)
      auditRepository.log(conn, {
        eventType: 'KARIGAR_RETURN_RECORDED',
        firmId,
        entityId: returnRecord.id,
        payload: {
          issueId,
          returnId: returnRecord.id,
          grossWeightMg: input.grossWeightMg,
          purityPct: input.purityPct,
          fineWeightMg: returnFineWeightMg,
          totalReturnedFine,
          newStatus,
          wasteExceeded,
          excessMg,
        },
      });

      return {
        wasteExceeded,
        excessMg,
        issue: { ...issue, status: newStatus },
        returnRecord,
      };
    }, tx);
  },

  /**
   * Records karigar labour settled in gold (agreed wastage compensation).
   *
   * Guards:
   * - assertNoActiveLease() + assertNotInSafeMode()
   * - Pre: issue.status === 'CLOSED' (labour recorded only after full return)
   * - ⚠️ weightMg IS fine milligrams. Do NOT multiply by purityPct. (D2, P3-FIX-5)
   *
   * Transaction:
   * 1. Append karigar_ledger: type = 'LABOUR_IN_GOLD', weightMg, purityPct = 0
   * 2. Audit: KARIGAR_LABOUR_GOLD_RECORDED (live tx — G41)
   */
  async recordLabourInGold(
    issueId: string,
    weightMg: number,
    firmId: string,
    tx?: any
  ): Promise<void> {
    // Guards
    leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) {
      throw new Error(`${ERR.FIRM_ID_REQUIRED}: firmId is required`);
    }

    if (!issueId) {
      throw new Error(`${ERR.KARIGAR_ISSUE_NOT_FOUND}: issueId is required`);
    }

    if (!weightMg || weightMg <= 0) {
      throw new Error(`${ERR.AMOUNT_NEGATIVE}: weightMg must be greater than 0`);
    }

    return executeTransaction(async (conn) => {
      const issue = karigarFlowRepository.getIssueById(conn, issueId, firmId);
      if (!issue || issue.firmId !== firmId) {
        throw new Error(
          `${ERR.KARIGAR_ISSUE_NOT_FOUND}: Karigar issue ${issueId} not found or firm mismatch`
        );
      }

      // Pre: issue.status === 'CLOSED' (labour recorded only after full return)
      if (issue.status !== 'CLOSED') {
        throw new Error(
          `${ERR.INVALID_KARIGAR_ISSUE_STATUS}: Labour in gold can only be recorded after issue is CLOSED (current status: ${issue.status})`
        );
      }

      // 1. Append karigar_ledger: type = LABOUR_IN_GOLD, weightMg is fine mg, purityPct = 0 (D2, P3-FIX-5)
      karigarLedgerRepository.insert(conn, {
        firmId,
        karigarId: issue.karigarId,
        type: 'LABOUR_IN_GOLD',
        weightMg,
        purityPct: 0,
        linkedEntityId: issueId,
        notes: `Labour in gold for closed issue ${issueId}`,
      });

      // 2. Audit: KARIGAR_LABOUR_GOLD_RECORDED (live tx — G41)
      auditRepository.log(conn, {
        eventType: 'KARIGAR_LABOUR_GOLD_RECORDED',
        firmId,
        entityId: issueId,
        payload: {
          issueId,
          karigarId: issue.karigarId,
          weightMg,
        },
      });
    }, tx);
  },

  /**
   * P3-FIX-3 [Build Blocker — reverseKarigarIssue() fully defined]
   *
   * Pre-conditions (all must pass):
   * - KarigarIssue must exist with status === 'ISSUED' (not PARTIAL_RETURN or CLOSED)
   * - No KarigarReturn records may exist linked to this issueId
   * - assertNoActiveLease() — Guard 1
   * - assertNotInSafeMode() — Guard 2
   * - reason MUST route through Phase 1's sanitizeText() before persistence — throws INVALID_TEXT_CONTENT on rejection (FIX-P4-SANITIZE-1, v1.15)
   *
   * System actions (atomic transaction):
   * 1. Append ItemEvent: type = 'KARIGAR_ISSUE_REVERSED', linked to issueId, reason field populated
   * 2. Append karigar_ledger reversal: type = 'METAL_OUT_REVERSAL', weightMg = original issuedGrossWeightMg, purityPct = original issuedPurityPct
   * 3. Set karigar_issues.status = 'REVERSED' — write-once after ISSUED
   * 4. Set sourceLot.status back to 'RECEIVED' — lot returned to available inventory (VALID_LOT_TRANSITIONS: ISSUED_TO_KARIGAR -> RECEIVED)
   * 5. Audit: OLD_METAL_LOT_STATUS_CHANGED with reason (live tx — G41)
   *
   * APPEND-ONLY: No row in karigar_issues, karigar_ledger, or item_events is edited or deleted.
   * The reversal is a new append. The original issue record is immutable.
   */
  async reverseKarigarIssue(
    issueId: string,
    reason: string,
    firmId: string,
    tx?: any
  ): Promise<void> {
    // Guards 1 & 2
    leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) {
      throw new Error(`${ERR.FIRM_ID_REQUIRED}: firmId is required`);
    }

    if (!issueId) {
      throw new Error(`${ERR.KARIGAR_ISSUE_NOT_FOUND}: issueId is required`);
    }

    // FIX-P4-SANITIZE-1 (v1.15): sanitizeText throws INVALID_TEXT_CONTENT on rejection
    const sanitizedReason = sanitizeText(reason);

    return executeTransaction(async (conn) => {
      const issue = karigarFlowRepository.getIssueById(conn, issueId, firmId);
      if (!issue || issue.firmId !== firmId) {
        throw new Error(
          `${ERR.KARIGAR_ISSUE_NOT_FOUND}: Karigar issue ${issueId} not found or firm mismatch`
        );
      }

      // Pre: No returns may exist
      const returns = karigarFlowRepository.getReturnsByIssueId(conn, issueId);
      if (returns && returns.length > 0) {
        throw new Error(
          `${ERR.KARIGAR_REVERSAL_HAS_RETURNS}: Cannot reverse an issue with existing return records`
        );
      }

      // Pre: status === 'ISSUED'
      if (issue.status !== 'ISSUED') {
        throw new Error(
          `${ERR.KARIGAR_REVERSAL_NOT_ISSUED}: Only issues with status ISSUED can be reversed, current status is ${issue.status}`
        );
      }

      // 1. Append ItemEvent: type = 'KARIGAR_ISSUE_REVERSED', linked to issueId, reason field populated
      itemEventRepository.insert(conn, {
        itemId: issueId,
        firmId,
        karigarId: issue.karigarId,
        eventType: 'KARIGAR_ISSUE_REVERSED' as any,
        severity: 'INFO',
        performedBy: getSafeDeviceId(),
        reason: sanitizedReason,
        timestamp: now(),
      });

      // 2. Append karigar_ledger reversal: type = 'METAL_OUT_REVERSAL', original gross & purity
      karigarLedgerRepository.insert(conn, {
        firmId,
        karigarId: issue.karigarId,
        type: 'METAL_OUT_REVERSAL',
        weightMg: issue.issuedGrossWeightMg,
        purityPct: issue.issuedPurityPct,
        linkedEntityId: issueId,
        notes: `Reversal of issue ${issueId}: ${sanitizedReason}`,
      });

      // 3. Set karigar_issues.status = 'REVERSED'
      karigarFlowRepository.updateIssue(conn, issueId, firmId, {
        status: 'REVERSED',
      });

      // 4. Set sourceLot.status back to 'RECEIVED'
      oldMetalLotRepository.updateStatus(conn, issue.sourceLotId, firmId, 'RECEIVED');

      // 5. Audit: OLD_METAL_LOT_STATUS_CHANGED with reason (live tx — G41)
      auditRepository.log(conn, {
        eventType: 'OLD_METAL_LOT_STATUS_CHANGED',
        firmId,
        entityId: issue.sourceLotId,
        payload: {
          previousStatus: 'ISSUED_TO_KARIGAR',
          newStatus: 'RECEIVED',
          reason: sanitizedReason,
          issueId,
        },
      });
    }, tx);
  },

  /**
   * Retrieves total outstanding fine gold (in mg) across all karigars for the firm.
   * Reads from karigar_ledger.
   * Supports both (tx, firmId) and (firmId, tx) signatures.
   */
  async getTotalOutstandingFineMg(arg1: any, arg2?: any): Promise<number> {
    let tx: any = undefined;
    let firmId: string;
    if (typeof arg1 === 'string') {
      firmId = arg1;
      tx = arg2;
    } else {
      tx = arg1;
      firmId = arg2;
    }
    return karigarLedgerRepository.getMetalBalance(firmId, tx);
  },
};
