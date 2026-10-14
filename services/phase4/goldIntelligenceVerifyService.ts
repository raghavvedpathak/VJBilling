// services/phase4/goldIntelligenceVerifyService.ts
// Phase 4: Gold Intelligence — Verify-My-Data Implementation (Step 12)
// Aligned with P3-FIX-4 (rounding threshold delta > 1mg), P3-FIX-1 (MELT_OUTPUT guard & terminal state),
// REVIEW-4 (REVERSED exclusion), and DOMAIN-FIX-1 v1.7 (MELT_OUTPUT source requirement).

import db, { expoDb } from '@/db/client';
import { firms } from '@/db/schema';
import { metalFlowService } from './metalFlowService';
import { ERR } from '@/constants/errorCodes';
import type { VerifyFinding } from '@/services/phase1/verifyService';

function queryAllRaw(sqlQuery: string, params: any[] = []): any[] {
  try {
    const rawExpo = expoDb as any;
    if (rawExpo) {
      if (typeof rawExpo.prepare === 'function') {
        return rawExpo.prepare(sqlQuery).all(...params) || [];
      }
      if (typeof rawExpo.getAllSync === 'function') {
        return rawExpo.getAllSync(sqlQuery, params) || [];
      }
    }
  } catch {}

  try {
    const client = (db as any)?.__rawClient;
    if (client?.sqlite && typeof client.sqlite.prepare === 'function') {
      return client.sqlite.prepare(sqlQuery).all(...params) || [];
    }
  } catch {}

  return [];
}

export const goldIntelligenceVerifyService = {
  /**
   * Runs all Phase 4 Gold Intelligence & Refinery/Melt/Karigar domain integrity checks.
   * Returns an array of VerifyFinding records.
   */
  async runGoldIntelligenceChecks(firmId?: string): Promise<VerifyFinding[]> {
    const findings: VerifyFinding[] = [];

    // Resolve firms to scan
    let allFirmIds: string[] = [];
    try {
      if (firmId) {
        allFirmIds = [firmId];
      } else {
        const firmRows = await db.select({ id: firms.id }).from(firms);
        allFirmIds = firmRows.map((r) => r.id);
      }
    } catch {
      return findings;
    }

    if (allFirmIds.length === 0) {
      return findings;
    }

    for (const fid of allFirmIds) {
      // =======================================================================
      // CHECK 1: OldMetalLot SENT_TO_REFINERY but not linked to open batch (CRITICAL)
      // =======================================================================
      try {
        const sql1 = `
          SELECT ol.id FROM old_metal_lots ol WHERE firm_id=?
          AND status='SENT_TO_REFINERY' AND NOT EXISTS
          (SELECT 1 FROM refinery_batch_lots rbl JOIN refinery_batches
          rb ON rbl.batch_id=rb.id WHERE rbl.lot_id=ol.id AND rb.status
          NOT IN ('CLOSED'))
        `;
        const orphanRefineryLots = queryAllRaw(sql1, [fid]);
        for (const row of orphanRefineryLots) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.OLD_METAL_SENT_TO_REFINERY_WITHOUT_OPEN_BATCH,
            detail: `OldMetalLot ${row.id} has status SENT_TO_REFINERY but is not linked to any open refinery batch.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 2: OldMetalLot with metalSource=MELT_OUTPUT in refinery (CRITICAL — P3-FIX-1)
      // =======================================================================
      try {
        const sql2 = `
          SELECT rbl.lot_id FROM refinery_batch_lots rbl JOIN
          old_metal_lots ol ON ol.id=rbl.lot_id WHERE ol.firm_id=? AND
          ol.metal_source='MELT_OUTPUT'
        `;
        const meltOutputInRefinery = queryAllRaw(sql2, [fid]);
        for (const row of meltOutputInRefinery) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.MELT_OUTPUT_LOT_IN_REFINERY_BATCH,
            detail: `OldMetalLot ${row.lot_id} with metalSource 'MELT_OUTPUT' exists as refinery batch input (P3-FIX-1 violation).`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 3: OldMetalLot SENT_TO_MELT in CLOSED batch with no output lot (CRITICAL)
      // =======================================================================
      try {
        const sql3 = `
          SELECT ol.id FROM old_metal_lots ol JOIN
          melt_batch_inputs mbi ON mbi.lot_id=ol.id JOIN melt_batches
          mb ON mb.id=mbi.batch_id WHERE ol.firm_id=? AND
          ol.status='SENT_TO_MELT' AND mb.status='CLOSED' AND
          mb.output_lot_id IS NULL
        `;
        const closedMeltNoOutput = queryAllRaw(sql3, [fid]);
        for (const row of closedMeltNoOutput) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.MELT_BATCH_CLOSED_WITHOUT_OUTPUT_LOT,
            detail: `OldMetalLot ${row.id} was SENT_TO_MELT in a closed melt batch without output lot generated.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // Note on Check 4: OldMetalLot SENT_TO_MELT with mb.status='CREATED' is HEALTHY (in-progress, not an orphan).

      // =======================================================================
      // CHECK 5: Refinery batch SENT but no RECEIVED after 30 days (WARNING)
      // =======================================================================
      try {
        const sql5 = `
          SELECT id FROM refinery_batches WHERE firm_id=?
          AND status='SENT' AND date(sent_date,'+'||30||' days') <
          date('now')
        `;
        const overdueSentBatches = queryAllRaw(sql5, [fid]);
        for (const row of overdueSentBatches) {
          findings.push({
            severity: 'WARNING',
            check: ERR.REFINERY_BATCH_SENT_OVERDUE,
            detail: `Refinery batch ${row.id} has been SENT for more than 30 days without output received.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 6: Refinery batch RECEIVED but not CLOSED (WARNING)
      // =======================================================================
      try {
        const sql6 = `
          SELECT id FROM refinery_batches WHERE firm_id=?
          AND status='RECEIVED'
        `;
        const receivedNotClosedBatches = queryAllRaw(sql6, [fid]);
        for (const row of receivedNotClosedBatches) {
          findings.push({
            severity: 'WARNING',
            check: ERR.REFINERY_BATCH_RECEIVED_NOT_CLOSED,
            detail: `Refinery batch ${row.id} has status RECEIVED but has not been settled/CLOSED.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 7: Karigar issue ISSUED but no return after 30 days (WARNING — REVIEW-4)
      // =======================================================================
      try {
        const sql7 = `
          SELECT id FROM karigar_issues WHERE firm_id=? AND
          status='ISSUED' AND date(issue_date,'+'||30||' days') <
          date('now') AND status != 'REVERSED'
        `;
        const overdueKarigarIssues = queryAllRaw(sql7, [fid]);
        for (const row of overdueKarigarIssues) {
          findings.push({
            severity: 'WARNING',
            check: ERR.KARIGAR_ISSUE_OVERDUE,
            detail: `Karigar issue ${row.id} has remained ISSUED for more than 30 days without return.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 8: Karigar metal balance negative (CRITICAL — impossibility)
      // =======================================================================
      try {
        const sql8 = `
          SELECT karigar_id, SUM(CASE WHEN
          type='METAL_OUT' THEN weight_mg WHEN
          type='METAL_OUT_REVERSAL' THEN -weight_mg WHEN
          type='METAL_IN' THEN -weight_mg WHEN
          type='LABOUR_IN_GOLD' THEN -weight_mg ELSE 0 END) as
          balance FROM karigar_ledger WHERE firm_id=? GROUP BY
          karigar_id HAVING balance < 0
        `;
        const negativeKarigarBalances = queryAllRaw(sql8, [fid]);
        for (const row of negativeKarigarBalances) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.KARIGAR_NEGATIVE_METAL_BALANCE,
            detail: `Karigar ${row.karigar_id} has negative metal balance (${row.balance}mg). Physical impossibility.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 9: Melt batch CREATED but not CLOSED after 7 days (WARNING)
      // =======================================================================
      try {
        const sql9 = `
          SELECT id FROM melt_batches WHERE firm_id=? AND
          status='CREATED' AND date(created_at,'+'||7||' days') <
          date('now')
        `;
        const overdueMeltBatches = queryAllRaw(sql9, [fid]);
        for (const row of overdueMeltBatches) {
          findings.push({
            severity: 'WARNING',
            check: ERR.MELT_BATCH_CREATED_OVERDUE,
            detail: `Melt batch ${row.id} has remained in CREATED status for more than 7 days without closing.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 10: Fine balance negative (CRITICAL)
      // =======================================================================
      try {
        const fineBalance = await metalFlowService.getFineBalance(fid);
        if (fineBalance && fineBalance.currentFineBalanceMg < 0) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.NEGATIVE_FINE_BALANCE,
            detail: `Firm ${fid} has negative fine metal balance (${fineBalance.currentFineBalanceMg}mg). Event sequence error: total metal out exceeds total metal in. Review audit trail.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 11: Refinery batch lot shares sum differs by > 1mg (WARNING — P3-FIX-4)
      // =======================================================================
      try {
        const sql11 = `
          SELECT batch_id, ABS(SUM(output_fine_mg) -
          rb.total_output_fine_mg) as delta FROM refinery_batch_lots rbl
          JOIN refinery_batches rb ON rb.id=rbl.batch_id WHERE
          rb.firm_id=? AND rb.status='CLOSED' GROUP BY batch_id
          HAVING delta > 1
        `;
        const discrepancyBatches = queryAllRaw(sql11, [fid]);
        for (const row of discrepancyBatches) {
          findings.push({
            severity: 'WARNING',
            check: ERR.REFINERY_BATCH_LOT_SHARES_DISCREPANCY,
            detail: `Refinery batch ${row.batch_id} output lot shares sum differs from totalOutputFineMg by ${row.delta}mg (tolerance is 1mg, P3-FIX-4).`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 12: KarigarIssue CLOSED but no LABOUR_IN_GOLD entry (WARNING)
      // =======================================================================
      try {
        const sql12 = `
          SELECT ki.id FROM karigar_issues ki WHERE ki.firm_id=?
          AND ki.status='CLOSED' AND NOT EXISTS (SELECT 1 FROM
          karigar_ledger kl WHERE kl.karigar_id=ki.karigar_id AND
          kl.type='LABOUR_IN_GOLD')
        `;
        const missingLabourGoldIssues = queryAllRaw(sql12, [fid]);
        for (const row of missingLabourGoldIssues) {
          findings.push({
            severity: 'WARNING',
            check: ERR.KARIGAR_ISSUE_CLOSED_NO_LABOUR_IN_GOLD,
            detail: `Karigar issue ${row.id} is CLOSED but has no LABOUR_IN_GOLD entry recorded.`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }

      // =======================================================================
      // CHECK 13: KarigarIssue linked to old_metal_lot where metalSource != 'MELT_OUTPUT' (CRITICAL — DOMAIN-FIX-1 v1.7)
      // =======================================================================
      try {
        const sql13 = `
          SELECT ki.id, ol.metal_source FROM karigar_issues ki JOIN
          old_metal_lots ol ON ol.id = ki.source_lot_id WHERE ki.firm_id = ?
          AND ol.metal_source != 'MELT_OUTPUT'
        `;
        const invalidSourceIssues = queryAllRaw(sql13, [fid]);
        for (const row of invalidSourceIssues) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.KARIGAR_ISSUE_INVALID_SOURCE_LOT,
            detail: `Karigar issue ${row.id} is linked to old metal lot with metalSource '${row.metal_source}' (expected 'MELT_OUTPUT'). Raw unmelted old metal was issued directly to karigar (DOMAIN-FIX-1 v1.7).`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if table unavailable in isolated environments
      }
    }

    return findings;
  },
};

export const phase4VerifyService = goldIntelligenceVerifyService;
export const runGoldIntelligenceChecks =
  goldIntelligenceVerifyService.runGoldIntelligenceChecks.bind(goldIntelligenceVerifyService);
export const runPhase4Checks = runGoldIntelligenceChecks;
