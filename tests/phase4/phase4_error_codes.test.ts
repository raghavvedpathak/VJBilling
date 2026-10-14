// tests/phase4/phase4_error_codes.test.ts
// STEP E — PHASE 4 ERROR CODE REGISTRY (GAP-ERROR-REGISTRY v1.8)
// Comprehensive test suite for all 19 Phase 4 error codes, throw sites, and UI message mappings.

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
  },
}));

jest.mock('@/services/phase1/safeModeService', () => ({
  safeModeService: {
    assertNotInSafeMode: jest.fn(),
  },
}));

import { db } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { ERROR_MESSAGES, getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { karigarFlowService } from '@/services/phase4/karigarFlowService';
import { refineryBatchService } from '@/services/phase4/refineryBatchService';
import { meltBatchService } from '@/services/phase4/meltBatchService';
import { karigarFlowRepository } from '@/repositories/phase4/karigarFlowRepository';
import { refineryBatchRepository } from '@/repositories/phase4/refineryBatchRepository';
import { meltBatchRepository } from '@/repositories/phase4/meltBatchRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';

describe('STEP E — PHASE 4 ERROR CODE REGISTRY', () => {
  let sqlite: any;
  const firmId = 'firm-err-test';

  beforeAll(() => {
    sqlite = (db as any).__rawClient.sqlite;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS firms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        firm_code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'SUPPLIER',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS karigar (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        allowed_wastage_pct REAL NOT NULL DEFAULT 0.0,
        wastage_type TEXT NOT NULL DEFAULT 'PERCENT',
        wastage_fixed_mg INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS old_metal_lots (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT NOT NULL,
        received_from TEXT NOT NULL,
        received_date TEXT NOT NULL,
        customer_id TEXT,
        sale_invoice_id TEXT,
        urd_purchase_id TEXT,
        gross_weight_mg INTEGER NOT NULL,
        metal TEXT NOT NULL DEFAULT 'GOLD',
        purity_percent REAL NOT NULL,
        fine_weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
        purchase_rate_paise INTEGER,
        total_amount_paise INTEGER,
        metal_source TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
        karigar_id TEXT NOT NULL,
        type TEXT NOT NULL,
        weight_mg INTEGER NOT NULL DEFAULT 0,
        purity_pct REAL NOT NULL DEFAULT 0,
        amount_paise INTEGER NOT NULL DEFAULT 0,
        linked_entity_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS item_events (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        firm_id TEXT NOT NULL,
        karigar_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        performed_by TEXT NOT NULL,
        reason TEXT,
        old_value TEXT,
        new_value TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        firm_id TEXT,
        event_type TEXT NOT NULL,
        entity_id TEXT,
        device_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    sqlite.prepare('INSERT OR IGNORE INTO firms (id, name, firm_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(firmId, 'Err Firm', 'EF1', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO suppliers (id, firm_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('sup-ref-1', firmId, 'National Refinery', 'REFINERY', '2026-01-01', '2026-01-01');
    sqlite.prepare('INSERT OR IGNORE INTO karigar (id, firm_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('kar-1', firmId, 'Gopal Goldsmith', '2026-01-01', '2026-01-01');
  });

  // ---------------------------------------------------------------------------
  // 1. Error Code Registry Constants & UI Message Mapping
  // ---------------------------------------------------------------------------
  test('All 19 Phase 4 error codes exist in ERR and have user-friendly ERROR_MESSAGES mapped', () => {
    const requiredCodes = [
      ERR.INVALID_LOT_SOURCE,
      ERR.KARIGAR_ISSUE_EXCEEDS_LOT,
      ERR.KARIGAR_ISSUE_WEIGHT_INVALID,
      ERR.KARIGAR_LOOP_LIMIT_EXCEEDED,
      ERR.KARIGAR_RETURN_WEIGHT_INVALID,
      ERR.KARIGAR_REVERSAL_HAS_RETURNS,
      ERR.KARIGAR_REVERSAL_NOT_ISSUED,
      ERR.INVALID_TEXT_CONTENT,
      ERR.REFINERY_OUTPUT_WEIGHT_INVALID,
      ERR.REFINERY_OUTPUT_PURITY_INVALID,
      ERR.REFINERY_OUTPUT_EXCEEDS_INPUT,
      ERR.REFINERY_BATCH_NOT_SENT,
      ERR.REFINERY_BATCH_NOT_RECEIVED,
      ERR.REFINERY_BATCH_NO_LOTS,
      ERR.REFINERY_BATCH_NOT_ALL_SETTLED,
      ERR.REFINERY_LOT_ALREADY_SETTLED,
      ERR.MELT_BATCH_NOT_CREATED,
      ERR.MELT_OUTPUT_WEIGHT_INVALID,
      ERR.REFINERY_SETTLEMENT_VARIANCE,
    ];

    expect(requiredCodes).toHaveLength(19);

    for (const code of requiredCodes) {
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(ERROR_MESSAGES[code]).toBeDefined();
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(10);

      // Verify getUserFriendlyErrorMessage returns the friendly message instead of raw constant
      const msg = getUserFriendlyErrorMessage(code);
      expect(msg).toBe(ERROR_MESSAGES[code]);
      expect(msg).not.toBe(code);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Step 9 Throw Sites: issueGoldToKarigar()
  // ---------------------------------------------------------------------------
  describe('Step 9 Throw Sites — issueGoldToKarigar()', () => {
    test('Throws KARIGAR_ISSUE_WEIGHT_INVALID if issuedGrossWeightMg <= 0', async () => {
      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: 'kar-1',
            sourceLotId: 'lot-x',
            issuedGrossWeightMg: 0,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_ISSUE_WEIGHT_INVALID);
    });

    test('Throws INVALID_LOT_SOURCE if lot.metalSource is not MELT_OUTPUT', async () => {
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-customer-raw',
        firmId,
        receivedFrom: 'Customer X',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 91.6,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      } as any);

      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: 'kar-1',
            sourceLotId: 'lot-customer-raw',
            issuedGrossWeightMg: 5000,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.INVALID_LOT_SOURCE);
    });

    test('Throws KARIGAR_ISSUE_EXCEEDS_LOT if issuedGrossWeightMg > lot.grossWeightMg', async () => {
      oldMetalLotRepository.insert(db as any, {
        id: 'lot-melt-small',
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 5000,
        metal: 'GOLD',
        purityPercent: 91.6,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: 'kar-1',
            sourceLotId: 'lot-melt-small',
            issuedGrossWeightMg: 6000,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_ISSUE_EXCEEDS_LOT);
    });

    test('Throws KARIGAR_LOOP_LIMIT_EXCEEDED if issue-return cycle count >= 3', async () => {
      const lotId = 'lot-loop-limit';
      oldMetalLotRepository.insert(db as any, {
        id: lotId,
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 50000,
        metal: 'GOLD',
        purityPercent: 91.6,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      // Create 3 past returns for karigar-1 + lot-loop-limit
      for (let i = 1; i <= 3; i++) {
        const iss = karigarFlowRepository.insertIssue(sqlite, {
          id: `iss-loop-${i}`,
          firmId,
          karigarId: 'kar-1',
          sourceLotId: lotId,
          issuedGrossWeightMg: 5000,
          issuedPurityPct: 91.6,
          issuedFineWeightMg: 4580,
          status: 'CLOSED',
          issueDate: '2026-10-10',
        });
        karigarFlowRepository.insertReturn(sqlite, {
          id: `ret-loop-${i}`,
          issueId: iss.id,
          grossWeightMg: 5000,
          purityPct: 91.6,
          fineWeightMg: 4580,
          returnDate: '2026-10-10',
        });
      }

      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: 'kar-1',
            sourceLotId: lotId,
            issuedGrossWeightMg: 5000,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_LOOP_LIMIT_EXCEEDED);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Step 9 Throw Sites: recordKarigarReturn() & reverseKarigarIssue()
  // ---------------------------------------------------------------------------
  describe('Step 9 Throw Sites — recordKarigarReturn() & reverseKarigarIssue()', () => {
    let activeIssueId: string;
    let lotRevId: string;

    beforeEach(() => {
      lotRevId = `lot-rev-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      oldMetalLotRepository.insert(db as any, {
        id: lotRevId,
        firmId,
        receivedFrom: 'Melt Output',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 91.6,
        metalSource: 'MELT_OUTPUT',
        status: 'ISSUED_TO_KARIGAR',
      } as any);

      const issue = karigarFlowRepository.insertIssue(sqlite, {
        id: `iss-rev-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        firmId,
        karigarId: 'kar-1',
        sourceLotId: lotRevId,
        issuedGrossWeightMg: 10000,
        issuedPurityPct: 91.6,
        issuedFineWeightMg: 9160,
        status: 'ISSUED',
        issueDate: '2026-10-10',
      });
      activeIssueId = issue.id;
    });

    test('Throws KARIGAR_RETURN_WEIGHT_INVALID if returnGrossWeightMg <= 0', async () => {
      await expect(
        karigarFlowService.recordKarigarReturn(
          activeIssueId,
          { grossWeightMg: 0, purityPct: 91.6 },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_RETURN_WEIGHT_INVALID);
    });

    test('Throws INVALID_TEXT_CONTENT if reversal reason fails sanitizeText()', async () => {
      await expect(
        karigarFlowService.reverseKarigarIssue(
          activeIssueId,
          '<script></script>',
          firmId
        )
      ).rejects.toThrow(ERR.INVALID_TEXT_CONTENT);
    });

    test('Throws KARIGAR_REVERSAL_HAS_RETURNS if returns exist on the issue', async () => {
      // Add return record
      karigarFlowRepository.insertReturn(sqlite, {
        id: `ret-exist-${Date.now()}`,
        issueId: activeIssueId,
        grossWeightMg: 2000,
        purityPct: 91.6,
        fineWeightMg: 1832,
        returnDate: '2026-10-10',
      });

      await expect(
        karigarFlowService.reverseKarigarIssue(
          activeIssueId,
          'Valid cancellation reason',
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_REVERSAL_HAS_RETURNS);
    });

    test('Throws KARIGAR_REVERSAL_NOT_ISSUED if issue.status is not ISSUED', async () => {
      sqlite.prepare("UPDATE karigar_issues SET status = 'CLOSED' WHERE id = ?").run(activeIssueId);

      await expect(
        karigarFlowService.reverseKarigarIssue(
          activeIssueId,
          'Valid cancellation reason',
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_REVERSAL_NOT_ISSUED);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Step 5 Throw Sites: refineryBatchService
  // ---------------------------------------------------------------------------
  describe('Step 5 Throw Sites — refineryBatchService', () => {
    let batchId: string;
    let lotId: string;

    beforeEach(() => {
      batchId = `batch-err-${Date.now()}`;
      lotId = `lot-ref-${Date.now()}`;

      refineryBatchRepository.insertBatch(sqlite, {
        id: batchId,
        firmId,
        supplierId: 'sup-ref-1',
        status: 'CREATED',
      });
    });

    test('Throws REFINERY_BATCH_NO_LOTS if sending batch with 0 lots', async () => {
      await expect(
        refineryBatchService.sendRefineryBatch(batchId, firmId)
      ).rejects.toThrow(ERR.REFINERY_BATCH_NO_LOTS);
    });

    test('Throws REFINERY_OUTPUT_WEIGHT_INVALID if grossWeightMg <= 0', async () => {
      await expect(
        refineryBatchService.receiveRefineryOutput(
          batchId,
          { grossWeightMg: 0, purityPercent: 99.5 },
          firmId
        )
      ).rejects.toThrow(ERR.REFINERY_OUTPUT_WEIGHT_INVALID);
    });

    test('Throws REFINERY_OUTPUT_PURITY_INVALID if purityPercent <= 0 or > 100', async () => {
      await expect(
        refineryBatchService.receiveRefineryOutput(
          batchId,
          { grossWeightMg: 10000, purityPercent: 105 },
          firmId
        )
      ).rejects.toThrow(ERR.REFINERY_OUTPUT_PURITY_INVALID);
    });

    test('Throws REFINERY_BATCH_NOT_SENT if receiveRefineryOutput called when status != SENT', async () => {
      // batch is currently CREATED
      await expect(
        refineryBatchService.receiveRefineryOutput(
          batchId,
          { grossWeightMg: 10000, purityPercent: 99.5 },
          firmId
        )
      ).rejects.toThrow(ERR.REFINERY_BATCH_NOT_SENT);
    });

    test('Throws REFINERY_OUTPUT_EXCEEDS_INPUT if output fine > 110% of totalInputFineMg', async () => {
      // Attach lot with 10,000 mg fine
      refineryBatchRepository.insertBatchLot(sqlite, {
        id: `bl-${Date.now()}`,
        batchId,
        lotId,
        inputFineMg: 10000,
        shareRatio: 1.0,
        settled: 0,
      });
      // Send batch
      await refineryBatchService.sendRefineryBatch(batchId, firmId);

      // Max allowed is 11,000 fine mg. Pass 12,000 gross @ 100% = 12,000 fine mg
      await expect(
        refineryBatchService.receiveRefineryOutput(
          batchId,
          { grossWeightMg: 12000, purityPercent: 100 },
          firmId
        )
      ).rejects.toThrow(ERR.REFINERY_OUTPUT_EXCEEDS_INPUT);
    });

    test('Throws REFINERY_BATCH_NOT_RECEIVED if settleRefineryBatchLot called when status != RECEIVED', async () => {
      // batch is currently SENT
      await expect(
        refineryBatchService.settleRefineryBatchLot(batchId, lotId, firmId)
      ).rejects.toThrow(ERR.REFINERY_BATCH_NOT_RECEIVED);
    });

    test('Throws REFINERY_LOT_ALREADY_SETTLED if lot.settled is already 1', async () => {
      refineryBatchRepository.updateBatch(sqlite, batchId, firmId, {
        status: 'RECEIVED',
        totalOutputFineMg: 9900,
      });
      // Add already settled lot
      refineryBatchRepository.insertBatchLot(sqlite, {
        id: `bl-settled-${Date.now()}`,
        batchId,
        lotId: 'lot-settled-1',
        inputFineMg: 10000,
        outputFineMg: 9900,
        shareRatio: 1.0,
        settled: 1,
      });

      await expect(
        refineryBatchService.settleRefineryBatchLot(batchId, 'lot-settled-1', firmId)
      ).rejects.toThrow(ERR.REFINERY_LOT_ALREADY_SETTLED);
    });

    test('Throws REFINERY_BATCH_NOT_ALL_SETTLED if closeRefineryBatch called with unsettled lots', async () => {
      refineryBatchRepository.updateBatch(sqlite, batchId, firmId, {
        status: 'RECEIVED',
      });
      refineryBatchRepository.insertBatchLot(sqlite, {
        id: `bl-unsettled-${Date.now()}`,
        batchId,
        lotId: 'lot-unsettled-1',
        inputFineMg: 10000,
        settled: 0,
      });

      await expect(
        refineryBatchService.closeRefineryBatch(batchId, firmId)
      ).rejects.toThrow(ERR.REFINERY_BATCH_NOT_ALL_SETTLED);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Step 6 Throw Sites: meltBatchService
  // ---------------------------------------------------------------------------
  describe('Step 6 Throw Sites — meltBatchService', () => {
    let meltBatchId: string;

    beforeEach(() => {
      meltBatchId = `mb-err-${Date.now()}`;
      meltBatchRepository.insertBatch(sqlite, {
        id: meltBatchId,
        firmId,
        status: 'CREATED',
      });
    });

    test('Throws MELT_OUTPUT_WEIGHT_INVALID if outputGrossWeightMg <= 0', async () => {
      await expect(
        meltBatchService.closeMeltBatch(
          {
            batchId: meltBatchId,
            outputGrossWeightMg: 0,
            outputPurityPct: 99.5,
          },
          firmId
        )
      ).rejects.toThrow(ERR.MELT_OUTPUT_WEIGHT_INVALID);
    });

    test('Throws MELT_BATCH_NOT_CREATED if batch.status is not CREATED', async () => {
      meltBatchRepository.updateBatch(sqlite, meltBatchId, firmId, {
        status: 'CLOSED',
      });

      await expect(
        meltBatchService.closeMeltBatch(
          {
            batchId: meltBatchId,
            outputGrossWeightMg: 5000,
            outputPurityPct: 99.5,
          },
          firmId
        )
      ).rejects.toThrow(ERR.MELT_BATCH_NOT_CREATED);
    });
  });
});
