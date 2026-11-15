// scripts/verify-migration-zero.ts
// v7.8 FIX-V78-1 / v7.9 FIX-V79-2 / v7.12 FIX-V712-3 / v7.22 FIX-V722-3/4 / v7.39 FIX-V739-1..3 / v7.40 FIX-V740-5

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { fileURLToPath } from 'url';

const getMigrationsDir = (): string => {
  const dirs = [
    path.join(process.cwd(), 'drizzle', 'migrations'),
    path.join(process.cwd(), 'drizzle'),
  ];
  try {
    const fromMeta = path.dirname(fileURLToPath(import.meta.url));
    dirs.unshift(path.join(fromMeta, '..', 'drizzle', 'migrations'));
    dirs.unshift(path.join(fromMeta, '..', 'drizzle'));
  } catch {}
  for (const d of dirs) {
    if (fs.existsSync(d) && glob.sync('**/0000_*.sql', { cwd: d }).length > 0) {
      return d;
    }
  }
  return path.join(process.cwd(), 'drizzle');
};

const MIGRATIONS_DIR = getMigrationsDir();

// Required indexes — 12 Canonical Indexes (v7.39 Alignment)
const REQUIRED_INDEXES: string[] = [
  'idx_writer_leases_expires',
  'idx_audit_logs_firm_date',
  'idx_audit_logs_event_type',
  'idx_financial_years_firm_status',
  'idx_financial_years_firm_dates',
  'idx_firms_archived',
  'idx_bis_logos_firm_active',
  'idx_tax_rates_firm_active',
  'idx_tax_groups_firm_active',
  'idx_tax_group_components_group',
  'idx_tax_group_components_rate',
  'idx_audit_archive_firm_fy',
];

// Required triggers
const REQUIRED_TRIGGERS: string[] = [
  'prevent_audit_update',
  'prevent_audit_delete',
  'prevent_firm_code_update',
];

// Required boundary comments
const REQUIRED_COMMENTS: string[] = [
  'PHASE 3 STEP 0 BOUNDARY',
  'FUTURE SYNC PHASE BOUNDARY',
  'uq_one_active_fy_per_firm',
];

// Required table & seed row validation (v7.12 FIX-V712-3 / v7.22 FIX-V722-3)
const REQUIRED_TABLE_AND_SEED = [
  { table: 'audit_delete_gate', seed: 'INSERT INTO audit_delete_gate' },
  { table: 'schema_version', seed: 'INSERT INTO schema_version' },
  { table: 'safe_mode_state', seed: 'INSERT INTO safe_mode_state' },
  { table: 'app_settings', seed: 'INSERT INTO app_settings' },
];

function findMigrationZeroContent(): string {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Drizzle migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const files = glob.sync('**/0000_*.sql', { cwd: MIGRATIONS_DIR });

  if (files.length === 0) {
    throw new Error(
      `Migration zero SQL file (0000_*.sql) not found in ${MIGRATIONS_DIR}.\n` +
        `Run: npx drizzle-kit generate — then complete scripts/post-generate-checklist.md.`
    );
  }

  if (files.length > 1) {
    throw new Error(
      `Multiple migration zero candidates found: ${files.join(', ')}.\n` +
        `There should be exactly one 0000_*.sql file.`
    );
  }

  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf-8');
}

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

  for (const { table, seed } of REQUIRED_TABLE_AND_SEED) {
    const contentLower = sqlContent.toLowerCase();
    const hasTable =
      contentLower.includes(`create table "${table}"`) ||
      contentLower.includes(`create table \`${table}\``) ||
      contentLower.includes(`create table ${table}`);

    if (!hasTable) {
      failures.push(`MISSING TABLE: ${table}`);
    }

    const hasSeed =
      sqlContent.includes(seed) ||
      sqlContent.includes(seed.replace('INSERT INTO', 'INSERT OR IGNORE INTO'));

    if (!hasSeed) {
      failures.push(`MISSING SEED ROW: ${table}`);
    }
  }

  // v7.40 FIX-V740-5: Verify >= 7 FOREIGN KEY references to firms and audit_retention_days >= 30 CHECK
  const fkCount = (sqlContent.match(/REFERENCES\s+[`"]?firms[`"]?/gi) ?? []).length;
  if (fkCount < 7) {
    failures.push(`MISSING FOREIGN KEYS to firms: found ${fkCount}, expected at least 7`);
  }
  if (!sqlContent.includes('audit_retention_days') || !/>=\s*30/.test(sqlContent)) {
    failures.push('MISSING CHECK: audit_retention_days >= 30');
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
    `verify-migration-zero PASSED (` +
      `${REQUIRED_INDEXES.length} indexes, ` +
      `${REQUIRED_TRIGGERS.length} triggers, ` +
      `${REQUIRED_COMMENTS.length} boundary comments, ` +
      `${REQUIRED_TABLE_AND_SEED.length} table+seed checks, ` +
      `${fkCount} firm FKs & retention CHECK verified).`
  );
}

verify();
