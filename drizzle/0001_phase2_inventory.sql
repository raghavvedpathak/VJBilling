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
CREATE UNIQUE INDEX `design_category_map_design_id_category_id_firm_id_unique` ON `design_category_map` (`design_id`,`category_id`,`firm_id`);--> statement-breakpoint
CREATE TABLE `designs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`metal` text NOT NULL,
	`default_hsn` text,
	`firm_id` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`low_stock_threshold` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `designs_name_metal_firm_id_unique` ON `designs` (`name`,`metal`,`firm_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `hsn_codes_code_unique` ON `hsn_codes` (`code`);--> statement-breakpoint
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
	`purity_rounding_delta_mg` integer DEFAULT 0 NOT NULL,
	`wastage_percent` real DEFAULT 0 NOT NULL,
	`fine_gold_charged_mg` integer,
	`purchase_rate_paise` integer,
	`making_charge_paise` integer,
	`stone_cost_paise` integer,
	`location` text,
	`invoice_id` text,
	`phantom_stock_id` text,
	`hsn_code` text NOT NULL,
	`size_value` real,
	`size_unit` text,
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
CREATE UNIQUE INDEX `items_sku_unique` ON `items` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_barcode_unique` ON `items` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_huid_unique` ON `items` (`huid`);--> statement-breakpoint
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
	`purity_rounding_delta_mg` integer DEFAULT 0 NOT NULL,
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

--> statement-breakpoint
-- =============================================================================
-- CONSTITUTIONAL TRIGGERS & INDEXES (PHASE 2 INVENTORY)
-- =============================================================================

CREATE TRIGGER prevent_phantom_stock_id_update BEFORE UPDATE OF phantom_stock_id ON items
FOR EACH ROW
WHEN OLD.phantom_stock_id IS NOT NULL AND OLD.phantom_stock_id != NEW.phantom_stock_id
BEGIN
  SELECT RAISE(ABORT, 'PHANTOM_STOCK_IMMUTABLE: phantom_stock_id cannot be changed once reconciled');
END;
--> statement-breakpoint
-- 3. Constitutional Indexes - Search & Performance (Phase 2)
CREATE INDEX IF NOT EXISTS idx_items_firm_status ON items(firm_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_design_id ON items(design_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_designs_firm_id ON designs(firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_old_gold_lots_firm ON old_gold_lots(firm_id, status, metal_source);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gemstone_lots_firm_status ON gemstone_lots(firm_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gemstone_lots_name ON gemstone_lots(name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_design_status ON items(design_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku, firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_huid ON items(huid) WHERE huid IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_category_status ON items(firm_id, category_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_invoice ON items(invoice_id) WHERE invoice_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_phantom_available ON items(firm_id, phantom_stock_id) WHERE status = 'PHANTOM_AVAILABLE';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_phantom_sold ON items(firm_id, phantom_stock_id) WHERE status = 'PHANTOM_SOLD';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events(item_id, firm_id, timestamp DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_item_events_firm_type ON item_events(firm_id, event_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_designs_firm_active ON designs(firm_id, is_active);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_designs_firm_metal ON designs(firm_id, metal);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_categories_firm_active ON categories(firm_id, is_active);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sequence_counters_firm_month ON sequence_counters(firm_id, month);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_urd_purchases_fy ON urd_purchases(firm_id, fy_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dcm_design ON design_category_map(design_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dcm_category ON design_category_map(category_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_hsn_code ON hsn_codes(code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_hsn_chapter ON hsn_codes(chapter);

-- MIGRATION: 0002_phase2_inventory.sql addendum (v1.49)
-- FIX-OLDGOLD-CUSTOMER-1: customerId FK on old_gold_lots
ALTER TABLE old_gold_lots ADD COLUMN customer_id TEXT REFERENCES customers(id); 
-- FIX-CUSTOMERS-FK-SCOPE-1 (v1.50): customers table is Phase 3 scope and does NOT exist
-- when this Phase 2 migration runs. SQLite FK enforcement is OFF by default in expo-sqlite 
-- (PRAGMA foreign_keys = OFF), so this will not blow up at runtime. The FK declaration 
-- is forward-declared as an architectural contract — it becomes enforced once Phase 3 
-- creates the customers table. This is accepted, documented, and intentional. 

-- FIX-OLDGOLD-COST-1 (v1.51): Add cost tracking columns to old_gold_lots.
-- fineWeightMg: derived at insert time, DEFAULT 0 is migration-safe for existing rows.
-- purchaseRatePaise: nullable — not always known at lot creation.
-- totalAmountPaise: nullable — null when purchaseRatePaise is null.
ALTER TABLE old_gold_lots ADD COLUMN fine_weight_mg INTEGER NOT NULL DEFAULT 0; 
ALTER TABLE old_gold_lots ADD COLUMN purchase_rate_paise INTEGER; 
ALTER TABLE old_gold_lots ADD COLUMN total_amount_paise INTEGER; 

-- v1.91 FEAT-PURITY-ROUND-1 (extended): purity rounding delta for MELT_OUTPUT (refinery-returned) lots only
ALTER TABLE old_gold_lots ADD COLUMN purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_old_gold_lots_customer
 ON old_gold_lots(firm_id, customer_id) WHERE customer_id IS NOT NULL;

-- FIX-URD-1: urd_purchases table
CREATE TABLE IF NOT EXISTS urd_purchases (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 fy_id TEXT NOT NULL REFERENCES financial_years(id),
 urd_number TEXT,
 purchase_date TEXT NOT NULL,
 customer_id TEXT REFERENCES customers(id), -- Phase 3 FK (FIX-CUSTOMERS-FK-SCOPE-1 v1.50): customers table created in Phase 3. SQLite FK enforcement OFF at Phase 2 build time — accepted and documented.
 customer_name TEXT NOT NULL,
 customer_address TEXT,
 customer_mobile TEXT,
 customer_aadhaar TEXT,
 customer_pan TEXT,
 metal_type TEXT NOT NULL,
 gross_weight_mg INTEGER NOT NULL,
 purity_percent REAL NOT NULL,
 fine_weight_mg INTEGER NOT NULL,
 rate_per_gram_paise INTEGER NOT NULL,
 total_value_paise INTEGER NOT NULL,
 payment_mode TEXT NOT NULL,
 bank_account_id TEXT,
 old_gold_lot_id TEXT NOT NULL REFERENCES old_gold_lots(id),
 status TEXT NOT NULL DEFAULT 'DRAFT',
 notes TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_urd_purchases_firm
 ON urd_purchases(firm_id, status, purchase_date);

CREATE INDEX IF NOT EXISTS idx_urd_purchases_customer
 ON urd_purchases(firm_id, customer_id) WHERE customer_id IS NOT NULL;

-- FIX-URD-SEQ-1: Add 'URD' to sequence_counters valid types
-- sequenceCounters already stores type as free text — no schema change required.
-- Document that valid type values are: 'SALE' | 'CREDIT_NOTE' | 'URD'

-- ADDENDUM: Missing columns for items and audit_logs index merged from generate
ALTER TABLE items ADD COLUMN size_value REAL;
ALTER TABLE items ADD COLUMN size_unit TEXT;
ALTER TABLE items ADD COLUMN purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_event 
 ON audit_logs(entity_id, event_type, firm_id, created_at DESC);

-- FIX-GAP-P2-SIZE-3 (v1.76): partial index for size filter
CREATE INDEX IF NOT EXISTS idx_items_size 
 ON items(firm_id, size_unit, size_value) WHERE size_value IS NOT NULL;

-- FIX-LOWSTOCK-DESIGN-1 (v2.08): designs low_stock_threshold column migration fallback
ALTER TABLE designs ADD COLUMN low_stock_threshold integer;

