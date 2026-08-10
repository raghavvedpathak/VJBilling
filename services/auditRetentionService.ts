// services/auditRetentionService.ts — Phase 2 v2.11 Canonical Service

import { subDays } from 'date-fns';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs, auditDeleteGate, appSettings } from '../db/schema';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { appSettingsStore } from '../store/appSettingsStore';

export async function purgeExpiredAuditLogs(): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1 — Dual Guard
  safeModeService.assertNotInSafeMode();    // GUARD 2 — Dual Guard
  
  const { auditRetentionDays } = appSettingsStore.getState(); // default 30
  const cutoff = subDays(new Date(), auditRetentionDays).toISOString();
  
  await db.transaction((tx) => {
    tx.update(auditDeleteGate).set({ gateOpen: 1 }).where(eq(auditDeleteGate.id, 1)).run();
    
    // Uses auditLogs.createdAt
    const result = tx.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).run();
    
    tx.update(auditDeleteGate).set({ gateOpen: 0 }).where(eq(auditDeleteGate.id, 1)).run();
    
    auditRepository.log(tx, { 
      eventType: 'AUDIT_RETENTION_PURGE_EXECUTED', 
      firmId: null,
      deviceId: 'SYSTEM', 
      payload: { 
        deletedCount: result?.changes ?? 0, 
        auditRetentionDays,
        cutoff, 
        executedAt: new Date().toISOString() 
      } 
    });

    tx.update(appSettings).set({ auditRetentionLastRunAt: new Date().toISOString() }).where(eq(appSettings.id, 1)).run();
  });

  appSettingsStore.setState({ auditRetentionLastRunAt: new Date().toISOString() });
}