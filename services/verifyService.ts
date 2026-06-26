// services/verifyService.ts
// v6.0 G63 — Canonical Implementation
// v6.7 FIX-V67-4 — firmId param (optional) for firm-scoped filtering
// v7.7 VERIFY-BOOT-CACHE — 30-minute MMKV cache eliminates 9-query boot scan
// v7.8 FIX-V78-5 — VerifyFinding.firmId?: string structural field (replaces string-matching)
// v7.9 FIX-CLEAN-INSTALL-HANG — Skip safeModeService.clear() on clean install (no firms).
//   On Expo Go (AsyncStorage fallback), db.transaction() in clear() hangs when called
//   immediately after bootstrap on a fresh DB with no audit log rows written yet.
//   Safe to skip: if no firms exist, Safe Mode cannot be active from a prior session.
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
        const bootInterrupted = await storage.getItem('vjbilling_boot_was_interrupted');

        if (cachedStatus === 'HEALTHY' && cachedAt && bootInterrupted === 'false') {
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

    console.log('[Verify] Check 1: Fetching all firms...');
    const allFirmRows = await db.select({ id: firms.id }).from(firms);
    console.log('[Verify] Check 1: Got', allFirmRows.length, 'firms');
    const allFirmIds  = allFirmRows.map(r => r.id);
    const knownFirmIdSet = new Set(allFirmIds);

    // ✅ FIX-CLEAN-INSTALL-HANG: On clean install with no firms, skip all checks
    // and return HEALTHY immediately. Safe Mode cannot be active with no firms.
    // This avoids safeModeService.clear() db.transaction() hang on first boot.
    if (allFirmIds.length === 0) {
      console.log('[Verify] Clean install detected — no firms. Skipping all checks, returning HEALTHY.');
      useVerifyStore.getState().setScanResults([]);

      if (!firmId) {
        try {
          await storage.setItem(CACHE_KEY_STATUS, 'HEALTHY');
          await storage.setItem(CACHE_KEY_AT, new Date().toISOString());
        } catch (cacheWriteError) {
          console.warn('[Verify] VERIFY-BOOT-CACHE: Failed to write cache keys:', cacheWriteError);
        }
      }

      return { status: 'HEALTHY', findings: [] };
    }

    // Check 1: Orphan FY
    console.log('[Verify] Check 1b: Orphan FY check...');
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
    console.log('[Verify] Check 1b done:', orphanFYs.length, 'orphans');

    // Check 2 + 3: Missing FY / Multiple Active FY per active firm
    console.log('[Verify] Check 2+3: Active firm FY check...');
    const activeFirmRows = await db
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isArchived, 0));

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
    console.log('[Verify] Check 2+3 done');

    // Check 4: Firm isolation — FY rows referencing unknown firmId
    console.log('[Verify] Check 4: Firm isolation...');
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
    console.log('[Verify] Check 4 done');

    // Check 5: Audit log timestamp continuity
    console.log('[Verify] Check 5: Audit log continuity...');
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
    console.log('[Verify] Check 5 done');

    // Check 6: Orphan audit logs
    console.log('[Verify] Check 6: Orphan audit logs...');
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
    console.log('[Verify] Check 6 done');

    // Check 7: Expired writer leases still in DB
    console.log('[Verify] Check 7: Expired leases...');
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
    console.log('[Verify] Check 7 done');

    // Check 8: Schema version mismatch
    console.log('[Verify] Check 8: Schema version...');
    try {
      const svRow = await db.select().from(schemaVersion).limit(1);
      console.log('[Verify] Check 8: svRow=', JSON.stringify(svRow), 'SCHEMA_VERSION=', SCHEMA_VERSION);
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
    console.log('[Verify] Check 8 done');

    // Check 9: Counter integrity — Phase 1 no-op. Activates in Phase 2.
    // Phase 2: validate invoice/receipt counter monotonicity per firm per FY.
    // DO NOT REMOVE this comment.

    // Determine overall status
    let status: VerifyStatus = 'HEALTHY';
    if (findings.some(f => f.severity === 'CRITICAL')) status = 'CRITICAL';
    else if (findings.some(f => f.severity === 'WARNING')) status = 'WARNING';

    console.log('[Verify] Overall status:', status);

    // PATH 1 RESOLUTION
    if (status === 'CRITICAL') {
      console.error('[Verify] Critical Integrity Failure Detected. Activating Safe Mode.');
      await safeModeService.activate('VERIFY_CRITICAL_ISSUE' as any);
    } else if (status === 'HEALTHY') {
      // ✅ FIX-CLEAN-INSTALL-HANG: Only call clear() when firms exist.
      // We already returned early above for the no-firms case.
      console.log('[Verify] Clearing Safe Mode (HEALTHY)...');
      await safeModeService.clear();
      console.log('[Verify] Safe Mode cleared.');
    }

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
// --- APPENDED PHASE 2 INVENTORY VERIFY ---
import { items, designs, categories } from '../db/schema';
import { inArray, isNull, gt } from 'drizzle-orm';
import type { VerifyIssue } from '../types/phase2.types';

export const phase2VerifyService = {
  async runVerify(firmId: string): Promise<VerifyIssue[]> {
    const issues: VerifyIssue[] = [];
    const p1Result = await verifyService.runVerify(firmId);
    
    for (const f of p1Result.findings) {
      if (f.severity === 'HEALTHY') continue;
      issues.push({ code: f.check, severity: f.severity as 'CRITICAL' | 'WARNING', message: f.detail });
    }
    
    const allDesignIds = new Set((await db.select({ id: designs.id }).from(designs).where(eq(designs.firmId, firmId))).map(r => r.id));
    const itemDesignIds = (await db.select({ designId: items.designId }).from(items).where(eq(items.firmId, firmId))).map(r => r.designId);
    const orphanItemCount = itemDesignIds.filter(id => !allDesignIds.has(id)).length;
    if (orphanItemCount > 0) issues.push({ code: 'ORPHAN_ITEMS', severity: 'CRITICAL', message: `${orphanItemCount} item(s) reference non-existent designs` });

    const allCategoryIds = new Set((await db.select({ id: categories.id }).from(categories).where(eq(categories.firmId, firmId))).map(r => r.id));
    const itemCategoryIds = (await db.select({ categoryId: items.categoryId }).from(items).where(eq(items.firmId, firmId))).map(r => r.categoryId);
    const orphanItemCategoryCount = itemCategoryIds.filter(id => id && !allCategoryIds.has(id)).length;
    if (orphanItemCategoryCount > 0) issues.push({ code: 'ORPHAN_ITEM_CATEGORIES', severity: 'CRITICAL', message: `${orphanItemCategoryCount} item(s) reference non-existent categories` });

    const zeroWeightItems = await db.select({ id: items.id }).from(items).where(and(eq(items.firmId, firmId), eq(items.grossWeightMg, 0)));
    if (zeroWeightItems.length > 0) issues.push({ code: 'ITEMS_ZERO_GROSS_WEIGHT', severity: 'CRITICAL', message: `${zeroWeightItems.length} item(s) have grossWeightMg = 0` });

    const purityViolations = await db.select({ id: items.id }).from(items).where(and(eq(items.firmId, firmId), gt(items.fineWeightMg, items.grossWeightMg)));
    if (purityViolations.length > 0) issues.push({ code: 'ITEMS_PURITY_OVER_100', severity: 'CRITICAL', message: `${purityViolations.length} item(s) have fineWeightMg > grossWeightMg (effective purity > 100%)` });

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const staleFYs = await db.select({ id: financialYears.id }).from(financialYears)
      .where(and(eq(financialYears.firmId, firmId), eq(financialYears.status, 'ACTIVE'), lt(financialYears.endDate, sixtyDaysAgo)));
    if (staleFYs.length > 0) issues.push({ code: 'STALE_ACTIVE_FY', severity: 'WARNING', message: `${staleFYs.length} active FY boundary is > 60 days in the past — close the financial year` });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const stalePhantoms = await db.select({ id: items.id }).from(items).where(and(eq(items.firmId, firmId), inArray(items.status, ['PHANTOM_AVAILABLE','PHANTOM_SOLD']), isNull(items.phantomStockId), lt(items.createdAt, thirtyDaysAgo)));
    if (stalePhantoms.length > 0) issues.push({ code: 'STALE_PHANTOM_ITEMS', severity: 'WARNING', message: `${stalePhantoms.length} phantom item(s) have been unreconciled for > 30 days — add backdated stock and reconcile` });

    const openPhantoms = await db.select({ id: items.id }).from(items).where(and(eq(items.firmId, firmId), inArray(items.status, ['PHANTOM_AVAILABLE','PHANTOM_SOLD']), isNull(items.phantomStockId)));
    if (openPhantoms.length > 0) issues.push({ code: 'FY_CLOSE_BLOCKED_PHANTOM_ITEMS', severity: 'CRITICAL', message: `${openPhantoms.length} phantom item(s) must be reconciled before closing FY — add backdated stock entries and call reconcilePhantomItem()` });

    return issues;
  }
};
