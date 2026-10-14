// services/phase4/meltBatchService.ts
// Phase 4: Gold Intelligence — Melt Batch Service
// Implements Melt Batch Lifecycle: CREATE → CLOSE
// Complies with:
// - P3-FIX-1: SENT_TO_MELT is a valid terminal state
// - GAP-MELT-INPUT-FINE v1.8: inputFineMg = lot.fineWeightMg (do NOT recompute)
// - NET-WEIGHT-FIX-2: Melt output is pure metal — no stone/bead deduction
//   outputFineWeightMg = Decimal(gross).times(purity).div(100).roundHalfUp
// - GAP-MELT-OUTPUT-FIELDS v1.8: old_metal_lots row metalSource = 'MELT_OUTPUT', status = 'RECEIVED'
// - G41 Live Transaction Audit Rule

import Decimal from 'decimal.js';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { meltBatchRepository } from '@/repositories/phase4/meltBatchRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import type { DrizzleTransaction, OldMetalLot } from '@/types/phase2/phase2.types';
import type {
  MeltBatch,
  CreateMeltBatchInput,
  CloseMeltBatchInput,
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

export const meltBatchService = {
  /**
   * CREATE MELT BATCH
   * createMeltBatch(lotIds: string[], firmId: string): Promise<MeltBatch>
   *
   * Guards: assertNoActiveLease() + assertNotInSafeMode()
   * Validate: all lots status === 'RECEIVED' AND metalSource !== 'MELT_OUTPUT'
   * Transaction:
   * 1. Insert melt_batches row (status = 'CREATED')
   * 2. For each lot: Insert melt_batch_inputs, set lot.status -> 'SENT_TO_MELT'
   *    GAP-MELT-INPUT-FINE v1.8: inputFineMg = lot.fineWeightMg (read from old_metal_lots row)
   * 3. Audit: MELT_BATCH_CREATED (live tx — G41)
   */
  async createMeltBatch(
    first: string[] | CreateMeltBatchInput,
    second?: string
  ): Promise<MeltBatch> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    let lotIds: string[];
    let firmId: string;

    if (Array.isArray(first)) {
      lotIds = first;
      firmId = second!;
    } else {
      lotIds = first.lotIds;
      firmId = second!;
    }

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!lotIds || !Array.isArray(lotIds) || lotIds.length === 0) {
      throw new Error(ERR.MELT_BATCH_NO_LOTS);
    }

    return executeTransaction(async (tx) => {
      // Validate: all lots status === 'RECEIVED' AND metalSource !== 'MELT_OUTPUT'
      // Re-validate atomically inside tx using findEligible
      const eligibleLots: OldMetalLot[] = oldMetalLotRepository.findEligible(tx, firmId);
      const eligibleMap = new Map<string, OldMetalLot>();
      for (const lot of eligibleLots) {
        eligibleMap.set(lot.id, lot);
      }

      const selectedLots: OldMetalLot[] = [];
      for (const lotId of lotIds) {
        const lot = eligibleMap.get(lotId);
        if (!lot) {
          throw new Error(ERR.LOT_NOT_ELIGIBLE_FOR_MELT);
        }
        selectedLots.push(lot);
      }

      // 1. Insert melt_batches row (status = 'CREATED')
      const batch = meltBatchRepository.insertBatch(tx, {
        firmId,
        status: 'CREATED',
      });

      // 2. For each lot: Insert melt_batch_inputs, set lot.status -> 'SENT_TO_MELT'
      for (const lot of selectedLots) {
        // GAP-MELT-INPUT-FINE v1.8: inputFineMg = lot.fineWeightMg (read from old_metal_lots row)
        // fineWeightMg was set by Phase 2 net-weight formula at purchase time — do NOT recompute
        meltBatchRepository.insertBatchInput(tx, {
          batchId: batch.id,
          lotId: lot.id,
          inputFineMg: lot.fineWeightMg,
        });

        // Set lot.status -> 'SENT_TO_MELT'
        oldMetalLotRepository.updateStatus(tx, lot.id, firmId, 'SENT_TO_MELT');
      }

      // 3. Audit: MELT_BATCH_CREATED (live tx — G41)
      auditRepository.log(tx, {
        eventType: 'MELT_BATCH_CREATED',
        firmId,
        entityId: batch.id,
        payload: {
          batchId: batch.id,
          lotIds,
          lotCount: selectedLots.length,
          totalInputFineMg: selectedLots.reduce((acc, l) => acc + (l.fineWeightMg || 0), 0),
        },
      });

      return batch;
    });
  },

  /**
   * CLOSE MELT BATCH
   * closeMeltBatch(batchId, outputGrossWeightMg, outputPurityPct, firmId): Promise<void>
   *
   * Pre: batch.status === 'CREATED'
   * NET-WEIGHT-FIX-2: Melt output is pure metal — no stone/bead deduction.
   * outputFineWeightMg = new Decimal(outputGrossWeightMg).times(outputPurityPct)
   *   .dividedBy(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
   * Transaction:
   * 1. Insert old_metal_lots row: metalSource = 'MELT_OUTPUT', status = 'RECEIVED'
   *    GAP-MELT-OUTPUT-FIELDS v1.8: field mapping:
   *    grossWeightMg = outputGrossWeightMg, purityPercent = outputPurityPct
   *    fineWeightMg = outputFineWeightMg (computed above), stoneWeightMg = 0, beadsWeightMg = 0
   * 2. Update batch: status -> 'CLOSED', outputLotId, outputFineWeightMg, closedAt
   * 3. Audit: MELT_BATCH_CLOSED (live tx — G41)
   */
  async closeMeltBatch(
    first: string | CloseMeltBatchInput,
    second?: number | string,
    third?: number,
    fourth?: string
  ): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    let batchId: string;
    let outputGrossWeightMg: number;
    let outputPurityPct: number;
    let firmId: string;

    if (typeof first === 'object') {
      batchId = first.batchId;
      outputGrossWeightMg = first.outputGrossWeightMg;
      outputPurityPct = first.outputPurityPct;
      firmId = second as string;
    } else {
      batchId = first;
      outputGrossWeightMg = second as number;
      outputPurityPct = third as number;
      firmId = fourth as string;
    }

    if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED);
    if (!batchId) throw new Error(ERR.MELT_BATCH_NOT_FOUND);
    if (typeof outputGrossWeightMg !== 'number' || outputGrossWeightMg <= 0) {
      throw new Error(ERR.MELT_OUTPUT_WEIGHT_INVALID);
    }
    if (typeof outputPurityPct !== 'number' || outputPurityPct <= 0 || outputPurityPct > 100) {
      throw new Error(ERR.INVALID_MELT_OUTPUT_PURITY);
    }

    // NET-WEIGHT-FIX-2: Melt output is pure metal — no stone/bead deduction.
    const outputFineWeightMg = new Decimal(outputGrossWeightMg)
      .times(outputPurityPct)
      .dividedBy(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    return executeTransaction(async (tx) => {
      // Pre: batch.status === 'CREATED'
      const batch = meltBatchRepository.getBatchById(tx, batchId, firmId);
      if (!batch) {
        throw new Error(ERR.MELT_BATCH_NOT_FOUND);
      }
      if (batch.status !== 'CREATED') {
        throw new Error(ERR.MELT_BATCH_NOT_CREATED);
      }

      const timestamp = now();
      const receivedDate = timestamp.slice(0, 10);

      // 1. Insert old_metal_lots row: metalSource = 'MELT_OUTPUT', status = 'RECEIVED'
      // GAP-MELT-OUTPUT-FIELDS v1.8: field mapping:
      // grossWeightMg = outputGrossWeightMg, purityPercent = outputPurityPct
      // fineWeightMg = outputFineWeightMg, stoneWeightMg = 0, beadsWeightMg = 0
      const outputLot = oldMetalLotRepository.insert(tx, {
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate,
        grossWeightMg: outputGrossWeightMg,
        metal: 'GOLD',
        purityPercent: outputPurityPct,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
        fineWeightMg: outputFineWeightMg,
        notes: `Melt output from batch ${batchId}`,
      } as any);

      // 2. Update batch: status -> 'CLOSED', outputLotId, outputFineWeightMg, closedAt
      meltBatchRepository.updateBatch(tx, batchId, firmId, {
        status: 'CLOSED',
        outputGrossWeightMg,
        outputPurityPct,
        outputFineWeightMg,
        outputLotId: outputLot.id,
        closedAt: timestamp,
      });

      // 3. Audit: MELT_BATCH_CLOSED (live tx — G41)
      auditRepository.log(tx, {
        eventType: 'MELT_BATCH_CLOSED',
        firmId,
        entityId: batchId,
        payload: {
          batchId,
          outputGrossWeightMg,
          outputPurityPct,
          outputFineWeightMg,
          outputLotId: outputLot.id,
        },
      });
    });
  },

  /**
   * Helper: Retrieve melt batch by ID
   */
  async getBatchById(batchId: string, firmId: string): Promise<MeltBatch | null> {
    return meltBatchRepository.getBatchById(batchId, firmId);
  },

  /**
   * Helper: List melt batches by firm
   */
  async listBatches(firmId: string): Promise<MeltBatch[]> {
    return meltBatchRepository.listBatches(firmId);
  },

  /**
   * Helper: List melt batch inputs
   */
  async getBatchInputs(batchId: string) {
    return meltBatchRepository.getBatchInputs(batchId);
  },

  /**
   * Helper: Find melt batch input by lot ID
   */
  async getBatchInputByLotId(lotId: string) {
    return meltBatchRepository.getBatchInputByLotId(lotId);
  },
};
