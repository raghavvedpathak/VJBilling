// types/phase4/phase4.types.ts
// Phase 4: Gold Intelligence Layer Domain Types

import {
  refineryBatches,
  refineryBatchLots,
  refineryOutputLots,
  meltBatches,
  meltBatchInputs,
  karigarIssues,
  karigarReturns,
} from '@/db/schema/phase4_gold_intelligence';

// =============================================================================
// REFINERY BATCH TYPES (Step 4 & Step 5)
// =============================================================================

export type RefineryBatchStatus = 'CREATED' | 'SENT' | 'RECEIVED' | 'SETTLED' | 'CLOSED';

export type RefineryBatch = typeof refineryBatches.$inferSelect;
export type NewRefineryBatch = typeof refineryBatches.$inferInsert;

export type RefineryBatchLot = typeof refineryBatchLots.$inferSelect;
export type NewRefineryBatchLot = typeof refineryBatchLots.$inferInsert;

export type RefineryOutputLot = typeof refineryOutputLots.$inferSelect;
export type NewRefineryOutputLot = typeof refineryOutputLots.$inferInsert;

export interface CreateRefineryBatchInput {
  supplierId: string;
  lotIds: string[];
  notes?: string;
}

export interface ReceiveRefineryInput {
  grossWeightMg: number;
  purityPercent: number;
  receivedDate?: string;
  notes?: string;
}

export interface SettlementResult {
  varianceWarning: boolean;
  variancePct: number | null;
  impliedOutputMg: number | null;
}

export interface BatchAnalytics {
  batchId: string;
  firmId: string;
  supplierId: string;
  status: RefineryBatchStatus;
  sentDate: string | null;
  receivedDate: string | null;
  totalInputFineMg: number;
  totalOutputFineMg: number;
  gainLossMg: number | null;
  yieldPct: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefineryGainLossReport {
  batches: BatchAnalytics[];
  totalBatches: number;
  totalInputFineMg: number;
  totalOutputFineMg: number;
  netGainLossMg: number;
  overallYieldPct: number | null;
}

// =============================================================================
// MELT BATCH TYPES (Step 6)
// =============================================================================

export type MeltBatchStatus = 'CREATED' | 'CLOSED';

export type MeltBatch = typeof meltBatches.$inferSelect;
export type NewMeltBatch = typeof meltBatches.$inferInsert;

export type MeltBatchInput = typeof meltBatchInputs.$inferSelect;
export type NewMeltBatchInput = typeof meltBatchInputs.$inferInsert;

export interface CreateMeltBatchInput {
  lotIds: string[];
}

export interface CloseMeltBatchInput {
  batchId: string;
  outputGrossWeightMg: number;
  outputPurityPct: number;
}

// =============================================================================
// KARIGAR FLOW TYPES (Step 7)
// =============================================================================

export type KarigarIssueStatus = 'ISSUED' | 'PARTIAL_RETURN' | 'CLOSED' | 'REVERSED';

export type KarigarIssue = typeof karigarIssues.$inferSelect;
export type NewKarigarIssue = typeof karigarIssues.$inferInsert;

export type KarigarReturn = typeof karigarReturns.$inferSelect;
export type NewKarigarReturn = typeof karigarReturns.$inferInsert;

export interface IssueGoldInput {
  karigarId: string;
  sourceLotId: string;
  issuedGrossWeightMg: number;
  issuedPurityPct: number;
  issueDate?: string;
  notes?: string;
}

export type IssueGoldToKarigarInput = IssueGoldInput;

export interface ReturnInput {
  grossWeightMg: number;
  purityPct: number;
  returnDate?: string;
  notes?: string;
  actualWastageMg?: number;
  allowedWastageMg?: number;
}

export type ReturnGoldFromKarigarInput = ReturnInput & { issueId?: string };

export interface KarigarReturnResult {
  wasteExceeded: boolean;
  excessMg: number;
  issue?: KarigarIssue;
  returnRecord?: KarigarReturn;
}

export interface KarigarBalance {
  issued: number;       // fine mg of METAL_OUT
  returned: number;     // fine mg of METAL_IN
  labourGold: number;   // fine mg of LABOUR_IN_GOLD
  outstanding: number;  // outstanding = METAL_OUT − METAL_IN − LABOUR_IN_GOLD
}

// =============================================================================
// METAL BALANCE & LOCATION TYPES (Step 8)
// =============================================================================

export interface FineBalanceBreakdown {
  openingFineBalanceMg: number;
  purchaseFineMg: number;
  refineryOutputFineMg: number;
  meltOutputFineMg: number;
  karigarReturnFineMg: number;
  saleFineMg: number;
  karigarIssueFineMg: number;
  karigarIssueReversalFineMg: number;
  refineryInputFineMg: number;
  meltInputFineMg: number;
  karigarLabourGoldFineMg: number;
  currentFineBalanceMg: number;
}

export interface MetalLocationBucket {
  grossWeightMg: number;
  fineWeightMg: number;
  lotCount: number;
}

export interface KarigarMetalLocationBucket {
  fineWeightMg: number;
  karigarCount: number;
  perKarigar: Array<{
    karigarId: string;
    karigarName: string;
    fineWeightMg: number;
  }>;
}

export interface MetalLocationSummary {
  inHand: MetalLocationBucket;
  atRefinery: MetalLocationBucket;
  withKarigar: KarigarMetalLocationBucket;
  consumedMelt: MetalLocationBucket;
  settledRefinery: MetalLocationBucket;
  totalFineWeightMg: number;
}

// =============================================================================
// FY CLOSE HOOK TYPES (Step 11A — GAP-FY-HOOK-TYPE v1.8)
// =============================================================================

export interface FYCloseHookResult {
  karigarOutstandingFineMg?: number; // set by Phase 4 hook
  refineryOutstandingFineMg?: number; // set by Phase 4 hook
}

export type FYCloseHook = (
  tx: any,
  firmId: string,
  fyId: string
) => Promise<FYCloseHookResult | void> | FYCloseHookResult | void;

// =============================================================================
// PHASE 4 AUDIT PAYLOAD DISCRIMINATED UNION (FIX-P4-AUDITPAYLOAD-1 v1.15)
// Owned entirely within Phase 4 code — not merged into Phase 1's AuditPayload.
// =============================================================================

export type Phase4AuditPayload =
  | {
      eventType: 'KARIGAR_GOLD_ISSUED';
      payload: {
        issueId: string;
        karigarId: string;
        sourceLotId: string;
        issuedGrossWeightMg: number;
        issuedPurityPct: number;
        issuedFineWeightMg: number;
        issueDate: string;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'KARIGAR_RETURN_RECORDED';
      payload: {
        returnId?: string;
        issueId?: string;
        grossWeightMg?: number;
        purityPct?: number;
        fineWeightMg?: number;
        returnDate?: string;
        wasteExceeded?: boolean;
        excessMg?: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'KARIGAR_LABOUR_GOLD_RECORDED';
      payload: {
        issueId?: string;
        karigarId?: string;
        labourGoldFineMg?: number;
        purityPct?: number;
        notes?: string | null;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'KARIGAR_ISSUE_REVERSED';
      payload: {
        issueId?: string;
        karigarId?: string;
        sourceLotId?: string;
        reversedFineMg?: number;
        reason?: string;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'KARIGAR_WASTAGE_EXCEEDED';
      payload: {
        issueId?: string;
        karigarId?: string;
        allowedWastageMg?: number;
        actualWastageMg?: number;
        excessMg?: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'OLD_METAL_LOT_STATUS_CHANGED';
      payload: {
        lotId: string;
        oldStatus: string;
        newStatus: string;
        reason?: string | null;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_BATCH_CREATED';
      payload: {
        batchId: string;
        supplierId: string;
        lotIds: string[];
        totalInputFineMg?: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_BATCH_SENT';
      payload: {
        batchId: string;
        sentDate: string;
        totalInputFineMg: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_OUTPUT_RECEIVED';
      payload: {
        batchId: string;
        receivedDate: string;
        grossWeightMg: number;
        purityPercent: number;
        totalOutputFineMg: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_LOT_SETTLED';
      payload: {
        batchId: string;
        lotId: string;
        outputFineMg: number;
        shareRatio: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_BATCH_CLOSED';
      payload: {
        batchId: string;
        totalInputFineMg: number;
        totalOutputFineMg: number;
        gainLossMg: number;
        yieldPct: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'REFINERY_SETTLEMENT_VARIANCE';
      payload: {
        batchId: string;
        variancePct: number;
        impliedOutputMg: number;
        actualOutputFineMg: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'MELT_BATCH_CREATED';
      payload: {
        batchId: string;
        lotIds: string[];
        totalInputFineMg?: number;
        [key: string]: unknown;
      };
    }
  | {
      eventType: 'MELT_BATCH_CLOSED';
      payload: {
        batchId: string;
        outputGrossWeightMg: number;
        outputPurityPct: number;
        outputFineWeightMg: number;
        outputLotId: string;
        totalInputFineMg?: number;
        [key: string]: unknown;
      };
    };


