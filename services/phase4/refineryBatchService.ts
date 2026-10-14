// services/phase4/refineryBatchService.ts
// Phase 4: Gold Intelligence — Refinery Batch Service
// Implements 4-Stage Lifecycle: CREATE → SEND → RECEIVE → SETTLE/CLOSE
// Complies with:
// - P3-FIX-1 (Terminal state & positive candidate validation)
// - NET-WEIGHT-FIX-2 (netWeightMg = grossWeight - stones - beads)
// - DECIMAL-FIX & SHARE-RATIO-FIX (Decimal.ROUND_HALF_UP, 8 decimals for shareRatio)
// - FIX-EMPTY-BATCH v1.8 (guard on send)
// - GAP-REFINERY-TOTALOUTPUT v1.8 (output fine calculation & 110% yield guard)
// - SETTLEMENT-VARIANCE v1.9 (20% advisory check)
// - FIX-CLOSEBATCH v1.8 (all lots must be settled before closing)
// - G41 Live Transaction Audit Rule

import Decimal from 'decimal.js';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { refineryBatchRepository } from '@/repositories/phase4/refineryBatchRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import type { DrizzleTransaction, OldMetalLot } from '@/types/phase2/phase2.types';
import type {
  RefineryBatch,
  CreateRefineryBatchInput,
  ReceiveRefineryInput,
  SettlementResult,
  BatchAnalytics,
  RefineryGainLossReport,
} from '@/types/phase4/phase4.types';
import { now } from '@/utils/now';

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

export const refineryBatchService = {
  /**
   * STAGE 1 — CREATE
   * Creates a refinery batch, attaches input lots, computes shareRatio per lot,
   * transitions input lots to SENT_TO_REFINERY.
   */
  async createRefineryBatch(input: CreateRefineryBatchInput, firmId: string): Promise<RefineryBatch> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!input.supplierId) throw new Error('SUPPLIER_ID_REQUIRED');
    if (!input.lotIds || input.lotIds.length === 0) {
      throw new Error(ERR.REFINERY_BATCH_NO_LOTS);
    }

    return executeTransaction(async (tx) => {
      // 1. Validate supplier type is REFINERY
      const supplier = supplierRepository.findById(tx, firmId, input.supplierId);
      if (!supplier || supplier.type !== 'REFINERY') {
        throw new Error(ERR.SUPPLIER_NOT_REFINERY);
      }

      // 2. Atomic candidate validation (Two-step pattern / P3-FIX-1)
      // P3-FIX-1: MELT_OUTPUT lots cannot be refinery inputs — data integrity violation
      // P3-FIX-1: SENT_TO_MELT is a valid terminal state — NOT an orphan
      // findEligible: WHERE status = 'RECEIVED' AND (metalSource IS NULL OR metalSource != 'MELT_OUTPUT')
      const eligibleLots: OldMetalLot[] = oldMetalLotRepository.findEligible(tx, firmId);
      const eligibleMap = new Map<string, OldMetalLot>();
      for (const lot of eligibleLots) {
        eligibleMap.set(lot.id, lot);
      }

      const selectedLots: OldMetalLot[] = [];
      for (const lotId of input.lotIds) {
        const lot = eligibleMap.get(lotId);
        if (!lot) {
          throw new Error(ERR.LOT_NOT_ELIGIBLE_FOR_REFINERY);
        }
        selectedLots.push(lot);
      }

      // 3. Compute inputFineMg for each lot and totalInputFineMg
      interface PreparedLot {
        lot: OldMetalLot;
        netWeightMg: number;
        inputFineMg: number;
      }

      let totalInputFineMg = 0;
      const preparedLots: PreparedLot[] = [];

      for (const lot of selectedLots) {
        const stoneWeight = (lot as any).stoneWeightMg || 0;
        const beadsWeight = (lot as any).beadsWeightMg || 0;
        const netWeightMg = Math.max(0, lot.grossWeightMg - stoneWeight - beadsWeight);

        const inputFineMg = new Decimal(netWeightMg)
          .times(lot.purityPercent)
          .dividedBy(100)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();

        totalInputFineMg += inputFineMg;
        preparedLots.push({ lot, netWeightMg, inputFineMg });
      }

      // 4. Insert refinery_batches row (status = CREATED)
      const batch = refineryBatchRepository.insertBatch(tx, {
        firmId,
        supplierId: input.supplierId,
        status: 'CREATED',
        notes: input.notes || null,
        totalInputFineMg: null, // computed at SENT stage
      });

      // 5. For each lot: compute shareRatio, insert refinery_batch_lots row, transition old_metal_lot status
      for (const item of preparedLots) {
        const shareRatio =
          totalInputFineMg > 0
            ? new Decimal(item.inputFineMg)
                .dividedBy(totalInputFineMg)
                .toDecimalPlaces(8, Decimal.ROUND_HALF_UP)
                .toNumber()
            : 0;

        refineryBatchRepository.insertBatchLot(tx, {
          batchId: batch.id,
          lotId: item.lot.id,
          inputFineMg: item.inputFineMg,
          shareRatio,
          settled: 0,
        });

        oldMetalLotRepository.updateStatus(tx, item.lot.id, firmId, 'SENT_TO_REFINERY');
      }

      // 6. G41 Live Transaction Audit Log
      auditRepository.log(tx, {
        eventType: 'REFINERY_BATCH_CREATED',
        firmId,
        entityId: batch.id,
        payload: {
          batchId: batch.id,
          supplierId: input.supplierId,
          lotCount: selectedLots.length,
          totalInputFineMg,
        },
      });

      return batch;
    });
  },

  /**
   * STAGE 2 — SEND
   * Marks batch as physically dispatched to refinery, records totalInputFineMg and sentDate.
   */
  async sendRefineryBatch(
    batchId: string,
    second: string,
    third?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    let sentDate: string;
    let firmId: string;

    if (!third) {
      // Called as sendRefineryBatch(batchId, firmId)
      firmId = second;
      sentDate = now().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(second)) {
      // Called as sendRefineryBatch(batchId, sentDate, firmId)
      sentDate = second;
      firmId = third;
    } else {
      // Called as sendRefineryBatch(batchId, firmId, sentDate)
      firmId = second;
      sentDate = third;
    }

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error('BATCH_ID_REQUIRED');

    return executeTransaction(async (tx) => {
      const batch = refineryBatchRepository.getBatchById(tx, batchId, firmId);
      if (!batch) {
        throw new Error(ERR.REFINERY_BATCH_NOT_FOUND);
      }
      if (batch.status !== 'CREATED') {
        throw new Error(ERR.INVALID_REFINERY_BATCH_STATUS);
      }

      // FIX-EMPTY-BATCH v1.8
      const batchLots = refineryBatchRepository.getBatchLots(tx, batchId);
      if (!batchLots || batchLots.length === 0) {
        throw new Error(ERR.REFINERY_BATCH_NO_LOTS);
      }

      const totalInputFineMg = batchLots.reduce(
        (sum: number, l: any) => sum + (l.inputFineMg || 0),
        0
      );

      const resolvedSentDate = sentDate || now().slice(0, 10);

      refineryBatchRepository.updateBatch(tx, batchId, firmId, {
        status: 'SENT',
        sentDate: resolvedSentDate,
        totalInputFineMg,
      });

      // G41 Live Transaction Audit Log
      auditRepository.log(tx, {
        eventType: 'REFINERY_BATCH_SENT',
        firmId,
        entityId: batchId,
        payload: {
          batchId,
          sentDate: resolvedSentDate,
          totalInputFineMg,
          lotCount: batchLots.length,
        },
      });
    });
  },

  /**
   * STAGE 3 — RECEIVE
   * Records receipt of refined metal, creates output lot records, and validates plausibility (<=110% yield).
   */
  async receiveRefineryOutput(batchId: string, input: ReceiveRefineryInput, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error('BATCH_ID_REQUIRED');
    if (!input.grossWeightMg || input.grossWeightMg <= 0) {
      throw new Error(ERR.REFINERY_OUTPUT_WEIGHT_INVALID);
    }
    if (input.purityPercent === undefined || input.purityPercent <= 0 || input.purityPercent > 100) {
      throw new Error(ERR.REFINERY_OUTPUT_PURITY_INVALID);
    }

    return executeTransaction(async (tx) => {
      const batch = refineryBatchRepository.getBatchById(tx, batchId, firmId);
      if (!batch) {
        throw new Error(ERR.REFINERY_BATCH_NOT_FOUND);
      }
      if (batch.status !== 'SENT') {
        throw new Error(ERR.REFINERY_BATCH_NOT_SENT);
      }

      // GAP-REFINERY-TOTALOUTPUT v1.8 (DECIMAL-FIX)
      const totalOutputFineMg = new Decimal(input.grossWeightMg)
        .times(input.purityPercent)
        .dividedBy(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();

      // SETTLEMENT-VARIANCE yield plausibility guard (>110% is physically impossible)
      const inputFine = batch.totalInputFineMg || 0;
      if (inputFine > 0 && totalOutputFineMg > Math.floor(inputFine * 1.1)) {
        throw new Error(ERR.REFINERY_OUTPUT_EXCEEDS_INPUT);
      }

      const receivedDate = input.receivedDate || now().slice(0, 10);

      // 1. Insert refinery_output_lots record
      const outputLotRecord = refineryBatchRepository.insertOutputLot(tx, {
        batchId,
        fineWeightMg: totalOutputFineMg,
        purityPercent: input.purityPercent,
        grossWeightMg: input.grossWeightMg,
        metalSource: 'REFINERY_OUTPUT',
        receivedDate,
      });

      // 2. Insert corresponding old_metal_lots record for store inventory
      const newOldMetalLot = oldMetalLotRepository.insert(tx, {
        firmId,
        receivedFrom: 'Refinery Output',
        receivedDate,
        grossWeightMg: input.grossWeightMg,
        metal: 'GOLD',
        purityPercent: input.purityPercent,
        metalSource: 'REFINERY_OUTPUT',
        status: 'RECEIVED',
        fineWeightMg: totalOutputFineMg,
        notes: input.notes || `Refinery output from batch ${batchId}`,
      } as any);

      // 3. Update batch status
      refineryBatchRepository.updateBatch(tx, batchId, firmId, {
        status: 'RECEIVED',
        receivedDate,
        totalOutputFineMg,
      });

      // 4. G41 Live Transaction Audit Log
      auditRepository.log(tx, {
        eventType: 'REFINERY_OUTPUT_RECEIVED',
        firmId,
        entityId: batchId,
        payload: {
          batchId,
          totalOutputFineMg,
          grossWeightMg: input.grossWeightMg,
          purityPercent: input.purityPercent,
          refineryOutputLotId: outputLotRecord.id,
          inventoryLotId: newOldMetalLot.id,
        },
      });
    });
  },

  /**
   * STAGE 4 — SETTLE LOT
   * Settles an individual lot within a RECEIVED batch, performs pro-rata variance advisory check.
   */
  async settleRefineryBatchLot(
    batchId: string,
    lotId: string,
    third: number | string,
    fourth?: string
  ): Promise<SettlementResult> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    let outputFineMgParam: number | undefined;
    let firmId: string;

    if (typeof third === 'string') {
      firmId = third;
      outputFineMgParam = undefined;
    } else {
      outputFineMgParam = third;
      firmId = fourth!;
    }

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error('BATCH_ID_REQUIRED');
    if (!lotId) throw new Error('LOT_ID_REQUIRED');

    return executeTransaction(async (tx) => {
      const batch = refineryBatchRepository.getBatchById(tx, batchId, firmId);
      if (!batch) {
        throw new Error(ERR.REFINERY_BATCH_NOT_FOUND);
      }
      if (batch.status !== 'RECEIVED') {
        throw new Error(ERR.REFINERY_BATCH_NOT_RECEIVED);
      }

      const batchLot = refineryBatchRepository.getBatchLotByLotId(tx, batchId, lotId);
      if (!batchLot) {
        throw new Error(ERR.ITEM_NOT_FOUND);
      }
      if (batchLot.settled === 1) {
        throw new Error(ERR.REFINERY_LOT_ALREADY_SETTLED);
      }

      // SETTLEMENT-VARIANCE v1.9: advisory check (WARNING, not blocking)
      const totalBatchOutput = batch.totalOutputFineMg || 0;
      const impliedOutput = new Decimal(batchLot.shareRatio || 0)
        .times(totalBatchOutput)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();

      const outputFineMg = outputFineMgParam !== undefined ? outputFineMgParam : impliedOutput;

      const variancePct =
        impliedOutput > 0
          ? (Math.abs(outputFineMg - impliedOutput) / impliedOutput) * 100
          : 0;

      let varianceWarning = false;
      if (variancePct > 20) {
        varianceWarning = true;
        auditRepository.log(tx, {
          eventType: 'REFINERY_SETTLEMENT_VARIANCE',
          firmId,
          entityId: lotId,
          payload: {
            batchId,
            lotId,
            impliedOutputMg: impliedOutput,
            actualOutputMg: outputFineMg,
            variancePct: Number(variancePct.toFixed(2)),
          },
        });
      }

      // 1. Update refinery_batch_lots: outputFineMg, settled = 1
      refineryBatchRepository.updateBatchLot(tx, batchLot.id, {
        outputFineMg,
        settled: 1,
      });

      // 2. Update old_metal_lots.status → SETTLED
      oldMetalLotRepository.updateStatus(tx, lotId, firmId, 'SETTLED');

      // 3. G41 Live Transaction Audit Log
      auditRepository.log(tx, {
        eventType: 'REFINERY_LOT_SETTLED',
        firmId,
        entityId: lotId,
        payload: {
          batchId,
          lotId,
          outputFineMg,
          impliedOutputMg: impliedOutput,
          variancePct: Number(variancePct.toFixed(2)),
        },
      });

      return varianceWarning
        ? {
            varianceWarning: true,
            variancePct: Number(variancePct.toFixed(2)),
            impliedOutputMg: impliedOutput,
          }
        : {
            varianceWarning: false,
            variancePct: null,
            impliedOutputMg: null,
          };
    });
  },

  /**
   * Alias for settleRefineryBatchLot
   */
  async settleLot(
    batchId: string,
    lotId: string,
    third: number | string,
    fourth?: string
  ): Promise<SettlementResult> {
    return this.settleRefineryBatchLot(batchId, lotId, third as any, fourth);
  },

  /**
   * STAGE 4 — CLOSE BATCH
   * Closes a batch after ALL constituent lots are settled (FIX-CLOSEBATCH v1.8),
   * calculates net gainLossMg.
   */
  async closeRefineryBatch(batchId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error('BATCH_ID_REQUIRED');

    return executeTransaction(async (tx) => {
      const batch = refineryBatchRepository.getBatchById(tx, batchId, firmId);
      if (!batch) {
        throw new Error(ERR.REFINERY_BATCH_NOT_FOUND);
      }
      if (batch.status !== 'RECEIVED') {
        throw new Error(ERR.INVALID_REFINERY_BATCH_STATUS);
      }

      // FIX-CLOSEBATCH v1.8 guard: ALL lots must have settled === 1
      const batchLots = refineryBatchRepository.getBatchLots(tx, batchId);
      const hasUnsettled = batchLots.some((l: any) => l.settled !== 1);
      if (hasUnsettled) {
        throw new Error(ERR.REFINERY_BATCH_NOT_ALL_SETTLED);
      }

      const totalInput = batch.totalInputFineMg || 0;
      const totalOutput = batch.totalOutputFineMg || 0;
      const gainLossMg = totalOutput - totalInput;

      // 1. Update batch: status → CLOSED, gainLossMg
      refineryBatchRepository.updateBatch(tx, batchId, firmId, {
        status: 'CLOSED',
        gainLossMg,
      });

      // 2. G41 Live Transaction Audit Log
      auditRepository.log(tx, {
        eventType: 'REFINERY_BATCH_CLOSED',
        firmId,
        entityId: batchId,
        payload: {
          batchId,
          totalInputFineMg: totalInput,
          totalOutputFineMg: totalOutput,
          gainLossMg,
        },
      });
    });
  },

  /**
   * Helper: Retrieve batch by ID
   */
  async getBatchById(batchId: string, firmId: string): Promise<RefineryBatch | null> {
    return refineryBatchRepository.getBatchById(batchId, firmId);
  },

  /**
   * Helper: List batches by firm
   */
  async listBatches(firmId: string): Promise<RefineryBatch[]> {
    return refineryBatchRepository.listBatches(firmId);
  },

  /**
   * Helper: List batch lots
   */
  async getBatchLots(batchId: string) {
    return refineryBatchRepository.getBatchLots(batchId);
  },

  /**
   * Helper: List output lots
   */
  async getOutputLots(batchId: string) {
    return refineryBatchRepository.getOutputLots(batchId);
  },

  /**
   * GAIN / LOSS REPORTING (Step 10)
   * Computes per-batch analytics including gainLossMg and yieldPct.
   *
   * Batch Gain/Loss (mg) = totalOutputFineMg − totalInputFineMg
   * Yield % = (totalOutputFineMg / totalInputFineMg) × 100
   * Positive gainLossMg = refinery returned MORE fine gold than sent (gain)
   * Negative gainLossMg = refinery returned LESS fine gold than sent (loss — normal for processing)
   * Gain/loss is stored on refinery_batches.gainLossMg at CLOSE. It is NOT recalculated after close.
   */
  async getBatchAnalytics(batchId: string, firmId: string): Promise<BatchAnalytics> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error('BATCH_ID_REQUIRED');

    const batch = refineryBatchRepository.getBatchById(batchId, firmId);
    if (!batch) {
      throw new Error(ERR.REFINERY_BATCH_NOT_FOUND);
    }

    const totalInput = batch.totalInputFineMg || 0;
    const totalOutput = batch.totalOutputFineMg || 0;

    let gainLossMg: number | null = null;
    if (batch.status === 'CLOSED') {
      gainLossMg = batch.gainLossMg ?? (totalOutput - totalInput);
    } else if (batch.status === 'RECEIVED' || batch.status === 'SETTLED') {
      gainLossMg = totalOutput - totalInput;
    }

    let yieldPct: number | null = null;
    if (totalInput > 0 && totalOutput > 0) {
      yieldPct = new Decimal(totalOutput)
        .dividedBy(totalInput)
        .times(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
    }

    return {
      batchId: batch.id,
      firmId: batch.firmId,
      supplierId: batch.supplierId,
      status: batch.status,
      sentDate: batch.sentDate,
      receivedDate: batch.receivedDate,
      totalInputFineMg: totalInput,
      totalOutputFineMg: totalOutput,
      gainLossMg,
      yieldPct,
      notes: batch.notes,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  },

  /**
   * GAIN / LOSS REPORTING — Historical View (Step 10)
   * Aggregates all refinery batches for the firm with net gain/loss and overall yield %.
   */
  async getGainLossReport(firmId: string): Promise<RefineryGainLossReport> {
    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);

    const batches = refineryBatchRepository.listBatches(firmId);
    const analyticsList: BatchAnalytics[] = [];

    let totalInputFineMg = 0;
    let totalOutputFineMg = 0;
    let netGainLossMg = 0;

    for (const batch of batches) {
      const input = batch.totalInputFineMg || 0;
      const output = batch.totalOutputFineMg || 0;

      let gainLossMg: number | null = null;
      if (batch.status === 'CLOSED') {
        gainLossMg = batch.gainLossMg ?? (output - input);
        if (gainLossMg !== null) {
          netGainLossMg += gainLossMg;
        }
      } else if (batch.status === 'RECEIVED' || batch.status === 'SETTLED') {
        gainLossMg = output - input;
      }

      totalInputFineMg += input;
      totalOutputFineMg += output;

      let yieldPct: number | null = null;
      if (input > 0 && output > 0) {
        yieldPct = new Decimal(output)
          .dividedBy(input)
          .times(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
      }

      analyticsList.push({
        batchId: batch.id,
        firmId: batch.firmId,
        supplierId: batch.supplierId,
        status: batch.status,
        sentDate: batch.sentDate,
        receivedDate: batch.receivedDate,
        totalInputFineMg: input,
        totalOutputFineMg: output,
        gainLossMg,
        yieldPct,
        notes: batch.notes,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      });
    }

    let overallYieldPct: number | null = null;
    if (totalInputFineMg > 0 && totalOutputFineMg > 0) {
      overallYieldPct = new Decimal(totalOutputFineMg)
        .dividedBy(totalInputFineMg)
        .times(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
    }

    return {
      batches: analyticsList,
      totalBatches: analyticsList.length,
      totalInputFineMg,
      totalOutputFineMg,
      netGainLossMg,
      overallYieldPct,
    };
  },

  /**
   * Retrieves total outstanding fine gold (in mg) at refinery for active batches (SENT / RECEIVED).
   * Reads from refinery_batches.
   * Supports both (tx, firmId) and (firmId, tx) signatures.
   */
  async getTotalOutstandingFineMg(arg1: any, arg2?: any): Promise<number> {
    let tx: any = undefined;
    let firmId: string;
    if (typeof arg1 === 'string') {
      firmId = arg1;
      tx = arg2;
    } else {
      tx = arg1;
      firmId = arg2;
    }
    const batches = refineryBatchRepository.listBatches(tx, firmId);
    const outstandingBatches = batches.filter(
      (b: any) => b.status === 'SENT' || b.status === 'RECEIVED'
    );
    return outstandingBatches.reduce(
      (sum: number, b: any) => sum + (b.totalInputFineMg || 0),
      0
    );
  },

  /**
   * Helper: Find refinery batch lot entry by lot ID
   */
  async getBatchLotByLot(lotId: string) {
    return refineryBatchRepository.getBatchLotByLot(lotId);
  },
};
