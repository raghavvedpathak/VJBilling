import { db } from '../db/client';
import { eq, sql, and, lte, gte } from 'drizzle-orm';
import { fyRepository } from '../repositories/fyRepository';
import { auditRepository } from '../repositories/auditRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditArchiveIndexRepository } from '../repositories/auditArchiveIndexRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { phase2VerifyService } from './verifyService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { oldGoldLots, appSettings, financialYears, FYStatus } from '../db/schema';
import { appSettingsStore } from '../store/appSettingsStore';
import type { DrizzleTransaction, VerifyIssue } from '../types/phase2.types';
import { ERR } from '../constants/errorCodes';
import { purgeExpiredAuditLogs } from './auditRetentionService';

// FIX-V718-1: Hooks must be strictly synchronous to execute safely inside the JSI transaction boundary
const fyCloseHooks: Array<(tx: DrizzleTransaction, firmId: string, fyId: string) => void> = [];

export function registerFYCloseHook(fn: (tx: DrizzleTransaction, firmId: string, fyId: string) => void): void { 
  fyCloseHooks.push(fn); 
}

export async function preCloseChecks(fyId: string, firmId: string): Promise<{ canClose: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];
  
  // FIX: Safely execute async read on the global DB since we are outside a synchronous transaction
  const [fy] = await db
    .select()
    .from(financialYears)
    .where(and(eq(financialYears.id, fyId), eq(financialYears.firmId, firmId)))
    .limit(1);
  
  if (!fy) { 
    issues.push({ code: ERR.FY_OWNERSHIP_MISMATCH, severity: 'CRITICAL', message: 'Financial year does not belong to this firm' }); 
    return { canClose: false, issues }; 
  }
  
  if (fy.status !== 'ACTIVE') {
    issues.push({ code: ERR.FY_NOT_ACTIVE, severity: 'CRITICAL', message: 'Financial year is not in ACTIVE status' });
  }

  const draftItems = await itemRepository.findByStatus(firmId, 'DRAFT');
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

export async function closeFY(fyId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const leaseId = await leaseService.acquire('FY_CLOSE', firmId);
  
  try {
    // FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82): run outside transaction
    const verifyIssues = await phase2VerifyService.runVerify(firmId);
    if (verifyIssues.some((i: VerifyIssue) => i.severity === 'CRITICAL')) {
      throw new Error(ERR.FY_CLOSE_BLOCKED_CRITICAL_VERIFY);
    }

    // Hoisted async call BEFORE transaction lock
    const deviceId = await getDeviceId();

    // FIX-V718-1: Completely synchronous transaction block
    db.transaction((tx) => {
      // Inline query since we have tx context, avoids guessing repo methods
      const fy = tx.select().from(financialYears).where(and(eq(financialYears.id, fyId), eq(financialYears.firmId, firmId))).limit(1).get() as any;
      
      if (!fy) throw new Error(ERR.FY_OWNERSHIP_MISMATCH);
      if (fy.status !== 'ACTIVE') throw new Error(ERR.FY_NOT_ACTIVE);
      
      const draftItems = itemRepository.findByStatusTx(tx, firmId, 'DRAFT');
      if (draftItems.length > 0) throw new Error(ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS);

      if (fyCloseHooks.length === 0) {
        console.warn('FY_CLOSE_NO_HOOKS: closeFY() running with no registered hooks. Phase 4 karigar/refinery outstanding fine balance will be 0. Phase 4 MUST call registerFYCloseHook() before this runs in production.');
      }

      // Stubs updated to synchronous signatures
      const karigarRepository = { getOutstandingFineMg: (_tx: DrizzleTransaction, _firmId: string) => 0 };
      const refineryRepository = { getOutstandingFineMg: (_tx: DrizzleTransaction, _firmId: string) => 0 };

      const karigarOutstandingFineMg = karigarRepository.getOutstandingFineMg(tx, firmId);
      const refineryOutstandingFineMg = refineryRepository.getOutstandingFineMg(tx, firmId);
      
      const openGoldLotsRows = tx.select().from(oldGoldLots).where(eq(oldGoldLots.firmId, firmId)).all();
      const openGoldLotFineMg = openGoldLotsRows
        .filter(l => !['SETTLED','SENT_TO_MELT'].includes(l.status))
        .reduce((sum, l) => sum + l.fineWeightMg, 0);
        
      const totalOpeningFineMg = karigarOutstandingFineMg + refineryOutstandingFineMg + openGoldLotFineMg;

      // FIX FOR TS ERROR 2339: Inline synchronous update instead of a nonexistent repo method
      tx.update(financialYears)
        .set({ status: 'CLOSED' })
        .where(and(eq(financialYears.id, fyId), eq(financialYears.firmId, firmId)))
        .run();

      for (const hook of fyCloseHooks) {
        hook(tx, firmId, fyId);
      }

      auditRepository.log(tx, { 
        eventType: 'FY_CLOSED', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ fyId, closedAt: now() }) 
      });

      auditRepository.log(tx, { 
        eventType: 'FY_CLOSE_FINE_BALANCE', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ 
          fyId, closedAt: now(), 
          fineBalanceComponents: { karigarOutstandingFineMg, refineryOutstandingFineMg, openGoldLotFineMg, totalOpeningFineMg } 
        }) 
      });

      // Synchronous repository calls
      const auditRowCount = auditArchiveIndexRepository.countByFirmAndFY(tx, firmId, fyId, fy);
      auditArchiveIndexRepository.insert(tx, {
        id: Crypto.randomUUID(), firmId, fyId,
        fyLabel: fy.label, archiveDate: now(),
        rowCount: auditRowCount, storageRef: null,
      });

      auditRepository.log(tx, { 
        eventType: 'FY_ARCHIVE_INDEXED', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ fyId, fyLabel: fy.label, rowCount: auditRowCount }) 
      });

    });

    // v7.10 AUDIT-RETENTION-MONTHLY: call purgeExpiredAuditLogs() after transaction commit
    await purgeExpiredAuditLogs().catch(console.error);
  } finally {
    await leaseService.release(leaseId);
  }
}

export const fyService = {
  async getActiveFY(firmId: string) { return fyRepository.getActiveFY(firmId); },
  resolveTransactionFyId,
  closeFY,
  preCloseChecks,
  registerFYCloseHook
};

export async function resolveTransactionFyId(
  firmId: string, entryDate: string
): Promise<string> {
  // Safe async block: Outer function, NO tx callback boundaries
  const match = await db.select().from(financialYears).where(
    and(
      eq(financialYears.firmId, firmId),
      eq(financialYears.status, FYStatus.ACTIVE),
      lte(financialYears.startDate, entryDate),
      gte(financialYears.endDate, entryDate),
    )
  ).limit(1);
  if (!match.length) throw new Error(ERR.ENTRY_DATE_IN_CLOSED_FY);
  return match[0].id;
}