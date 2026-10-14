// tests/phase4/phase4_refinery_melt.test.ts
// Test suite for Phase 4: Refinery Batches (Step 4 & 5) and Melt Batches (Step 6)

jest.mock('@/db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const schema = require('@/db/schema');

  const sqlite = new Database(':memory:');
  const dbInstance = drizzle(sqlite, { schema });

  let spCounter = 0;
  dbInstance.transaction = (cb: any) => {
    const spName = `sp_${++spCounter}`;
    sqlite.exec(`SAVEPOINT ${spName};`);
    try {
      const res = cb(dbInstance);
      if (res && typeof res.then === 'function') {
        return res
          .then((val: any) => {
            sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
            return val;
          })
          .catch((err: any) => {
            sqlite.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
            sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
            throw err;
          });
      }
      sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
      return res;
    } catch (err) {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
      sqlite.exec(`RELEASE SAVEPOINT ${spName};`);
      throw err;
    }
  };

  dbInstance.__rawClient = {
    execute: async (query: string) => sqlite.exec(query),
    sqlite,
  };

  return {
    db: dbInstance,
    default: dbInstance,
    expoDb: {
      execSync: (query: string) => sqlite.exec(query),
      runSync: (query: string, params: any[] = []) => sqlite.prepare(query).run(...params),
      getFirstSync: (query: string, params: any[] = []) => sqlite.prepare(query).get(...params),
      getAllSync: (query: string, params: any[] = []) => sqlite.prepare(query).all(...params),
      prepare: (query: string) => sqlite.prepare(query),
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

jest.mock('@/services/phase1/leaseService', () => ({
  leaseService: {
    assertNoActiveLease: jest.fn().mockResolvedValue(undefined),
    acquire: jest.fn().mockResolvedValue('test-lease-id'),
    release: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/phase1/safeModeService', () => ({
  safeModeService: {
    assertNotInSafeMode: jest.fn(),
    activate: jest.fn().mockResolvedValue(undefined),
    isSafeModeActive: jest.fn().mockReturnValue(false),
  },
  bootstrapComplete: { value: true },
}));

jest.mock('@/services/phase2/inventoryVerifyService', () => ({
  phase2VerifyService: {
    runVerify: jest.fn().mockResolvedValue([]),
  },
  inventoryVerifyService: {
    runVerify: jest.fn().mockResolvedValue([]),
  },
}));

import { db } from '@/db/client';
import { refineryBatchService } from '@/services/phase4/refineryBatchService';
import { meltBatchService } from '@/services/phase4/meltBatchService';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { karigarFlowRepository } from '@/repositories/phase4/karigarFlowRepository';
import { karigarMasterRepository } from '@/repositories/phase3/karigarMasterRepository';
import { karigarLedgerRepository } from '@/repositories/phase3/karigarLedgerRepository';
import { metalFlowService } from '@/services/phase4/metalFlowService';
import { karigarFlowService } from '@/services/phase4/karigarFlowService';
import { closeFY } from '@/services/phase2/fyInventoryService';
import {
  clearFYCloseHooks,
  registerFYCloseHook,
  fyCloseHooks,
  fyCoreService,
} from '@/services/phase1/fyService';
import {
  registerPhase4FYCloseHook,
  resetPhase4FYCloseHookRegistration,
} from '@/services/phase4/bootstrapPhase4';
import { items } from '@/db/schema';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { ERR } from '@/constants/errorCodes';

describe('Phase 4: Refinery Batches & Melt Batches (Steps 4, 5, 6)', () => {
  let sqlite: any;
  const firmId = 'firm-phase4-test';

  beforeAll(() => {
    sqlite = (db as any).__rawClient.sqlite;

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS firms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        firm_code TEXT NOT NULL,
        proprietor TEXT NOT NULL DEFAULT '',
        gstin TEXT,
        bis_licence TEXT,
        bis_logo_ref TEXT,
        firm_logo_ref TEXT,
        address_line1 TEXT NOT NULL DEFAULT '',
        address_line2 TEXT,
        city TEXT NOT NULL DEFAULT '',
        state_code TEXT NOT NULL DEFAULT '27',
        state_name TEXT NOT NULL DEFAULT 'Maharashtra',
        pincode TEXT NOT NULL DEFAULT '',
        phone1 TEXT NOT NULL DEFAULT '',
        phone2 TEXT,
        phone3 TEXT,
        is_archived INTEGER DEFAULT 0 NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT,
        event_type TEXT NOT NULL,
        entity_id TEXT,
        device_id TEXT NOT NULL,
        operator_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mobile TEXT,
        gstin TEXT,
        address TEXT,
        type TEXT NOT NULL DEFAULT 'SUPPLIER',
        bank_name TEXT,
        bank_account TEXT,
        ifsc TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS old_metal_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        received_from TEXT NOT NULL,
        received_date TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        metal TEXT NOT NULL DEFAULT 'GOLD',
        purity_percent REAL NOT NULL,
        metal_source TEXT NOT NULL DEFAULT 'CUSTOMER',
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'RECEIVED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        customer_id TEXT,
        sale_invoice_id TEXT,
        urd_purchase_id TEXT,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        total_amount_paise INTEGER
      );

      CREATE TABLE IF NOT EXISTS refinery_batches (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        sent_date TEXT,
        received_date TEXT,
        total_input_fine_mg INTEGER,
        total_output_fine_mg INTEGER,
        gain_loss_mg INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refinery_batch_lots (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        lotId TEXT,
        lot_id TEXT NOT NULL,
        input_fine_mg INTEGER NOT NULL,
        output_fine_mg INTEGER,
        share_ratio REAL,
        settled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refinery_output_lots (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        purity_percent REAL NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        metal_source TEXT NOT NULL DEFAULT 'REFINERY_OUTPUT',
        received_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS melt_batches (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        output_gross_weight_mg INTEGER,
        output_purity_pct REAL,
        output_fine_weight_mg INTEGER,
        output_lot_id TEXT,
        closed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS melt_batch_inputs (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        input_fine_mg INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mobile TEXT,
        address TEXT,
        speciality TEXT,
        bank_name TEXT,
        bank_account TEXT,
        ifsc TEXT,
        allowed_wastage_pct REAL NOT NULL DEFAULT 0.0,
        wastage_type TEXT NOT NULL DEFAULT 'PERCENT',
        wastage_fixed_mg INTEGER,
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_issues (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT NOT NULL,
        source_lot_id TEXT NOT NULL,
        issued_gross_weight_mg INTEGER NOT NULL,
        issued_purity_pct REAL NOT NULL,
        issued_fine_weight_mg INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED',
        issue_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_returns (
        id TEXT PRIMARY KEY NOT NULL,
        issue_id TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL,
        purity_pct REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL,
        return_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar_ledger (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT,
        karigar_id TEXT NOT NULL,
        type TEXT NOT NULL,
        weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_pct REAL NOT NULL DEFAULT 0,
        amount_paise INTEGER NOT NULL DEFAULT 0,
        rate_paise_per_gram INTEGER NOT NULL DEFAULT 0,
        is_manual_rate INTEGER NOT NULL DEFAULT 0,
        linked_entity_id TEXT,
        linked_job_work_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        category_id TEXT,
        design_id TEXT,
        sku TEXT NOT NULL,
        gross_weight_mg INTEGER NOT NULL DEFAULT 0,
        net_weight_mg INTEGER NOT NULL DEFAULT 0,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_percent REAL NOT NULL DEFAULT 91.6,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        hsn_code TEXT NOT NULL DEFAULT '7113',
        metal_source TEXT NOT NULL DEFAULT 'SUPPLIER_PURCHASE',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_archive_index (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        fy_id TEXT NOT NULL,
        fy_label TEXT NOT NULL,
        archive_date TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        storage_ref TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_delete_gate (
        id INTEGER PRIMARY KEY DEFAULT 1,
        gate_open INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        audit_retention_days INTEGER DEFAULT 30
      );
    `);

    sqlite.prepare(`INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0)`).run();
    sqlite.prepare(`INSERT OR IGNORE INTO app_settings (id, audit_retention_days) VALUES (1, 30)`).run();

    // Insert test firm
    sqlite.prepare(`
      INSERT INTO firms (id, name, firm_code, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(firmId, 'Phase 4 Jewellers', 'P4J');
  });

  describe('Refinery Batch Lifecycle (Step 4 & Step 5)', () => {
    let refinerySupplierId: string;
    let nonRefinerySupplierId: string;
    let lot1: any;
    let lot2: any;
    let meltOutputLot: any;

    beforeEach(() => {
      // Create suppliers
      refinerySupplierId = 'sup-refinery-1';
      nonRefinerySupplierId = 'sup-bullion-1';
      sqlite.prepare(`DELETE FROM suppliers`).run();
      sqlite.prepare(`
        INSERT INTO suppliers (id, firm_id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(refinerySupplierId, firmId, 'Apex Refinery', 'REFINERY');
      sqlite.prepare(`
        INSERT INTO suppliers (id, firm_id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(nonRefinerySupplierId, firmId, 'Bullion Dealer', 'BULLION');

      // Create test lots
      sqlite.prepare(`DELETE FROM old_metal_lots`).run();
      sqlite.prepare(`DELETE FROM refinery_batches`).run();
      sqlite.prepare(`DELETE FROM refinery_batch_lots`).run();
      sqlite.prepare(`DELETE FROM refinery_output_lots`).run();
      sqlite.prepare(`DELETE FROM audit_logs`).run();

      lot1 = (oldMetalLotRepository as any).insert(db as any, {
        id: 'lot-1',
        firmId,
        receivedFrom: 'Customer 1',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 9160,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      });

      lot2 = (oldMetalLotRepository as any).insert(db as any, {
        id: 'lot-2',
        firmId,
        receivedFrom: 'Customer 2',
        receivedDate: '2026-10-10',
        grossWeightMg: 20000,
        metal: 'GOLD',
        purityPercent: 75.0,
        fineWeightMg: 15000,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      });

      meltOutputLot = (oldMetalLotRepository as any).insert(db as any, {
        id: 'lot-melt-output',
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 90.0,
        fineWeightMg: 9000,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      });
    });

    test('Stage 1: Rejects non-REFINERY supplier', async () => {
      await expect(
        refineryBatchService.createRefineryBatch(
          { supplierId: nonRefinerySupplierId, lotIds: [lot1.id] },
          firmId
        )
      ).rejects.toThrow(ERR.SUPPLIER_NOT_REFINERY);
    });

    test('Stage 1: Rejects MELT_OUTPUT lots (P3-FIX-1)', async () => {
      await expect(
        refineryBatchService.createRefineryBatch(
          { supplierId: refinerySupplierId, lotIds: [meltOutputLot.id] },
          firmId
        )
      ).rejects.toThrow(ERR.LOT_NOT_ELIGIBLE_FOR_REFINERY);
    });

    test('Stage 1: Creates batch and sets shareRatio proportionally', async () => {
      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot1.id, lot2.id] },
        firmId
      );

      expect(batch).toBeDefined();
      expect(batch.status).toBe('CREATED');

      const batchLots = await refineryBatchService.getBatchLots(batch.id);
      expect(batchLots).toHaveLength(2);

      // Total input fine = 9160 + 15000 = 24160
      const bl1 = batchLots.find((l: any) => l.lotId === lot1.id);
      const bl2 = batchLots.find((l: any) => l.lotId === lot2.id);

      expect(bl1.shareRatio).toBeCloseTo(9160 / 24160, 4);
      expect(bl2.shareRatio).toBeCloseTo(15000 / 24160, 4);
    });

    test('Stage 2: Sends batch and computes totalInputFineMg', async () => {
      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot1.id, lot2.id] },
        firmId
      );

      await refineryBatchService.sendRefineryBatch(batch.id, firmId, '2026-10-11');
      const updated = await refineryBatchService.getBatchById(batch.id, firmId);

      expect(updated?.status).toBe('SENT');
      expect(updated?.totalInputFineMg).toBe(24160);
      expect(updated?.sentDate).toBe('2026-10-11');
    });

    test('Stage 3: Receive refinery output and enforces 110% yield plausibility guard', async () => {
      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot1.id, lot2.id] },
        firmId
      );
      await refineryBatchService.sendRefineryBatch(batch.id, firmId);

      // Exceeds 110% of 24160 (which is 26576) -> e.g. 30000 fine
      await expect(
        refineryBatchService.receiveRefineryOutput(
          batch.id,
          { grossWeightMg: 30000, purityPercent: 100 },
          firmId
        )
      ).rejects.toThrow(ERR.REFINERY_OUTPUT_EXCEEDS_INPUT);

      // Valid output: 24000 gross @ 99.5% = 23880 fine mg
      await refineryBatchService.receiveRefineryOutput(
        batch.id,
        { grossWeightMg: 24000, purityPercent: 99.5 },
        firmId
      );

      const receivedBatch = await refineryBatchService.getBatchById(batch.id, firmId);
      expect(receivedBatch?.status).toBe('RECEIVED');
      expect(receivedBatch?.totalOutputFineMg).toBe(23880);
    });

    test('Stage 4: Settles lots and closes batch', async () => {
      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot1.id, lot2.id] },
        firmId
      );
      await refineryBatchService.sendRefineryBatch(batch.id, firmId);
      await refineryBatchService.receiveRefineryOutput(
        batch.id,
        { grossWeightMg: 24000, purityPercent: 99.5 },
        firmId
      );

      // Trying to close before settling throws REFINERY_BATCH_NOT_ALL_SETTLED
      await expect(
        refineryBatchService.closeRefineryBatch(batch.id, firmId)
      ).rejects.toThrow(ERR.REFINERY_BATCH_NOT_ALL_SETTLED);

      // Settle lot 1
      const res1 = await refineryBatchService.settleRefineryBatchLot(batch.id, lot1.id, firmId);
      expect(res1.varianceWarning).toBe(false);

      // Settle lot 2
      const res2 = await refineryBatchService.settleRefineryBatchLot(batch.id, lot2.id, firmId);
      expect(res2.varianceWarning).toBe(false);

      // Close batch
      await refineryBatchService.closeRefineryBatch(batch.id, firmId);
      const closedBatch = await refineryBatchService.getBatchById(batch.id, firmId);
      expect(closedBatch?.status).toBe('CLOSED');
      // Gain/loss = output (23880) - input (24160) = -280 mg
      expect(closedBatch?.gainLossMg).toBe(-280);
    });
  });

  describe('Melt Batch Lifecycle (Step 6)', () => {
    let meltLot1: any;
    let meltLot2: any;
    let meltOutputLot: any;

    beforeEach(() => {
      sqlite.prepare(`DELETE FROM old_metal_lots`).run();
      sqlite.prepare(`DELETE FROM melt_batches`).run();
      sqlite.prepare(`DELETE FROM melt_batch_inputs`).run();
      sqlite.prepare(`DELETE FROM audit_logs`).run();

      meltLot1 = (oldMetalLotRepository as any).insert(db as any, {
        id: 'melt-lot-1',
        firmId,
        receivedFrom: 'Customer A',
        receivedDate: '2026-10-10',
        grossWeightMg: 15000,
        metal: 'GOLD',
        purityPercent: 80.0,
        fineWeightMg: 12000,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      });

      meltLot2 = (oldMetalLotRepository as any).insert(db as any, {
        id: 'melt-lot-2',
        firmId,
        receivedFrom: 'Customer B',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 90.0,
        fineWeightMg: 9000,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      });

      meltOutputLot = (oldMetalLotRepository as any).insert(db as any, {
        id: 'melt-lot-prev-output',
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 5000,
        metal: 'GOLD',
        purityPercent: 85.0,
        fineWeightMg: 4250,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      });
    });

    test('createMeltBatch: Guards against empty lot list', async () => {
      await expect(
        meltBatchService.createMeltBatch([], firmId)
      ).rejects.toThrow(ERR.MELT_BATCH_NO_LOTS);
    });

    test('createMeltBatch: Rejects lots that are MELT_OUTPUT or non-RECEIVED', async () => {
      // MELT_OUTPUT should be rejected
      await expect(
        meltBatchService.createMeltBatch([meltOutputLot.id], firmId)
      ).rejects.toThrow(ERR.LOT_NOT_ELIGIBLE_FOR_MELT);

      // Non-RECEIVED status lot should be rejected
      sqlite.prepare(`UPDATE old_metal_lots SET status = 'VOIDED' WHERE id = ?`).run(meltLot1.id);
      await expect(
        meltBatchService.createMeltBatch([meltLot1.id], firmId)
      ).rejects.toThrow(ERR.LOT_NOT_ELIGIBLE_FOR_MELT);
    });

    test('createMeltBatch: Creates batch, inserts inputs with fineWeightMg, and updates lot status to SENT_TO_MELT', async () => {
      const batch = await meltBatchService.createMeltBatch([meltLot1.id, meltLot2.id], firmId);

      expect(batch).toBeDefined();
      expect(batch.status).toBe('CREATED');
      expect(batch.firmId).toBe(firmId);

      // Verify inputs table
      const inputs = await meltBatchService.getBatchInputs(batch.id);
      expect(inputs).toHaveLength(2);

      const in1 = inputs.find((i: any) => i.lotId === meltLot1.id);
      const in2 = inputs.find((i: any) => i.lotId === meltLot2.id);

      // GAP-MELT-INPUT-FINE: fine weight taken directly from old_metal_lots row
      expect(in1.inputFineMg).toBe(12000);
      expect(in2.inputFineMg).toBe(9000);

      // Verify lots updated to SENT_TO_MELT
      const refreshedLot1 = (oldMetalLotRepository as any).getById(db as any, meltLot1.id, firmId);
      const refreshedLot2 = (oldMetalLotRepository as any).getById(db as any, meltLot2.id, firmId);
      expect(refreshedLot1.status).toBe('SENT_TO_MELT');
      expect(refreshedLot2.status).toBe('SENT_TO_MELT');

      // Verify live audit log (G41)
      const audit = sqlite.prepare(`SELECT * FROM audit_logs WHERE event_type = 'MELT_BATCH_CREATED'`).get();
      expect(audit).toBeDefined();
      expect(audit.entity_id).toBe(batch.id);
    });

    test('closeMeltBatch: Validates weights and purities', async () => {
      const batch = await meltBatchService.createMeltBatch([meltLot1.id], firmId);

      // Negative/zero weight
      await expect(
        meltBatchService.closeMeltBatch(batch.id, 0, 95.0, firmId)
      ).rejects.toThrow(ERR.INVALID_MELT_OUTPUT_WEIGHT);

      // Invalid purity (>100 or <=0)
      await expect(
        meltBatchService.closeMeltBatch(batch.id, 14000, 105.0, firmId)
      ).rejects.toThrow(ERR.INVALID_MELT_OUTPUT_PURITY);
    });

    test('closeMeltBatch: Computes output fine weight, inserts MELT_OUTPUT lot, closes batch, and logs audit', async () => {
      const batch = await meltBatchService.createMeltBatch([meltLot1.id, meltLot2.id], firmId);

      // Input gross = 25000 mg, Input fine = 21000 mg
      // Melt output gross = 24500 mg, purity = 85.5%
      // Expected fine = round(24500 * 85.5 / 100) = round(20947.5) = 20948 (ROUND_HALF_UP)
      await meltBatchService.closeMeltBatch(batch.id, 24500, 85.5, firmId);

      // Verify batch updated to CLOSED
      const closed = await meltBatchService.getBatchById(batch.id, firmId);
      expect(closed?.status).toBe('CLOSED');
      expect(closed?.outputGrossWeightMg).toBe(24500);
      expect(closed?.outputPurityPct).toBe(85.5);
      expect(closed?.outputFineWeightMg).toBe(20948);
      expect(closed?.outputLotId).toBeTruthy();
      expect(closed?.closedAt).toBeTruthy();

      // Verify output lot created in old_metal_lots
      const newLot = (oldMetalLotRepository as any).getById(db as any, closed?.outputLotId, firmId);
      expect(newLot).toBeDefined();
      expect(newLot.metalSource).toBe('MELT_OUTPUT');
      expect(newLot.status).toBe('RECEIVED');
      expect(newLot.grossWeightMg).toBe(24500);
      expect(newLot.purityPercent).toBe(85.5);
      expect(newLot.fineWeightMg).toBe(20948);

      // Verify live audit log (G41)
      const audit = sqlite.prepare(`SELECT * FROM audit_logs WHERE event_type = 'MELT_BATCH_CLOSED'`).get();
      expect(audit).toBeDefined();
      expect(audit.entity_id).toBe(batch.id);
    });

    test('closeMeltBatch: Prevents closing an already closed batch', async () => {
      const batch = await meltBatchService.createMeltBatch([meltLot1.id], firmId);
      await meltBatchService.closeMeltBatch(batch.id, 14000, 85.0, firmId);

      // Closing again should fail
      await expect(
        meltBatchService.closeMeltBatch(batch.id, 14000, 85.0, firmId)
      ).rejects.toThrow(ERR.INVALID_MELT_BATCH_STATUS);
    });
  });

  describe('Karigar Flow Schema (Step 7)', () => {
    let testKarigarId: string;
    let testLotId: string;

    beforeEach(() => {
      testKarigarId = 'karigar-test-1';
      testLotId = 'lot-test-1';

      sqlite.prepare(`DELETE FROM karigar_returns`).run();
      sqlite.prepare(`DELETE FROM karigar_issues`).run();
      sqlite.prepare(`DELETE FROM karigar`).run();
      sqlite.prepare(`DELETE FROM old_metal_lots`).run();

      // Test karigar with P4-M5 extensions
      karigarMasterRepository.insert({
        id: testKarigarId,
        firmId,
        name: 'Suresh Karigar',
        allowedWastagePct: 1.5,
        wastageType: 'PERCENT',
        wastageFixedMg: null,
      });

      // Test source lot
      oldMetalLotRepository.insert(db as any, {
        id: testLotId,
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-11',
        grossWeightMg: 10000,
        purityPercent: 91.6,
        fineWeightMg: 9160,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);
    });

    test('P4-M5: karigar table accepts allowedWastagePct, wastageType, and wastageFixedMg', () => {
      const k = karigarMasterRepository.findById(firmId, testKarigarId);
      expect(k).toBeDefined();
      expect(k?.allowedWastagePct).toBe(1.5);
      expect(k?.wastageType).toBe('PERCENT');
      expect(k?.wastageFixedMg).toBeNull();

      // Update to FIXED_MG
      const updated = karigarMasterRepository.update(firmId, testKarigarId, {
        wastageType: 'FIXED_MG',
        wastageFixedMg: 150,
      });
      expect(updated.wastageType).toBe('FIXED_MG');
      expect(updated.wastageFixedMg).toBe(150);
    });

    test('karigarIssues: Inserts and retrieves issue with ISSUED status', () => {
      const issue = karigarFlowRepository.insertIssue(db as any, {
        firmId,
        karigarId: testKarigarId,
        sourceLotId: testLotId,
        issuedGrossWeightMg: 10000,
        issuedPurityPct: 91.6,
        issuedFineWeightMg: 9160,
        status: 'ISSUED',
        issueDate: '2026-10-11',
      });

      expect(issue).toBeDefined();
      expect(issue.id).toBeTruthy();
      expect(issue.status).toBe('ISSUED');
      expect(issue.issuedGrossWeightMg).toBe(10000);
      expect(issue.issuedFineWeightMg).toBe(9160);

      const found = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(found).toBeDefined();
      expect(found?.karigarId).toBe(testKarigarId);
    });

    test('karigarIssues (REVIEW-4): Supports REVERSED, PARTIAL_RETURN, and CLOSED statuses', () => {
      const issue = karigarFlowRepository.insertIssue(db as any, {
        firmId,
        karigarId: testKarigarId,
        sourceLotId: testLotId,
        issuedGrossWeightMg: 10000,
        issuedPurityPct: 91.6,
        issuedFineWeightMg: 9160,
        status: 'ISSUED',
        issueDate: '2026-10-11',
      });

      // Update to PARTIAL_RETURN
      karigarFlowRepository.updateIssue(db as any, issue.id, firmId, { status: 'PARTIAL_RETURN' });
      let refreshed = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(refreshed?.status).toBe('PARTIAL_RETURN');

      // Update to CLOSED
      karigarFlowRepository.updateIssue(db as any, issue.id, firmId, { status: 'CLOSED' });
      refreshed = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(refreshed?.status).toBe('CLOSED');

      // Update to REVERSED (REVIEW-4)
      karigarFlowRepository.updateIssue(db as any, issue.id, firmId, { status: 'REVERSED' });
      refreshed = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(refreshed?.status).toBe('REVERSED');
    });

    test('karigarReturns: Inserts return linked to issue and queries by issueId', () => {
      const issue = karigarFlowRepository.insertIssue(db as any, {
        firmId,
        karigarId: testKarigarId,
        sourceLotId: testLotId,
        issuedGrossWeightMg: 10000,
        issuedPurityPct: 91.6,
        issuedFineWeightMg: 9160,
        status: 'ISSUED',
        issueDate: '2026-10-11',
      });

      const ret1 = karigarFlowRepository.insertReturn(db as any, {
        issueId: issue.id,
        grossWeightMg: 5000,
        purityPct: 91.6,
        fineWeightMg: 4580,
        returnDate: '2026-10-12',
      });

      const ret2 = karigarFlowRepository.insertReturn(db as any, {
        issueId: issue.id,
        grossWeightMg: 4800,
        purityPct: 91.6,
        fineWeightMg: 4397,
        returnDate: '2026-10-13',
      });

      expect(ret1).toBeDefined();
      expect(ret2).toBeDefined();

      const returns = karigarFlowRepository.getReturnsByIssueId(db as any, issue.id);
      expect(returns).toHaveLength(2);
      expect(returns.reduce((sum: number, r: any) => sum + r.fineWeightMg, 0)).toBe(4580 + 4397);
    });
  });

  describe('Metal Balance Engine & Location Summary (Step 8)', () => {
    let k1: string;
    let k2: string;

    beforeEach(() => {
      k1 = 'karigar-mb-1';
      k2 = 'karigar-mb-2';

      sqlite.prepare(`DELETE FROM audit_logs`).run();
      sqlite.prepare(`DELETE FROM old_metal_lots`).run();
      sqlite.prepare(`DELETE FROM karigar_ledger`).run();
      sqlite.prepare(`DELETE FROM items`).run();
      sqlite.prepare(`DELETE FROM karigar`).run();

      karigarMasterRepository.insert({
        id: k1,
        firmId,
        name: 'Ramesh Karigar',
      });

      karigarMasterRepository.insert({
        id: k2,
        firmId,
        name: 'Ganesh Karigar',
      });
    });

    test('Fine Balance Formula: Computes exact fine balance across all 11 terms', async () => {
      // Term 1: Opening Fine Balance (from FY_CLOSE_FINE_BALANCE audit event) = 100,000 mg
      sqlite.prepare(`
        INSERT INTO audit_logs (id, firm_id, event_type, entity_id, device_id, payload, created_at)
        VALUES (?, ?, 'FY_CLOSE_FINE_BALANCE', 'fy-prev', 'dev-1', ?, datetime('now'))
      `).run(
        'audit-fy-close',
        firmId,
        JSON.stringify({
          fyId: 'fy-prev',
          fineBalanceComponents: { totalOpeningFineMg: 100000 },
        })
      );

      // Term 2: + Purchase Fine (CUSTOMER / SUPPLIER_PURCHASE lots) = 20,000 mg
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-pur-1',
        firmId,
        receivedFrom: 'Customer X',
        receivedDate: '2026-10-10',
        grossWeightMg: 25000,
        metal: 'GOLD',
        purityPercent: 80.0,
        fineWeightMg: 20000,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      } as any);

      // Term 3: + Refinery Output Fine (REFINERY_OUTPUT lots) = 50,000 mg
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-ref-out-1',
        firmId,
        receivedFrom: 'Apex Refinery',
        receivedDate: '2026-10-10',
        grossWeightMg: 50500,
        metal: 'GOLD',
        purityPercent: 99.01,
        fineWeightMg: 50000,
        metalSource: 'REFINERY_OUTPUT',
        status: 'RECEIVED',
      } as any);

      // Term 4: + Melt Output Fine (MELT_OUTPUT lots) = 30,000 mg
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-melt-out-1',
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 35000,
        metal: 'GOLD',
        purityPercent: 85.71,
        fineWeightMg: 30000,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      // Term 5: + Karigar Return Fine (METAL_IN entries in karigar_ledger) = 15,000 mg (20000 @ 75%)
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'METAL_IN',
        weightMg: 20000,
        purityPct: 75.0,
      });

      // Term 6: - Sale Fine (fine weight of sold items) = 40,000 mg
      sqlite.prepare(`
        INSERT INTO items (id, firm_id, sku, gross_weight_mg, net_weight_mg, fine_weight_mg, status, created_at, updated_at)
        VALUES (?, ?, 'SKU-SOLD-1', 45000, 44000, 40000, 'SOLD', datetime('now'), datetime('now'))
      `).run('item-sold-1', firmId);

      // Term 7: - Karigar Issue Fine (METAL_OUT entries in karigar_ledger) = 60,000 mg (65502 @ 91.6%)
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'METAL_OUT',
        weightMg: 65502,
        purityPct: 91.6, // round(65502 * 0.916) = 60000
      });

      // Term 8: + Karigar Issue Reversal Fine (METAL_OUT_REVERSAL entries) = 10,000 mg
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'METAL_OUT_REVERSAL',
        weightMg: 10917,
        purityPct: 91.6, // round(10917 * 0.916) = 10000
      });

      // Term 9: - Refinery Input Fine (fine weight of lots SENT_TO_REFINERY) = 12,000 mg
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-sent-ref-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 15000,
        metal: 'GOLD',
        purityPercent: 80.0,
        fineWeightMg: 12000,
        metalSource: 'CUSTOMER',
        status: 'SENT_TO_REFINERY',
      } as any);

      // Term 10: - Melt Input Fine (fine weight of lots SENT_TO_MELT) = 8,000 mg
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-sent-melt-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 80.0,
        fineWeightMg: 8000,
        metalSource: 'CUSTOMER',
        status: 'SENT_TO_MELT',
      } as any);

      // Term 11: - Karigar Labour Gold (LABOUR_IN_GOLD entries) = 5,000 mg
      // ⚠️ P3-FIX-5: purityPct = 0, weightMg is already fine mg — NO MULTIPLY!
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'LABOUR_IN_GOLD',
        weightMg: 5000,
        purityPct: 0,
      });

      // Expected calculation:
      // + Opening:               100,000
      // + Purchase:             + 40,000 (20k in-hand + 12k sent ref + 8k sent melt)
      // + Refinery Output:      + 50,000
      // + Melt Output:          + 30,000
      // + Karigar Return:       + 15,000
      // − Sale Fine:            − 40,000
      // − Karigar Issue Fine:   − 60,000
      // + Karigar Issue Rev:    + 10,000
      // − Refinery Input Fine:  − 12,000
      // − Melt Input Fine:      −  8,000
      // − Karigar Labour Gold:  −  5,000
      // = Current Fine Balance:  120,000 mg

      const balance = await metalFlowService.getFineBalance(firmId);

      expect(balance.openingFineBalanceMg).toBe(100000);
      expect(balance.purchaseFineMg).toBe(40000);
      expect(balance.refineryOutputFineMg).toBe(50000);
      expect(balance.meltOutputFineMg).toBe(30000);
      expect(balance.karigarReturnFineMg).toBe(15000);
      expect(balance.saleFineMg).toBe(40000);
      expect(balance.karigarIssueFineMg).toBe(60000);
      expect(balance.karigarIssueReversalFineMg).toBe(10000);
      expect(balance.refineryInputFineMg).toBe(12000);
      expect(balance.meltInputFineMg).toBe(8000);
      expect(balance.karigarLabourGoldFineMg).toBe(5000);

      expect(balance.currentFineBalanceMg).toBe(120000);
    });

    test('CRITICAL RULE (P3-FIX-5): LABOUR_IN_GOLD row with purityPct=0 is deducted directly without multiplier', async () => {
      // If code incorrectly multiplied by purityPct / 100, labour in gold would evaluate to 0!
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'LABOUR_IN_GOLD',
        weightMg: 3500,
        purityPct: 0,
      });

      const balance = await metalFlowService.getFineBalance(firmId);
      expect(balance.karigarLabourGoldFineMg).toBe(3500);
      expect(balance.currentFineBalanceMg).toBe(-3500);

      const kBalance = await metalFlowService.getKarigarBalance(k1, firmId);
      expect(kBalance.labourGold).toBe(3500);
      expect(kBalance.outstanding).toBe(-3500);
    });

    test('Metal Location Summary (REVIEW-3): Categorizes metal locations without double-counting ISSUED_TO_KARIGAR', async () => {
      // 1. IN HAND: RECEIVED old metal lots (gross=10000, fine=9160)
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-in-hand-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 9160,
        status: 'RECEIVED',
      } as any);

      // 2. AT REFINERY: SENT_TO_REFINERY lots (gross=20000, fine=18000)
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-ref-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 20000,
        metal: 'GOLD',
        purityPercent: 90.0,
        fineWeightMg: 18000,
        status: 'SENT_TO_REFINERY',
      } as any);

      // 3. CONSUMED (MELT): SENT_TO_MELT lots (gross=15000, fine=12000)
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-melt-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 15000,
        metal: 'GOLD',
        purityPercent: 80.0,
        fineWeightMg: 12000,
        status: 'SENT_TO_MELT',
      } as any);

      // 4. SETTLED (REFINERY): SETTLED lots (gross=8000, fine=7200)
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-settled-1',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 8000,
        metal: 'GOLD',
        purityPercent: 90.0,
        fineWeightMg: 7200,
        status: 'SETTLED',
      } as any);

      // 5. ISSUED_TO_KARIGAR lot in old_metal_lots (REVIEW-3: MUST NOT BE DOUBLE COUNTED)
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-issued-k',
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 50000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 45800,
        status: 'ISSUED_TO_KARIGAR',
      } as any);

      // 6. WITH KARIGAR: Outstanding balance in karigar_ledger
      // k1 has METAL_OUT 25000 @ 91.6% = 22900 fine mg, and METAL_IN 5000 @ 91.6% = 4580 fine mg -> balance = 18320 fine mg
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'METAL_OUT',
        weightMg: 25000,
        purityPct: 91.6,
      });
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k1,
        type: 'METAL_IN',
        weightMg: 5000,
        purityPct: 91.6,
      });

      // k2 has METAL_OUT 10000 @ 90% = 9000 fine mg
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k2,
        type: 'METAL_OUT',
        weightMg: 10000,
        purityPct: 90.0,
      });

      const summary = await metalFlowService.getMetalLocationSummary(firmId);

      // In Hand
      expect(summary.inHand.lotCount).toBe(1);
      expect(summary.inHand.grossWeightMg).toBe(10000);
      expect(summary.inHand.fineWeightMg).toBe(9160);

      // At Refinery
      expect(summary.atRefinery.lotCount).toBe(1);
      expect(summary.atRefinery.grossWeightMg).toBe(20000);
      expect(summary.atRefinery.fineWeightMg).toBe(18000);

      // Consumed Melt
      expect(summary.consumedMelt.lotCount).toBe(1);
      expect(summary.consumedMelt.grossWeightMg).toBe(15000);
      expect(summary.consumedMelt.fineWeightMg).toBe(12000);

      // Settled Refinery
      expect(summary.settledRefinery.lotCount).toBe(1);
      expect(summary.settledRefinery.grossWeightMg).toBe(8000);
      expect(summary.settledRefinery.fineWeightMg).toBe(7200);

      // With Karigar: k1 (18320) + k2 (9000) = 27320 fine mg
      // REVIEW-3: Does NOT include lot-issued-k (45800)
      expect(summary.withKarigar.fineWeightMg).toBe(27320);
      expect(summary.withKarigar.karigarCount).toBe(2);

      // Total active fine weight in the business = inHand (9160) + atRefinery (18000) + withKarigar (27320)
      expect(summary.totalFineWeightMg).toBe(9160 + 18000 + 27320);
    });

    test('getMetalLocationSummary accepts fyId parameter without error', async () => {
      const summary = await metalFlowService.getMetalLocationSummary(firmId, 'FY-2026-27');
      expect(summary).toBeDefined();
      expect(summary.inHand).toBeDefined();
    });

    test('getKarigarBalance rejects fyId parameter per KARIGAR-BALANCE-SCOPE v1.9', async () => {
      await expect(
        metalFlowService.getKarigarBalance(k1, firmId, 'FY-2026-27' as any)
      ).rejects.toThrow('INVALID_ARGUMENT');
    });

    test('getKarigarBalance returns { issued, returned, labourGold, outstanding }', async () => {
      const k3 = 'karigar-step10-test';
      karigarMasterRepository.insert(db as any, {
        id: k3,
        firmId,
        name: 'Gopal Art',
      } as any);

      // 1. Issue 10,000 mg @ 90% = 9,000 fine mg
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k3,
        type: 'METAL_OUT',
        weightMg: 10000,
        purityPct: 90.0,
      });

      // 2. Return 4,000 mg @ 90% = 3,600 fine mg
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k3,
        type: 'METAL_IN',
        weightMg: 4000,
        purityPct: 90.0,
      });

      // 3. Labour in gold = 200 fine mg (purity 0, D2)
      karigarLedgerRepository.insert({
        firmId,
        karigarId: k3,
        type: 'LABOUR_IN_GOLD',
        weightMg: 200,
        purityPct: 0,
      });

      const bal = await metalFlowService.getKarigarBalance(k3, firmId);
      expect(bal.issued).toBe(9000);
      expect(bal.returned).toBe(3600);
      expect(bal.labourGold).toBe(200);
      // outstanding = 9000 - 3600 - 200 = 5200
      expect(bal.outstanding).toBe(5200);
      // valueOf returns outstanding
      expect(Number(bal)).toBe(5200);
    });
  });

  describe('Gain / Loss Reporting & Analytics (Step 10)', () => {
    let refinerySupplierId: string;

    beforeEach(() => {
      refinerySupplierId = 'sup-ref-s10';
      sqlite.prepare(`DELETE FROM suppliers WHERE id = ?`).run(refinerySupplierId);
      sqlite.prepare(`
        INSERT INTO suppliers (id, firm_id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(refinerySupplierId, firmId, 'Royal Refinery S10', 'REFINERY');
    });

    test('Per-batch analytics: computes yield % and negative gainLossMg (loss)', async () => {
      const lot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-s10-loss',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 100,
        fineWeightMg: 10000,
        status: 'RECEIVED',
      } as any);

      // 1. Create batch (input = 10,000 mg)
      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot.id] },
        firmId
      );

      // 2. Send batch
      await refineryBatchService.sendRefineryBatch(batch.id, firmId);

      // 3. Receive output = 9,800 mg (200 mg loss, 98% yield)
      await refineryBatchService.receiveRefineryOutput(
        batch.id,
        { grossWeightMg: 9800, purityPercent: 100 },
        firmId
      );

      // 4. Settle lot
      await refineryBatchService.settleLot(batch.id, lot.id, 9800, firmId);

      // 5. Close batch
      await refineryBatchService.closeRefineryBatch(batch.id, firmId);

      // Fetch analytics
      const analytics = await refineryBatchService.getBatchAnalytics(batch.id, firmId);
      expect(analytics.status).toBe('CLOSED');
      expect(analytics.totalInputFineMg).toBe(10000);
      expect(analytics.totalOutputFineMg).toBe(9800);
      expect(analytics.gainLossMg).toBe(-200); // 9800 - 10000
      expect(analytics.yieldPct).toBe(98.0); // (9800 / 10000) * 100
    });

    test('Per-batch analytics: computes yield % and positive gainLossMg (gain)', async () => {
      const lot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-s10-gain',
        firmId,
        receivedFrom: 'Customer',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 100,
        fineWeightMg: 10000,
        status: 'RECEIVED',
      } as any);

      const batch = await refineryBatchService.createRefineryBatch(
        { supplierId: refinerySupplierId, lotIds: [lot.id] },
        firmId
      );

      await refineryBatchService.sendRefineryBatch(batch.id, firmId);

      // Output = 10,050 mg (50 mg gain, 100.5% yield)
      await refineryBatchService.receiveRefineryOutput(
        batch.id,
        { grossWeightMg: 10050, purityPercent: 100 },
        firmId
      );

      await refineryBatchService.settleLot(batch.id, lot.id, 10050, firmId);
      await refineryBatchService.closeRefineryBatch(batch.id, firmId);

      const analytics = await refineryBatchService.getBatchAnalytics(batch.id, firmId);
      expect(analytics.status).toBe('CLOSED');
      expect(analytics.totalInputFineMg).toBe(10000);
      expect(analytics.totalOutputFineMg).toBe(10050);
      expect(analytics.gainLossMg).toBe(50); // positive gain
      expect(analytics.yieldPct).toBe(100.5);
    });

    test('Historical view: getGainLossReport aggregates all firm refinery batches', async () => {
      const report = await refineryBatchService.getGainLossReport(firmId);
      expect(report.totalBatches).toBeGreaterThanOrEqual(2);
      expect(report.totalInputFineMg).toBeGreaterThan(0);
      expect(report.totalOutputFineMg).toBeGreaterThan(0);
      expect(report.batches).toBeDefined();
      expect(typeof report.netGainLossMg).toBe('number');
      expect(typeof report.overallYieldPct).toBe('number');
    });
  });

  describe('Opening Fine Balance & FY Carry-Forward (Step 11 — MISALIGN-2 FIX & FIX-AUDIT-REPO v1.8)', () => {
    beforeEach(() => {
      sqlite.prepare(`DELETE FROM audit_logs WHERE event_type = 'FY_CLOSE_FINE_BALANCE'`).run();
      sqlite.prepare(`DELETE FROM old_metal_lots`).run();
      sqlite.prepare(`DELETE FROM karigar_ledger`).run();
    });

    test('auditRepository.findLatest() returns latest event with parsed payload', async () => {
      auditRepository.log(db as any, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
        entityId: 'fy-2025-26',
        payload: {
          fyId: 'fy-2025-26',
          closedAt: '2026-03-31T23:59:59Z',
          fineBalanceComponents: {
            karigarOutstandingFineMg: 5000,
            refineryOutstandingFineMg: 15000,
            openGoldLotFineMg: 30000,
            totalOpeningFineMg: 50000,
          },
        },
      });

      const latest = await auditRepository.findLatest(db as any, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
      });

      expect(latest).toBeDefined();
      expect(latest.eventType).toBe('FY_CLOSE_FINE_BALANCE');
      expect(latest.firmId).toBe(firmId);
      expect(latest.payload.fineBalanceComponents.totalOpeningFineMg).toBe(50000);
    });

    test('MISALIGN-2 FIX: metalFlowService.getFineBalance reads totalOpeningFineMg properly', async () => {
      auditRepository.log(db as any, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
        entityId: 'fy-2025-26',
        payload: {
          fyId: 'fy-2025-26',
          closedAt: '2026-03-31T23:59:59Z',
          fineBalanceComponents: {
            karigarOutstandingFineMg: 10000,
            refineryOutstandingFineMg: 20000,
            openGoldLotFineMg: 45000,
            totalOpeningFineMg: 75000,
          },
        },
      });

      const balance = await metalFlowService.getFineBalance(firmId);
      expect(balance.openingFineBalanceMg).toBe(75000);
      expect(balance.currentFineBalanceMg).toBe(75000);
    });

    test('MISALIGN-2 FIX: opening balance defaults to 0 when no prior FY close event exists', async () => {
      const balance = await metalFlowService.getFineBalance(firmId);
      expect(balance.openingFineBalanceMg).toBe(0);
    });
  });

  describe('Phase 4: FY Close Hook Registration (GAP-FY-HOOK-TYPE v1.8 — Step 11A)', () => {
    const testFyId = 'fy-step11a-2026';

    beforeEach(() => {
      clearFYCloseHooks();
      resetPhase4FYCloseHookRegistration();
      sqlite.prepare(`DELETE FROM karigar_ledger WHERE firm_id = ?`).run(firmId);
      sqlite.prepare(`DELETE FROM refinery_batches WHERE firm_id = ?`).run(firmId);
      sqlite.prepare(`DELETE FROM audit_logs WHERE firm_id = ?`).run(firmId);
      sqlite.prepare(`DELETE FROM financial_years WHERE firm_id = ?`).run(firmId);

      sqlite.prepare(`
        INSERT INTO financial_years (id, firm_id, label, start_date, end_date, status, created_at)
        VALUES (?, ?, '2026-27', '2026-04-01', '2027-03-31', 'ACTIVE', datetime('now'))
      `).run(testFyId, firmId);
    });

    test('karigarFlowService.getTotalOutstandingFineMg reads total karigar outstanding metal', async () => {
      const initial = await karigarFlowService.getTotalOutstandingFineMg(db as any, firmId);
      expect(initial).toBe(0);

      // METAL_OUT: 10,000 mg @ 90% purity = 9,000 mg fine
      karigarLedgerRepository.insert(db as any, {
        firmId,
        karigarId: 'karigar-1',
        type: 'METAL_OUT',
        weightMg: 10000,
        purityPct: 90,
      });

      // METAL_IN: 2,000 mg @ 90% purity = 1,800 mg fine
      karigarLedgerRepository.insert(db as any, {
        firmId,
        karigarId: 'karigar-1',
        type: 'METAL_IN',
        weightMg: 2000,
        purityPct: 90,
      });

      // Net = 9,000 - 1,800 = 7,200 mg
      const balance = await karigarFlowService.getTotalOutstandingFineMg(db as any, firmId);
      expect(balance).toBe(7200);

      // Test swapped signature (firmId, tx)
      const balanceSwapped = await karigarFlowService.getTotalOutstandingFineMg(firmId, db as any);
      expect(balanceSwapped).toBe(7200);
    });

    test('refineryBatchService.getTotalOutstandingFineMg sums totalInputFineMg of SENT and RECEIVED batches', async () => {
      const initial = await refineryBatchService.getTotalOutstandingFineMg(db as any, firmId);
      expect(initial).toBe(0);

      // Batch 1: CREATED -> NOT included
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, created_at, updated_at)
        VALUES ('rb-created', ?, 'sup-1', 'CREATED', 5000, datetime('now'), datetime('now'))
      `).run(firmId);

      // Batch 2: SENT -> included (15,000 mg)
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, created_at, updated_at)
        VALUES ('rb-sent', ?, 'sup-1', 'SENT', 15000, datetime('now'), datetime('now'))
      `).run(firmId);

      // Batch 3: RECEIVED -> included (25,000 mg input)
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, total_output_fine_mg, created_at, updated_at)
        VALUES ('rb-received', ?, 'sup-1', 'RECEIVED', 25000, 24500, datetime('now'), datetime('now'))
      `).run(firmId);

      // Batch 4: CLOSED -> NOT included
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, total_output_fine_mg, created_at, updated_at)
        VALUES ('rb-closed', ?, 'sup-1', 'CLOSED', 10000, 9900, datetime('now'), datetime('now'))
      `).run(firmId);

      // Total = 15,000 + 25,000 = 40,000 mg
      const outstanding = await refineryBatchService.getTotalOutstandingFineMg(db as any, firmId);
      expect(outstanding).toBe(40000);

      // Test swapped signature (firmId, tx)
      const outstandingSwapped = await refineryBatchService.getTotalOutstandingFineMg(firmId, db as any);
      expect(outstandingSwapped).toBe(40000);
    });

    test('registerPhase4FYCloseHook registers hook and returns expected FYCloseHookResult', async () => {
      // Setup karigar ledger: 8,000 mg
      karigarLedgerRepository.insert(db as any, {
        firmId,
        karigarId: 'karigar-1',
        type: 'METAL_OUT',
        weightMg: 8000,
        purityPct: 100,
      });

      // Setup refinery batch: 14,000 mg
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, created_at, updated_at)
        VALUES ('rb-direct-test', ?, 'sup-1', 'SENT', 14000, datetime('now'), datetime('now'))
      `).run(firmId);

      registerPhase4FYCloseHook();

      expect(fyCloseHooks.length).toBe(1);
      const hook = fyCloseHooks[0];
      const result = await hook(db as any, firmId, testFyId);

      expect(result).toEqual({
        karigarOutstandingFineMg: 8000,
        refineryOutstandingFineMg: 14000,
      });
    });

    test('closeFY() accumulates Phase 4 hook results before writing FY_CLOSE_FINE_BALANCE audit', async () => {
      // 1. Setup karigar metal outstanding (12,000 mg)
      karigarLedgerRepository.insert(db as any, {
        firmId,
        karigarId: 'karigar-1',
        type: 'METAL_OUT',
        weightMg: 12000,
        purityPct: 100,
      });

      // 2. Setup refinery metal outstanding (18,000 mg)
      sqlite.prepare(`
        INSERT INTO refinery_batches (id, firm_id, supplier_id, status, total_input_fine_mg, created_at, updated_at)
        VALUES ('rb-close-test', ?, 'sup-1', 'SENT', 18000, datetime('now'), datetime('now'))
      `).run(firmId);

      // 3. Register Phase 4 hook
      registerPhase4FYCloseHook();

      // 4. Run closeFY
      await closeFY(testFyId, firmId);

      // 5. Verify financial year status is CLOSED
      const fyRow = sqlite.prepare(`SELECT status FROM financial_years WHERE id = ?`).get(testFyId);
      expect(fyRow.status).toBe('CLOSED');

      // 6. Verify FY_CLOSE_FINE_BALANCE audit log contains accumulated components
      const auditEvent = await auditRepository.findLatest(db as any, {
        eventType: 'FY_CLOSE_FINE_BALANCE',
        firmId,
      });

      expect(auditEvent).toBeDefined();
      expect(auditEvent.payload.fyId).toBe(testFyId);
      expect(auditEvent.payload.fineBalanceComponents.karigarOutstandingFineMg).toBe(12000);
      expect(auditEvent.payload.fineBalanceComponents.refineryOutstandingFineMg).toBe(18000);

      const expectedTotal = 12000 + 18000 + (auditEvent.payload.fineBalanceComponents.openGoldLotFineMg ?? 0);
      expect(auditEvent.payload.fineBalanceComponents.totalOpeningFineMg).toBe(expectedTotal);
    });
  });
});


