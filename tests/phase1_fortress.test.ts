// tests/phase1_fortress.test.ts
// Phase 1 Integration Fortress Tests

// ─── MOCK db/client FIRST — before any other import ──────────────────────────
// jest.mock() is hoisted to the top by Babel. To prevent out-of-scope errors,
// all instantiation happens INSIDE the mock factory.

jest.mock('../db/client', () => {
  const { createClient } = require('@libsql/client');
  const { drizzle } = require('drizzle-orm/libsql');

  // Use a shared memory cache so Drizzle transactions share the same instance
  const rawClient = createClient({ url: 'file::memory:?cache=shared' });
  const dbInstance = drizzle(rawClient);
  
  // Attach the raw client so our test suite can access it for DDL (CREATE TABLE)
  dbInstance.__rawClient = rawClient;

  return {
    db: dbInstance,
    expoDb: {
      execSync: () => {},
      runSync: () => {},
      getFirstSync: () => ({ count: 0 }),
      getAllSync: () => [],
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

// ─── IMPORTS — after mock registration ───────────────────────────────────────

import { firmService } from '../services/firmService';
import { leaseService } from '../services/leaseService';
import { safeModeService, bootstrapComplete } from '../services/safeModeService';
import { useSafeModeStore } from '../store/safeModeStore';
import { db } from '../db/client';
import { firms, writerLeases, auditLogs, safeModeState, financialYears } from '../db/schema';
import { eq } from 'drizzle-orm';

// ─── SCHEMA SETUP & TEARDOWN ──────────────────────────────────────────────────

beforeAll(async () => {
  const _rawClient = (db as any).__rawClient;

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS safe_mode_state (
    id INTEGER PRIMARY KEY,
    is_active INTEGER NOT NULL DEFAULT 0,
    reason TEXT, activated_at TEXT, cleared_at TEXT
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'system',
    audit_retention_days INTEGER NOT NULL DEFAULT 365,
    currency TEXT NOT NULL DEFAULT 'INR',
    currency_symbol TEXT NOT NULL DEFAULT '',
    currency_decimal_places INTEGER NOT NULL DEFAULT 2,
    date_format_token TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    warn_unsaved_changes INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT ''
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY,
    current_version INTEGER NOT NULL DEFAULT 1
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    firm_code TEXT NOT NULL UNIQUE, proprietor TEXT NOT NULL,
    gstin TEXT, bis_licence TEXT, bis_logo_ref TEXT, firm_logo_ref TEXT,
    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT,
    city TEXT NOT NULL DEFAULT '',
    state_code TEXT NOT NULL DEFAULT '27',
    state_name TEXT NOT NULL DEFAULT 'Maharashtra',
    pincode TEXT NOT NULL DEFAULT '000000',
    phone1 TEXT NOT NULL DEFAULT '0000000000',
    phone2 TEXT, phone3 TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS financial_years (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL,
    label TEXT NOT NULL, start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS writer_leases (
    id TEXT PRIMARY KEY, lease_type TEXT NOT NULL,
    firm_id TEXT, acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, device_id TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
    firm_id TEXT, entity_id TEXT,
    device_id TEXT NOT NULL, payload TEXT,
    created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS bis_logos (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL,
    file_ref TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT, archived_reason TEXT,
    created_at TEXT NOT NULL
  )`);

  await _rawClient.execute(`INSERT OR IGNORE INTO safe_mode_state (id, is_active) VALUES (1, 0)`);
  await _rawClient.execute(`INSERT OR IGNORE INTO schema_version (id, current_version) VALUES (1, 1)`);
  await _rawClient.execute(`INSERT OR IGNORE INTO app_settings (id, updated_at) VALUES (1, '')`);

  bootstrapComplete.value = true;
});

beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(financialYears);
  await db.delete(firms);
  await db.delete(writerLeases);

  await db.update(safeModeState)
    .set({ isActive: 0, reason: null, activatedAt: null, clearedAt: null })
    .where(eq(safeModeState.id, 1));

  useSafeModeStore.setState({ isActive: false, reason: null, activatedAt: null });
});

afterAll(async () => {
  const _rawClient = (db as any).__rawClient;
  if (_rawClient && typeof _rawClient.close === 'function') {
    _rawClient.close();
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const validFirmBase = {
  addressLine1: '123 Main St',
  city: 'Mumbai',
  stateCode: '27',
  stateName: 'Maharashtra',
  pincode: '400001',
  phone1: '9999999999',
};

function makeFirm(name: string, firmCode: string) {
  return { ...validFirmBase, name, firmCode, proprietor: 'Test Owner' };
}

// =============================================================================
// 1. LEASE GUARD TESTS
// =============================================================================
describe('Lease Guard Logic', () => {
  it('blocks firm creation when a system lease is active', async () => {
    await leaseService.acquire('BACKUP');
    await expect(firmService.createFirm(makeFirm('Test Firm', 'T1') as any))
      .rejects.toThrow('LEASE_HELD');
  });

  it('blocks firm archiving when a lease is active', async () => {
    const firm = await firmService.createFirm(makeFirm('F1', 'F1') as any);
    await db.delete(writerLeases);

    await firmService.createFirm(makeFirm('F2', 'F2') as any);
    await db.delete(writerLeases);

    await leaseService.acquire('SETTINGS_CHANGE');

    await expect(firmService.archiveFirm(firm.id))
      .rejects.toThrow('LEASE_HELD');
  });
});

// =============================================================================
// 2. FIRM LIMITS
// =============================================================================
describe('Firm Limits', () => {
  it('strictly enforces the 3-firm limit under atomic transactions', async () => {
    await firmService.createFirm(makeFirm('F1', 'F1') as any);
    await db.delete(writerLeases);
    await firmService.createFirm(makeFirm('F2', 'F2') as any);
    await db.delete(writerLeases);
    await firmService.createFirm(makeFirm('F3', 'F3') as any);
    await db.delete(writerLeases);

    await expect(firmService.createFirm(makeFirm('F4', 'F4') as any))
      .rejects.toThrow('MAX_FIRMS_REACHED');
  });

  it('correctly ignores archived firms in the active-firm archive gate', async () => {
    const f1 = await firmService.createFirm(makeFirm('F1', 'F1') as any);
    await db.delete(writerLeases);
    const f2 = await firmService.createFirm(makeFirm('F2', 'F2') as any);
    await db.delete(writerLeases);

    // FIX: The business logic blocks archiving the active firm.
    // We explicitly demote f1 and promote f2 to active to satisfy the guard.
    await db.update(firms).set({ isActive: 0 }).where(eq(firms.id, f1.id));
    await db.update(firms).set({ isActive: 1 }).where(eq(firms.id, f2.id));

    await firmService.archiveFirm(f1.id);
    await db.delete(writerLeases);

    await firmService.unarchiveFirm(f1.id);
    await db.delete(writerLeases);

    const f3 = await firmService.createFirm(makeFirm('F3', 'F3') as any);
    expect(f3.name).toBe('F3');
  });
});

// =============================================================================
// 3. SAFE MODE ENFORCEMENT
// =============================================================================
describe('Safe Mode Enforcement', () => {
  it('blocks firm updates when Safe Mode is activated', async () => {
    const firm = await firmService.createFirm(makeFirm('Healthy', 'H1') as any);
    await db.delete(writerLeases);

    await safeModeService.activate('VERIFY_CRITICAL_ISSUE');

    await expect(firmService.updateFirm(firm.id, { name: 'Changed' }))
      .rejects.toThrow('SAFE_MODE_ACTIVE');
  });
});

// =============================================================================
// 4. FIRMCODE IMMUTABILITY
// =============================================================================
describe('firmCode Immutability', () => {
  it('throws when trying to update firmCode via the service layer', async () => {
    const firm = await firmService.createFirm(makeFirm('F1', 'ORIGINAL') as any);
    await db.delete(writerLeases);

    await expect(firmService.updateFirm(firm.id, { firmCode: 'CHANGED' } as any))
      .rejects.toThrow('Firm Code is immutable');
  });

  it('emits FIRM_CODE_SET audit log with correct firmCode payload', async () => {
    await firmService.createFirm(makeFirm('AuditTest', 'AT1') as any);
    await db.delete(writerLeases);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventType, 'FIRM_CODE_SET' as any));

    expect(logs.length).toBe(1);
    const payload = JSON.parse(logs[0].payload || '{}');
    expect(payload.firmCode).toBe('AT1');
  });
});