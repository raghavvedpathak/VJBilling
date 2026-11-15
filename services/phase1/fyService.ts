// services/phase1/fyService.ts — Phase 1 v7.47 & Phase 2 Canonical Financial Year Core Service
// Implements Step 5 (RESOLVE-TRANSACTION-FYID), Step 5.5 (CLOSE-FY-FLOW), FIX-V742-2, FIX-V744-6

import db, { db as dbNamed } from '@/db/client';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { financialYears, auditDeleteGate as auditDeleteGateTable, FYStatus } from '@/db/schema';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { auditArchiveIndexRepository } from '@/repositories/phase1/auditArchiveIndexRepository';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import type {
  DrizzleTransaction,
  FinancialYear,
  FYCloseHook,
  FYCloseHookResult,
} from '@/types/phase1/fy.types';
import { ERR } from '@/constants/errorCodes';
import { MIN_AUDIT_RETENTION_DAYS } from '@/constants/auditRetention';

export type { FYCloseHook, FYCloseHookResult };

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

// GAP-FY-HOOK-TYPE v1.8 — FYCloseHook return type and registration pattern
export const fyCloseHooks: Array<FYCloseHook> = [];

export function registerFYCloseHook(fn: FYCloseHook): void {
  fyCloseHooks.push(fn);
}

export function clearFYCloseHooks(): void {
  fyCloseHooks.length = 0;
}

/**
 * Core Phase 1/2 Year-End status finalizer.
 * Updates FY status to CLOSED, dispatches extension hooks, logs FY_CLOSED audit event,
 * indexes the archive in audit_archive_index, and safely prunes audit logs via the delete gate
 * while preserving PURGE_EXEMPT_EVENTS (FIX-V742-2).
 */
export function closeCoreFY(
  tx: DrizzleTransaction,
  firmId: string,
  fyId: string,
  resolvedDeviceId?: string,
  skipHooks: boolean = false
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

  // Dispatch registered extension hooks if not skipped
  if (!skipHooks) {
    for (const hook of fyCloseHooks) {
      try {
        const res = hook(targetTx, firmId, fyId);
        if (res && typeof (res as any).catch === 'function') {
          (res as any).catch((err: any) => {
            console.error('[closeCoreFY] FY close hook error:', err);
          });
        }
      } catch (err) {
        console.error('[closeCoreFY] FY close hook error:', err);
      }
    }
  }

  const deviceId = resolvedDeviceId || 'DEV-DEVICE-ID';
  const closedAt = now();

  auditRepository.log(targetTx, {
    eventType: 'FY_CLOSED',
    firmId,
    entityId: fyId,
    deviceId,
    payload: { fyId, fyLabel: fy.label, closedAt },
  });

  const auditRowCount = auditArchiveIndexRepository.countByFirmAndFY(targetTx, firmId, fyId, fy);
  auditArchiveIndexRepository.insert(targetTx, {
    id: Crypto.randomUUID(),
    firmId,
    fyId,
    fyLabel: fy.label,
    archiveDate: closedAt,
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
  const retentionDays = Math.max(
    MIN_AUDIT_RETENTION_DAYS,
    settings.auditRetentionDays ?? MIN_AUDIT_RETENTION_DAYS
  );
  const endDateBound = fy.endDate.length === 10 ? `${fy.endDate}T23:59:59.999Z` : fy.endDate;

  // Unlock gate prior to deletion to satisfy the prevent_audit_delete trigger;
  // FIX-V742-2: Never delete DEVICE_ID_GENERATED or FIRM_CODE_SET identity events.
  targetTx
    .update(auditDeleteGateTable)
    .set({ gateOpen: 1 })
    .where(eq(auditDeleteGateTable.id, 1))
    .run();
  targetTx.run(sql`
    DELETE FROM audit_logs
    WHERE firm_id = ${firmId}
    AND event_type NOT IN ('DEVICE_ID_GENERATED', 'FIRM_CODE_SET')
    AND created_at < datetime('now', '-' || ${retentionDays} || ' days')
    AND created_at NOT BETWEEN ${fy.startDate} AND ${endDateBound}
  `);
  targetTx
    .update(auditDeleteGateTable)
    .set({ gateOpen: 0 })
    .where(eq(auditDeleteGateTable.id, 1))
    .run();
}

/**
 * Canonical FY resolution function (RESOLVE-TRANSACTION-FYID / Step 2 & 5)
 * Disallows entries in closed financial years.
 */
export function resolveTransactionFyId(
  firmId: string,
  entryDate: string,
  dbOrTx?: any
): string {
  if (typeof (fyRepository as any).resolveTransactionFyId === 'function') {
    return (fyRepository as any).resolveTransactionFyId(firmId, entryDate, dbOrTx);
  }

  const target = getDb(dbOrTx);
  const cleanDate = entryDate.length > 10 ? entryDate.slice(0, 10) : entryDate;
  const rows =
    target
      .select()
      .from(financialYears)
      .where(
        and(
          eq(financialYears.firmId, firmId),
          eq(financialYears.status, FYStatus.ACTIVE),
          lte(financialYears.startDate, cleanDate),
          gte(financialYears.endDate, cleanDate)
        )
      )
      .limit(1)
      .all?.() ?? [];

  if (!rows || rows.length === 0) {
    throw new Error(ERR.ENTRY_DATE_IN_CLOSED_FY);
  }

  return rows[0].id;
}

export async function getActiveFY(firmId: string): Promise<FinancialYear | null> {
  return fyRepository.getActiveFY(firmId);
}

export function createInitialFY(firmId: string, tx?: any): FinancialYear {
  return fyRepository.createInitialFY(firmId, tx);
}

export const fyCoreService = {
  getActiveFY,
  createInitialFY,
  resolveTransactionFyId,
  registerFYCloseHook,
  clearFYCloseHooks,
  closeCoreFY,
};

export const fyService = fyCoreService;
export default fyService;
