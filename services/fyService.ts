// services/fyService.ts — Phase 2 v2.11 Canonical Service

import { db } from '../db/client';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { fyRepository } from '../repositories/fyRepository';
import { auditRepository } from '../repositories/auditRepository';
import { itemRepository } from '../repositories/itemRepository';
import { auditArchiveIndexRepository } from '../repositories/auditArchiveIndexRepository';
import { oldGoldLotRepository } from '../repositories/oldGoldLotRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { phase2VerifyService } from './verifyService';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import { oldGoldLots, financialYears } from '../db/schema';
import { appSettingsStore } from '../store/appSettingsStore';
import type { DrizzleTransaction, VerifyIssue, FinancialYear } from '../types/phase2.types';
import { ERR } from '../constants/errorCodes';

// FIX-V718-1: Hooks must be strictly synchronous to execute safely inside the JSI transaction boundary
const fyCloseHooks: Array<(tx: DrizzleTransaction, firmId: string, fyId: string) => void> = [];

export function registerFYCloseHook(fn: (tx: DrizzleTransaction, firmId: string, fyId: string) => void): void { 
  fyCloseHooks.push(fn); 
}

// --- preCloseChecks (Step 5.5 / CLOSE-FY-FLOW STEP 2) ---
export async function preCloseChecks(fyId: string, firmId: string): Promise<{ canClose: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];
  
  const fy = await fyRepository.getById(fyId);
  
  if (!fy || fy.firmId !== firmId) { 
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

// --- closeFY (Step 5.5 / ALIGN-P1-V76) ---
export async function closeFY(fyId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  // ALIGN-P1-1 (v1.16): LeaseType.WRITE
  const leaseId = await leaseService.acquire('WRITE', firmId);
  
  try {
    // FIX-CLOSEFY-VERIFY-SYNC-1 (v1.82): run outside transaction
    const verifyIssues = await phase2VerifyService.runVerify(firmId);
    if (verifyIssues.some((i: VerifyIssue) => i.severity === 'CRITICAL')) {
      throw new Error(ERR.FY_CLOSE_BLOCKED_CRITICAL_VERIFY);
    }

    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    db.transaction((tx) => {
      const fy = fyRepository.getById(tx, firmId, fyId) ?? fyRepository.getById(tx, fyId);
      
      if (!fy || fy.firmId !== firmId) throw new Error(ERR.FY_OWNERSHIP_MISMATCH);
      if (fy.status !== 'ACTIVE') throw new Error(ERR.FY_NOT_ACTIVE);
      
      const draftItems = itemRepository.findByStatus(tx, firmId, 'DRAFT');
      if (draftItems.length > 0) throw new Error(ERR.FY_CLOSE_BLOCKED_DRAFT_ITEMS);

      if (fyCloseHooks.length === 0) {
        console.warn(
          'FY_CLOSE_NO_HOOKS: closeFY() running with no registered hooks. ' +
          'Phase 4 karigar/refinery outstanding fine balance will be 0. ' +
          'Phase 4 MUST call registerFYCloseHook() before this runs in production.'
        );
      }

      const karigarRepository = { getOutstandingFineMg: (_tx: DrizzleTransaction, _firmId: string) => 0 };
      const refineryRepository = { getOutstandingFineMg: (_tx: DrizzleTransaction, _firmId: string) => 0 };

      const karigarOutstandingFineMg = karigarRepository.getOutstandingFineMg(tx, firmId);
      const refineryOutstandingFineMg = refineryRepository.getOutstandingFineMg(tx, firmId);
      
      const openGoldLotsRows = oldGoldLotRepository.findByFirmId(tx, firmId);
      const openGoldLotFineMg = openGoldLotsRows
        .filter(l => !['SETTLED','SENT_TO_MELT'].includes(l.status))
        .reduce((sum, l) => sum + l.fineWeightMg, 0); // RED-5: reads stored value verbatim
        
      const totalOpeningFineMg = karigarOutstandingFineMg + refineryOutstandingFineMg + openGoldLotFineMg;

      // Update FY status to CLOSED
      fyRepository.updateStatus(tx, firmId, fyId, 'CLOSED');

      for (const hook of fyCloseHooks) {
        hook(tx, firmId, fyId);
      }

      auditRepository.log(tx, { 
        eventType: 'FY_CLOSED', 
        firmId, 
        entityId: fyId, 
        deviceId, 
        payload: { fyId, closedAt: now() } 
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
            totalOpeningFineMg 
          } 
        } 
      });

      // ALIGN-P1-V74 (v1.39) Audit archive index row
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
        payload: { fyId, fyLabel: fy.label, rowCount: auditRowCount } 
      });

      // AUDIT-RETENTION-ENFORCE (Phase 1 v7.7 / FIX-V78-6 per-firmId scope / Step 5.5)
      const settings = appSettingsStore.getState();
      const retentionDays = settings.auditRetentionDays ?? 90;
      tx.run(sql`
        DELETE FROM audit_logs
        WHERE firm_id = ${firmId}
        AND created_at < datetime('now', '-' || ${retentionDays} || ' days')
        AND created_at NOT BETWEEN ${fy.startDate} AND ${fy.endDate}
      `);
    });
  } finally {
    await leaseService.release(leaseId);
  }
}

// --- resolveTransactionFyId (RESOLVE-TRANSACTION-FYID / Step 1) ---
export async function resolveTransactionFyId(
  firmId: string, entryDate: string, dbOrTx?: any
): Promise<string> {
  const runner = dbOrTx ?? db;
  const match = await runner.select().from(financialYears).where(
    and(
      eq(financialYears.firmId, firmId),
      eq(financialYears.status, 'ACTIVE'),
      lte(financialYears.startDate, entryDate),
      gte(financialYears.endDate, entryDate),
    )
  ).limit(1);
  if (!match.length) throw new Error(ERR.ENTRY_DATE_IN_CLOSED_FY);
  return match[0].id;
}

export const fyService = {
  async getActiveFY(firmId: string) { return fyRepository.getActiveFY(firmId); },
  resolveTransactionFyId,
  closeFY,
  preCloseChecks,
  registerFYCloseHook
};