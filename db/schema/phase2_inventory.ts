import { sqliteTable, text, integer, real, index, foreignKey, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { isNotNull, sql } from 'drizzle-orm';
import { firms } from './phase1_core';

// PHASE 2 — INVENTORY TRUTH LAYER (v2.15 SPECIFICATION)
// =============================================================================

// PURITY HELPERS (Step 6.1 — in-memory constants, no DB table)
export const PURITY_MAP: Record<number, number> = {
  24: 99.9,
  23: 95.8,
  22: 91.6,
  21: 87.5,
  20: 83.3,
  18: 75.0,
  14: 58.3,
  10: 41.7,
  9: 37.5,
};

export const PURITY_PERCENT_EXTENDED: Record<number, number> = {
  // Maps exact purityPercent → karat (checked first in percentToKarat)
  99.99: 24, // BIS 9999 — 4-nine fine (v1.57 FIX-24K-PURITY-1)
  99.50: 24, // BIS 995 — hallmarked 24K fine gold
};

export function karatToPercent(karat: number): number {
  return PURITY_MAP[karat] ?? 0;
}

export function percentToKarat(percent: number): number | null {
  // Check extended map first (exact match for 99.99, 99.50)
  const extended = PURITY_PERCENT_EXTENDED[percent];
  if (extended !== undefined) return extended;
  // Tolerance search in PURITY_MAP (±0.05%)
  for (const [k, p] of Object.entries(PURITY_MAP)) {
    if (Math.abs(p - percent) < 0.05) return Number(k);
  }
  return null; // silver or non-standard custom purity
}

// Categories (Step 2 — ARCH-FLAT-CAT v1.42: Flat structure, no metal column)
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firmId: text('firm_id').notNull(),
  isActive: integer('is_active').notNull().default(1),
  code: text('code').notNull(), // CAT-DES-DISPLAY-CODE (v1.42): e.g. CAT0001
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxCategoriesFirmActive: index('idx_categories_firm_active').on(table.firmId, table.isActive),
})); 

// Designs (Step 3)
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
  // lowStockThreshold REMOVED (v2.13, FIX-LOWSTOCK-PURITYGRAIN-1) — moved to design_purity_thresholds below
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  uniqueDesign: unique().on(table.name, table.metal, table.firmId), // FIX-CAT-ITEM-FK (v1.42)
  idxDesignsFirmId: index('idx_designs_firm_id').on(table.firmId),
  idxDesignsFirmActive: index('idx_designs_firm_active').on(table.firmId, table.isActive),
  idxDesignsFirmMetal: index('idx_designs_firm_metal').on(table.firmId, table.metal),
}));

// Design Purity Thresholds (Step 3 / Step 9-Lite GAP-3 — FIX-LOWSTOCK-PURITYGRAIN-1 v2.13)
export const designPurityThresholds = sqliteTable('design_purity_thresholds', {
  designId: text('design_id').notNull(),
  purityPercent: real('purity_percent').notNull(),
  lowStockThreshold: integer('low_stock_threshold').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.designId, table.purityPercent] }),
  designFk: foreignKey({ columns: [table.designId], foreignColumns: [designs.id] }),
}));

// Items (individual SKUs - Step 6)
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
  metal: text('metal', { enum: ['GOLD', 'SILVER'] }).notNull(), // FEAT-ITEM-METAL-DENORM-1 (v1.95)
  purityPercent: real('purity_percent').notNull(),
  purityKarat: real('purity_karat').notNull(),
  grossWeightMg: integer('gross_weight_mg').notNull(),
  stoneWeightMg: integer('stone_weight_mg').notNull().default(0),
  beadsWeightMg: integer('beads_weight_mg').notNull().default(0),
  netWeightMg: integer('net_weight_mg').notNull(), // PHYSICAL: gross - stone - beads
  fineWeightMg: integer('fine_weight_mg').notNull(), // PHYSICAL: round(net x purity / 100)
  purityRoundingDeltaMg: integer('purity_rounding_delta_mg').notNull().default(0), // FEAT-PURITY-ROUND-1 (v1.90)
  wastagePercent: real('wastage_percent').notNull().default(0), // FIX-WAST-1 (v1.26)
  fineGoldChargedMg: integer('fine_gold_charged_mg'), // nullable (FIX-WAST-2 v1.26)
  purchaseRatePaise: integer('purchase_rate_paise'), // nullable (FIX-WAST-3 v1.26)
  makingChargePaise: integer('making_charge_paise'), // nullable (FIX-COST-1 v1.40)
  stoneCostPaise: integer('stone_cost_paise'), // nullable (FIX-COST-2 v1.40)
  location: text('location'), // nullable (FIX-LOC-1 v1.40)
  invoiceId: text('invoice_id'), // nullable DORMANT (FIX-INV-1 v1.40)
  phantomStockId: text('phantom_stock_id'), // nullable (FEAT-PHANTOM-INVENTORY-1 v1.67)
  hsnCode: text('hsn_code').notNull(), // GST HSN code (FIX-HSN-ITEM-1 v1.44)
  sizeValue: real('size_value'), // FIX-GAP-P2-SIZE-2 (v1.76)
  sizeUnit: text('size_unit', { enum: ['INCH','MM','CM','RING_SIZE'] }), // FIX-GAP-P2-SIZE-2 (v1.76)
  metalSource: text('metal_source', {
    enum: ['CUSTOMER','KARIGAR','EXCHANGE','PURCHASE','MELT_OUTPUT',
           'CUSTOMER_OLD_GOLD','SUPPLIER_PURCHASE','REFINERY_OUTPUT',
           'JOB_WORK_RETURN','OPENING_BALANCE']
  }).notNull().default('SUPPLIER_PURCHASE'),
  status: text('status', {
    enum: ['DRAFT','AVAILABLE','SOLD','SENT_TO_REFINERY','MELTED','DAMAGED','RETURNED','SENT_TO_MELT','SENT_TO_KARIGAR','PHANTOM_AVAILABLE','PHANTOM_SOLD']
  }).notNull().default('DRAFT'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  designFk: foreignKey({ columns: [table.designId], foreignColumns: [designs.id] }),
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  stoneFk: foreignKey({ columns: [table.primaryStoneId], foreignColumns: [stones.id] }),
  idxItemsFirmStatus: index('idx_items_firm_status').on(table.firmId, table.status),
  idxItemsDesignId: index('idx_items_design_id').on(table.designId),
  idxItemsDesignStatus: index('idx_items_design_status').on(table.designId, table.status),
  idxItemsSku: index('idx_items_sku').on(table.sku, table.firmId),
  idxItemsHuid: index('idx_items_huid').on(table.huid).where(isNotNull(table.huid)),
  idxItemsCategoryStatus: index('idx_items_category_status').on(table.firmId, table.categoryId, table.status),
  idxItemsInvoice: index('idx_items_invoice').on(table.invoiceId).where(isNotNull(table.invoiceId)),
  idxItemsPhantomAvailable: index('idx_items_phantom_available').on(table.firmId, table.phantomStockId).where(sql`status = 'PHANTOM_AVAILABLE'`),
  idxItemsPhantomSold: index('idx_items_phantom_sold').on(table.firmId, table.phantomStockId).where(sql`status = 'PHANTOM_SOLD'`),
  idxItemsSize: index('idx_items_size').on(table.firmId, table.sizeUnit, table.sizeValue).where(isNotNull(table.sizeValue)), // FIX-GAP-P2-SIZE-3 (v1.76)
}));

// Item Events (append-only audit trail per item - Step 1.6 & 6.7)
export const itemEvents = sqliteTable('item_events', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  firmId: text('firm_id').notNull(),
  eventType: text('event_type', {
    enum: ['CREATED','ITEM_STATUS_CHANGED','WEIGHT_ADJUSTED', 
    'HUID_ADDED','BARCODE_REPRINTED','ITEM_RETURNED',
    'ITEM_SENT_TO_KARIGAR','ITEM_RETURNED_FROM_KARIGAR','ITEM_EDITED','PHANTOM_CREATED','PHANTOM_RECONCILED',
    'SKU_CHANGED','ITEM_ENTRY_DATE_CORRECTED','HUID_CORRECTED','METAL_SOURCE_CORRECTED']
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
  idxItemEventsItem: index('idx_item_events_item').on(table.itemId, table.firmId, table.timestamp),
  idxItemEventsFirmType: index('idx_item_events_firm_type').on(table.firmId, table.eventType),
}));

// Sequence Counters (SCHEMA-1 FIX v1.8 / Step 5)
export const sequenceCounters = sqliteTable('sequence_counters', {
  id: text('id').primaryKey(), // format: '{firmId}_{MMYY}' or '{firmId}_{type}_{fyLabel}'
  firmId: text('firm_id').notNull(),
  month: text('month').notNull(), // MMYY format e.g. '0226'
  year: text('year').notNull(), // 4-digit year e.g. '2026'
  currentSeq: integer('current_seq').notNull().default(0),
  lastUsedAt: text('last_used_at').notNull(), 
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxSequenceCountersFirmMonth: index('idx_sequence_counters_firm_month').on(table.firmId, table.month),
})); 

// Old Gold Lots (BLOCK-4 v1.15 / Step 12)
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
  customerId: text('customer_id'), // FIX-OLDGOLD-CUSTOMER-1 (v1.49)
  fineWeightMg: integer('fine_weight_mg').notNull().default(0), // FIX-OLDGOLD-COST-1 (v1.51)
  purityRoundingDeltaMg: integer('purity_rounding_delta_mg').notNull().default(0), // FEAT-PURITY-ROUND-1 (v1.91)
  purchaseRatePaise: integer('purchase_rate_paise'), // FIX-OLDGOLD-COST-1 (v1.51)
  totalAmountPaise: integer('total_amount_paise'), // FIX-OLDGOLD-COST-1 (v1.51)
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
  idxOldGoldLotsFirm: index('idx_old_gold_lots_firm').on(table.firmId, table.status, table.metalSource),
}));

// URD Purchases (FIX-URD-1 v1.49 / Step 12.9)
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
  idxUrdPurchasesFirm: index('idx_urd_purchases_firm').on(table.firmId, table.status, table.purchaseDate),
  idxUrdPurchasesCustomer: index('idx_urd_purchases_customer').on(table.firmId, table.customerId).where(isNotNull(table.customerId)),
  idxUrdPurchasesFy: index('idx_urd_purchases_fy').on(table.firmId, table.fyId),
}));

// Design-Category Map (DESIGN-CAT-MAP v1.42 / Step 3.5)
export const designCategoryMap = sqliteTable('design_category_map', {
  id: text('id').primaryKey(),
  designId: text('design_id').notNull(),
  categoryId: text('category_id').notNull(),
  firmId: text('firm_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  uniqueDCM: unique().on(table.designId, table.categoryId, table.firmId),
  idxDcmDesign: index('idx_dcm_design').on(table.designId),
  idxDcmCategory: index('idx_dcm_category').on(table.categoryId),
}));

// Stones (Step 4 / FIX-MISSING-CREATE-1 v1.95)
export const stones = sqliteTable('stones', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['DIAMOND', 'RUBY', 'EMERALD', 'SAPPHIRE'] }).notNull(), // FIX-MISSING-CREATE-1 (v1.95) DB enum
  firmId: text('firm_id').notNull(),
  isActive: integer('is_active').default(1).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  firmFk: foreignKey({ columns: [table.firmId], foreignColumns: [firms.id] }),
}));

// Gemstone Lots (GEMSTONE-1 v1.21 / Step 4.5)
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
  idxGemstoneLotsFirmStatus: index('idx_gemstone_lots_firm_status').on(table.firmId, table.status),
  idxGemstoneLotsName: index('idx_gemstone_lots_name').on(table.name),
}));

// HSN Code Master (FIX-HSN-MASTER-1 v1.46 / Step 4.75)
export const hsnCodes = sqliteTable('hsn_codes', {
  id: text('id').primaryKey(), // uuid
  code: text('code').notNull().unique(), // '7113', '711311', etc.
  description: text('description').notNull(), // human-readable label
  chapter: text('chapter').notNull().default('71'), // '71' for jewellery
  isActive: integer('is_active').notNull().default(1), // 1=active 0=deactivated
  createdAt: text('created_at').notNull(), // ISO timestamp
});