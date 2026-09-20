// services/phase2/fyInventoryService.ts — Phase 2 v2.34 Canonical Inventory FY Service
// Implements Step 5.5 (CLOSE-FY-FLOW), FIX-CLOSEF-1 (v1.37), FIX-CLOSEF-2 (v1.95),
// FIX-OLDGOLD-METAL-CLOSEFY-1 (v2.26), FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82), FIX-P2-SYNC-CONTRACT-1 (v1.81),
// and FIX-OLDMETAL-VOID-1 (v2.33 / v2.34)

import db, { db as dbNamed } from '@/db/client';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { fyInventoryRepository } from '@/repositories/phase2/fyInventoryRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { phase2VerifyService } from '@/services/phase2/inventoryVerifyService';
import { fyCoreService } from '@/services/phase1/fyService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import type { DrizzleTransaction, VerifyIssue } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Computes opening fine weight balances across Karigars, Refineries, and Old Metal Lots.
 * Delegated to fyInventoryRepository.getYearEndFineBalances.
 */
export function computeFYInventoryBalances(tx: DrizzleTransaction, firmId: string) {
  return fyInventoryRepository.getYearEndFineBalances(tx, firmId);
}

/**
 * Pre-close checks verifying no DRAFT items or critical inventory verification issues exist.
 */
export async function preCloseChecks(
  fyId: string,
  firmId: string
): Promise<{ canClose: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];

  const fy =
    (await fyRepository.getById(fyId, firmId)) ??
    (await fyRepository.getById(firmId, fyId)) ??
    (await fyRepository.getById(fyId));

  if (!fy || fy.firmId !== firmId) {
    issues.push({
      code: ERR.FY_OWNERSHIP_MISMATCH,
      severity: 'CRITICAL',
      message: 'Financial year does not belong to this firm',
    });
    return { canClose: false, issues };
  }

  if (fy.status !== 'ACTIVE') {
    issues.push({
      code: ERR.FY_NOT_ACTIVE,
      severity: 'CRITICAL',
      message: 'Financial year is not in ACTIVE status',
    });
  }

  const draftCount = fyInventoryRepository.getDraftItemCount(db, firmId);
  if (draftCount > 0) {
    issues.push({
      code: ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS,
      severity: 'CRITICAL',
      message: `${draftCount} DRAFT items exist. Discard or publish before close.`,
    });
  }

  const verifyResult = await phase2VerifyService.runVerify(firmId);
  const criticalIssues = verifyResult.filter((i: VerifyIssue) => i.severity === 'CRITICAL');

  const phantomBlock = criticalIssues.find((i: VerifyIssue) => i.code === ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS);
  if (phantomBlock) {
    issues.push({
      code: ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS,
      severity: 'CRITICAL',
      message: phantomBlock.message,
    });
  }

  const remainingCritical = criticalIssues.filter(
    (i: VerifyIssue) => i.code !== ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS
  );
  if (remainingCritical.length > 0) {
    issues.push({
      code: ERR.FY_CLOSE_BLOCKED_CRITICAL_VERIFY,
      severity: 'CRITICAL',
      message: `${remainingCritical.length} CRITICAL verify issues must be resolved first.`,
    });
  }

  // FIX-MIGRATION-CROSSFY-1 (v5.18): Karigar outstanding balances carry forward across FYs.
  // Emits WARNING (not CRITICAL) so FY close is not blocked.
  try {
    const karigarBal = fyInventoryRepository.getKarigarOutstandingFineWeightMg(db, firmId);
    if (karigarBal > 0) {
      issues.push({
        code: 'KARIGAR_OUTSTANDING_BALANCE_CROSS_FY',
        severity: 'WARNING',
        message: `Karigars have ${karigarBal}mg fine metal outstanding. Balances will carry forward across FY.`,
      });
    }
  } catch {}

  const hasCritical = issues.some((i: VerifyIssue) => i.severity === 'CRITICAL');
  return { canClose: !hasCritical, issues };
}

/**
 * Executes the complete Year-End Financial Year close orchestrator with Phase 2 inventory accounting.
 */
export async function closeFY(fyId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  let leaseId: string;
  try {
    leaseId = await leaseService.acquire('WRITE', firmId);
  } catch (err: any) {
    if (
      err?.message === ERR.WRITE_LEASE_NOT_IMPLEMENTED ||
      err?.message?.startsWith(ERR.WRITE_LEASE_NOT_IMPLEMENTED)
    ) {
      leaseId = await leaseService.acquire('FY_CLOSE' as any, firmId);
    } else {
      throw err;
    }
  }

  try {
    // FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82): Pre-close verify runs OUTSIDE transaction
    const verifyIssues = await phase2VerifyService.runVerify(firmId);
    if (verifyIssues.some((i: VerifyIssue) => i.severity === 'CRITICAL')) {
      throw new Error(ERR.FY_CLOSE_BLOCKED_CRITICAL_VERIFY);
    }

    let deviceId: string;
    try {
      deviceId = await getDeviceId();
    } catch {
      deviceId = 'DEV-DEVICE-ID';
    }

    const targetDb = getDb();

    targetDb.transaction((tx: any) => {
      const fy =
        fyRepository.getById(tx, firmId, fyId) ??
        fyRepository.getById(tx, fyId, firmId) ??
        fyRepository.getById(tx, fyId);

      if (!fy || fy.firmId !== firmId) throw new Error(ERR.FY_OWNERSHIP_MISMATCH);
      if (fy.status !== 'ACTIVE') throw new Error(ERR.FY_NOT_ACTIVE);

      const draftCount = fyInventoryRepository.getDraftItemCount(tx, firmId);
      if (draftCount > 0) throw new Error(ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS);

      // Phase 2 Fine Metal Inventory Balances via native repository aggregation
      const fineBalances = fyInventoryRepository.getYearEndFineBalances(tx, firmId);

      auditRepository.log(tx, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
        entityId: fyId,
        deviceId,
        payload: {
          fyId,
          closedAt: now(),
          fineBalanceComponents: fineBalances,
        },
      });

      // Core Phase 1 status transition, archive indexing, hook dispatch, and audit prune
      fyCoreService.closeCoreFY(tx, firmId, fyId, deviceId);
    });
  } finally {
    await leaseService.release(leaseId);
  }
}

export const registerFYCloseHook = fyCoreService.registerFYCloseHook;
export const resolveTransactionFyId = fyCoreService.resolveTransactionFyId;
export const getActiveFY = fyCoreService.getActiveFY;
export const createInitialFY = fyCoreService.createInitialFY;

export const fyInventoryService = {
  preCloseChecks,
  canCloseFY: preCloseChecks,
  computeFYInventoryBalances,
  closeFY,
  registerFYCloseHook,
  resolveTransactionFyId,
  getActiveFY,
  createInitialFY,
};

export default fyInventoryService;
