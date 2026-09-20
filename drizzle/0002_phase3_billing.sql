-- Migration 0004_phase3_billing.sql — Phase 3 Customer Master & Money Truth
-- Adheres to STEP 1 Specification (v5.5 / v5.9 FIX-CUSTOMER-URD-1)

CREATE TABLE IF NOT EXISTS `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`name` text NOT NULL,
	`mobile` text,
	`gstin` text,
	`address` text,
	`aadhaar_number` text,
	`pan_number` text,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customers_firm_name` ON `customers` (`firm_id`, `name`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customers_firm_mobile` ON `customers` (`firm_id`, `mobile`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`mobile` text,
	`gstin` text,
	`address` text,
	`type` text DEFAULT 'SUPPLIER' NOT NULL,
	`bank_name` text,
	`bank_account` text,
	`ifsc` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_suppliers_firm_name` ON `suppliers` (`firm_id`, `name`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_suppliers_firm_mobile` ON `suppliers` (`firm_id`, `mobile`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `karigar` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`mobile` text,
	`address` text,
	`speciality` text,
	`bank_name` text,
	`bank_account` text,
	`ifsc` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_firm_name` ON `karigar` (`firm_id`, `name`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_firm_mobile` ON `karigar` (`firm_id`, `mobile`) WHERE `is_deleted` = 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `karigar_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text,
	`karigar_id` text NOT NULL,
	`type` text NOT NULL,
	`weight_mg` integer DEFAULT 0 NOT NULL,
	`purity_pct` real DEFAULT 0 NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`rate_paise_per_gram` integer DEFAULT 0 NOT NULL,
	`is_manual_rate` integer DEFAULT 0 NOT NULL,
	`linked_entity_id` text,
	`linked_job_work_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`karigar_id`) REFERENCES `karigar`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_ledger_karigar` ON `karigar_ledger` (`firm_id`, `karigar_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_ledger_firm_karigar` ON `karigar_ledger` (`firm_id`, `karigar_id`, `type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_ledger_firm_type` ON `karigar_ledger` (`firm_id`, `type`, `karigar_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_karigar_ledger_job_work` ON `karigar_ledger` (`linked_job_work_id`) WHERE `linked_job_work_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invoice_number_config` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`prefix` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`allow_manual_override` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_inv_num_cfg_unique` ON `invoice_number_config` (`firm_id`, `fy_id`, `doc_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invoice_print_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`paper_size` text DEFAULT 'A5' NOT NULL,
	`orientation` text DEFAULT 'LANDSCAPE' NOT NULL,
	`show_terms_and_conditions` integer DEFAULT 0 NOT NULL,
	`terms_and_conditions_text` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invoice_print_settings_firm` ON `invoice_print_settings` (`firm_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`invoice_number` text,
	`invoice_date` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`metal_rate_paise_per_gram` integer NOT NULL,
	`is_manual_rate` integer DEFAULT 0 NOT NULL,
	`making_charges_mode` text DEFAULT 'FLAT' NOT NULL,
	`making_charges_paise` integer DEFAULT 0 NOT NULL,
	`taxable_metal_amt_paise` integer DEFAULT 0 NOT NULL,
	`taxable_making_amt_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`stone_amt_paise` integer DEFAULT 0 NOT NULL,
	`old_metal_deduction_paise` integer DEFAULT 0 NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`net_payable_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`posted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sale_invoices_firm_status` ON `sale_invoices` (`firm_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sale_invoices_num` ON `sale_invoices` (`firm_id`, `invoice_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`stock_lot_id` text NOT NULL,
	`sku` text,
	`item_name` text NOT NULL,
	`metal` text NOT NULL,
	`purity_pct` real NOT NULL,
	`gross_weight_mg` integer,
	`stone_weight_mg` integer DEFAULT 0,
	`net_weight_mg` integer,
	`fine_weight_mg` integer,
	`hsn_code` text,
	`stone_amount_paise` integer DEFAULT 0 NOT NULL,
	`metal_value_paise` integer DEFAULT 0 NOT NULL,
	`making_charges_paise` integer DEFAULT 0 NOT NULL,
	`line_gst_paise` integer DEFAULT 0 NOT NULL,
	`line_total_paise` integer DEFAULT 0 NOT NULL,
	`metal_tax_group_id` text,
	`making_tax_group_id` text,
	`line_type` text DEFAULT 'SERIALIZED_ITEM' NOT NULL,
	`qty_sold` integer,
	`weight_sold_mg` integer,
	FOREIGN KEY (`invoice_id`) REFERENCES `sale_invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sale_invoice_items_invoice` ON `sale_invoice_items` (`invoice_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sale_invoice_items_stock` ON `sale_invoice_items` (`stock_lot_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `estimate_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`customer_id` text,
	`estimate_number` text,
	`estimate_date` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`metal_rate_paise_per_gram` integer NOT NULL,
	`is_manual_rate` integer DEFAULT 0 NOT NULL,
	`making_charges_mode` text DEFAULT 'FLAT' NOT NULL,
	`making_charges_paise` integer DEFAULT 0 NOT NULL,
	`net_payable_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`converted_invoice_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`converted_invoice_id`) REFERENCES `sale_invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_estimate_invoices_firm_status` ON `estimate_invoices` (`firm_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_estimate_invoices_num` ON `estimate_invoices` (`firm_id`, `estimate_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `estimate_items` (
	`id` text PRIMARY KEY NOT NULL,
	`estimate_id` text NOT NULL,
	`stock_lot_id` text NOT NULL,
	`sku` text,
	`item_name` text NOT NULL,
	`metal` text NOT NULL,
	`purity_pct` real NOT NULL,
	`gross_weight_mg` integer,
	`stone_weight_mg` integer DEFAULT 0,
	`net_weight_mg` integer,
	`fine_weight_mg` integer,
	`hsn_code` text,
	`metal_value_paise` integer DEFAULT 0 NOT NULL,
	`making_charges_paise` integer DEFAULT 0 NOT NULL,
	`line_total_paise` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimate_invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_estimate_items_estimate` ON `estimate_items` (`estimate_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_estimate_items_stock` ON `estimate_items` (`stock_lot_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text,
	`party_id` text NOT NULL,
	`party_type` text NOT NULL,
	`type` text DEFAULT 'DEBIT' NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`linked_entity_type` text,
	`linked_entity_id` text,
	`description` text,
	`created_at` text NOT NULL,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`notes` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ledger_entries_party` ON `ledger_entries` (`firm_id`, `party_id`, `party_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ledger_entries_firm_party` ON `ledger_entries` (`firm_id`, `party_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ledger_entries_linked` ON `ledger_entries` (`firm_id`, `linked_entity_id`, `linked_entity_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text,
	`party_id` text NOT NULL,
	`party_type` text NOT NULL,
	`type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`mode` text NOT NULL,
	`bank_account_id` text,
	`status` text DEFAULT 'PAID' NOT NULL,
	`reason` text,
	`linked_invoice_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payments_party` ON `payments` (`firm_id`, `party_id`, `party_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payments_invoice` ON `payments` (`firm_id`, `linked_invoice_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payments_date` ON `payments` (`firm_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `supplier_metal_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`metal_weight_mg` integer DEFAULT 0 NOT NULL,
	`metal_purity_pct` real DEFAULT 0 NOT NULL,
	`metal_fine_weight_mg` integer DEFAULT 0 NOT NULL,
	`metal_rate_paise_per_gram` integer DEFAULT 0 NOT NULL,
	`metal_value_paise` integer DEFAULT 0 NOT NULL,
	`money_amount_paise` integer DEFAULT 0 NOT NULL,
	`money_mode` text,
	`bank_account_id` text,
	`total_value_paise` integer NOT NULL,
	`linked_purchase_invoice_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_smp_firm_supplier` ON `supplier_metal_payments` (`firm_id`, `supplier_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_smp_invoice` ON `supplier_metal_payments` (`linked_purchase_invoice_id`) WHERE `linked_purchase_invoice_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`original_invoice_id` text NOT NULL,
	`cn_number` text NOT NULL,
	`cn_date` text NOT NULL,
	`reason` text NOT NULL,
	`returned_item_ids` text NOT NULL,
	`credit_amount_paise` integer NOT NULL,
	`is_partial` integer DEFAULT 0 NOT NULL,
	`remaining_old_metal_credit_paise` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `sale_invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_notes_firm_status` ON `credit_notes` (`firm_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_notes_num` ON `credit_notes` (`firm_id`, `cn_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_notes_invoice` ON `credit_notes` (`original_invoice_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`original_invoice_id` text NOT NULL,
	`dn_number` text NOT NULL,
	`entry_date` text NOT NULL,
	`reason` text NOT NULL,
	`additional_amount_paise` integer NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `sale_invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_debit_notes_firm_status` ON `debit_notes` (`firm_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_debit_notes_num` ON `debit_notes` (`firm_id`, `dn_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_debit_notes_invoice` ON `debit_notes` (`original_invoice_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_debit_notes_customer` ON `debit_notes` (`firm_id`, `customer_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fy_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_invoice_number` text,
	`supplier_invoice_date` text NOT NULL,
	`invoice_number` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`taxable_amount_paise` integer NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`total_amount_paise` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`posted_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fy_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_purchase_invoices_firm_status` ON `purchase_invoices` (`firm_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_purchase_invoices_num` ON `purchase_invoices` (`firm_id`, `invoice_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_purchase_invoices_supplier` ON `purchase_invoices` (`firm_id`, `supplier_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`item_description` text NOT NULL,
	`metal_type` text,
	`gross_weight_mg` integer DEFAULT 0 NOT NULL,
	`purity_pct` real DEFAULT 0 NOT NULL,
	`fine_weight_mg` integer DEFAULT 0 NOT NULL,
	`rate_per_gram_paise` integer DEFAULT 0 NOT NULL,
	`taxable_amount_paise` integer NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`line_total_paise` integer NOT NULL,
	`hsn_code` text,
	`created_item_id` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pii_invoice` ON `purchase_invoice_items` (`invoice_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_holder` text NOT NULL,
	`account_number` text NOT NULL,
	`ifsc` text NOT NULL,
	`branch` text,
	`upi_ids` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bank_accounts_firm_default` ON `bank_accounts` (`firm_id`, `is_default`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bank_accounts_firm_archived` ON `bank_accounts` (`firm_id`, `is_archived`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bank_accounts_firm_acc_num` ON `bank_accounts` (`firm_id`, `account_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `migration_log` (
	`id` text PRIMARY KEY NOT NULL,
	`step_key` text NOT NULL UNIQUE,
	`description` text,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rate_engine_config` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`gold_24_base_per_10g_paise` integer NOT NULL,
	`gold_22_base_per_10g_paise` integer NOT NULL,
	`gold_cash_per_10g_paise` integer NOT NULL,
	`silver_cash_per_kg_paise` integer NOT NULL,
	`last_updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);

