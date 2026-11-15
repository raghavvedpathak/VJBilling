import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export type Metal = 'GOLD' | 'SILVER';

// =============================================================================
// MIGRATION ZERO TABLE ORDER (v7.9 FIX-V79-1 / v7.12 FIX-V712-2 — 15 tables):
// safe_mode_state, app_settings, firms, financial_years, writer_leases,
// audit_logs, audit_delete_gate, bis_logos, schema_version,
// tax_rates, tax_groups, tax_group_components,
// sync_devices, sync_log, audit_archive_index
// =============================================================================

// 1. SAFE MODE STATE — seed row (id=1, is_active=0) required in migration zero
export const safeModeState = sqliteTable('safe_mode_state', {
  id: integer('id').primaryKey().default(1), // Single row: id always = 1
  isActive: integer('is_active').notNull().default(0), // 0/1 boolean
  reason: text('reason'), // SafeModeTrigger enum value
  activatedAt: text('activated_at'), // ISO-8601
  clearedAt: text('cleared_at'), // v2.4: ISO-8601, null while active
});

// 2. APP SETTINGS — seed row (id=1) required in migration zero (v6.2 G67+G68+G69, v7.40 FIX-V740-5)
export const appSettings = sqliteTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1), // Single row
    theme: text('theme').notNull().default('system'),
    auditRetentionDays: integer('audit_retention_days').notNull().default(30), // v7.10: was 365
    auditRetentionLastRunAt: text('audit_retention_last_run_at'), // v7.10: nullable ISO-8601
    currency: text('currency').notNull().default('INR'), // v6.2 G67: read-only, not user-changeable
    currencySymbol: text('currency_symbol').notNull().default('₹'), // v6.2 G67
    currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2), // v6.2 G67: paise = 2dp
    dateFormatToken: text('date_format_token').notNull().default('dd/MM/yyyy'), // v6.2 G68: date-fns v3 token (lowercase)
    warnUnsavedChanges: integer('warn_unsaved_changes').notNull().default(1), // v6.2 G69: 1=ON, 0=OFF
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    retentionMin: check('audit_retention_min_30', sql`${t.auditRetentionDays} >= 30`),
  })
);

// 3. FIRMS (Identity — root of all future records)
// v5.0 G45: firmLogoRef added | v5.0 G46: phone3 added
// v7.0 G70: stateCode + stateName replace free-text state
export const firms = sqliteTable('firms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firmCode: text('firm_code').notNull().unique(), // Immutable after creation (DB trigger enforced)
  proprietor: text('proprietor').notNull(),

  // Statutory
  gstin: text('gstin'), // Optional; determines Tax Invoice vs Bill of Supply (one-time null->value allowed per FIX-V735-1)
  bisLicence: text('bis_licence'),
  bisLogoRef: text('bis_logo_ref'),
  firmLogoRef: text('firm_logo_ref'), // v5.0 G45: firm brand logo URI (nullable)

  // Address
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  stateCode: text('state_code').notNull(), // v7.0 G70: 2-digit GST state code e.g. '27'
  stateName: text('state_name').notNull(), // v7.0 G70: display name e.g. 'Maharashtra'
  pincode: text('pincode').notNull(),

  // Contact
  phone1: text('phone1').notNull(), // Required
  phone2: text('phone2'), // Optional
  phone3: text('phone3'), // v5.0 G46: Optional third contact number

  // System
  isArchived: integer('is_archived').default(0).notNull(), // 0=active, 1=archived
  isActive: integer('is_active').default(0).notNull(), // 0=inactive, 1=active
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// 4. FINANCIAL YEARS (FY boundaries per firm — immutable once created)
// v7.5 UQ-ACTIVE-FY-CONSTRAINT: Partial unique index in migration zero SQL:
//   CREATE UNIQUE INDEX uq_one_active_fy_per_firm ON financial_years(firm_id) WHERE status = 'ACTIVE';
// v7.8 FIX-V78-3: resolveTransactionFyId() canonical location = services/fyService.ts.
export const financialYears = sqliteTable('financial_years', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id), // FIX-V740-5: FK → firms.id
  label: text('label').notNull(), // e.g. 'FY 2025-26'
  startDate: text('start_date').notNull(), // ISO date e.g. '2025-04-01'
  endDate: text('end_date').notNull(), // ISO date e.g. '2026-03-31'
  status: text('status').notNull(), // FYStatus enum: ACTIVE | CLOSED
  createdAt: text('created_at').notNull(), // ISO-8601
});

export const FYStatus = { ACTIVE: 'ACTIVE', CLOSED: 'CLOSED' } as const;

// 5. WRITER LEASES (Concurrency guard — session-scoped, purged on every restart)
export const writerLeases = sqliteTable('writer_leases', {
  id: text('id').primaryKey(), // UUID — NOT an integer singleton
  leaseType: text('lease_type').notNull(), // LeaseType enum: RESTORE | BACKUP | WRITE
  firmId: text('firm_id').references(() => firms.id), // FIX-V740-5: nullable FK → firms.id
  acquiredAt: text('acquired_at').notNull(), // ISO-8601
  expiresAt: text('expires_at').notNull(), // ISO-8601 — extended by heartbeat
  deviceId: text('device_id').notNull(), // UUID from deviceId util
});

export const LeaseType = {
  RESTORE: 'RESTORE',
  BACKUP: 'BACKUP',
  WRITE: 'WRITE', // Reserved for Phase 2 bulk-write operations — DO NOT ACQUIRE IN PHASE 1 (G57)
} as const;

// 6. AUDIT LOGS (Append-only accountability trail — never editable)
// v2.7 DB triggers: prevent_audit_update + gated prevent_audit_delete
// v3.0 G39: entityId added for Phase 3+ traceability
// G41 (v7.43 FIX-V743-2): log(null, ...) permitted ONLY for DEVICE_ID_GENERATED and BACKUP_CREATED
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(), // UUID
    eventType: text('event_type').notNull(), // e.g. 'FIRM_CREATED'
    firmId: text('firm_id').references(() => firms.id), // FIX-V740-5: nullable FK → firms.id
    entityId: text('entity_id'), // nullable — traceability (v3.0 G39)
    deviceId: text('device_id').notNull(), // UUID from deviceId util
    payload: text('payload'), // JSON string — event-specific data, nullable
    createdAt: text('created_at').notNull(), // ISO-8601
  },
  (table) => ({
    idxAuditLogsEntityEvent: index('idx_audit_logs_entity_event').on(
      table.entityId,
      table.eventType,
      table.firmId,
      table.createdAt
    ),
  })
);

// 7. AUDIT DELETE GATE (v7.10 AUDIT-RETENTION-MONTHLY / FIX-V711-1)
// Seed row (migration zero, point 1 — FIX-V713-3): INSERT INTO audit_delete_gate (id, gate_open) VALUES (1, 0);
export const auditDeleteGate = sqliteTable('audit_delete_gate', {
  id: integer('id').primaryKey().default(1),
  gateOpen: integer('gate_open').notNull().default(0),
});

// 8. BIS LOGOS (Soft-delete only — v2.9 Gap B fix)
export const bisLogos = sqliteTable('bis_logos', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id), // FIX-V740-5: FK → firms.id
  fileRef: text('file_ref').notNull(), // expo-file-system URI
  isArchived: integer('is_archived').notNull().default(0), // 0=active, 1=archived
  archivedAt: text('archived_at'), // ISO-8601, null while active
  archivedReason: text('archived_reason'), // e.g. 'licence_removed'
  createdAt: text('created_at').notNull(), // ISO-8601
});

// 9. SCHEMA VERSION (v6.1 G64 / G66 — single row, id=1, current_version=1)
export const schemaVersion = sqliteTable('schema_version', {
  id: integer('id').primaryKey().default(1), // Single row: id always = 1
  currentVersion: integer('current_version').notNull(), // Must match SCHEMA_VERSION constant
});

// =============================================================================
// PHASE 3 DORMANCY BOUNDARY — TAX MASTER (v6.9 GST-TAXMASTER)
// =============================================================================

// 10. TAX RATES — SCHEMA ONLY in Phase 1. Phase 3 Step 0 implementation target.
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxRates = sqliteTable('tax_rates', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id), // FIX-V740-5: FK → firms.id
  taxName: text('tax_name').notNull(), // e.g. "CGST 1.5%"
  rateBps: integer('rate_bps').notNull(), // basis points: 150 = 1.50%
  taxType: text('tax_type').notNull(), // ENUM: 'CGST' | 'SGST' (NO IGST — intra-state only)
  isActive: integer('is_active').notNull().default(1), // 1=active, 0=inactive
  createdAt: text('created_at').notNull(), // ISO-8601
  updatedAt: text('updated_at').notNull(), // ISO-8601
});

// 11. TAX GROUPS — SCHEMA ONLY in Phase 1. Phase 3 Step 0 implementation target.
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxGroups = sqliteTable('tax_groups', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id), // FIX-V740-5: FK → firms.id
  groupName: text('group_name').notNull(), // e.g. "GST 3%"
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// 12. TAX GROUP COMPONENTS — SCHEMA ONLY in Phase 1. FK → tax_groups + tax_rates.
// -- TODO: PHASE 3 STEP 0 BOUNDARY. DO NOT import or query this table from Phase 1 service code. Any Phase 1 usage is a build violation.
export const taxGroupComponents = sqliteTable('tax_group_components', {
  id: text('id').primaryKey(), // UUID
  taxGroupId: text('tax_group_id')
    .notNull()
    .references(() => taxGroups.id), // FIX-V740-5: FK → tax_groups.id
  taxRateId: text('tax_rate_id')
    .notNull()
    .references(() => taxRates.id), // FIX-V740-5: FK → tax_rates.id
});

// =============================================================================
// SYNC FOUNDATION — DORMANT (v7.3 SYNC-FOUNDATION)
// =============================================================================

// 13. SYNC DEVICES — SCHEMA ONLY. Future Sync Phase implementation target.
// -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
export const syncDevices = sqliteTable('sync_devices', {
  id: text('id').primaryKey(), // UUID
  deviceId: text('device_id').notNull(), // from getDeviceId() — links to deviceId util
  deviceName: text('device_name').notNull(), // user-assigned name e.g. "Owner Phone"
  deviceRole: text('device_role').notNull(), // 'PRIMARY' | 'SECONDARY' — never mixed
  isEnabled: integer('is_enabled').notNull().default(0), // 0=disabled 1=enabled
  pairedAt: text('paired_at').notNull(), // ISO-8601
  lastSeenAt: text('last_seen_at'), // ISO-8601, nullable. Written by PRIMARY only.
  pairingCode: text('pairing_code'), // FIX-VSEC-13: nullable. MUST store SHA-256 hash only (never plaintext); cleared after pairing.
});

// 14. SYNC LOG — APPEND-ONLY. Mirror of audit_logs pattern. Future Sync Phase only.
// -- TODO: FUTURE SYNC PHASE BOUNDARY. DO NOT import or query this table from Phase 1–7 service code. Any usage before the Future Sync Phase spec is approved is a build violation.
export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey(), // UUID
  eventType: text('event_type').notNull(), // SyncEventType enum
  deviceId: text('device_id').notNull(), // device that generated this event
  targetDeviceId: text('target_device_id'), // nullable — the secondary being acted on
  occurredAt: text('occurred_at').notNull(), // ISO-8601
  payload: text('payload'), // nullable JSON — event-specific detail
});

export const SyncEventType = {
  DEVICE_PAIRED: 'DEVICE_PAIRED',
  DEVICE_UNPAIRED: 'DEVICE_UNPAIRED',
  SECONDARY_ENABLED: 'SECONDARY_ENABLED',
  SECONDARY_DISABLED: 'SECONDARY_DISABLED',
  SYNC_STARTED: 'SYNC_STARTED',
  SYNC_COMPLETED: 'SYNC_COMPLETED',
  SYNC_FAILED: 'SYNC_FAILED',
} as const;

// 15. AUDIT ARCHIVE INDEX (v7.4 AUDIT-ARCHIVE) — APPEND-ONLY
export const auditArchiveIndex = sqliteTable('audit_archive_index', {
  id: text('id').primaryKey(), // UUID
  firmId: text('firm_id')
    .notNull()
    .references(() => firms.id), // FIX-V740-5: FK → firms.id
  fyId: text('fy_id')
    .notNull()
    .references(() => financialYears.id), // FIX-V740-5: FK → financial_years.id
  fyLabel: text('fy_label').notNull(), // e.g. 'FY 2024-25'
  archiveDate: text('archive_date').notNull(), // ISO-8601 — when FY_CLOSED fired
  rowCount: integer('row_count').notNull(), // # of audit_logs rows archived for this FY
  storageRef: text('storage_ref'), // nullable — future: file URI for external archive
});
