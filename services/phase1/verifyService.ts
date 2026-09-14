// services/phase1/verifyService.ts — Phase 2 v2.34 Canonical Implementation
// Aligned with FIX-VERIFY-ADAPTER-1 (v1.31), FIX-CAT-ITEM-FK (v1.42), FEAT-PURITY-ROUND-1 (v1.90),
// FIX-V192-CHECK4B-1/2 (v1.92), FEAT-PHANTOM-INVENTORY-1 (v1.67/v1.68), FIX-OLDMETAL-RENAME-1 (v2.32)

import { db } from '@/db/client';
import { eq, lt, and, isNotNull, notInArray } from 'drizzle-orm';
import {
  firms,
  financialYears,
  writerLeases,
  auditLogs,
  schemaVersion,
} from '@/db/schema';
import { safeModeService } from '@/services/phase1/safeModeService';
import { verifyStore } from '@/store/phase1/verifyStore';
import { storage } from '@/utils/storage';
import { now } from '@/utils/now';
import { SCHEMA_VERSION } from '@/constants';
import { ERR } from '@/constants/errorCodes';

const CACHE_KEY_STATUS = 'vjbilling_last_verify_status';
const CACHE_KEY_AT     = 'vjbilling_last_verify_at';
const CACHE_TTL_MS     = 30 * 60 * 1000; // 30 minutes

export type VerifyStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface VerifyFinding {
  severity: VerifyStatus;
  check: string;
  detail: string;
  firmId?: string;
}

export interface VerifyResult {
  status: VerifyStatus;
  findings: VerifyFinding[];
}

export const verifyService = {
  async runVerify(firmId?: string): Promise<VerifyResult> {
    if (!firmId) {
      try {
        const cachedStatus = storage.getString(CACHE_KEY_STATUS);
        const cachedAt     = storage.getString(CACHE_KEY_AT);
        const bootInterrupted = storage.getString('vjbilling_boot_was_interrupted');

        if (cachedStatus === 'HEALTHY' && cachedAt && bootInterrupted === 'false') {
          const elapsed = Date.now() - new Date(cachedAt).getTime();
          if (elapsed < CACHE_TTL_MS) {
            console.log('[Verify] VERIFY-BOOT-CACHE: Returning cached HEALTHY result (elapsed:', Math.round(elapsed / 1000), 's)');
            verifyStore.getState().setScanResults([]);
            return { status: 'HEALTHY', findings: [] };
          }
        }
      } catch (cacheError) {
        console.warn('[Verify] VERIFY-BOOT-CACHE: Cache read failed, running full verify:', cacheError);
      }
    }

    const findings: VerifyFinding[] = [];

    const allFirmRows = await db.select({ id: firms.id }).from(firms);
    const allFirmIds  = allFirmRows.map(r => r.id);
    const knownFirmIdSet = new Set(allFirmIds);

    if (allFirmIds.length === 0) {
      console.log('[Verify] Clean install detected — no firms. Skipping all checks, returning HEALTHY.');
      verifyStore.getState().setScanResults([]);

      if (!firmId) {
        try {
          storage.set(CACHE_KEY_STATUS, 'HEALTHY');
          storage.set(CACHE_KEY_AT, now());
        } catch (cacheWriteError) {
          console.warn('[Verify] VERIFY-BOOT-CACHE: Failed to write cache keys:', cacheWriteError);
        }
      }

      return { status: 'HEALTHY', findings: [] };
    }

    // Check 1b: Orphan FY
    const orphanFYs = await db
      .select({ id: financialYears.id, firmId: financialYears.firmId })
      .from(financialYears)
      .where(notInArray(financialYears.firmId, allFirmIds));

    for (const row of orphanFYs) {
      findings.push({
        severity: 'CRITICAL',
        check: 'ORPHAN_FY',
        detail: `Financial year references non-existent firm ${row.firmId}`,
        firmId: row.firmId ?? undefined,
      });
    }

    // Check 2 + 3: Missing FY / Multiple Active FY
    const activeFirmRows = firmId
      ? await db.select({ id: firms.id }).from(firms).where(and(eq(firms.id, firmId), eq(firms.isArchived, 0)))
      : await db.select({ id: firms.id }).from(firms).where(eq(firms.isArchived, 0));

    for (const { id: fid } of activeFirmRows) {
      const activeFYs = await db
        .select({ id: financialYears.id })
        .from(financialYears)
        .where(and(eq(financialYears.firmId, fid), eq(financialYears.status, 'ACTIVE')));

      if (activeFYs.length === 0) {
        findings.push({
          severity: 'CRITICAL',
          check: 'MISSING_FY',
          detail: `Firm ${fid} has no active financial year. Data boundary violated.`,
          firmId: fid,
        });
      } else if (activeFYs.length > 1) {
        findings.push({
          severity: 'CRITICAL',
          check: 'MULTIPLE_ACTIVE_FY',
          detail: `Firm ${fid} has ${activeFYs.length} active financial years (max 1). Time boundary violated.`,
          firmId: fid,
        });
      }
    }

    // Check 4: Firm isolation
    const fyFirmIds = (await db
      .select({ firmId: financialYears.firmId })
      .from(financialYears)).map(r => r.firmId);

    const isolationViolations = fyFirmIds.filter(fid => fid && !knownFirmIdSet.has(fid));
    if (isolationViolations.length > 0) {
      findings.push({
        severity: 'CRITICAL',
        check: 'FIRM_ISOLATION_VIOLATION',
        detail: `${isolationViolations.length} record(s) reference unknown firmId — firm isolation violated.`,
      });
    }

    // Check 5: Audit log timestamp continuity
    const auditRows = await db
      .select({ firmId: auditLogs.firmId, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(isNotNull(auditLogs.firmId))
      .orderBy(auditLogs.firmId, auditLogs.createdAt);

    let prevFirmId: string | null = null;
    let prevTs: string | null = null;
    let continuityViolations = 0;

    for (const row of auditRows) {
      if (row.firmId === prevFirmId && prevTs && row.createdAt < prevTs) {
        continuityViolations++;
      }
      prevFirmId = row.firmId;
      prevTs = row.createdAt;
    }

    if (continuityViolations > 0) {
      findings.push({
        severity: 'WARNING',
        check: 'AUDIT_LOG_CONTINUITY',
        detail: `${continuityViolations} audit log timestamp inversion(s) detected.`,
      });
    }

    // Check 6: Orphan audit logs
    const orphanAudit = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(isNotNull(auditLogs.firmId), notInArray(auditLogs.firmId, allFirmIds)));

    if (orphanAudit.length > 0) {
      findings.push({
        severity: 'WARNING',
        check: 'ORPHAN_AUDIT_LOGS',
        detail: `${orphanAudit.length} audit log(s) reference non-existent firms. Data isolation breach detected.`,
      });
    }

    // Check 7: Expired writer leases
    const expiredLeases = await db
      .select({ id: writerLeases.id })
      .from(writerLeases)
      .where(lt(writerLeases.expiresAt, now()));

    if (expiredLeases.length > 0) {
      findings.push({
        severity: 'WARNING',
        check: 'EXPIRED_LEASES',
        detail: `${expiredLeases.length} expired writer lease(s) found. Database lock mechanism may be stalling.`,
      });
    }

    // Check 8: Schema version mismatch
    try {
      const svRow = await db.select().from(schemaVersion).limit(1);
      if (!svRow.length || svRow[0].currentVersion !== SCHEMA_VERSION) {
        findings.push({
          severity: 'CRITICAL',
          check: 'SCHEMA_VERSION_MISMATCH',
          detail: `DB version ${svRow[0]?.currentVersion ?? 'missing'} !== app ${SCHEMA_VERSION}. Please update the app.`,
        });
      }
    } catch {
      findings.push({
        severity: 'CRITICAL',
        check: 'SCHEMA_VERSION_MISMATCH',
        detail: 'Database schema version table missing or unreadable.',
      });
    }

    const filteredFindings = firmId
      ? findings.filter(f => f.firmId === undefined || f.firmId === firmId)
      : findings;

    let status: VerifyStatus = 'HEALTHY';
    if (filteredFindings.some(f => f.severity === 'CRITICAL')) status = 'CRITICAL';
    else if (filteredFindings.some(f => f.severity === 'WARNING')) status = 'WARNING';

    if (!firmId) {
      if (status === 'CRITICAL') {
        const criticalFindings = filteredFindings.filter(f => f.severity === 'CRITICAL');
        console.error('[Verify] Critical Integrity Failure Detected. Activating Safe Mode.');
        console.error('[Verify] Critical Findings Breakdown:', JSON.stringify(criticalFindings, null, 2));
        await safeModeService.activate('VERIFY_CRITICAL_ISSUE');
      } else if (status === 'HEALTHY') {
        console.log('[Verify] Clearing Safe Mode (HEALTHY)...');
        await safeModeService.clear();
        console.log('[Verify] Safe Mode cleared.');
      }

      try {
        storage.set(CACHE_KEY_STATUS, status);
        storage.set(CACHE_KEY_AT, now());
      } catch (cacheWriteError) {
        console.warn('[Verify] VERIFY-BOOT-CACHE: Failed to write cache keys:', cacheWriteError);
      }
    }

    verifyStore.getState().setScanResults(filteredFindings);

    return { status, findings: filteredFindings };
  },

  async invalidateCache(): Promise<void> {
    try {
      storage.delete(CACHE_KEY_STATUS);
      storage.delete(CACHE_KEY_AT);
      console.log('[Verify] VERIFY-BOOT-CACHE: Cache invalidated.');
    } catch (e) {
      console.warn('[Verify] VERIFY-BOOT-CACHE: Cache invalidation failed (non-fatal):', e);
    }
  },
};