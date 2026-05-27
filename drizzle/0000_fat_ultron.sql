CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`audit_retention_days` integer DEFAULT 365 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`currency_symbol` text DEFAULT '₹' NOT NULL,
	`currency_decimal_places` integer DEFAULT 2 NOT NULL,
	`date_format_token` text DEFAULT 'dd/MM/yyyy' NOT NULL,
	`warn_unsaved_changes` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
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
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`metal` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`low_stock_threshold` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
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
CREATE TABLE `designs` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`metal` text NOT NULL,
	`purity_percent` real NOT NULL,
	`purity_karat` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
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
CREATE UNIQUE INDEX `firms_firm_code_unique` ON `firms` (`firm_code`);--> statement-breakpoint
CREATE TABLE `item_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`firm_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`sku` text NOT NULL,
	`huid` text,
	`design_id` text NOT NULL,
	`category_id` text NOT NULL,
	`metal` text NOT NULL,
	`purity_percent` real NOT NULL,
	`purity_karat` integer NOT NULL,
	`gross_weight_mg` integer NOT NULL,
	`net_weight_mg` integer NOT NULL,
	`stone_weight_mg` integer DEFAULT 0 NOT NULL,
	`metal_source` text DEFAULT 'PURCHASE' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`location` text,
	`invoice_id` text,
	`phantom_stock_id` text,
	`fy_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_sku_unique` ON `items` (`sku`);--> statement-breakpoint
CREATE TABLE `old_gold_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`customer_id` text,
	`lot_number` text NOT NULL,
	`metal` text NOT NULL,
	`gross_weight_mg` integer NOT NULL,
	`purity_percent` real NOT NULL,
	`fine_weight_mg` integer DEFAULT 0 NOT NULL,
	`metal_source` text DEFAULT 'OLD_GOLD' NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`purchase_rate_paise` integer,
	`total_amount_paise` integer,
	`notes` text,
	`received_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `safe_mode_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`activated_at` text,
	`cleared_at` text
);
--> statement-breakpoint
CREATE TABLE `schema_version` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`current_version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sequence_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`counter_type` text NOT NULL,
	`fy_id` text NOT NULL,
	`month` text NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_devices` (
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
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`device_id` text NOT NULL,
	`target_device_id` text,
	`occurred_at` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE TABLE `tax_group_components` (
	`id` text PRIMARY KEY NOT NULL,
	`tax_group_id` text NOT NULL,
	`tax_rate_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`group_name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_rates` (
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
CREATE TABLE `urd_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`urd_number` text NOT NULL,
	`old_gold_lot_id` text NOT NULL,
	`metal` text NOT NULL,
	`gross_weight_mg` integer NOT NULL,
	`purity_percent` real NOT NULL,
	`fine_weight_mg` integer NOT NULL,
	`rate_per_gram_paise` integer,
	`total_value_paise` integer NOT NULL,
	`payment_mode` text NOT NULL,
	`bank_account_id` text,
	`customer_aadhaar` text,
	`customer_pan` text,
	`purchase_date` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
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
