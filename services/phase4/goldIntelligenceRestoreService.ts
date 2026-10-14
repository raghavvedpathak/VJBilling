// services/phase4/goldIntelligenceRestoreService.ts — Phase 4 STEP 21: Gold Intelligence Restore Extension Service
// Handles atomic deletion and restoration of Phase 4 Gold Intelligence tables in strict dependency order.
// RESTORE — Delete order (reverse FK, Phase 4 tables):
// karigar_returns → karigar_issues → melt_batch_inputs → melt_batches → refinery_output_lots → refinery_batch_lots → refinery_batches
// RESTORE — Insert order (FK-safe, Phase 4 tables):
// refinery_batches → refinery_batch_lots → refinery_output_lots → melt_batches → melt_batch_inputs → karigar_issues → karigar_returns
// Automatically registers as an extension handler with Phase 1 backupService/restoreService.

import {
  refineryBatches,
  refineryBatchLots,
  refineryOutputLots,
  meltBatches,
  meltBatchInputs,
  karigarIssues,
  karigarReturns,
} from '@/db/schema/phase4_gold_intelligence';
import { registerRestoreHandler } from '@/services/phase1/backupService';
import db, { db as dbNamed } from '@/db/client';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

/**
 * Returns Phase 4 schema version restore warning per STEP 21 specification.
 */
export function getPhase4RestoreWarning(schemaVersion: number): string | null {
  if (schemaVersion === 5) {
    return (
      'This backup was created before Gold Intelligence features were available.\n' +
      'Refinery batches, melt batches, and karigar issue history will NOT be in this backup.\n' +
      'All current Phase 4 data will be permanently lost on restore.'
    );
  }
  if (schemaVersion < 5) {
    return (
      `This backup was created before Gold Intelligence features were available (schema v${schemaVersion} < 5).\n` +
      'Earlier phase warning escalation applies; refinery batches, melt batches, and karigar issue history will NOT be in this backup.\n' +
      'All current Phase 4 data will be permanently lost on restore.'
    );
  }
  return null;
}

/**
 * Clears all Phase 4 Gold Intelligence tables in reverse dependency order (reverse FK):
 * karigar_returns → karigar_issues → melt_batch_inputs → melt_batches → refinery_output_lots → refinery_batch_lots → refinery_batches
 */
export function clearGoldIntelligenceData(tx: DbOrTx): void {
  const targetTx = getDb(tx);

  try {
    // 1. karigar_returns (FK -> karigar_issues)
    targetTx.delete(karigarReturns).run();
  } catch {}

  try {
    // 2. karigar_issues (FK -> old_metal_lots, karigar, firms)
    targetTx.delete(karigarIssues).run();
  } catch {}

  try {
    // 3. melt_batch_inputs (FK -> melt_batches, old_metal_lots)
    targetTx.delete(meltBatchInputs).run();
  } catch {}

  try {
    // 4. melt_batches (FK -> firms, old_metal_lots)
    targetTx.delete(meltBatches).run();
  } catch {}

  try {
    // 5. refinery_output_lots (FK -> refinery_batches)
    targetTx.delete(refineryOutputLots).run();
  } catch {}

  try {
    // 6. refinery_batch_lots (FK -> refinery_batches, old_metal_lots)
    targetTx.delete(refineryBatchLots).run();
  } catch {}

  try {
    // 7. refinery_batches (FK -> firms, suppliers)
    targetTx.delete(refineryBatches).run();
  } catch {}
}

/**
 * Inserts all Phase 4 Gold Intelligence tables in dependency order (FK-safe):
 * refinery_batches → refinery_batch_lots → refinery_output_lots → melt_batches → melt_batch_inputs → karigar_issues → karigar_returns
 */
export function restoreGoldIntelligenceData(tx: DbOrTx, payload: Record<string, any>): void {
  const targetTx = getDb(tx);
  const tables = payload.tables || {};

  // 1. refinery_batches
  const refBatches = tables.refinery_batches || payload.refinery_batches || payload.refineryBatches;
  if (refBatches?.length) {
    try {
      targetTx.insert(refineryBatches).values(refBatches).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore refinery_batches:', e);
    }
  }

  // 2. refinery_batch_lots
  const refBatchLots = tables.refinery_batch_lots || payload.refinery_batch_lots || payload.refineryBatchLots;
  if (refBatchLots?.length) {
    try {
      targetTx.insert(refineryBatchLots).values(refBatchLots).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore refinery_batch_lots:', e);
    }
  }

  // 3. refinery_output_lots
  const refOutputLots = tables.refinery_output_lots || payload.refinery_output_lots || payload.refineryOutputLots;
  if (refOutputLots?.length) {
    try {
      targetTx.insert(refineryOutputLots).values(refOutputLots).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore refinery_output_lots:', e);
    }
  }

  // 4. melt_batches
  const meltBatchRows = tables.melt_batches || payload.melt_batches || payload.meltBatches;
  if (meltBatchRows?.length) {
    try {
      targetTx.insert(meltBatches).values(meltBatchRows).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore melt_batches:', e);
    }
  }

  // 5. melt_batch_inputs
  const meltInputs = tables.melt_batch_inputs || payload.melt_batch_inputs || payload.meltBatchInputs;
  if (meltInputs?.length) {
    try {
      targetTx.insert(meltBatchInputs).values(meltInputs).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore melt_batch_inputs:', e);
    }
  }

  // 6. karigar_issues
  const karIssues = tables.karigar_issues || payload.karigar_issues || payload.karigarIssues;
  if (karIssues?.length) {
    try {
      targetTx.insert(karigarIssues).values(karIssues).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore karigar_issues:', e);
    }
  }

  // 7. karigar_returns
  const karReturns = tables.karigar_returns || payload.karigar_returns || payload.karigarReturns;
  if (karReturns?.length) {
    try {
      targetTx.insert(karigarReturns).values(karReturns).run();
    } catch (e) {
      console.warn('[Restore] Failed to restore karigar_returns:', e);
    }
  }
}

// Automatically register Phase 4 Gold Intelligence extension with Phase 1 restoreService
registerRestoreHandler('phase4_gold_intelligence', {
  clear: clearGoldIntelligenceData,
  restore: restoreGoldIntelligenceData,
});

export const goldIntelligenceRestoreService = {
  clearGoldIntelligenceData,
  restoreGoldIntelligenceData,
  getPhase4RestoreWarning,
};

export default goldIntelligenceRestoreService;
