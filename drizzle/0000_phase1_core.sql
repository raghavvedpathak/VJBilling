CREATE TABLE `safe_mode_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`activated_at` text,
	`cleared_at` text
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`audit_retention_days` integer DEFAULT 30 NOT NULL,
	`audit_retention_last_run_at` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`currency_symbol` text DEFAULT '₹' NOT NULL,
	`currency_decimal_places` integer DEFAULT 2 NOT NULL,
	`date_format_token` text DEFAULT 'dd/MM/yyyy' NOT NULL,
	`warn_unsaved_changes` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`firm_code` text NOT NULL,
	`proprietor` text NOT NULL,
	`gstin` text,
	`bis_licence` text,
	`bis_logo_ref` text,
	`firm_logo_ref` text,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`city` text NOT NULL,
	`state_code` text NOT NULL,
	`state_name` text NOT NULL,
	`pincode` text NOT NULL,
	`phone1` text NOT NULL,
	`phone2` text,
	`phone3` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firms_firm_code_unique` ON `firms` (`firm_code`);
--> statement-breakpoint
CREATE TABLE `financial_years` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `writer_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_type` text NOT NULL,
	`firm_id` text,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`device_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`firm_id` text,
	`entity_id` text,
	`device_id` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_delete_gate` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`gate_open` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bis_logos` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`file_ref` text NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`archived_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schema_version` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`current_version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_rates` (
	-- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`tax_name` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`tax_type` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_groups` (
	-- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`group_name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_group_components` (
	-- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
	`id` text PRIMARY KEY NOT NULL,
	`tax_group_id` text NOT NULL,
	`tax_rate_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_devices` (
	-- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`device_role` text NOT NULL,
	`is_enabled` integer DEFAULT 0 NOT NULL,
	`paired_at` text NOT NULL,
	`last_seen_at` text,
	`pairing_code` text
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	-- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`device_id` text NOT NULL,
	`target_device_id` text,
	`occurred_at` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE TABLE `audit_archive_index` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`fy_label` text NOT NULL,
	`archive_date` text NOT NULL,
	`row_count` integer NOT NULL,
	`storage_ref` text
);

--> statement-breakpoint
-- =============================================================================
-- MIGRATION ZERO SEED ROWS & CONSTITUTIONAL TRIGGERS
-- =============================================================================

INSERT INTO safe_mode_state (id, is_active) VALUES (1, 0);
--> statement-breakpoint
INSERT INTO app_settings (id, date_format_token, theme, audit_retention_days, audit_retention_last_run_at, currency, currency_symbol, currency_decimal_places, warn_unsaved_changes, updated_at) 
VALUES (1, 'dd/MM/yyyy', 'system', 30, NULL, 'INR', '₹', 2, 1, datetime('now'));
--> statement-breakpoint
INSERT INTO schema_version (id, current_version) VALUES (1, 1);
--> statement-breakpoint
INSERT INTO audit_delete_gate (id, gate_open) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_logs
BEGIN 
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be changed'); 
END;
--> statement-breakpoint
CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_logs
BEGIN 
  SELECT CASE 
    WHEN (SELECT gate_open FROM audit_delete_gate WHERE id = 1) = 0
    THEN RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be deleted outside the retention job') 
  END; 
END;
--> statement-breakpoint
CREATE TRIGGER prevent_firm_code_update BEFORE UPDATE OF firm_code ON firms
BEGIN 
  SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firm_code cannot be changed after creation'); 
END;
--> statement-breakpoint
CREATE TRIGGER safe_mode_row_guard AFTER INSERT ON schema_version
WHEN (SELECT COUNT(*) FROM safe_mode_state) = 0
BEGIN
  SELECT RAISE(ABORT, 'STORAGE_CORRUPTION_DETECTED: safe_mode_state row missing');
END;

--> statement-breakpoint
-- =============================================================================
-- CONSTITUTIONAL INDEXES (MIGRATION ZERO CHECKLIST — v7.39)
-- =============================================================================

-- 1. Enforce single active financial year per firm
CREATE UNIQUE INDEX `uq_one_active_fy_per_firm` ON `financial_years` (`firm_id`) WHERE status = 'ACTIVE';
--> statement-breakpoint
-- 2. Performance & Lookups (12 Canonical Indexes)
CREATE INDEX IF NOT EXISTS idx_writer_leases_expires ON writer_leases(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_date ON audit_logs(firm_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_status ON financial_years(firm_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_dates ON financial_years(firm_id, start_date, end_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_firms_archived ON firms(is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_bis_logos_firm_active ON bis_logos(firm_id, is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tax_rates_firm_active ON tax_rates(firm_id, is_active);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tax_groups_firm_active ON tax_groups(firm_id, is_active);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tax_group_components_group ON tax_group_components(tax_group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tax_group_components_rate ON tax_group_components(tax_rate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_archive_firm_fy ON audit_archive_index(firm_id, fy_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_event ON audit_logs(entity_id, event_type, firm_id, created_at DESC);