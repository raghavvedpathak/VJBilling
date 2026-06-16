import { db } from '../db/client';
import { eq, sql } from 'drizzle-orm';
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
import { oldGoldLots, appSettings } from '../db/schema';
import type { DrizzleTransaction, VerifyIssue } from '../types/phase2.types';

const fyCloseHooks: Array<(tx: DrizzleTransaction, firmId: string, fyId: string) => Promise<void>> = [];

export function registerFYCloseHook(fn: (tx: DrizzleTransaction, firmId: string, fyId: string) => Promise<void>): void { 
  fyCloseHooks.push(fn); 
}

export async function preCloseChecks(fyId: string, firmId: string): Promise<{ canClose: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];
  const fy = await fyRepository.getById(fyId);
  
  if (!fy || fy.firmId !== firmId) { 
    issues.push({ code: 'FY_OWNERSHIP_MISMATCH', severity: 'CRITICAL', message: 'Financial year does not belong to this firm' }); 
    return { canClose: false, issues }; 
  }
  
  if (fy && fy.status !== 'ACTIVE') {
    issues.push({ code: 'FY_NOT_ACTIVE', severity: 'CRITICAL', message: 'Financial year is not in ACTIVE status' });
  }

  const draftItems = await itemRepository.findByStatus(firmId, 'DRAFT');
  if (draftItems.length > 0) {
    issues.push({ code: 'FY_CLOSE_BLOCKED_DRAFT_ITEMS', severity: 'CRITICAL', message: `${draftItems.length} DRAFT items exist. Discard or publish before close.` });
  }

  const verifyResult = await phase2VerifyService.runVerify(firmId);
  const criticalIssues = verifyResult.filter((i: VerifyIssue) => i.severity === 'CRITICAL');
  
  const phantomBlock = criticalIssues.find((i: VerifyIssue) => i.code === 'FY_CLOSE_BLOCKED_PHANTOM_ITEMS');
  if (phantomBlock) {
    issues.push({ code: 'FY_CLOSE_BLOCKED_PHANTOM_ITEMS', severity: 'CRITICAL', message: phantomBlock.message });
  }

  const remainingCritical = criticalIssues.filter((i: VerifyIssue) => i.code !== 'FY_CLOSE_BLOCKED_PHANTOM_ITEMS');
  if (remainingCritical.length > 0) {
    issues.push({ code: 'FY_CLOSE_BLOCKED_CRITICAL_VERIFY', severity: 'CRITICAL', message: `${remainingCritical.length} CRITICAL verify issues must be resolved first.` });
  }

  return { canClose: issues.length === 0, issues };
}

export async function closeFY(fyId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();

  const leaseId = await leaseService.acquire('WRITE', firmId);
  
  try {
    await db.transaction(async (tx) => {
      const fy = await fyRepository.getById(fyId);
      if (!fy || fy.firmId !== firmId) throw new Error('FY_OWNERSHIP_MISMATCH');
      if (fy.status !== 'ACTIVE') throw new Error('FY_NOT_ACTIVE');

      const draftItems = await itemRepository.findByStatus(firmId, 'DRAFT');
      if (draftItems.length > 0) throw new Error('FY_CLOSE_BLOCKED_DRAFT_ITEMS');

      const verifyIssues = await phase2VerifyService.runVerify(firmId);
      if (verifyIssues.some((i: VerifyIssue) => i.severity === 'CRITICAL')) {
        throw new Error('FY_CLOSE_BLOCKED_CRITICAL_VERIFY');
      }

      if (fyCloseHooks.length === 0) {
        console.warn('FY_CLOSE_NO_HOOKS: closeFY() running with no registered hooks. Phase 4 karigar/refinery outstanding fine balance will be 0. Phase 4 MUST call registerFYCloseHook() before this runs in production.');
      }

      const karigarRepository = { getOutstandingFineMg: async (_tx: DrizzleTransaction, _firmId: string) => 0 };
      const refineryRepository = { getOutstandingFineMg: async (_tx: DrizzleTransaction, _firmId: string) => 0 };

      const karigarOutstandingFineMg = await karigarRepository.getOutstandingFineMg(tx, firmId);
      const refineryOutstandingFineMg = await refineryRepository.getOutstandingFineMg(tx, firmId);
      
      const openGoldLotsRows = await tx.select().from(oldGoldLots).where(eq(oldGoldLots.firmId, firmId));
      const openGoldLotFineMg = openGoldLotsRows
        .filter(l => !['SETTLED','SENT_TO_MELT'].includes(l.status))
        .reduce((sum, l) => sum + Math.round(l.grossWeightMg * l.purityPercent / 100), 0);
        
      const totalOpeningFineMg = karigarOutstandingFineMg + refineryOutstandingFineMg + openGoldLotFineMg;

      // Close FY
      await fyRepository.closeFY(firmId, fyId, tx);

      for (const hook of fyCloseHooks) await hook(tx, firmId, fyId);

      const deviceId = await getDeviceId();

      await auditRepository.log(tx, { 
        eventType: 'FY_CLOSED', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ fyId, closedAt: now() }) 
      });

      await auditRepository.log(tx, { 
        eventType: 'FY_CLOSE_FINE_BALANCE', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ 
          fyId, closedAt: now(), 
          fineBalanceComponents: { karigarOutstandingFineMg, refineryOutstandingFineMg, openGoldLotFineMg, totalOpeningFineMg } 
        }) 
      });

      const auditRowCount = await auditArchiveIndexRepository.countByFirmAndFY(tx, firmId, fyId, fy);
      await auditArchiveIndexRepository.insert(tx, {
        id: Crypto.randomUUID(), firmId, fyId,
        fyLabel: fy.label, archiveDate: now(),
        rowCount: auditRowCount, storageRef: null,
      });

      await auditRepository.log(tx, { 
        eventType: 'FY_ARCHIVE_INDEXED', firmId, entityId: fyId, deviceId, 
        payload: JSON.stringify({ fyId, fyLabel: fy.label, rowCount: auditRowCount }) 
      });

      const [settings] = await tx.select().from(appSettings).limit(1);
      const retentionDays = settings?.auditRetentionDays || 90;
      
      await tx.run(sql`
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

export const fyService = {
  async getActiveFY(firmId: string) { return fyRepository.getActiveFY(firmId); },
  async resolveTransactionFyId(firmId: string, entryDate: string) { return fyRepository.resolveTransactionFyId(firmId, entryDate); },
  closeFY,
  preCloseChecks,
  registerFYCloseHook
};