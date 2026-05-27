// services/verifyService.ts
// v6.0 G63 — Canonical Implementation
// v6.7 FIX-V67-4 — firmId param (optional) for firm-scoped filtering
// v7.7 VERIFY-BOOT-CACHE — 30-minute MMKV cache eliminates 9-query boot scan
// v7.8 FIX-V78-5 — VerifyFinding.firmId?: string structural field (replaces string-matching)
//
// CONSTITUTIONAL RULES:
//   - MUST NOT call assertNotInSafeMode() — verify runs when Safe Mode is active.
//   - MUST NOT call assertNoActiveLease() — it is read-only.
//   - Cache logic is INTERNAL to runVerify(). Callers pass NO cache flags.
//   - safeModeService.clear() is called ONLY when status === 'HEALTHY' (PATH 1 resolution).
//   - storage API: getItem / setItem / removeItem (StorageService interface — NOT MMKV direct).

import { db } from '../db/client';
import { eq, lt, and, isNotNull, notInArray } from 'drizzle-orm';
import {
  firms,
  financialYears,
  writerLeases,
  auditLogs,
  schemaVersion,
} from '../db/schema';
import { safeModeService } from './safeModeService';
import { useVerifyStore } from '../store/verifyStore';
import { storage } from '../utils/storage';
import { now } from '../utils/now';
import { SCHEMA_VERSION } from '../constants/appVersion';

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

    // v7.7 VERIFY-BOOT-CACHE: only applies on global scan (no firmId)
    if (!firmId) {
      try {
        const cachedStatus = await storage.getItem(CACHE_KEY_STATUS);
        const cachedAt     = await storage.getItem(CACHE_KEY_AT);

        if (cachedStatus === 'HEALTHY' && cachedAt) {
          const elapsed = Date.now() - new Date(cachedAt).getTime();
          if (elapsed < CACHE_TTL_MS) {
            console.log('[Verify] VERIFY-BOOT-CACHE: Returning cached HEALTHY result (elapsed:', Math.round(elapsed / 1000), 's)');
            useVerifyStore.getState().setScanResults([]);
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

    // Check 1: Orphan FY
    if (allFirmIds.length > 0) {
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
    } else {
      const orphanFYs = await db
        .select({ id: financialYears.id, firmId: financialYears.firmId })
        .from(financialYears);

      for (const row of orphanFYs) {
        findings.push({
          severity: 'CRITICAL',
          check: 'ORPHAN_FY',
          detail: `Financial year references non-existent firm ${row.firmId}`,
          firmId: row.firmId ?? undefined,
        });
      }
    }

    // Check 2 + 3: Missing FY / Multiple Active FY per active firm
    const activeFirmRows = await db
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isArchived, 0)); // plain integer

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

    // Check 4: Firm isolation — FY rows referencing unknown firmId
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
    if (allFirmIds.length > 0) {
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
    }

    // Check 7: Expired writer leases still in DB
    // FIX: now() replaces raw new Date().toISOString() — consistent with centralized time utility
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

    // Check 9: Counter integrity — Phase 1 no-op. Activates in Phase 2.
    // Phase 2: validate invoice/receipt counter monotonicity per firm per FY.
    // DO NOT REMOVE this comment.

    // Determine overall status
    let status: VerifyStatus = 'HEALTHY';
    if (findings.some(f => f.severity === 'CRITICAL')) status = 'CRITICAL';
    else if (findings.some(f => f.severity === 'WARNING')) status = 'WARNING';

    // PATH 1 RESOLUTION
    if (status === 'CRITICAL') {
      console.error('[Verify] Critical Integrity Failure Detected. Activating Safe Mode.');
      await safeModeService.activate('VERIFY_CRITICAL_ISSUE');
    } else if (status === 'HEALTHY') {
      await safeModeService.clear();
    }
    // WARNING: do NOT clear Safe Mode — findings still exist

    // Write cache after every full global scan
    if (!firmId) {
      try {
        await storage.setItem(CACHE_KEY_STATUS, status);
        await storage.setItem(CACHE_KEY_AT, new Date().toISOString());
      } catch (cacheWriteError) {
        console.warn('[Verify] VERIFY-BOOT-CACHE: Failed to write cache keys:', cacheWriteError);
      }
    }

    useVerifyStore.getState().setScanResults(findings);

    // v7.8 FIX-V78-5: structural firmId filtering
    const filteredFindings = firmId
      ? findings.filter(f => f.firmId === undefined || f.firmId === firmId)
      : findings;

    return { status, findings: filteredFindings };
  },

  async invalidateCache(): Promise<void> {
    try {
      await storage.removeItem(CACHE_KEY_STATUS);
      await storage.removeItem(CACHE_KEY_AT);
      console.log('[Verify] VERIFY-BOOT-CACHE: Cache invalidated.');
    } catch (e) {
      console.warn('[Verify] VERIFY-BOOT-CACHE: Cache invalidation failed (non-fatal):', e);
    }
  },
};