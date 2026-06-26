import { subDays, differenceInDays, parseISO } from 'date-fns';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs, auditDeleteGate, appSettings } from '../db/schema';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { auditRepository } from '../repositories/auditRepository';
import { useAppSettingsStore } from '../store/appSettingsStore';

export async function purgeExpiredAuditLogs(): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1 — Dual Guard
  safeModeService.assertNotInSafeMode(); // GUARD 2 — Dual Guard
  
  const { auditRetentionDays } = useAppSettingsStore.getState(); // default 30
  const cutoff = subDays(new Date(), auditRetentionDays).toISOString();
  
  // No FY-active carve-out (removed v7.10 FIX-V710-3) — purely time-based.
  // v7.21 FIX-V721-1: `return` removed from db.transaction()
  await db.transaction(async (tx) => {
    await tx.update(auditDeleteGate).set({ gateOpen: 1 }).where(eq(auditDeleteGate.id, 1));
    
    const result = await tx.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
    
    await tx.update(auditDeleteGate).set({ gateOpen: 0 }).where(eq(auditDeleteGate.id, 1)); // gate closes same tx
    
    // Purge event is an INSERT — unaffected by the DELETE trigger, stays permanent
    await auditRepository.log(tx, { 
      eventType: 'AUDIT_RETENTION_PURGE_EXECUTED', 
      firmId: null,
      deviceId: 'SYSTEM', 
      payload: JSON.stringify({ 
        deletedCount: result?.changes ?? 0, 
        auditRetentionDays,
        cutoff, 
        executedAt: new Date().toISOString() 
      }) 
    });

    await tx.update(appSettings).set({ auditRetentionLastRunAt: new Date().toISOString() }).where(eq(appSettings.id, 1));
  });

  // v7.20 FIX-V720-2: appSettingsStore.setState moved OUTSIDE db.transaction() callback — SETSTATE-OUTSIDE-TX COROLLARY
  useAppSettingsStore.setState({ auditRetentionLastRunAt: new Date().toISOString() });
}
