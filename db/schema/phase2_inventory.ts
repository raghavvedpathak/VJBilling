import { sqliteTable, text, integer, real, foreignKey, unique } from 'drizzle-orm/sqlite-core';
import { firms, type Metal } from './phase1_core';
// PHASE 2 — INVENTORY TRUTH LAYER (Migration 0002)
// =============================================================================

// PURITY HELPERS (Step 2 — in-memory constants, no DB table)
export const PURITY_MAP: Record<number, number> = {
  24: 99.9, 22: 91.6, 20: 83.3, 18: 75.0, 17: 70.8,
  14: 58.5, 10: 41.7, 9: 37.5,
  // Silver: use purityKarat=0 with explicit purityPercent
};

export const PURITY_PERCENT_EXTENDED: Record<number, number> = {
  // Maps exact purityPercent → karat (checked first in percentToKarat)
  99.99: 24, // BIS 9999 — 4-nine fine (v1.57 FIX-24K-PURITY-1)
  99.50: 24, // BIS 995 — hallmarked 24K fine gold
};

export function karatToPercent(karat: number): number {
  return PURITY_MAP[karat] ?? 0;
}

export function percentToKarat(percent: number): number {
  // Check extended map first (exact match for 99.99, 99.50)
  const extended = PURITY_PERCENT_EXTENDED[percent];
  if (extended !== undefined) return extended;
  // Tolerance search in PURITY_MAP (±0.05%)
  for (const [k, p] of Object.entries(PURITY_MAP)) {
    if (Math.abs(p - percent) < 0.05) return Number(k);
  }
  return 0; // silver or unknown
}

export function getDisplayPurity(metal: Metal, purityPercent: number, purityKarat: number): string {
  if (metal === 'SILVER') return `${purityPercent.toFixed(2)}%`;
  const k = percentToKarat(purityPercent) || purityKarat;
  return `${k}K (${purityPercent.toFixed(2)}%)`;
}

// Categories
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  name: text('name').notNull(),
  metal: text('metal', { enum: ['GOLD', 'SILVER'] }).notNull(),
  isActive: integer('is_active').notNull().default(1),
  code: text('code').notNull(), // CAT-DES-DISPLAY-CODE (v1.42): e.g. CAT0001
  lowStockThreshold: integer('low_stock_threshold'), // v1.66 FEAT-GAP3-LOWSTOCK-1 (nullable)
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
})); 

// Designs
export const designs = sqliteTable('designs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(), // CAT-DES-DISPLAY-CODE (v1.42): e.g. DES0001
  metal: text('metal', { enum: ['GOLD', 'SILVER'] }).notNull(),
  defaultHsn: text('default_hsn'),
  firmId: text('firm_id').notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  uniqueDesign: unique().on(table.name, table.metal, table.firmId), // FIX-CAT-ITEM-FK (v1.42)
}));

// Items (individual SKUs)
export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  barcode: text('barcode').notNull().unique(), // = sku
  barcodeReprintRequired: integer('barcode_reprint_required').notNull().default(0),
  huid: text('huid').unique(), // FIX-HUID-FORMAT-1 (v1.44) + FIX-HUID-ONCE-1 (v1.45)
  designId: text('design_id').notNull(),
  categoryId: text('category_id').notNull(), // FIX-CAT-ITEM-FK (v1.42)
  firmId: text('firm_id').notNull(),
  primaryStoneId: text('primary_stone_id'),
  metal: text('metal', { enum: ['GOLD', 'SILVER'] }).notNull(),
  purityPercent: real('purity_percent').notNull(),
  purityKarat: real('purity_karat').notNull(),
  grossWeightMg: integer('gross_weight_mg').notNull(),
  stoneWeightMg: integer('stone_weight_mg').notNull().default(0),
  beadsWeightMg: integer('beads_weight_mg').notNull().default(0),
  netWeightMg: integer('net_weight_mg').notNull(), // PHYSICAL: gross - stone - beads
  fineWeightMg: integer('fine_weight_mg').notNull(), // PHYSICAL: round(net x purity / 100)
  wastagePercent: real('wastage_percent').notNull().default(0),
  fineGoldChargedMg: integer('fine_gold_charged_mg'), // nullable
  purchaseRatePaise: integer('purchase_rate_paise'), // nullable
  makingChargePaise: integer('making_charge_paise'), // nullable
  stoneCostPaise: integer('stone_cost_paise'), // nullable
  location: text('location'), // nullable
  invoiceId: text('invoice_id'), // nullable DORMANT
  phantomStockId: text('phantom_stock_id'), // nullable
  hsnCode: text('hsn_code').notNull(), // GST HSN code
  metalSource: text('metal_source', {
    enum: ['CUSTOMER','KARIGAR','EXCHANGE','PURCHASE','MELT_OUTPUT',
           'CUSTOMER_OLD_GOLD','SUPPLIER_PURCHASE','REFINERY_OUTPUT',
           'JOB_WORK_RETURN','OPENING_BALANCE']
  }).notNull().default('SUPPLIER_PURCHASE'),
  status: text('status', {
    enum: ['DRAFT','AVAILABLE','SOLD','SENT_TO_REFINERY','MELTED','DAMAGED','RETURNED','SENT_TO_MELT','SENT_TO_KARIGAR','PHANTOM_AVAILABLE','PHANTOM_SOLD']
  }).notNull().default('DRAFT'),
  fyId: text('fy_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  designFk: foreignKey({ columns: [table.designId], foreignColumns: [designs.id] }),
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  stoneFk: foreignKey({ columns: [table.primaryStoneId], foreignColumns: [stones.id] }),
}));

// Item Events (append-only audit trail per item)
export const itemEvents = sqliteTable('item_events', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  firmId: text('firm_id').notNull(),
  eventType: text('event_type', {
    enum: ['CREATED','ITEM_STATUS_CHANGED','WEIGHT_ADJUSTED', 
    'HUID_ADDED','BARCODE_REPRINTED','ITEM_RETURNED',
    'ITEM_SENT_TO_KARIGAR','ITEM_RETURNED_FROM_KARIGAR','ITEM_EDITED','PHANTOM_CREATED','PHANTOM_RECONCILED']
  }).notNull(),
  severity: text('severity', { enum: ['INFO','WARNING','ERROR'] }).notNull(),
  performedBy: text('performed_by').notNull(), // deviceId
  reason: text('reason'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  timestamp: text('timestamp').notNull(),
}, (table) => ({
  itemFk: foreignKey({ columns: [table.itemId], foreignColumns: [items.id] }).onDelete('restrict'),
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
}));

// SCHEMA-1 FIX (v1.8): sequenceCounters table
export const sequenceCounters = sqliteTable('sequence_counters', {
  id: text('id').primaryKey(), // format: '{firmId}_{MMYY}'
  firmId: text('firm_id').notNull(),
  month: text('month').notNull(), // MMYY format e.g. '0226'
  year: text('year').notNull(), // 4-digit year e.g. '2026'
  currentSeq: integer('current_seq').notNull().default(0),
  lastUsedAt: text('last_used_at').notNull(), 
  // FIX-URD-SEQ-ARCH-1 (v1.53): TWO SEQUENCE SCOPES — SAME TABLE, DIFFERENT KEY FORMAT.
  // SKU items: key = '{firmId}_{MMYY}' — month-scoped
  // Documents: key = '{firmId}_{type}_{fyLabel}' — FY-scoped
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
})); 

// Old Gold Lots (BLOCK-4 v1.15)
export const oldGoldLots = sqliteTable('old_gold_lots', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  receivedFrom: text('received_from').notNull(),
  receivedDate: text('received_date').notNull(), // ISO date YYYY-MM-DD
  grossWeightMg: integer('gross_weight_mg').notNull(),
  purityPercent: real('purity_percent').notNull(),
  metalSource: text('metal_source').notNull().default('CUSTOMER'),
  notes: text('notes'),
  status: text('status', {
    enum: ['RECEIVED','PENDING','SENT_TO_REFINERY','SETTLED','SENT_TO_MELT','ISSUED_TO_KARIGAR']
  }).notNull().default('RECEIVED'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  customerId: text('customer_id'),
  fineWeightMg: integer('fine_weight_mg').notNull().default(0),
  purchaseRatePaise: integer('purchase_rate_paise'),
  totalAmountPaise: integer('total_amount_paise'),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
}));

// FIX-URD-1 (v1.49): urd_purchases table — standalone purchase of old gold/jewellery from unregistered customer
export const urdPurchases = sqliteTable('urd_purchases', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  fyId: text('fy_id').notNull(),
  urdNumber: text('urd_number'), // null until CONFIRMED
  purchaseDate: text('purchase_date').notNull(), // ISO date YYYY-MM-DD
  customerId: text('customer_id'), // nullable FK -> customers.id
  customerName: text('customer_name').notNull(),
  customerAddress: text('customer_address'),
  customerMobile: text('customer_mobile'),
  customerAadhaar: text('customer_aadhaar'), // OPTIONAL
  customerPAN: text('customer_pan'), // OPTIONAL
  metalType: text('metal_type').notNull(), // 'GOLD' | 'SILVER'
  grossWeightMg: integer('gross_weight_mg').notNull(),
  purityPercent: real('purity_percent').notNull(),
  fineWeightMg: integer('fine_weight_mg').notNull(),
  ratePerGramPaise: integer('rate_per_gram_paise').notNull(),
  totalValuePaise: integer('total_value_paise').notNull(),
  paymentMode: text('payment_mode').notNull(), // 'CASH' | 'BANK' | 'UPI'
  bankAccountId: text('bank_account_id'),
  oldGoldLotId: text('old_gold_lot_id').notNull(), // FK -> old_gold_lots.id
  status: text('status', {
    enum: ['DRAFT', 'CONFIRMED']
  }).notNull().default('DRAFT'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  lotFk: foreignKey({ columns: [table.oldGoldLotId], foreignColumns: [oldGoldLots.id] }),
}));

// Design-Category Map (Phase 6 analytics denormalization)
export const designCategoryMap = sqliteTable('design_category_map', {
  id: text('id').primaryKey(),
  designId: text('design_id').notNull(),
  categoryId: text('category_id').notNull(),
  firmId: text('firm_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  uniqueDCM: unique().on(table.designId, table.categoryId, table.firmId),
}));

// Stones (Stone Master)
export const stones = sqliteTable('stones', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'DIAMOND' | 'RUBY' | 'EMERALD' | 'SAPPHIRE'
  firmId: text('firm_id').notNull(),
  isActive: integer('is_active').default(1).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
}));

// Gemstone Lots (Step 4.5)
export const gemstoneLots = sqliteTable('gemstone_lots', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  stoneId: text('stone_id').notNull(), // FK -> stones.id
  name: text('name').notNull(), // e.g. 'Round Diamond 0.50ct'
  weightCaratX100: integer('weight_carat_x100').notNull(),
  quantity: integer('quantity').notNull().default(1),
  purchaseRatePaisePerCarat: integer('purchase_rate_paise_per_carat'),
  totalPurchaseAmountPaise: integer('total_purchase_amount_paise'),
  supplierName: text('supplier_name'),
  certificationRef: text('certification_ref'), // Phase 3 reads for invoice
  status: text('status', { enum: ['AVAILABLE','SOLD','DAMAGED'] }).notNull().default('AVAILABLE'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  stoneFk: foreignKey({ columns: [table.stoneId], foreignColumns: [stones.id] }),
}));

// HSN Code Master (FIX-HSN-MASTER-1 v1.46)
export const hsnCodes = sqliteTable('hsn_codes', {
  id: text('id').primaryKey(), // uuid
  code: text('code').notNull().unique(), // '7113', '711311', etc.
  description: text('description').notNull(), // human-readable label
  chapter: text('chapter').notNull().default('71'), // '71' for jewellery
  isActive: integer('is_active').notNull().default(1), // 1=active 0=deactivated
  createdAt: text('created_at').notNull(), // ISO timestamp
});