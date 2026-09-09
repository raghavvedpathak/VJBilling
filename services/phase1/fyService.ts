// services/phase1/fyService.ts — Phase 1 & 2 Canonical Financial Year Service
// Aligned with FIX-CLOSEF-1 (v1.37), FIX-CLOSEF-2 (v1.95), FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82) & FIX-P2-SYNC-CONTRACT-1 (v1.81)

import db, { db as dbNamed } from '@/db/client';
import { eq, and, sql } from 'drizzle-orm';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { auditArchiveIndexRepository } from '@/repositories/phase1/auditArchiveIndexRepository';
import { oldGoldLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { karigarRepository } from '@/repositories/phase2/karigarRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { phase2VerifyService } from '@/services/phase1/verifyService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { auditDeleteGate as auditDeleteGateTable } from '@/db/schema';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import type { DrizzleTransaction, VerifyIssue, FinancialYear } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

// Hooks must be strictly synchronous to execute safely inside the JSI transaction boundary
const fyCloseHooks: Array<(tx: DrizzleTransaction, firmId: string, fyId: string) => void> = [];

export function registerFYCloseHook(fn: (tx: DrizzleTransaction, firmId: string, fyId: string) => void): void {
  fyCloseHooks.push(fn);
}

// --- preCloseChecks (Step 5.5 / CLOSE-FY-FLOW STEP 2) ---
export async function preCloseChecks(fyId: string, firmId: string): Promise<{ canClose: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];

  const fy = (await fyRepository.getById(fyId, firmId)) ?? (await fyRepository.getById(firmId, fyId));

  if (!fy || fy.firmId !== firmId) {
    issues.push({ code: ERR.FY_OWNERSHIP_MISMATCH, severity: 'CRITICAL', message: 'Financial year does not belong to this firm' });
    return { canClose: false, issues };
  }

  if (fy.status !== 'ACTIVE') {
    issues.push({ code: ERR.FY_NOT_ACTIVE, severity: 'CRITICAL', message: 'Financial year is not in ACTIVE status' });
  }

  let draftItems: any[] = [];
  try {
    if (itemRepository && typeof itemRepository.findByStatus === 'function') {
      draftItems = await itemRepository.findByStatus(firmId, 'DRAFT');
    }
  } catch {}

  if (draftItems.length > 0) {
    issues.push({ code: ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS, severity: 'CRITICAL', message: `${draftItems.length} DRAFT items exist. Discard or publish before close.` });
  }

  const verifyResult = await phase2VerifyService.runVerify(firmId);
  const criticalIssues = verifyResult.filter((i: VerifyIssue) => i.severity === 'CRITICAL');

  const phantomBlock = criticalIssues.find((i: VerifyIssue) => i.code === ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS);
  if (phantomBlock) {
    issues.push({ code: ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS, severity: 'CRITICAL', message: phantomBlock.message });
  }

  const remainingCritical = criticalIssues.filter((i: VerifyIssue) => i.code !== ERR.FY_CLOSE_BLOCKED_PHANTOM_ITEMS);
  if (remainingCritical.length > 0) {
    issues.push({ code: ERR.FY_CLOSE_BLOCKED_CRITICAL_VERIFY, severity: 'CRITICAL', message: `${remainingCritical.length} CRITICAL verify issues must be resolved first.` });
  }

  return { canClose: issues.length === 0, issues };
}

// --- closeFY (Step 5.5 / ALIGN-P1-V76 / ALIGN-P1-V52 v1.28 / FIX-CLOSEFY-VERIFY-SYNC-1 v1.82) ---
export async function closeFY(fyId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  let leaseId: string;
  try {
    leaseId = await leaseService.acquire('WRITE', firmId);
  } catch (err: any) {
    if (err?.message === ERR.WRITE_LEASE_NOT_IMPLEMENTED || err?.message?.startsWith(ERR.WRITE_LEASE_NOT_IMPLEMENTED)) {
      leaseId = await leaseService.acquire('FY_CLOSE' as any, firmId);
    } else {
      throw err;
    }
  }

  try {
    // FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82): Pre-close verify run outside transaction
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
      const fy = fyRepository.getById(tx, firmId, fyId) ?? fyRepository.getById(tx, fyId, firmId) ?? fyRepository.getById(tx, fyId);

      if (!fy || fy.firmId !== firmId) throw new Error(ERR.FY_OWNERSHIP_MISMATCH);
      if (fy.status !== 'ACTIVE') throw new Error(ERR.FY_NOT_ACTIVE);

      let draftItems: any[] = [];
      try {
        if (itemRepository && typeof itemRepository.findByStatus === 'function') {
          draftItems = itemRepository.findByStatus(tx, firmId, 'DRAFT');
        }
      } catch {}

      if (draftItems.length > 0) throw new Error(ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS);

      if (fyCloseHooks.length === 0) {
        console.warn(
          'FY_CLOSE_NO_HOOKS: closeFY() running with no registered hooks. ' +
          'Phase 4 karigar/refinery outstanding fine balance will be 0. ' +
          'Phase 4 MUST call registerFYCloseHook() before this runs in production.'
        );
      }

      // Canonical Phase 2 karigarRepository returns 0 until Phase 4 registers hook
      const karigarOutstandingFineMg = karigarRepository?.getOutstandingFineMg
        ? karigarRepository.getOutstandingFineMg(tx, firmId)
        : 0;
      const refineryOutstandingFineMg = 0;

      let openGoldLotsRows: any[] = [];
      try {
        if (oldGoldLotRepository && typeof oldGoldLotRepository.findByFirmId === 'function') {
          openGoldLotsRows = oldGoldLotRepository.findByFirmId(tx, firmId);
        }
      } catch {}

      // FIX-CLOSEF-2 (v1.95): Read stored fineWeightMg directly per RED-5
      const openGoldLotFineMg = openGoldLotsRows
        .filter((l) => !['SETTLED', 'SENT_TO_MELT'].includes(l.status))
        .reduce((sum, l) => sum + (l.fineWeightMg || 0), 0);

      const totalOpeningFineMg = karigarOutstandingFineMg + refineryOutstandingFineMg + openGoldLotFineMg;

      if (typeof (fyRepository as any).close === 'function') {
        (fyRepository as any).close(tx, fyId, firmId);
      } else {
        fyRepository.updateStatus(tx, fyId, firmId, 'CLOSED');
      }

      for (const hook of fyCloseHooks) {
        hook(tx, firmId, fyId);
      }

      auditRepository.log(tx, {
        eventType: 'FY_CLOSED',
        firmId,
        entityId: fyId,
        deviceId,
        payload: { fyId, closedAt: now() },
      });

      auditRepository.log(tx, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
        entityId: fyId,
        deviceId,
        payload: {
          fyId,
          closedAt: now(),
          fineBalanceComponents: {
            karigarOutstandingFineMg,
            refineryOutstandingFineMg,
            openGoldLotFineMg,
            totalOpeningFineMg,
          },
        },
      });

      const auditRowCount = auditArchiveIndexRepository.countByFirmAndFY(tx, firmId, fyId, fy);
      auditArchiveIndexRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId,
        fyId,
        fyLabel: fy.label,
        archiveDate: now(),
        rowCount: auditRowCount,
        storageRef: null,
      });

      auditRepository.log(tx, {
        eventType: 'FY_ARCHIVE_INDEXED',
        firmId,
        entityId: fyId,
        deviceId,
        payload: { fyId, fyLabel: fy.label, rowCount: auditRowCount },
      });

      const settings = appSettingsStore.getState();
      const retentionDays = settings.auditRetentionDays ?? 30;

      const endDateBound = fy.endDate.length === 10
        ? `${fy.endDate}T23:59:59.999Z`
        : fy.endDate;

      // Unlock gate prior to deletion to satisfy the prevent_audit_delete trigger
      tx.update(auditDeleteGateTable).set({ gateOpen: 1 }).where(eq(auditDeleteGateTable.id, 1)).run();
      tx.run(sql`
        DELETE FROM audit_logs
        WHERE firm_id = ${firmId}
        AND created_at < datetime('now', '-' || ${retentionDays} || ' days')
        AND created_at NOT BETWEEN ${fy.startDate} AND ${endDateBound}
      `);
      tx.update(auditDeleteGateTable).set({ gateOpen: 0 }).where(eq(auditDeleteGateTable.id, 1)).run();
    });
  } finally {
    await leaseService.release(leaseId);
  }
}

// --- resolveTransactionFyId (RESOLVE-TRANSACTION-FYID / Step 1) ---
export function resolveTransactionFyId(firmId: string, entryDate: string, dbOrTx?: any): string {
  return fyRepository.resolveTransactionFyId(firmId, entryDate, dbOrTx);
}

export const fyService = {
  async getActiveFY(firmId: string) {
    return fyRepository.getActiveFY(firmId);
  },
  resolveTransactionFyId,
  closeFY,
  preCloseChecks,
  registerFYCloseHook,
};
export default fyService;