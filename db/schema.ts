import { sqliteTable, text, integer, real, foreignKey, unique } from 'drizzle-orm/sqlite-core';

export type Metal = 'GOLD' | 'SILVER';

// =============================================================================
// MIGRATION ZERO TABLE ORDER (v7.9 FIX-V79-1 — 15 tables):
// safe_mode_state, app_settings, firms, financial_years, writer_leases,
// audit_logs, audit_delete_gate, bis_logos, schema_version,
// tax_rates, tax_groups, tax_group_components,
// sync_devices, sync_log, audit_archive_index
// =============================================================================

// 1. SAFE MODE STATE — seed row (id=1, is_active=0) required in migration zero
export const safeModeState = sqliteTable('safe_mode_state', {
  id: integer('id').primaryKey().default(1), // Single row: id always = 1
  isActive: integer('is_active').notNull().default(0), // 0/1 boolean
  reason: text('reason'),         // SafeModeTrigger enum value
  activatedAt: text('activated_at'), // ISO-8601
  clearedAt: text('cleared_at'),     // v2.4: ISO-8601, null while active
});

// 2. APP SETTINGS — seed row (id=1) required in migration zero (v6.2 G67+G68+G69)
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey().default(1), // Single row
  theme: text('theme').notNull().default('system'),
  auditRetentionDays: integer('audit_retention_days').notNull().default(30), // v7.10: was 365
  auditRetentionLastRunAt: text('audit_retention_last_run_at'), // v7.10: nullable ISO-8601
  currency: text('currency').notNull().default('INR'),           // v6.2 G67: Indian Rupee — read-only, not user-changeable
  currencySymbol: text('currency_symbol').notNull().default('₹'), // v6.2 G67 (FIXED: was 'Rs')
  currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2), // v6.2 G67: paise = 2dp
  dateFormatToken: text('date_format_token').notNull().default('dd/MM/yyyy'), // v6.2 G68: date-fns v3 token (lowercase)
  warnUnsavedChanges: integer('warn_unsaved_changes').notNull().default(1), // v6.2 G69: 1=ON, 0=OFF
  updatedAt: text('updated_at').notNull(),
});

// 3. FIRMS (Identity — root of all future records)
// v5.0 G45: firmLogoRef added | v5.0 G46: phone3 added
// v7.0 G70: stateCode + stateName replace free-text state
// NOTE: logoUri (logo_uri) column does NOT exist — removed as phantom column
export const firms = sqliteTable('firms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firmCode: text('firm_code').notNull().unique(), // Immutable after creation (DB trigger enforced)
  proprietor: text('proprietor').notNull(),

  // Statutory
  gstin: text('gstin'),         // Optional; determines Tax Invoice vs Bill of Supply (locked at creation)
  bisLicence: text('bis_licence'),
  bisLogoRef: text('bis_logo_ref'),
  firmLogoRef: text('firm_logo_ref'), // v5.0 G45: firm brand logo URI (nullable, device-local)

  // Address
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  stateCode: text('state_code').notNull(), // v7.0 G70: 2-digit GST state code e.g. '27'
  stateName: text('state_name').notNull(), // v7.0 G70: display name e.g. 'Maharashtra'
  pincode: text('pincode').notNull(),

  // Contact
  phone1: text('phone1').notNull(),         // Required
  phone2: text('phone2'),                   // Optional
  phone3: text('phone3'),                   // v5.0 G46: Optional third contact number

  // System
  isArchived: integer('is_archived').default(0).notNull(), // 0=active, 1=archived — plain integer, NOT boolean mode
  isActive: integer('is_active').default(0).notNull(),     // 0=inactive, 1=active — plain integer, NOT boolean mode
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// 4. FINANCIAL YEARS (FY boundaries per firm — immutable once created)
// v7.5 UQ-ACTIVE-FY-CONSTRAINT: Partial unique index must be added MANUALLY after npx drizzle-kit generate:
//   CREATE UNIQUE INDEX uq_one_active_fy_per_firm ON financial_years(firm_id) WHERE status = 'ACTIVE';
// ⚠️ DEVELOPER ACTION REQUIRED: Drizzle ORM cannot generate partial unique indexes.
// v7.5 RESOLVE-TRANSACTION-FYID: resolveTransactionFyId(firmId, entryDate) is defined in services/fyService.ts
// v7.8 FIX-V78-3: The code block below is a cross-reference ONLY. Canonical location = services/fyService.ts.
export const financialYears = sqliteTable('financial_years', {
  id: text('id').primaryKey(),           // UUID
  firmId: text('firm_id').notNull(),     // FK → firms.id
  label: text('label').notNull(),        // e.g. 'FY 2025-26'
  startDate: text('start_date').notNull(), // ISO date e.g. '2025-04-01'
  endDate: text('end_date').notNull(),     // ISO date e.g. '2026-03-31'
  status: text('status').notNull(),        // FYStatus enum: ACTIVE | CLOSED
  createdAt: text('created_at').notNull(), // ISO-8601
});

export const FYStatus = { ACTIVE: 'ACTIVE', CLOSED: 'CLOSED' } as const;

// 5. WRITER LEASES (Concurrency guard — session-scoped, purged on every restart)
export const writerLeases = sqliteTable('writer_leases', {
  id: text('id').primaryKey(),          // UUID — NOT an integer singleton
  leaseType: text('lease_type').notNull(), // LeaseType enum: RESTORE | BACKUP | WRITE
  firmId: text('firm_id'),              // nullable — RESTORE leases are firm-agnostic
  acquiredAt: text('acquired_at').notNull(), // ISO-8601
  expiresAt: text('expires_at').notNull(),   // ISO-8601 — extended by heartbeat
  deviceId: text('device_id').notNull(),     // UUID from deviceId util
});

export const LeaseType = {  RESTORE: 'RESTORE',
  BACKUP: 'BACKUP',
  WRITE: 'WRITE', // Reserved for Phase 2 bulk-write operations — DO NOT ACQUIRE IN PHASE 1
} as const;

// 6. AUDIT LOGS (Append-only accountability trail — never editable)
// v2.7 DB triggers (applied in client.ts): prevent_audit_update + prevent_audit_delete
// v3.0 G39: entityId added for Phase 3+ traceability (customer.id, invoice.id)
// G41: log(null, ...) permitted ONLY for RESTORE_OLD_SCHEMA, DEVICE_ID_GENERATED, BACKUP_CREATED
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),            // UUID
  eventType: text('event_type').notNull(), // e.g. 'FIRM_CREATED'
  firmId: text('firm_id'),                // nullable: device-level events have no firm
  entityId: text('entity_id'),            // nullable — traceability (v3.0 G39)
  deviceId: text('device_id').notNull(),  // UUID from deviceId util
  payload: text('payload'),               // JSON string — event-specific data, nullable
  createdAt: text('created_at').notNull(), // ISO-8601
});

// v7.10 AUDIT-RETENTION-MONTHLY
export const auditDeleteGate = sqliteTable('audit_delete_gate', {
  id: integer('id').primaryKey().default(1),
  gateOpen: integer('gate_open').notNull().default(0),
});

// 7. BIS LOGOS (Soft-delete only — v2.9 Gap B fix)
// v6.6 BUG FIX: bisLogoRepository.findActiveByFirmId() added — see bisLogoRepository.ts
export const bisLogos = sqliteTable('bis_logos', {
  id: text('id').primaryKey(),               // UUID
  firmId: text('firm_id').notNull(),         // FK → firms.id
  fileRef: text('file_ref').notNull(),       // expo-file-system URI
  isArchived: integer('is_archived').notNull().default(0), // 0=active, 1=archived
  archivedAt: text('archived_at'),           // ISO-8601, null while active
  archivedReason: text('archived_reason'),   // e.g. 'licence_removed'
  createdAt: text('created_at').notNull(),   // ISO-8601
});

// 8. SCHEMA VERSION (v6.1 G64 — single row, id=1, current_version=1)
// Required by verifyService to detect DB-vs-app schema mismatch at runtime.
// Do NOT confuse with SCHEMA_VERSION TypeScript constant (app-side expectation).
// INSERT seed row in migration zero: INSERT INTO schema_version (id, current_version) VALUES (1, 1)
export const schemaVersion = sqliteTable('schema_version', {
  id: integer('id').primaryKey().default(1), // Single row: id always = 1
  currentVersion: integer('current_version').notNull(), // Must match SCHEMA_VERSION constant
});

// =============================================================================
// PHASE 3 DORMANCY BOUNDARY — TAX MASTER (v6.9 GST-TAXMASTER)
// ⚠️ DEVELOPER ACTION REQUIRED: After npx drizzle-kit generate, manually add
// the TODO comment below as the FIRST LINE inside each CREATE TABLE block for
// these three tables in the generated migration SQL file.
// Comment: -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table
//          from Phase 1 service code. Any Phase 1 usage is a build violation.
// =============================================================================

// 9. TAX RATES — SCHEMA ONLY in Phase 1. Phase 3 Step 0 implementation target.
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxRates = sqliteTable('tax_rates', {
  id: text('id').primaryKey(),              // UUID
  firmId: text('firm_id').notNull(),        // FK → firms.id
  taxName: text('tax_name').notNull(),      // e.g. "CGST 1.5%"
  rateBps: integer('rate_bps').notNull(),   // basis points: 150 = 1.50%
  taxType: text('tax_type').notNull(),      // ENUM: 'CGST' | 'SGST' (NO IGST — intra-state only)
  isActive: integer('is_active').notNull().default(1), // 1=active, 0=inactive
  createdAt: text('created_at').notNull(),  // ISO-8601
  updatedAt: text('updated_at').notNull(),  // ISO-8601
});

// 10. TAX GROUPS — SCHEMA ONLY in Phase 1. Phase 3 Step 0 implementation target.
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxGroups = sqliteTable('tax_groups', {
  id: text('id').primaryKey(),              // UUID
  firmId: text('firm_id').notNull(),        // FK → firms.id
  groupName: text('group_name').notNull(),  // e.g. "GST 3%"
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// 11. TAX GROUP COMPONENTS — SCHEMA ONLY in Phase 1. FK → tax_groups + tax_rates.
// ⚠️ DEVELOPER ACTION REQUIRED: Must appear AFTER tax_rates AND tax_groups in migration SQL.
// Drizzle may reorder — hand-verify SQL table order before committing (FIX-V72-3).
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxGroupComponents = sqliteTable('tax_group_components', {
  id: text('id').primaryKey(),              // UUID
  taxGroupId: text('tax_group_id').notNull(), // FK → tax_groups.id
  taxRateId: text('tax_rate_id').notNull(),   // FK → tax_rates.id
});

// =============================================================================
// SYNC FOUNDATION — DORMANT (v7.3 SYNC-FOUNDATION)
// ⚠️ DEVELOPER ACTION REQUIRED: After npx drizzle-kit generate, manually add
// the TODO comment below as the FIRST LINE inside each CREATE TABLE block for
// sync_devices and sync_log in the generated migration SQL file.
// Comment: -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this
//          table from Phase 1–7 service code.
// PR GATE 3: grep for mDNS, socket, WebSocket, HttpServer, sendSnapshot — hard rejection.
// =============================================================================

// 12. SYNC DEVICES — SCHEMA ONLY. Future Sync Phase implementation target. // -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
export const syncDevices = sqliteTable('sync_devices', {
  id: text('id').primaryKey(),              // UUID
  deviceId: text('device_id').notNull(),    // from getDeviceId() — links to deviceId util
  deviceName: text('device_name').notNull(), // user-assigned name e.g. "Owner Phone"
  deviceRole: text('device_role').notNull(), // 'PRIMARY' | 'SECONDARY' — never mixed
  isEnabled: integer('is_enabled').notNull().default(0), // 0=disabled 1=enabled
  pairedAt: text('paired_at').notNull(),    // ISO-8601
  lastSeenAt: text('last_seen_at'),         // ISO-8601, nullable. Written by PRIMARY only.
  pairingCode: text('pairing_code'),        // nullable. 6-digit code, cleared after pairing.
});

// 13. SYNC LOG — APPEND-ONLY. Mirror of audit_logs pattern. Future Sync Phase only.
// -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey(),                   // UUID
  eventType: text('event_type').notNull(),        // SyncEventType enum
  deviceId: text('device_id').notNull(),          // device that generated this event
  targetDeviceId: text('target_device_id'),       // nullable — the secondary being acted on
  occurredAt: text('occurred_at').notNull(),      // ISO-8601
  payload: text('payload'),                       // nullable JSON — event-specific detail
});

// SyncEventType enum — all events that sync_log records (v7.3)
export const SyncEventType = {
  DEVICE_PAIRED:       'DEVICE_PAIRED',
  DEVICE_UNPAIRED:     'DEVICE_UNPAIRED',
  SECONDARY_ENABLED:   'SECONDARY_ENABLED',
  SECONDARY_DISABLED:  'SECONDARY_DISABLED',
  SYNC_STARTED:        'SYNC_STARTED',
  SYNC_COMPLETED:      'SYNC_COMPLETED',
  SYNC_FAILED:         'SYNC_FAILED',
} as const;

// 14. AUDIT ARCHIVE INDEX (v7.4 AUDIT-ARCHIVE) — APPEND-ONLY
// One row per FY-close event per firm. Written by fyService.closeFY() (Phase 2 scope).
// Immutability rule: rows are NEVER deleted or updated.
export const auditArchiveIndex = sqliteTable('audit_archive_index', {
  id: text('id').primaryKey(),              // UUID
  firmId: text('firm_id').notNull(),        // FK → firms.id
  fyId: text('fy_id').notNull(),            // FK → financial_years.id
  fyLabel: text('fy_label').notNull(),      // e.g. 'FY 2024-25'
  archiveDate: text('archive_date').notNull(), // ISO-8601 — when FY_CLOSED fired
  rowCount: integer('row_count').notNull(), // # of audit_logs rows archived for this FY
  storageRef: text('storage_ref'),          // nullable — future: file URI for external archive
});

// =============================================================================
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