// services/phase1/auditRetentionService.ts — Phase 2 v2.11 Canonical Service

import { subDays } from 'date-fns';
import { eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs, auditDeleteGate, appSettings } from '@/db/schema';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';

export async function purgeExpiredAuditLogs(): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1 — Dual Guard
  safeModeService.assertNotInSafeMode();    // GUARD 2 — Dual Guard
  
  const { auditRetentionDays } = appSettingsStore.getState(); // default 30
  const cutoff = subDays(new Date(), auditRetentionDays).toISOString();
  const deviceId = await getDeviceId().catch(() => 'DEV-DEVICE-ID');
  const executionTime = now();
  
  await db.transaction((tx) => {
    tx.update(auditDeleteGate).set({ gateOpen: 1 }).where(eq(auditDeleteGate.id, 1)).run();
    
    // Uses auditLogs.createdAt
    const result = tx.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).run();
    
    tx.update(auditDeleteGate).set({ gateOpen: 0 }).where(eq(auditDeleteGate.id, 1)).run();
    
    auditRepository.log(tx, { 
      eventType: 'AUDIT_RETENTION_PURGE_EXECUTED', 
      firmId: null,
      deviceId, 
      payload: JSON.stringify({ 
        deletedCount: result?.changes ?? 0, 
        auditRetentionDays,
        cutoff, 
        executedAt: executionTime 
      }) 
    });

    tx.update(appSettings)
      .set({ auditRetentionLastRunAt: executionTime })
      .where(eq(appSettings.id, 1))
      .run();
  });

  appSettingsStore.setState({ auditRetentionLastRunAt: executionTime });
}