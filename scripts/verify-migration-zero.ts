// scripts/verify-migration-zero.ts
// v7.8 FIX-V78-1 — CI validation script for migration zero SQL
// v7.9 FIX-V79-2 — Canonical implementation
//
// Run: npx ts-node scripts/verify-migration-zero.ts
// Add to CI pipeline — exits non-zero on any failure.
//
// SETUP: npm i --save-dev @types/node  (required for fs, path, __dirname)

/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs   = require('fs')   as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

// ------------------------------------------------------------------
// Location of drizzle migration output folder
// ------------------------------------------------------------------
const DRIZZLE_DIR: string = path.join(__dirname, '..', 'drizzle');

// ------------------------------------------------------------------
// Required indexes — 14 total (v7.7 IDX-* / v7.9 FIX-V79-1 count corrected)
// ------------------------------------------------------------------
const REQUIRED_INDEXES: string[] = [
  // writer_leases — assertNoActiveLease is most-called query in system
  'idx_writer_leases_expires',
  // audit_logs — every write + boot verify + audit screen
  'idx_audit_logs_firm_date',
  'idx_audit_logs_event_type',
  // financial_years — resolveTransactionFyId + verify + FY_TRANSITION_BANNER
  'idx_financial_years_firm_status',
  'idx_financial_years_firm_dates',
  // firms — firm manager + countActiveFirms
  'idx_firms_archived',
  // bis_logos — findActiveByFirmId called inside updateFirm
  'idx_bis_logos_firm_active',
  // tax tables — Phase 3 calculateInvoice (dormant until Phase 3)
  'idx_tax_rates_firm_active',
  'idx_tax_groups_firm_active',
  'idx_tax_group_components_group',
  'idx_tax_group_components_rate',
  // dormant sync/archive tables — Future Sync Phase + Phase 2 FY close
  'idx_sync_log_firm_date',
  'idx_sync_devices_firm',
  'idx_audit_archive_firm_fy',
];

// ------------------------------------------------------------------
// Required triggers — audit immutability + firm_code immutability
// ------------------------------------------------------------------
const REQUIRED_TRIGGERS: string[] = [
  'prevent_audit_update',
  'prevent_audit_delete',
  'prevent_firm_code_update',
];

// ------------------------------------------------------------------
// Required boundary comments / partial unique index marker
// ------------------------------------------------------------------
const REQUIRED_COMMENTS: string[] = [
  'PHASE 3 STEP 0 BOUNDARY',    // inside tax_rates, tax_groups, tax_group_components
  'FUTURE SYNC PHASE BOUNDARY', // inside sync_devices, sync_log
  'uq_one_active_fy_per_firm',  // partial unique index (v7.5 UQ-ACTIVE-FY-CONSTRAINT)
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function findMigrationZeroContent(): string {
  if (!fs.existsSync(DRIZZLE_DIR)) {
    throw new Error(`Drizzle migrations directory not found: ${DRIZZLE_DIR}`);
  }

  const allFiles: string[] = fs.readdirSync(DRIZZLE_DIR);
  const zeroFiles = allFiles.filter((f: string) => /^0000_.*\.sql$/.test(f));

  if (zeroFiles.length === 0) {
    throw new Error(
      `Migration zero SQL file (0000_*.sql) not found in ${DRIZZLE_DIR}.\n` +
      `Run: npx drizzle-kit generate — then complete scripts/post-generate-checklist.md.`
    );
  }

  if (zeroFiles.length > 1) {
    throw new Error(
      `Multiple migration zero candidates found: ${zeroFiles.join(', ')}.\n` +
      `There should be exactly one 0000_*.sql file.`
    );
  }

  return fs.readFileSync(path.join(DRIZZLE_DIR, zeroFiles[0]), 'utf-8');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function verify(): void {
  console.log('verify-migration-zero: Starting validation...\n');

  let sqlContent = '';

  try {
    sqlContent = findMigrationZeroContent();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('verify-migration-zero FAILED (setup error):\n' + message);
    process.exit(1);
  }

  const failures: string[] = [];

  for (const idx of REQUIRED_INDEXES) {
    if (!sqlContent.includes(idx)) {
      failures.push(`MISSING INDEX: ${idx}`);
    }
  }

  for (const trigger of REQUIRED_TRIGGERS) {
    if (!sqlContent.includes(trigger)) {
      failures.push(`MISSING TRIGGER: ${trigger}`);
    }
  }

  for (const comment of REQUIRED_COMMENTS) {
    if (!sqlContent.includes(comment)) {
      failures.push(`MISSING BOUNDARY COMMENT / INDEX: ${comment}`);
    }
  }

  if (failures.length > 0) {
    console.error('verify-migration-zero FAILED:\n');
    failures.forEach((f: string) => console.error('  ✗ ' + f));
    console.error(
      `\n${failures.length} item(s) missing. ` +
      `Complete scripts/post-generate-checklist.md before committing.`
    );
    process.exit(1);
  }

  console.log(
    `verify-migration-zero PASSED:\n` +
    `  ✓ ${REQUIRED_INDEXES.length} indexes verified\n` +
    `  ✓ ${REQUIRED_TRIGGERS.length} triggers verified\n` +
    `  ✓ ${REQUIRED_COMMENTS.length} boundary comments verified\n` +
    `\nMigration zero SQL is ready to commit.`
  );
}

verify();