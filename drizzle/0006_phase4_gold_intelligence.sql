-- Migration 0006_phase4_gold_intelligence.sql — Phase 4 Gold Intelligence Layer
-- Cross-Phase Migration File Registry (LOCKED):
-- 0000_initial_schema.sql (Phase 1 — 7 core tables)
-- 0001_phase1_bis_logos.sql (Phase 1 — bis_logos table added)
-- 0002_phase2_inventory.sql (Phase 2 — inventory layer)
-- 0003_phase4_melt_status.sql (Phase 2 v1.9 forward-compat — SENT_TO_MELT, metalSource)
-- 0004_phase3_billing.sql (Phase 3 — billing layer + purchase invoice + karigar settlement)
-- 0006_phase4_gold_intelligence.sql (Phase 4 — THIS FILE — all Phase 4 migrations)

-- =============================================================================
-- Migration Blocks (P4-M1 through P4-M6)
-- =============================================================================

-- IDX-KARIGAR-LEDGER v1.9: Phase 4 depends on these Phase 3 karigar_ledger indexes:
-- idx_karigar_ledger_firm_karigar ON karigar_ledger(firm_id, karigar_id, type)
-- idx_karigar_ledger_firm_type ON karigar_ledger(firm_id, type, karigar_id)
-- These are Phase 3 owned — Phase 4 MUST NOT redefine them here.

-- P4-M1: karigar_ledger.type enum extension
-- Add LABOUR_IN_GOLD and METAL_OUT_REVERSAL to karigar_ledger.type
-- (Enforced at application/schema layer; existing rows unaffected)

-- P4-M2: item_events.eventType enum extension (12 new types)
-- REFINERY_BATCH_CREATED, REFINERY_BATCH_SENT, REFINERY_OUTPUT_RECEIVED,
-- REFINERY_LOT_SETTLED, REFINERY_BATCH_CLOSED,
-- MELT_BATCH_CREATED, MELT_BATCH_CLOSED,
-- KARIGAR_GOLD_ISSUED, KARIGAR_RETURN_RECORDED,
-- KARIGAR_LABOUR_GOLD_RECORDED, KARIGAR_ISSUE_REVERSED, KARIGAR_WASTAGE_EXCEEDED

-- P4-M3: old_metal_lots.status enum extension
-- VALID_LOT_TRANSITIONS (from Phase 2 v1.13):
-- RECEIVED: ['PENDING','SENT_TO_MELT','ISSUED_TO_KARIGAR','VOIDED']
-- PENDING: ['SENT_TO_REFINERY','RECEIVED','VOIDED']
-- SENT_TO_REFINERY: ['SETTLED']
-- SENT_TO_MELT: []
-- ISSUED_TO_KARIGAR: ['RECEIVED']
-- SETTLED: []
-- VOIDED: []

-- P4-M4: old_metal_lots.metalSource enum extension
-- Full MetalSource enum: CUSTOMER | KARIGAR | EXCHANGE | PURCHASE | MELT_OUTPUT | REFINERY_OUTPUT

-- P4-M5: karigar table column additions
ALTER TABLE `karigar` ADD COLUMN `allowed_wastage_pct` real DEFAULT 0.0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `karigar` ADD COLUMN `wastage_type` text DEFAULT 'PERCENT' NOT NULL;
--> statement-breakpoint
ALTER TABLE `karigar` ADD COLUMN `wastage_fixed_mg` integer;
--> statement-breakpoint

-- P4-M6: Create 7 new Phase 4 tables + DB indexes (DB-INDEX-FIX v1.6)

-- 1. Table: refinery_batches
CREATE TABLE IF NOT EXISTS `refinery_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`sent_date` text,
	`received_date` text,
	`total_input_fine_mg` integer,
	`total_output_fine_mg` integer,
	`gain_loss_mg` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_batches_firm` ON `refinery_batches` (`firm_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_batches_firm_status` ON `refinery_batches` (`firm_id`, `status`);
--> statement-breakpoint

-- 2. Table: refinery_batch_lots
CREATE TABLE IF NOT EXISTS `refinery_batch_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`input_fine_mg` integer NOT NULL,
	`output_fine_mg` integer,
	`share_ratio` real,
	`settled` integer DEFAULT 0,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_batch_lots_batch` ON `refinery_batch_lots` (`batch_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_batch_lots_lot` ON `refinery_batch_lots` (`lot_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_batch_lots_settled` ON `refinery_batch_lots` (`batch_id`, `settled`);
--> statement-breakpoint

-- 3. Table: refinery_output_lots
CREATE TABLE IF NOT EXISTS `refinery_output_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`fine_weight_mg` integer NOT NULL,
	`purity_percent` real NOT NULL,
	`gross_weight_mg` integer NOT NULL,
	`metal_source` text DEFAULT 'REFINERY_OUTPUT' NOT NULL,
	`received_date` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_output_lots_batch` ON `refinery_output_lots` (`batch_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refinery_output_lots_batch_received` ON `refinery_output_lots` (`batch_id`, `received_date`);
--> statement-breakpoint

-- 4. Table: melt_batches
CREATE TABLE IF NOT EXISTS `melt_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`output_gross_weight_mg` integer,
	`output_purity_pct` real,
	`output_fine_weight_mg` integer,
	`output_lot_id` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_melt_batches_firm` ON `melt_batches` (`firm_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_melt_batches_firm_status` ON `melt_batches` (`firm_id`, `status`);
--> statement-breakpoint

-- 5. Table: melt_batch_inputs
CREATE TABLE IF NOT EXISTS `melt_batch_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`input_fine_mg` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_melt_batch_inputs_batch` ON `melt_batch_inputs` (`batch_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_melt_batch_inputs_lot` ON `melt_batch_inputs` (`lot_id`);
--> statement-breakpoint

-- 6. Table: karigar_issues
CREATE TABLE IF NOT EXISTS `karigar_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`karigar_id` text NOT NULL,
	`source_lot_id` text NOT NULL,
	`issued_gross_weight_mg` integer NOT NULL,
	`issued_purity_pct` real NOT NULL,
	`issued_fine_weight_mg` integer NOT NULL,
	`status` text DEFAULT 'ISSUED' NOT NULL,
	`issue_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`karigar_id`) REFERENCES `karigar`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_lot_id`) REFERENCES `old_metal_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_issues_firm` ON `karigar_issues` (`firm_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_issues_karigar` ON `karigar_issues` (`karigar_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_issues_status_date` ON `karigar_issues` (`firm_id`, `status`, `issue_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_issues_source_lot` ON `karigar_issues` (`source_lot_id`, `firm_id`);
--> statement-breakpoint

-- 7. Table: karigar_returns
CREATE TABLE IF NOT EXISTS `karigar_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`gross_weight_mg` integer NOT NULL,
	`purity_pct` real NOT NULL,
	`fine_weight_mg` integer NOT NULL,
	`return_date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `karigar_issues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_returns_issue` ON `karigar_returns` (`issue_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_returns_issue_created` ON `karigar_returns` (`issue_id`, `created_at`);
