// services/phase4/bootstrapPhase4.ts
// Phase 4 FY Close Hook Registration (GAP-FY-HOOK-TYPE v1.8)
//
// HOOK REGISTRATION ORDER IN bootstrapDatabase() IS MANDATORY:
// 1. Phase 4 registers karigar + refinery balance hook (reads from karigar_ledger, refinery_batches)
// 2. FY_CLOSE_FINE_BALANCE audit event written using accumulated hook results
// 3. Phase 7 WAC snapshot hook registered LAST (reads FY_CLOSE_FINE_BALANCE payload)
// NEVER reorder. Phase 4 hook MUST execute before Phase 7 WAC hook.

import { registerFYCloseHook, type FYCloseHookResult } from '@/services/phase1/fyService';
import { karigarFlowService } from './karigarFlowService';
import { refineryBatchService } from './refineryBatchService';

let phase4HookRegistered = false;

/**
 * Registers Phase 4 FY Close hook with the FY service.
 * Returns accumulated karigar and refinery outstanding fine balances.
 */
export function registerPhase4FYCloseHook(force: boolean = false): void {
  if (phase4HookRegistered && !force) {
    return;
  }

  registerFYCloseHook(async (tx, firmId, fyId): Promise<FYCloseHookResult> => {
    const k = await karigarFlowService.getTotalOutstandingFineMg(tx, firmId);
    const r = await refineryBatchService.getTotalOutstandingFineMg(tx, firmId);
    return { karigarOutstandingFineMg: k, refineryOutstandingFineMg: r };
  });

  phase4HookRegistered = true;
}

export function resetPhase4FYCloseHookRegistration(): void {
  phase4HookRegistered = false;
}
