// services/phase1/fyService.ts — Phase 1 Canonical Financial Year Core Service
// Implements Step 5.5 (CLOSE-FY-FLOW), FIX-CLOSEF-1 (v1.37), FIX-CLOSEF-2 (v1.95),
// FIX-P2-SYNC-CONTRACT-1 (v1.81)

import db, { db as dbNamed } from '@/db/client';
import { eq, sql } from 'drizzle-orm';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { auditArchiveIndexRepository } from '@/repositories/phase1/auditArchiveIndexRepository';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { auditDeleteGate as auditDeleteGateTable } from '@/db/schema';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import type { DrizzleTransaction, FinancialYear } from '@/types/phase2/phase2.types';
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

/**
 * Core Phase 1 Year-End status finalizer.
 * Updates FY status to CLOSED, dispatches extension hooks, logs FY_CLOSED audit event,
 * indexes the archive in audit_archive_index, and safely prunes audit logs via the delete gate.
 */
export function closeCoreFY(
  tx: DrizzleTransaction,
  firmId: string,
  fyId: string,
  resolvedDeviceId?: string
): void {
  const targetTx = getDb(tx);
  const fy =
    fyRepository.getById(targetTx, firmId, fyId) ??
    fyRepository.getById(targetTx, fyId, firmId) ??
    fyRepository.getById(targetTx, fyId);

  if (!fy || fy.firmId !== firmId) throw new Error(ERR.FY_OWNERSHIP_MISMATCH);
  if (fy.status !== 'ACTIVE') throw new Error(ERR.FY_NOT_ACTIVE);

  // Close FY in repository
  if (typeof (fyRepository as any).close === 'function') {
    (fyRepository as any).close(targetTx, fyId, firmId);
  } else if ((fyRepository as any).updateStatus.length >= 4) {
    (fyRepository as any).updateStatus(targetTx, fyId, firmId, 'CLOSED');
  } else {
    (fyRepository as any).updateStatus(targetTx, fyId, 'CLOSED');
  }

  // Dispatch registered extension hooks (e.g. Phase 4 refinery/karigar settlement)
  for (const hook of fyCloseHooks) {
    hook(targetTx, firmId, fyId);
  }

  const deviceId = resolvedDeviceId || 'DEV-DEVICE-ID';

  auditRepository.log(targetTx, {
    eventType: 'FY_CLOSED',
    firmId,
    entityId: fyId,
    deviceId,
    payload: { fyId, closedAt: now() },
  });

  const auditRowCount = auditArchiveIndexRepository.countByFirmAndFY(targetTx, firmId, fyId, fy);
  auditArchiveIndexRepository.insert(targetTx, {
    id: Crypto.randomUUID(),
    firmId,
    fyId,
    fyLabel: fy.label,
    archiveDate: now(),
    rowCount: auditRowCount,
    storageRef: null,
  });

  auditRepository.log(targetTx, {
    eventType: 'FY_ARCHIVE_INDEXED',
    firmId,
    entityId: fyId,
    deviceId,
    payload: { fyId, fyLabel: fy.label, rowCount: auditRowCount },
  });

  const settings = appSettingsStore.getState();
  const retentionDays = settings.auditRetentionDays ?? 30;

  const endDateBound = fy.endDate.length === 10 ? `${fy.endDate}T23:59:59.999Z` : fy.endDate;

  // Unlock gate prior to deletion to satisfy the prevent_audit_delete trigger
  targetTx.update(auditDeleteGateTable).set({ gateOpen: 1 }).where(eq(auditDeleteGateTable.id, 1)).run();
  targetTx.run(sql`
    DELETE FROM audit_logs
    WHERE firm_id = ${firmId}
    AND created_at < datetime('now', '-' || ${retentionDays} || ' days')
    AND created_at NOT BETWEEN ${fy.startDate} AND ${endDateBound}
  `);
  targetTx.update(auditDeleteGateTable).set({ gateOpen: 0 }).where(eq(auditDeleteGateTable.id, 1)).run();
}

// --- resolveTransactionFyId (RESOLVE-TRANSACTION-FYID / Step 1) ---
export function resolveTransactionFyId(firmId: string, entryDate: string, dbOrTx?: any): string {
  return fyRepository.resolveTransactionFyId(firmId, entryDate, dbOrTx);
}

export async function getActiveFY(firmId: string): Promise<FinancialYear | null> {
  return fyRepository.getActiveFY(firmId);
}

export function createInitialFY(firmId: string, tx?: any): FinancialYear {
  return fyRepository.createInitialFY(firmId, tx);
}

// Backward-compatible delegates for callers that still import preCloseChecks/closeFY from Phase 1
export async function preCloseChecks(fyId: string, firmId: string) {
  const { fyInventoryService } = await import('@/services/phase2/fyInventoryService');
  return fyInventoryService.preCloseChecks(fyId, firmId);
}

export async function closeFY(fyId: string, firmId: string) {
  const { fyInventoryService } = await import('@/services/phase2/fyInventoryService');
  return fyInventoryService.closeFY(fyId, firmId);
}

export const fyCoreService = {
  getActiveFY,
  createInitialFY,
  resolveTransactionFyId,
  registerFYCloseHook,
  closeCoreFY,
};

export const fyService = {
  ...fyCoreService,
  preCloseChecks,
  canCloseFY: preCloseChecks,
  closeFY,
};

export default fyService;