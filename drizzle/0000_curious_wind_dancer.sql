-- =============================================================================
-- PHASE 1: FOUNDATION TABLES (Strict Dependency Order)
-- =============================================================================

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
    -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1-7 service code.
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
    -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1-7 service code.
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

-- =============================================================================
-- PHASE 2: INVENTORY TABLES
-- =============================================================================

--> statement-breakpoint
CREATE TABLE `categories` (
    `id` text PRIMARY KEY NOT NULL,
    `firm_id` text NOT NULL,
    `name` text NOT NULL,
    `metal` text NOT NULL,
    `is_active` integer DEFAULT 1 NOT NULL,
    `code` text NOT NULL,
    `low_stock_threshold` integer,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `design_category_map` (
    `id` text PRIMARY KEY NOT NULL,
    `design_id` text NOT NULL,
    `category_id` text NOT NULL,
    `firm_id` text NOT NULL,
    `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_category_map_design_id_category_id_firm_id_unique` ON `design_category_map` (`design_id`,`category_id`,`firm_id`);
--> statement-breakpoint
CREATE TABLE `designs` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `code` text NOT NULL,
    `metal` text NOT NULL,
    `default_hsn` text,
    `firm_id` text NOT NULL,
    `is_active` integer DEFAULT 1 NOT NULL,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `designs_name_metal_firm_id_unique` ON `designs` (`name`,`metal`,`firm_id`);
--> statement-breakpoint
CREATE TABLE `gemstone_lots` (
    `id` text PRIMARY KEY NOT NULL,
    `firm_id` text NOT NULL,
    `stone_id` text NOT NULL,
    `name` text NOT NULL,
    `weight_carat_x100` integer NOT NULL,
    `quantity` integer DEFAULT 1 NOT NULL,
    `purchase_rate_paise_per_carat` integer,
    `total_purchase_amount_paise` integer,
    `supplier_name` text,
    `certification_ref` text,
    `status` text DEFAULT 'AVAILABLE' NOT NULL,
    `notes` text,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`stone_id`) REFERENCES `stones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hsn_codes` (
    `id` text PRIMARY KEY NOT NULL,
    `code` text NOT NULL,
    `description` text NOT NULL,
    `chapter` text DEFAULT '71' NOT NULL,
    `is_active` integer DEFAULT 1 NOT NULL,
    `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hsn_codes_code_unique` ON `hsn_codes` (`code`);
--> statement-breakpoint
CREATE TABLE `item_events` (
    `id` text PRIMARY KEY NOT NULL,
    `item_id` text NOT NULL,
    `firm_id` text NOT NULL,
    `event_type` text NOT NULL,
    `severity` text NOT NULL,
    `performed_by` text NOT NULL,
    `reason` text,
    `old_value` text,
    `new_value` text,
    `timestamp` text NOT NULL,
    FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
    `id` text PRIMARY KEY NOT NULL,
    `sku` text NOT NULL,
    `barcode` text NOT NULL,
    `barcode_reprint_required` integer DEFAULT 0 NOT NULL,
    `huid` text,
    `design_id` text NOT NULL,
    `category_id` text NOT NULL,
    `firm_id` text NOT NULL,
    `primary_stone_id` text,
    `metal` text NOT NULL,
    `purity_percent` real NOT NULL,
    `purity_karat` real NOT NULL,
    `gross_weight_mg` integer NOT NULL,
    `stone_weight_mg` integer DEFAULT 0 NOT NULL,
    `beads_weight_mg` integer DEFAULT 0 NOT NULL,
    `net_weight_mg` integer NOT NULL,
    `fine_weight_mg` integer NOT NULL,
    `wastage_percent` real DEFAULT 0 NOT NULL,
    `fine_gold_charged_mg` integer,
    `purchase_rate_paise` integer,
    `making_charge_paise` integer,
    `stone_cost_paise` integer,
    `location` text,
    `invoice_id` text,
    `phantom_stock_id` text,
    `hsn_code` text NOT NULL,
    `metal_source` text DEFAULT 'SUPPLIER_PURCHASE' NOT NULL,
    `status` text DEFAULT 'DRAFT' NOT NULL,
    `fy_id` text NOT NULL,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`primary_stone_id`) REFERENCES `stones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_sku_unique` ON `items` (`sku`);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_barcode_unique` ON `items` (`barcode`);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_huid_unique` ON `items` (`huid`);
--> statement-breakpoint
CREATE TABLE `old_gold_lots` (
    `id` text PRIMARY KEY NOT NULL,
    `firm_id` text NOT NULL,
    `received_from` text NOT NULL,
    `received_date` text NOT NULL,
    `gross_weight_mg` integer NOT NULL,
    `purity_percent` real NOT NULL,
    `metal_source` text DEFAULT 'CUSTOMER' NOT NULL,
    `notes` text,
    `status` text DEFAULT 'RECEIVED' NOT NULL,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    `customer_id` text,
    `fine_weight_mg` integer DEFAULT 0 NOT NULL,
    `purchase_rate_paise` integer,
    `total_amount_paise` integer,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sequence_counters` (
    `id` text PRIMARY KEY NOT NULL,
    `firm_id` text NOT NULL,
    `month` text NOT NULL,
    `year` text NOT NULL,
    `current_seq` integer DEFAULT 0 NOT NULL,
    `last_used_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stones` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `type` text NOT NULL,
    `firm_id` text NOT NULL,
    `is_active` integer DEFAULT 1 NOT NULL,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `urd_purchases` (
    `id` text PRIMARY KEY NOT NULL,
    `firm_id` text NOT NULL,
    `fy_id` text NOT NULL,
    `urd_number` text,
    `purchase_date` text NOT NULL,
    `customer_id` text,
    `customer_name` text NOT NULL,
    `customer_address` text,
    `customer_mobile` text,
    `customer_aadhaar` text,
    `customer_pan` text,
    `metal_type` text NOT NULL,
    `gross_weight_mg` integer NOT NULL,
    `purity_percent` real NOT NULL,
    `fine_weight_mg` integer NOT NULL,
    `rate_per_gram_paise` integer NOT NULL,
    `total_value_paise` integer NOT NULL,
    `payment_mode` text NOT NULL,
    `bank_account_id` text,
    `old_gold_lot_id` text NOT NULL,
    `status` text DEFAULT 'DRAFT' NOT NULL,
    `notes` text,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL,
    FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`old_gold_lot_id`) REFERENCES `old_gold_lots`(`id`) ON UPDATE no action ON DELETE no action
);


-- =============================================================================
-- MIGRATION ZERO SEED ROWS & CONSTITUTIONAL TRIGGERS
-- =============================================================================

INSERT INTO safe_mode_state (id, is_active) VALUES (1, 0);

INSERT INTO app_settings (id, date_format_token, theme, audit_retention_days, audit_retention_last_run_at, currency, currency_symbol, currency_decimal_places, warn_unsaved_changes, updated_at) 
VALUES (1, 'dd/MM/yyyy', 'system', 30, NULL, 'INR', '₹', 2, 1, datetime('now'));

INSERT INTO schema_version (id, current_version) VALUES (1, 1);

INSERT INTO audit_delete_gate (id, gate_open) VALUES (1, 0);

CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_logs
BEGIN 
  SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be changed'); 
END;

CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_logs
BEGIN 
  SELECT CASE 
    WHEN (SELECT gate_open FROM audit_delete_gate WHERE id = 1) = 0
    THEN RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: audit logs cannot be deleted outside the retention job') 
  END; 
END;

CREATE TRIGGER prevent_firm_code_update BEFORE UPDATE OF firm_code ON firms
BEGIN 
  SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firm_code cannot be changed after creation'); 
END;

CREATE TRIGGER safe_mode_row_guard AFTER INSERT ON schema_version
WHEN (SELECT COUNT(*) FROM safe_mode_state) = 0
BEGIN
  SELECT RAISE(ABORT, 'STORAGE_CORRUPTION_DETECTED: safe_mode_state row missing');
END;

CREATE TRIGGER prevent_phantom_stock_id_update BEFORE UPDATE OF phantom_stock_id ON items
FOR EACH ROW
WHEN OLD.phantom_stock_id IS NOT NULL AND OLD.phantom_stock_id != NEW.phantom_stock_id
BEGIN
  SELECT RAISE(ABORT, 'PHANTOM_STOCK_IMMUTABLE: phantom_stock_id cannot be changed once reconciled');
END;


-- =============================================================================
-- CONSTITUTIONAL INDEXES (MIGRATION ZERO CHECKLIST)
-- =============================================================================

-- 1. Enforce single active financial year per firm
CREATE UNIQUE INDEX `uq_one_active_fy_per_firm` ON `financial_years` (`firm_id`) WHERE status = 'ACTIVE';

-- 2. Performance & Lookups
CREATE INDEX IF NOT EXISTS idx_writer_leases_expires ON writer_leases(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_date ON audit_logs(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, firm_id);
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_status ON financial_years(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_years_firm_dates ON financial_years(firm_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_firms_archived ON firms(is_archived, id);
CREATE INDEX IF NOT EXISTS idx_bis_logos_firm_active ON bis_logos(firm_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_tax_rates_firm_active ON tax_rates(firm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tax_groups_firm_active ON tax_groups(firm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tax_group_components_group ON tax_group_components(tax_group_id);
CREATE INDEX IF NOT EXISTS idx_tax_group_components_rate ON tax_group_components(tax_rate_id);

CREATE INDEX IF NOT EXISTS idx_sync_log_firm_date ON sync_log(device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_devices_firm ON sync_devices(device_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_audit_archive_firm_fy ON audit_archive_index(firm_id, fy_id);

-- 3. Optimize Inventory Stock Summary Queries (Status-based partial indexes)
CREATE INDEX `idx_items_status_available` ON `items` (`firm_id`, `status`) WHERE status = 'AVAILABLE';
CREATE INDEX `idx_items_status_phantom` ON `items` (`firm_id`, `status`) WHERE status IN ('PHANTOM_AVAILABLE', 'PHANTOM_SOLD');
CREATE INDEX `idx_items_status_draft` ON `items` (`firm_id`, `status`) WHERE status = 'DRAFT';

-- 4. Optimize Reconciliation lookup
CREATE INDEX `idx_items_unreconciled_phantom` ON `items` (`firm_id`, `status`, `phantom_stock_id`) WHERE phantom_stock_id IS NULL AND status IN ('PHANTOM_AVAILABLE', 'PHANTOM_SOLD');