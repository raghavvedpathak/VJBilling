// services/phase1/verifyService.ts — Phase 1 v7.47 & Phase 2–4 Canonical Implementation
// Implements G63, FIX-VSEC-2, FIX-V740-7 (rowid continuity check), FIX-V742-1 (Safe Mode clear guard), FIX-V743-3 (no duplicate Safe Mode activation)

import { db } from '@/db/client';
import { eq, lt, and, isNotNull, notInArray, sql } from 'drizzle-orm';
import {
  firms,
  financialYears,
  writerLeases,
  auditLogs,
  schemaVersion,
  appSettings,
} from '@/db/schema';
import { safeModeService } from '@/services/phase1/safeModeService';
import { safeModeStore } from '@/store/phase1/safeModeStore';
import { verifyStore } from '@/store/phase1/verifyStore';
import { clearVerifyCache, writeVerifyCache } from '@/utils/verifyCache';
import { now } from '@/utils/now';
import { SCHEMA_VERSION } from '@/constants';
import { ERR } from '@/constants/errorCodes';
import { inventoryVerifyService } from '@/services/phase2/inventoryVerifyService';
import { inventoryVerifyRepository } from '@/repositories/phase2/inventoryVerifyRepository';
import { billingVerifyService } from '@/services/phase3/billingVerifyService';
import { goldIntelligenceVerifyService } from '@/services/phase4/goldIntelligenceVerifyService';

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
  /**
   * Universal verify entry point implementing Phase 1 v7.47 G63 + Phase 2–4 checks.
   * verifyService does NOT call assertNotInSafeMode() or assertNoActiveLease() (read-only; PATH 1 Safe Mode exit).
   */
  async runVerify(firmId?: string): Promise<VerifyResult> {
    const findings: VerifyFinding[] = [];

    const allFirmRows = await db.select({ id: firms.id }).from(firms);
    const allFirmIds = allFirmRows.map((r) => r.id);
    const knownFirmIdSet = new Set(allFirmIds);

    if (allFirmIds.length === 0) {
      // Clean install with 0 firms: still clear Safe Mode if it was somehow active (FIX-V742-1)
      if (safeModeStore.getState().isActive) {
        await safeModeService.clear();
      }
      verifyStore.getState().setScanResults([]);
      if (!firmId) {
        await writeVerifyCache('HEALTHY').catch(() => {});
      }
      return { status: 'HEALTHY', findings: [] };
    }

    // =========================================================================
    // 1. GLOBAL & CROSS-TABLE CHECKS (Run always; filtered by firmId at the end per G63 / FIX-V743-3)
    // =========================================================================

    // Check 1: Orphan FY check (FIX-V740-7: guarded against empty allFirmIds)
    try {
      const orphanFYs = allFirmIds.length
        ? await db
            .select({ id: financialYears.id, firmId: financialYears.firmId })
            .from(financialYears)
            .where(notInArray(financialYears.firmId, allFirmIds))
        : [];

      for (const row of orphanFYs) {
        findings.push({
          severity: 'CRITICAL',
          check: 'ORPHAN_FY',
          detail: `Financial year references non-existent firm ${row.firmId}`,
          firmId: row.firmId ?? undefined,
        });
      }
    } catch {}

    // Check 4: Firm isolation check
    try {
      const fyFirmIds = (
        await db.select({ firmId: financialYears.firmId }).from(financialYears)
      ).map((r) => r.firmId);

      const isolationViolations = fyFirmIds.filter(
        (fid) => fid && !knownFirmIdSet.has(fid)
      );
      if (isolationViolations.length > 0) {
        findings.push({
          severity: 'CRITICAL',
          check: 'FIRM_ISOLATION_VIOLATION',
          detail: `${isolationViolations.length} record(s) reference unknown firmId — firm isolation violated.`,
        });
      }
    } catch {}

    // Check 5: Audit log continuity — rowid insertion order (FIX-V740-7)
    try {
      const auditRows = await db
        .select({ firmId: auditLogs.firmId, createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(isNotNull(auditLogs.firmId))
        .orderBy(auditLogs.firmId, sql`rowid`);

      const stats = new Map<string, { inversions: number; maxBackMs: number }>();
      let prevFirm: string | null = null;
      let prevTs = 0;

      for (const r of auditRows) {
        const ts = Date.parse(r.createdAt);
        if (r.firmId === prevFirm && ts < prevTs) {
          const s = stats.get(r.firmId!) ?? { inversions: 0, maxBackMs: 0 };
          s.inversions++;
          s.maxBackMs = Math.max(s.maxBackMs, prevTs - ts);
          stats.set(r.firmId!, s);
        }
        prevFirm = r.firmId;
        prevTs = ts;
      }

      for (const [fid, s] of stats) {
        findings.push({
          severity: 'WARNING',
          check: 'AUDIT_LOG_CONTINUITY',
          firmId: fid,
          detail: `${s.inversions} audit timestamp inversion(s); largest backward jump ${Math.round(
            s.maxBackMs / 60000
          )} min`,
        });
      }
    } catch {}

    // Check 6: Orphan audit logs (WARNING; FIX-V740-7 empty-array guard)
    try {
      const orphanAudit = allFirmIds.length
        ? await db
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(
              and(isNotNull(auditLogs.firmId), notInArray(auditLogs.firmId, allFirmIds))
            )
        : [];

      if (orphanAudit.length > 0) {
        findings.push({
          severity: 'WARNING',
          check: 'ORPHAN_AUDIT_LOGS',
          detail: `${orphanAudit.length} audit log(s) reference non-existent firms`,
        });
      }
    } catch {}

    // Check 7: Expired writer leases still in DB
    try {
      const expiredLeases = await db
        .select({ id: writerLeases.id })
        .from(writerLeases)
        .where(lt(writerLeases.expiresAt, now()));

      if (expiredLeases.length > 0) {
        findings.push({
          severity: 'WARNING',
          check: 'EXPIRED_LEASES',
          detail: `${expiredLeases.length} expired writer lease(s) still present in DB`,
        });
      }
    } catch {}

    // Check 8: Schema version mismatch (CRITICAL)
    try {
      const svRow = await db.select().from(schemaVersion).limit(1);
      if (!svRow.length || svRow[0].currentVersion !== SCHEMA_VERSION) {
        findings.push({
          severity: 'CRITICAL',
          check: 'SCHEMA_VERSION_MISMATCH',
          detail: `DB version ${svRow[0]?.currentVersion ?? 'missing'} !== app ${SCHEMA_VERSION}`,
        });
      }
    } catch {
      findings.push({
        severity: 'CRITICAL',
        check: 'SCHEMA_VERSION_MISMATCH',
        detail: 'Database schema version table missing or unreadable.',
      });
    }

    // Phase 2 Global: Duplicate HUID
    if (!firmId) {
      try {
        const dupHuids = await inventoryVerifyRepository.findGlobalDuplicateHuids();
        for (const dup of dupHuids) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.DUPLICATE_HUID || 'DUPLICATE_HUID',
            detail: `Duplicate HUID detected: '${dup.huid}' appears on ${dup.count} items across the database.`,
          });
        }
      } catch {}
    }

    // =========================================================================
    // 2. FIRM-SCOPED CHECKS (Phase 1 Check 2 + Phase 2–4)
    // =========================================================================
    const activeFirmRows = await db
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isArchived, 0));

    for (const { id: fid } of activeFirmRows) {
      // Check 2: Missing FY / Multiple active FY (FIX-V740-7: firmId set on findings)
      try {
        const activeFYs = await db
          .select({ id: financialYears.id })
          .from(financialYears)
          .where(and(eq(financialYears.firmId, fid), eq(financialYears.status, 'ACTIVE')));

        if (activeFYs.length === 0) {
          findings.push({
            severity: 'CRITICAL',
            check: 'MISSING_FY',
            firmId: fid,
            detail: `Firm ${fid} has no active financial year`,
          });
        } else if (activeFYs.length > 1) {
          findings.push({
            severity: 'CRITICAL',
            check: 'MULTIPLE_ACTIVE_FY',
            firmId: fid,
            detail: `Firm ${fid} has ${activeFYs.length} active FYs (max 1)`,
          });
        }
      } catch {}

      // Missing settings row check
      try {
        const settingsRow = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.id, 1))
          .limit(1);
        if (!settingsRow || settingsRow.length === 0) {
          findings.push({
            severity: 'WARNING',
            check: ERR.MISSING_SETTINGS || 'MISSING_SETTINGS',
            firmId: fid,
            detail: `Firm ${fid} is missing app settings row (id=1). Default configuration required.`,
          });
        }
      } catch {}

      // If firmId was passed, only run heavy Phase 2–4 checks for the requested firm
      if (firmId && fid !== firmId) continue;

      // Phase 2: Inventory Ledger & Stock Truth Checks
      try {
        const p2Issues = await inventoryVerifyService.runInventoryChecks(fid);
        for (const issue of p2Issues) {
          findings.push({
            severity:
              issue.severity === 'CRITICAL'
                ? 'CRITICAL'
                : issue.severity === 'WARNING'
                  ? 'WARNING'
                  : 'HEALTHY',
            check: issue.code,
            detail: issue.message,
            firmId: fid,
          });
        }
      } catch {}

      // Phase 3: Billing, Money Truth & Karigar Integrity Checks
      try {
        const p3Findings = await billingVerifyService.runBillingChecks(fid);
        findings.push(...p3Findings);
      } catch {}

      // Phase 4: Gold Intelligence & Metal Integrity Checks
      try {
        const p4Findings =
          await goldIntelligenceVerifyService.runGoldIntelligenceChecks(fid);
        findings.push(...p4Findings);
      } catch {}
    }

    // =========================================================================
    // 3. GLOBAL SAFE MODE RESOLUTION & FIRM FILTERING (FIX-V742-1, FIX-V743-3)
    // =========================================================================
    // Per FIX-V743-3, Safe Mode is global: any CRITICAL finding activates Safe Mode
    const globalStatus: VerifyStatus = findings.some((f) => f.severity === 'CRITICAL')
      ? 'CRITICAL'
      : findings.some((f) => f.severity === 'WARNING')
        ? 'WARNING'
        : 'HEALTHY';

    if (globalStatus === 'CRITICAL') {
      // FIX-V743-3: Guard against duplicate SAFE_MODE_ACTIVATED audit rows when already active
      if (!safeModeStore.getState().isActive) {
        await safeModeService.activate('VERIFY_CRITICAL_ISSUE');
      }
    } else if (safeModeStore.getState().isActive) {
      // PATH 1 (FIX-V742-1): Clear Safe Mode on HEALTHY or WARNING, and ONLY when Safe Mode is currently active
      await safeModeService.clear();
    }

    // Structural firmId filter (v7.8 FIX-V78-5)
    const filteredFindings = firmId
      ? findings.filter((f) => f.firmId === undefined || f.firmId === firmId)
      : findings;

    const status: VerifyStatus = filteredFindings.some((f) => f.severity === 'CRITICAL')
      ? 'CRITICAL'
      : filteredFindings.some((f) => f.severity === 'WARNING')
        ? 'WARNING'
        : 'HEALTHY';

    if (!firmId) {
      await writeVerifyCache(status).catch(() => {});
    }

    verifyStore.getState().setScanResults(filteredFindings);

    return { status, findings: filteredFindings };
  },

  async runAll(firmId?: string): Promise<VerifyResult> {
    return this.runVerify(firmId);
  },

  async invalidateCache(): Promise<void> {
    try {
      clearVerifyCache();
    } catch (e) {
      console.warn('[Verify] VERIFY-BOOT-CACHE: Cache invalidation failed (non-fatal):', e);
    }
  },
};

export const runVerify = verifyService.runVerify.bind(verifyService);
export const runAll = verifyService.runAll.bind(verifyService);
export default verifyService;