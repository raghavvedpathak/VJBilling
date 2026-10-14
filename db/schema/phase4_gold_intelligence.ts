import { sqliteTable, text, integer, real, index, foreignKey } from 'drizzle-orm/sqlite-core';
import { firms } from './phase1_core';
import { oldMetalLots } from './phase2_inventory';
import { suppliers, karigar } from './phase3_money_truth';

// =============================================================================
// PHASE 4 — GOLD INTELLIGENCE LAYER: REFINERY BATCH SCHEMA
// =============================================================================

// TABLE: refinery_batches
export const refineryBatches = sqliteTable(
  'refinery_batches',
  {
    id: text('id').primaryKey(),
    firmId: text('firm_id').notNull(),
    supplierId: text('supplier_id').notNull(), // Refinery supplier (type=REFINERY)
    status: text('status', {
      enum: ['CREATED', 'SENT', 'RECEIVED', 'SETTLED', 'CLOSED'],
    })
      .notNull()
      .default('CREATED'),
    sentDate: text('sent_date'), // ISO date when sent
    receivedDate: text('received_date'), // ISO date when received back
    totalInputFineMg: integer('total_input_fine_mg'), // computed at SENT
    totalOutputFineMg: integer('total_output_fine_mg'), // computed at RECEIVED
    gainLossMg: integer('gain_loss_mg'), // computed at CLOSE: output - input
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    firmFk: foreignKey({ columns: [t.firmId], foreignColumns: [firms.id] }),
    idxRefineryBatchesFirm: index('idx_refinery_batches_firm').on(t.firmId),
    idxRefineryBatchesFirmStatus: index('idx_refinery_batches_firm_status').on(t.firmId, t.status),
  })
);

// TABLE: refinery_batch_lots
export const refineryBatchLots = sqliteTable(
  'refinery_batch_lots',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id').notNull(), // FK -> refinery_batches
    lotId: text('lot_id').notNull(), // FK -> old_metal_lots
    inputFineMg: integer('input_fine_mg').notNull(),
    outputFineMg: integer('output_fine_mg'), // set at settlement
    shareRatio: real('share_ratio'), // lot share of total input (0–1). Computed at CREATE.
    settled: integer('settled').default(0), // 0 or 1 (boolean)
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    idxRefineryBatchLotsBatch: index('idx_refinery_batch_lots_batch').on(t.batchId),
    idxRefineryBatchLotsLot: index('idx_refinery_batch_lots_lot').on(t.lotId),
    idxRefineryBatchLotsSettled: index('idx_refinery_batch_lots_settled').on(t.batchId, t.settled),
  })
);

// TABLE: refinery_output_lots
export const refineryOutputLots = sqliteTable(
  'refinery_output_lots',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id').notNull(), // FK -> refinery_batches
    fineWeightMg: integer('fine_weight_mg').notNull(),
    purityPercent: real('purity_percent').notNull(),
    grossWeightMg: integer('gross_weight_mg').notNull(),
    metalSource: text('metal_source').notNull().default('REFINERY_OUTPUT'),
    receivedDate: text('received_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    idxRefineryOutputLotsBatch: index('idx_refinery_output_lots_batch').on(t.batchId),
    idxRefineryOutputLotsBatchReceived: index('idx_refinery_output_lots_batch_received').on(t.batchId, t.receivedDate),
  })
);

// =============================================================================
// MELT BATCH SCHEMA (Step 6)
// =============================================================================

// TABLE: melt_batches
export const meltBatches = sqliteTable(
  'melt_batches',
  {
    id: text('id').primaryKey(),
    firmId: text('firm_id').notNull(),
    status: text('status', { enum: ['CREATED', 'CLOSED'] })
      .notNull()
      .default('CREATED'),
    outputGrossWeightMg: integer('output_gross_weight_mg'), // user-entered at CLOSE
    outputPurityPct: real('output_purity_pct'), // user-entered at CLOSE
    outputFineWeightMg: integer('output_fine_weight_mg'), // computed at CLOSE (NET-WEIGHT-FIX-2)
    outputLotId: text('output_lot_id'), // FK -> old_metal_lots (MELT_OUTPUT)
    closedAt: text('closed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    firmFk: foreignKey({ columns: [t.firmId], foreignColumns: [firms.id] }),
    idxMeltBatchesFirm: index('idx_melt_batches_firm').on(t.firmId),
    idxMeltBatchesFirmStatus: index('idx_melt_batches_firm_status').on(t.firmId, t.status),
  })
);

// TABLE: melt_batch_inputs
export const meltBatchInputs = sqliteTable(
  'melt_batch_inputs',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id').notNull(),
    lotId: text('lot_id').notNull(), // FK -> old_metal_lots
    inputFineMg: integer('input_fine_mg').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    idxMeltBatchInputsBatch: index('idx_melt_batch_inputs_batch').on(t.batchId),
    idxMeltBatchInputsLot: index('idx_melt_batch_inputs_lot').on(t.lotId),
  })
);
// =============================================================================
// KARIGAR FLOW SCHEMA (Step 7)
// =============================================================================

// TABLE: karigar_issues (REVIEW-4: REVERSED status included)
export const karigarIssues = sqliteTable(
  'karigar_issues',
  {
    id: text('id').primaryKey(),
    firmId: text('firm_id').notNull(),
    karigarId: text('karigar_id').notNull(),
    sourceLotId: text('source_lot_id').notNull(), // FK → old_metal_lots
    issuedGrossWeightMg: integer('issued_gross_weight_mg').notNull(),
    issuedPurityPct: real('issued_purity_pct').notNull(),
    issuedFineWeightMg: integer('issued_fine_weight_mg').notNull(),
    status: text('status', {
      enum: ['ISSUED', 'PARTIAL_RETURN', 'CLOSED', 'REVERSED'], // REVIEW-4
    })
      .notNull()
      .default('ISSUED'),
    issueDate: text('issue_date').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    firmFk: foreignKey({ columns: [t.firmId], foreignColumns: [firms.id] }),
    karigarFk: foreignKey({ columns: [t.karigarId], foreignColumns: [karigar.id] }),
    lotFk: foreignKey({ columns: [t.sourceLotId], foreignColumns: [oldMetalLots.id] }),
    idxKarigarIssuesFirm: index('idx_karigar_issues_firm').on(t.firmId),
    idxKarigarIssuesKarigar: index('idx_karigar_issues_karigar').on(t.karigarId),
    idxKarigarIssuesStatusDate: index('idx_karigar_issues_status_date').on(t.firmId, t.status, t.issueDate),
    idxKarigarIssuesSourceLot: index('idx_karigar_issues_source_lot').on(t.sourceLotId, t.firmId),
  })
);

// TABLE: karigar_returns
export const karigarReturns = sqliteTable(
  'karigar_returns',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id').notNull(), // FK → karigar_issues
    grossWeightMg: integer('gross_weight_mg').notNull(),
    purityPct: real('purity_pct').notNull(),
    fineWeightMg: integer('fine_weight_mg').notNull(),
    returnDate: text('return_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    issueFk: foreignKey({ columns: [t.issueId], foreignColumns: [karigarIssues.id] }),
    idxKarigarReturnsIssue: index('idx_karigar_returns_issue').on(t.issueId),
    idxKarigarReturnsIssueCreated: index('idx_karigar_returns_issue_created').on(t.issueId, t.createdAt),
  })
);
