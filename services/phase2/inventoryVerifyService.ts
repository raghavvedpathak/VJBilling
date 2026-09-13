// services/phase2/inventoryVerifyService.ts — Phase 2 v2.34 Canonical Implementation
// Aligned with Step 5.5, FIX-CAT-ITEM-FK (v1.42), FEAT-PURITY-ROUND-1 (v1.90),
// FIX-V192-CHECK4B-1/2 (v1.92), FEAT-PHANTOM-INVENTORY-1 (v1.67/v1.68), FIX-OLDMETAL-RENAME-1 (v2.32)

import { inventoryVerifyRepository } from '@/repositories/phase2/inventoryVerifyRepository';
import { verifyService } from '@/services/phase1/verifyService';
import type { VerifyIssue } from '@/types/phase2/phase2.types';

export const inventoryVerifyService = {
  /**
   * Run strictly Phase 2 inventory ledger, weight, category, design,
   * phantom stock, and purity rounding checks for a firm.
   */
  async runInventoryChecks(firmId: string): Promise<VerifyIssue[]> {
    const issues: VerifyIssue[] = [];

    // Phase 2 Check 1: No orphaned items by design
    const orphanItemCount = await inventoryVerifyRepository.getOrphanItemDesignCount(firmId);
    if (orphanItemCount > 0) {
      issues.push({
        code: 'ORPHAN_ITEMS',
        severity: 'CRITICAL',
        message: `${orphanItemCount} item(s) reference non-existent designs`,
      });
    }

    // Phase 2 Check 2: No orphaned items by category (FIX-CAT-ITEM-FK v1.42)
    const orphanItemCategoryCount = await inventoryVerifyRepository.getOrphanItemCategoryCount(firmId);
    if (orphanItemCategoryCount > 0) {
      issues.push({
        code: 'ORPHAN_ITEM_CATEGORIES',
        severity: 'CRITICAL',
        message: `${orphanItemCategoryCount} item(s) reference non-existent categories`,
      });
    }

    // Phase 2 Check 3: Zero gross weight
    const zeroWeightItems = await inventoryVerifyRepository.findZeroGrossWeightItemIds(firmId);
    if (zeroWeightItems.length > 0) {
      issues.push({
        code: 'ITEMS_ZERO_GROSS_WEIGHT',
        severity: 'CRITICAL',
        message: `${zeroWeightItems.length} item(s) have grossWeightMg = 0`,
      });
    }

    // Phase 2 Check 4: Purity over 100%
    const purityViolations = await inventoryVerifyRepository.findPurityOver100ItemIds(firmId);
    if (purityViolations.length > 0) {
      issues.push({
        code: 'ITEMS_PURITY_OVER_100',
        severity: 'CRITICAL',
        message: `${purityViolations.length} item(s) have fineWeightMg > grossWeightMg (effective purity > 100%)`,
      });
    }

    // Phase 2 Check 4b: Purity rounding accumulation (INFO) — sums items + old_metal_lots (v1.92 / v2.26 / v2.32)
    const roundingDeltaMg = await inventoryVerifyRepository.getAccumulatedPurityRoundingDeltaMg(firmId);
    if (roundingDeltaMg > 0) {
      issues.push({
        code: 'PURITY_ROUNDING_ACCUMULATED',
        severity: 'INFO',
        message: `Accumulated purity-rounding gap across all items + old-metal lots: ${roundingDeltaMg}mg (expected, not an error — see FEAT-PURITY-ROUND-1)`,
      });
    }

    // Phase 2 Check 5: Stale active FY boundary (> 60 days)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const staleFYs = await inventoryVerifyRepository.findStaleActiveFYIds(firmId, sixtyDaysAgo);
    if (staleFYs.length > 0) {
      issues.push({
        code: 'STALE_ACTIVE_FY',
        severity: 'WARNING',
        message: `${staleFYs.length} active FY boundary is > 60 days in the past — close the financial year`,
      });
    }

    // Phase 2 Check 6: Stale phantoms (> 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const stalePhantoms = await inventoryVerifyRepository.findStalePhantomItemIds(firmId, thirtyDaysAgo);
    if (stalePhantoms.length > 0) {
      issues.push({
        code: 'STALE_PHANTOM_ITEMS',
        severity: 'WARNING',
        message: `${stalePhantoms.length} phantom item(s) have been unreconciled for > 30 days — add backdated stock and reconcile`,
      });
    }

    // Phase 2 Check 7: Open phantoms blocking FY close
    const openPhantoms = await inventoryVerifyRepository.findOpenPhantomItemIds(firmId);
    if (openPhantoms.length > 0) {
      issues.push({
        code: 'FY_CLOSE_BLOCKED_PHANTOM_ITEMS',
        severity: 'CRITICAL',
        message: `${openPhantoms.length} phantom item(s) must be reconciled before closing FY — add backdated stock entries and call reconcilePhantomItem()`,
      });
    }

    return issues;
  },

  /**
   * Universal verify entry point.
   * If includeCoreChecks is true (default), runs Phase 1 core verification first,
   * then appends Phase 2 inventory findings.
   */
  async runVerify(firmId: string, options?: { includeCoreChecks?: boolean }): Promise<VerifyIssue[]> {
    const issues: VerifyIssue[] = [];

    if (options?.includeCoreChecks !== false) {
      const p1Result = await verifyService.runVerify(firmId);
      for (const f of p1Result.findings) {
        if (f.severity === 'HEALTHY') continue;
        issues.push({
          code: f.check,
          severity: f.severity as 'CRITICAL' | 'WARNING' | 'INFO',
          message: f.detail,
        });
      }
    }

    const p2Issues = await this.runInventoryChecks(firmId);
    issues.push(...p2Issues);

    return issues;
  },
};

// Aliases for canonical backward compatibility
export const phase2VerifyService = inventoryVerifyService;
export const runVerify = inventoryVerifyService.runVerify.bind(inventoryVerifyService);
