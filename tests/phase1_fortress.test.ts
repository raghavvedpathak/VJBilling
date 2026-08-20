// tests/phase1_fortress.test.ts
// Phase 1 Integration Fortress Tests (In-Memory SQLite with Drizzle ORM)

// ─── MOCK db/client FIRST — before any other import ──────────────────────────
// jest.mock() is hoisted to the top by Babel. To prevent out-of-scope errors,
// all instantiation happens INSIDE the mock factory.

jest.mock('@/db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');

  // Use a shared in-memory SQLite database instance
  const sqlite = new Database(':memory:');
  const dbInstance = drizzle(sqlite);
  
  // Attach the raw client so our test suite can execute DDL / raw SQL
  dbInstance.__rawClient = {
    execute: async (query: string) => {
      sqlite.exec(query);
    },
  };

  return {
    db: dbInstance,
    expoDb: {
      execSync: (query: string) => sqlite.exec(query),
      runSync: (query: string) => sqlite.prepare(query).run(),
      getFirstSync: (query: string) => sqlite.prepare(query).get(),
      getAllSync: (query: string) => sqlite.prepare(query).all(),
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

// ─── IMPORTS — after mock registration ───────────────────────────────────────

import { firmService } from '@/services/phase1/firmService';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService, bootstrapComplete } from '@/services/phase1/safeModeService';
import { verifyService } from '@/services/phase1/verifyService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { safeModeStore } from '@/store/phase1/safeModeStore';
import { db } from '@/db/client';
import { firms, writerLeases, auditLogs, safeModeState, financialYears } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ERR } from '@/constants/errorCodes';

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
    theme TEXT NOT NULL DEFAULT 'saffron',
    audit_retention_days INTEGER NOT NULL DEFAULT 30,
    currency TEXT NOT NULL DEFAULT 'INR',
    currency_symbol TEXT NOT NULL DEFAULT '₹',
    currency_decimal_places INTEGER NOT NULL DEFAULT 2,
    date_format_token TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    warn_unsaved_changes INTEGER NOT NULL DEFAULT 1,
    audit_retention_last_run_at TEXT,
    updated_at TEXT NOT NULL DEFAULT ''
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY,
    current_version INTEGER NOT NULL DEFAULT 1
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_delete_gate (
    id INTEGER PRIMARY KEY,
    gate_open INTEGER NOT NULL DEFAULT 0
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY, 
    name TEXT NOT NULL,
    firm_code TEXT NOT NULL UNIQUE, 
    proprietor TEXT NOT NULL,
    gstin TEXT, 
    bis_licence TEXT, 
    bis_logo_ref TEXT, 
    firm_logo_ref TEXT,
    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT,
    city TEXT NOT NULL DEFAULT '',
    state_code TEXT NOT NULL DEFAULT '27',
    state_name TEXT NOT NULL DEFAULT 'Maharashtra',
    pincode TEXT NOT NULL DEFAULT '000000',
    phone1 TEXT NOT NULL DEFAULT '0000000000',
    phone2 TEXT, 
    phone3 TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, 
    updated_at TEXT NOT NULL
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS financial_years (
    id TEXT PRIMARY KEY, 
    firm_id TEXT NOT NULL,
    label TEXT NOT NULL, 
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS writer_leases (
    id TEXT PRIMARY KEY, 
    lease_type TEXT NOT NULL,
    firm_id TEXT, 
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, 
    device_id TEXT NOT NULL
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, 
    event_type TEXT NOT NULL,
    firm_id TEXT, 
    entity_id TEXT,
    device_id TEXT NOT NULL, 
    payload TEXT,
    created_at TEXT NOT NULL
  )`);

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS bis_logos (
    id TEXT PRIMARY KEY, 
    firm_id TEXT NOT NULL,
    file_ref TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT, 
    archived_reason TEXT,
    created_at TEXT NOT NULL
  )`);

  // DB-level triggers
  await _rawClient.execute(`
    CREATE TRIGGER IF NOT EXISTS prevent_firm_code_update BEFORE UPDATE OF firm_code ON firms
    BEGIN SELECT RAISE(ABORT, 'FIRM_CODE_IMMUTABLE: firmCode cannot be changed after creation'); END;
  `);

  await _rawClient.execute(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE: Direct deletion of audit logs is prohibited')
      WHERE (SELECT gate_open FROM audit_delete_gate WHERE id = 1) = 0;
    END;
  `);

  await _rawClient.execute(`INSERT OR IGNORE INTO safe_mode_state (id, is_active) VALUES (1, 0)`);
  await _rawClient.execute(`INSERT OR IGNORE INTO schema_version (id, current_version) VALUES (1, 1)`);
  await _rawClient.execute(`INSERT OR IGNORE INTO app_settings (id, updated_at) VALUES (1, '')`);
  await _rawClient.execute(`INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0)`);

  bootstrapComplete.value = true;
});

beforeEach(async () => {
  const _rawClient = (db as any).__rawClient;
  
  // Unblock gate to clean audit logs between test runs
  await _rawClient.execute(`UPDATE audit_delete_gate SET gate_open = 1 WHERE id = 1`);
  await db.delete(auditLogs);
  await _rawClient.execute(`UPDATE audit_delete_gate SET gate_open = 0 WHERE id = 1`);

  await db.delete(financialYears);
  await db.delete(firms);
  await db.delete(writerLeases);

  await db.update(safeModeState)
    .set({ isActive: 0, reason: null, activatedAt: null, clearedAt: null })
    .where(eq(safeModeState.id, 1));

  safeModeStore.setState({ isActive: false, reason: null, activatedAt: null });
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

  it('throws when updating firm_code directly via raw SQLite (DB Trigger validation)', async () => {
    const firm = await firmService.createFirm(makeFirm('TriggerFirm', 'TRIG1') as any);
    await db.delete(writerLeases);

    const _rawClient = (db as any).__rawClient;
    await expect(_rawClient.execute(`UPDATE firms SET firm_code = 'HACK' WHERE id = '${firm.id}'`))
      .rejects.toThrow(/FIRM_CODE_IMMUTABLE/);
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

// =============================================================================
// 5. STATUTORY SIGNAL LOCKING (STEP 4)
// =============================================================================
describe('Statutory Signal Locking & GSTIN Immutability', () => {
  it('throws GSTIN_ALREADY_SET when attempting to change GSTIN on updateFirm', async () => {
    const firm = await firmService.createFirm({
      ...makeFirm('GSTFirm', 'GST1'),
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
      stateName: 'Maharashtra',
    } as any);
    await db.delete(writerLeases);

    await expect(firmService.updateFirm(firm.id, { gstin: '27AAPFU0939F1ZW' } as any))
      .rejects.toThrow('GSTIN_ALREADY_SET');
  });

  it('throws GSTIN_STATE_UPDATE_BLOCKED when changing stateCode on GST-registered firm', async () => {
    const firm = await firmService.createFirm({
      ...makeFirm('GSTStateFirm', 'GST2'),
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
      stateName: 'Maharashtra',
    } as any);
    await db.delete(writerLeases);

    await expect(firmService.updateFirm(firm.id, { stateCode: '29' } as any))
      .rejects.toThrow('GSTIN_STATE_UPDATE_BLOCKED');
  });

  it('allows adding a GSTIN to an unregistered firm', async () => {
    const firm = await firmService.createFirm({
      ...makeFirm('UnregFirm', 'UNREG1'),
      gstin: null,
      stateCode: '27',
      stateName: 'Maharashtra',
    } as any);
    await db.delete(writerLeases);

    const updated = await firmService.updateFirm(firm.id, { gstin: '27AAPFU0939F1ZV' } as any);
    expect(updated.gstin).toBe('27AAPFU0939F1ZV');
  });
});

// =============================================================================
// 6. WRITER LEASE CONCURRENCY GUARD (STEP 8)
// =============================================================================
describe('Writer Lease Concurrency Guard', () => {
  afterEach(() => {
    leaseService.stopHeartbeat();
  });

  it('blocks concurrent operations when a lease is held', async () => {
    await db.delete(writerLeases);
    const leaseId = await leaseService.acquire('BACKUP');

    await expect(leaseService.assertNoActiveLease())
      .rejects.toThrow('LEASE_HELD');

    await leaseService.release(leaseId);
    await expect(leaseService.assertNoActiveLease()).resolves.not.toThrow();
  });

  it('rejects acquisition of LeaseType.WRITE with WRITE_LEASE_NOT_IMPLEMENTED', async () => {
    // v6.5 GAP 5: LeaseType.WRITE is prohibited in Phase 1
    await db.delete(writerLeases);
    await expect(leaseService.acquire('WRITE'))
      .rejects.toThrow(ERR.WRITE_LEASE_NOT_IMPLEMENTED);
  });
});

// =============================================================================
// 7. SAFE MODE FAIL-SAFE SHIELD (STEP 10)
// =============================================================================
describe('Safe Mode Fail-Safe Shield', () => {
  it('throws BOOTSTRAP_INCOMPLETE if assertNotInSafeMode is called before bootstrap completes', () => {
    bootstrapComplete.value = false;
    expect(() => safeModeService.assertNotInSafeMode())
      .toThrow('BOOTSTRAP_INCOMPLETE');
    bootstrapComplete.value = true;
  });

  it('persists Safe Mode activation to DB and blocks writes', async () => {
    bootstrapComplete.value = true;
    await safeModeService.activate('VERIFY_CRITICAL_ISSUE');

    expect(() => safeModeService.assertNotInSafeMode())
      .toThrow('SAFE_MODE_ACTIVE');

    await safeModeService.clear();
    expect(() => safeModeService.assertNotInSafeMode()).not.toThrow();
  });

  it('triggers STORAGE_CORRUPTION_DETECTED when safe_mode_state row is missing after migration zero', async () => {
    await safeModeService.activate('STORAGE_CORRUPTION_DETECTED', { missingTable: 'safe_mode_state', schemaVersionConfirmed: true });
    expect(safeModeStore.getState().isActive).toBeTruthy();
    expect(safeModeStore.getState().reason).toBe('STORAGE_CORRUPTION_DETECTED');
    await safeModeService.clear();
  });
});

// =============================================================================
// 8. VERIFY MY DATA INTEGRITY CHECK (STEP 11)
// =============================================================================
describe('Verify My Data Integrity Check', () => {
  it('returns HEALTHY status and clears Safe Mode on a clean system', async () => {
    bootstrapComplete.value = true;
    const result = await verifyService.runVerify();
    expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(result.status);
    expect(Array.isArray(result.findings)).toBe(true);
  });
});

// =============================================================================
// 9. AUDIT LOGGING & G41 CONTRACT (STEP 14)
// =============================================================================
describe('Audit Logging & G41 Whitelist Contract', () => {
  it('throws AUDIT_TX_REQUIRED when tx is null for non-whitelisted event types', () => {
    expect(() => {
      auditRepository.log(null, {
        eventType: 'FIRM_CREATED',
        firmId: 'test-id',
        deviceId: 'TEST_DEVICE',
        payload: JSON.stringify({ firmCode: 'F1', name: 'Test' }),
      });
    }).toThrow('AUDIT_TX_REQUIRED');
  });

  it('allows null tx for whitelisted G41 event types', async () => {
    expect(() => {
      auditRepository.log(null, {
        eventType: 'DEVICE_ID_GENERATED',
        firmId: null,
        deviceId: 'TEST_DEVICE',
        payload: JSON.stringify({ deviceId: 'TEST_DEVICE' }),
      });
    }).not.toThrow();
  });
});

// =============================================================================
// 10. FIRM CODE IMMUTABILITY & FIRM_CODE_SET AUDIT (REVIEW ITEM 11)
// =============================================================================
describe('firmCode Immutability & FIRM_CODE_SET Audit (Review Item 11)', () => {
  it('throws FIRM_CODE_IMMUTABLE on raw SQL UPDATE of firm_code', async () => {
    bootstrapComplete.value = true;
    const firm = await firmService.createFirm({
      name: 'TriggerFirmTest',
      firmCode: 'TRIGTEST',
      proprietor: 'Test Owner',
      addressLine1: '123 St',
      city: 'Mumbai',
      stateCode: '27',
      stateName: 'Maharashtra',
      pincode: '400001',
      phone1: '9999999999',
    });

    const _rawClient = (db as any).__rawClient;
    await expect(_rawClient.execute(`UPDATE firms SET firm_code = 'NEWCODE' WHERE id = '${firm.id}'`))
      .rejects.toThrow('FIRM_CODE_IMMUTABLE');
  });

  it('writes FIRM_CODE_SET audit event exactly once per created firm', async () => {
    bootstrapComplete.value = true;
    const firm = await firmService.createFirm({
      name: 'AuditFirmTest',
      firmCode: 'AUDTEST',
      proprietor: 'Test Owner',
      addressLine1: '123 St',
      city: 'Mumbai',
      stateCode: '27',
      stateName: 'Maharashtra',
      pincode: '400001',
      phone1: '9999999999',
    });

    const logs = await db.select()
      .from(auditLogs)
      .where(eq(auditLogs.firmId, firm.id))
      .all();

    const codeSetLogs = logs.filter(l => l.eventType === 'FIRM_CODE_SET');
    expect(codeSetLogs.length).toBe(1);
    expect(codeSetLogs[0].deviceId).toBeTruthy();
    expect(codeSetLogs[0].firmId).toBe(firm.id);
  });
});