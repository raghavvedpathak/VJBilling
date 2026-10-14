// tests/phase4/phase4_karigar_flow.test.ts
// Test suite for Phase 4: Karigar Flow Services (Step 9)
// Covers:
// - issueGoldToKarigar (DOMAIN-FIX-1, FIX-ISSUE-WEIGHT, GAP-KARIGAR-LOOP, ISSUANCE-FINE-WEIGHT)
// - recordKarigarReturn (FIX-RETURN-TYPE, DECIMAL-FIX, WASTAGE-FIX)
// - recordLabourInGold (D2, P3-FIX-5 no-multiply rule, status === 'CLOSED')
// - reverseKarigarIssue (P3-FIX-3 build blocker, FIX-P4-SANITIZE-1, ALIGN-FIX-2)

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

import { db } from '@/db/client';
import { karigarFlowService } from '@/services/phase4/karigarFlowService';
import { karigarFlowRepository } from '@/repositories/phase4/karigarFlowRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { karigarMasterRepository } from '@/repositories/phase3/karigarMasterRepository';
import { karigarLedgerRepository } from '@/repositories/phase3/karigarLedgerRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { ERR } from '@/constants/errorCodes';

describe('Phase 4: Karigar Flow Services (Step 9)', () => {
  let sqlite: any;
  const firmId = 'firm-kflow-test';
  let karigar1: string;
  let karigarFixed: string;

  beforeAll(() => {
    sqlite = (db as any).__rawClient.sqlite;

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS firms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        firm_code TEXT NOT NULL,
        proprietor TEXT NOT NULL DEFAULT '',
        gstin TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
    `);

    // Insert firm
    sqlite.prepare(`
      INSERT INTO firms (id, name, firm_code, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(firmId, 'Karigar Test Jewellers', 'KTJ');

    // Insert test karigars
    karigar1 = 'k-pct-1';
    karigarMasterRepository.insert(db as any, {
      id: karigar1,
      firmId,
      name: 'Ramesh Goldsmith',
      allowedWastagePct: 2.0, // 2% allowed wastage
      wastageType: 'PERCENT',
    } as any);

    karigarFixed = 'k-fixed-1';
    karigarMasterRepository.insert(db as any, {
      id: karigarFixed,
      firmId,
      name: 'Suresh Master',
      allowedWastagePct: 0.0,
      wastageType: 'FIXED_MG',
      wastageFixedMg: 150, // 150 mg allowed wastage
    } as any);
  });

  describe('issueGoldToKarigar()', () => {
    let meltLot: any;
    let customerLot: any;

    beforeEach(() => {
      // Clear tables
      sqlite.exec(`DELETE FROM karigar_issues; DELETE FROM karigar_returns; DELETE FROM karigar_ledger; DELETE FROM item_events; DELETE FROM old_metal_lots;`);

      // 1. Valid MELT_OUTPUT lot
      meltLot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-melt-valid',
        firmId,
        receivedFrom: 'Melt Batch MB-001',
        receivedDate: '2026-10-10',
        grossWeightMg: 50000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 45800,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      // 2. Raw CUSTOMER lot
      customerLot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-customer-raw',
        firmId,
        receivedFrom: 'Customer Scrap',
        receivedDate: '2026-10-10',
        grossWeightMg: 50000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 45800,
        metalSource: 'CUSTOMER',
        status: 'RECEIVED',
      } as any);
    });

    it('successfully issues gold from MELT_OUTPUT lot to karigar', async () => {
      const issue = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar1,
          sourceLotId: meltLot.id,
          issuedGrossWeightMg: 20000,
          issuedPurityPct: 91.6,
        },
        firmId
      );

      expect(issue).toBeDefined();
      expect(issue.status).toBe('ISSUED');
      expect(issue.karigarId).toBe(karigar1);
      expect(issue.issuedGrossWeightMg).toBe(20000);
      expect(issue.issuedPurityPct).toBe(91.6);
      // ISSUANCE-FINE-WEIGHT v1.9: round(20000 * 91.6 / 100) = 18320
      expect(issue.issuedFineWeightMg).toBe(18320);

      // Verify old_metal_lot status updated to ISSUED_TO_KARIGAR
      const updatedLot = oldMetalLotRepository.getById(db as any, meltLot.id, firmId);
      expect(updatedLot?.status).toBe('ISSUED_TO_KARIGAR');

      // Verify karigar_ledger received METAL_OUT with gross weight
      const entries = karigarLedgerRepository.getEntriesByKarigar(firmId, karigar1);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('METAL_OUT');
      expect(entries[0].weightMg).toBe(20000); // GROSS weight
      expect(entries[0].purityPct).toBe(91.6);
      expect(entries[0].linkedEntityId).toBe(issue.id);

      // Verify karigar balance reflects issued metal
      const balance = karigarLedgerRepository.getMetalBalance(firmId, karigar1);
      expect(balance).toBe(18320);
    });

    it('DOMAIN-FIX-1: throws INVALID_LOT_SOURCE when trying to issue CUSTOMER raw lot', async () => {
      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: karigar1,
            sourceLotId: customerLot.id,
            issuedGrossWeightMg: 20000,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.INVALID_LOT_SOURCE);
    });

    it('FIX-ISSUE-WEIGHT: throws KARIGAR_ISSUE_WEIGHT_INVALID if weight <= 0', async () => {
      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: karigar1,
            sourceLotId: meltLot.id,
            issuedGrossWeightMg: 0,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_ISSUE_WEIGHT_INVALID);
    });

    it('FIX-ISSUE-WEIGHT: throws KARIGAR_ISSUE_EXCEEDS_LOT if weight > sourceLot.grossWeightMg', async () => {
      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: karigar1,
            sourceLotId: meltLot.id,
            issuedGrossWeightMg: 60000, // lot has 50000
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_ISSUE_EXCEEDS_LOT);
    });

    it('GAP-KARIGAR-LOOP: throws KARIGAR_LOOP_LIMIT_EXCEEDED when karigar has returned lot >= 3 times', async () => {
      // Simulate 3 prior returns for this karigar and lot
      const priorIssue = karigarFlowRepository.insertIssue(db as any, {
        firmId,
        karigarId: karigar1,
        sourceLotId: meltLot.id,
        issuedGrossWeightMg: 10000,
        issuedPurityPct: 91.6,
        issuedFineWeightMg: 9160,
        status: 'CLOSED',
        issueDate: '2026-10-01',
      });

      for (let i = 0; i < 3; i++) {
        karigarFlowRepository.insertReturn(db as any, {
          issueId: priorIssue.id,
          grossWeightMg: 3000,
          purityPct: 91.6,
          fineWeightMg: 2748,
          returnDate: '2026-10-02',
        });
      }

      // Check lifetime return count
      const count = karigarFlowRepository.countLifetimeReturns(
        db as any,
        karigar1,
        meltLot.id,
        firmId
      );
      expect(count).toBe(3);

      // Attempting to issue this lot to the same karigar again must fail
      await expect(
        karigarFlowService.issueGoldToKarigar(
          {
            karigarId: karigar1,
            sourceLotId: meltLot.id,
            issuedGrossWeightMg: 5000,
            issuedPurityPct: 91.6,
          },
          firmId
        )
      ).rejects.toThrow(ERR.KARIGAR_LOOP_LIMIT_EXCEEDED);
    });
  });

  describe('recordKarigarReturn()', () => {
    let issue: any;

    beforeEach(async () => {
      sqlite.exec(`DELETE FROM karigar_issues; DELETE FROM karigar_returns; DELETE FROM karigar_ledger; DELETE FROM item_events; DELETE FROM old_metal_lots;`);

      const meltLot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-melt-return-test',
        firmId,
        receivedFrom: 'Melt Batch',
        receivedDate: '2026-10-10',
        grossWeightMg: 50000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 45800,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      // Issue 10,000 mg @ 91.6% = 9,160 fine mg to karigar1 (2% allowed wastage)
      issue = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar1,
          sourceLotId: meltLot.id,
          issuedGrossWeightMg: 10000,
          issuedPurityPct: 91.6,
        },
        firmId
      );
    });

    it('records partial return correctly and updates status to PARTIAL_RETURN', async () => {
      // Karigar returns 5,000 mg @ 91.6% = 4,580 fine mg
      const result = await karigarFlowService.recordKarigarReturn(
        issue.id,
        {
          grossWeightMg: 5000,
          purityPct: 91.6,
        },
        firmId
      );

      expect(result).toBeDefined();
      expect(result.returnRecord).toBeDefined();
      expect(result.returnRecord?.fineWeightMg).toBe(4580);
      expect(result.issue?.status).toBe('PARTIAL_RETURN');

      // Check DB issue status
      const updatedIssue = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(updatedIssue?.status).toBe('PARTIAL_RETURN');

      // Check ledger
      const entries = karigarLedgerRepository.getEntriesByKarigar(firmId, karigar1);
      const returnEntries = entries.filter((e) => e.type === 'METAL_IN');
      expect(returnEntries).toHaveLength(1);
      expect(returnEntries[0].weightMg).toBe(5000);
      expect(returnEntries[0].purityPct).toBe(91.6);
    });

    it('records full return and updates status to CLOSED', async () => {
      // Karigar returns all 10,000 mg @ 91.6%
      const result = await karigarFlowService.recordKarigarReturn(
        issue.id,
        {
          grossWeightMg: 10000,
          purityPct: 91.6,
        },
        firmId
      );

      expect(result.wasteExceeded).toBe(false);
      expect(result.excessMg).toBe(0);
      expect(result.issue?.status).toBe('CLOSED');

      const updatedIssue = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(updatedIssue?.status).toBe('CLOSED');
    });

    it('WASTAGE-FIX: detects wastage exceeded when actual wastage > allowed wastage', async () => {
      // Karigar was issued 9160 fine mg. Allowed wastage is 2% = round(9160 * 0.02) = 183 fine mg.
      // Karigar returns only 8,000 mg @ 91.6% = 7,328 fine mg.
      // Actual wastage = 9160 - 7328 = 1832 fine mg.
      // 1832 > 183 -> wasteExceeded is true, excessMg = 1832 - 183 = 1649 mg.
      const result = await karigarFlowService.recordKarigarReturn(
        issue.id,
        {
          grossWeightMg: 8000,
          purityPct: 91.6,
        },
        firmId
      );

      expect(result.wasteExceeded).toBe(true);
      expect(result.excessMg).toBe(1832 - 183);

      // Verify audit log recorded KARIGAR_WASTAGE_EXCEEDED
      const audit = sqlite
        .prepare(`SELECT * FROM audit_logs WHERE event_type = 'KARIGAR_WASTAGE_EXCEEDED'`)
        .all();
      expect(audit.length).toBeGreaterThan(0);
    });

    it('WASTAGE-FIX: respects FIXED_MG wastage limit', async () => {
      // Issue to karigarFixed (150 mg fixed allowed wastage)
      const meltLot2 = oldMetalLotRepository.insert(db as any, {
        id: 'lot-fixed-k',
        firmId,
        receivedFrom: 'Melt Batch',
        receivedDate: '2026-10-10',
        grossWeightMg: 20000,
        metal: 'GOLD',
        purityPercent: 100,
        fineWeightMg: 20000,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      const fixedIssue = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigarFixed,
          sourceLotId: meltLot2.id,
          issuedGrossWeightMg: 10000,
          issuedPurityPct: 100,
        },
        firmId
      );

      // Return 9900 mg @ 100% -> actual wastage = 100 mg <= 150 mg
      const res1 = await karigarFlowService.recordKarigarReturn(
        fixedIssue.id,
        {
          grossWeightMg: 9900,
          purityPct: 100,
        },
        firmId
      );

      expect(res1.wasteExceeded).toBe(false);
      expect(res1.excessMg).toBe(0);
    });
  });

  describe('recordLabourInGold()', () => {
    let closedIssue: any;
    let openIssue: any;

    beforeEach(async () => {
      sqlite.exec(`DELETE FROM karigar_issues; DELETE FROM karigar_returns; DELETE FROM karigar_ledger; DELETE FROM item_events; DELETE FROM old_metal_lots;`);

      const lot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-labour-test',
        firmId,
        receivedFrom: 'Melt Batch',
        receivedDate: '2026-10-10',
        grossWeightMg: 30000,
        metal: 'GOLD',
        purityPercent: 100,
        fineWeightMg: 30000,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      openIssue = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar1,
          sourceLotId: lot.id,
          issuedGrossWeightMg: 10000,
          issuedPurityPct: 100,
        },
        firmId
      );

      // Complete return to close
      await karigarFlowService.recordKarigarReturn(
        openIssue.id,
        {
          grossWeightMg: 10000,
          purityPct: 100,
        },
        firmId
      );

      closedIssue = karigarFlowRepository.getIssueById(db as any, openIssue.id, firmId);
      expect(closedIssue.status).toBe('CLOSED');
    });

    it('records labour in gold for CLOSED issue with purityPct = 0 (P3-FIX-5)', async () => {
      await karigarFlowService.recordLabourInGold(closedIssue.id, 250, firmId);

      const entries = karigarLedgerRepository.getEntriesByKarigar(firmId, karigar1);
      const labourEntry = entries.find((e) => e.type === 'LABOUR_IN_GOLD');
      expect(labourEntry).toBeDefined();
      expect(labourEntry?.weightMg).toBe(250); // fine mg
      expect(labourEntry?.purityPct).toBe(0); // D2, P3-FIX-5 no-multiply rule
      expect(labourEntry?.linkedEntityId).toBe(closedIssue.id);

      // Audit recorded
      const audit = sqlite
        .prepare(`SELECT * FROM audit_logs WHERE event_type = 'KARIGAR_LABOUR_GOLD_RECORDED'`)
        .all();
      expect(audit.length).toBeGreaterThan(0);
    });

    it('throws INVALID_KARIGAR_ISSUE_STATUS if issue is not CLOSED', async () => {
      // Create new open issue
      const lot2 = oldMetalLotRepository.insert(db as any, {
        id: 'lot-labour-open',
        firmId,
        receivedFrom: 'Melt Batch',
        receivedDate: '2026-10-10',
        grossWeightMg: 10000,
        metal: 'GOLD',
        purityPercent: 100,
        fineWeightMg: 10000,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      const unclosed = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar1,
          sourceLotId: lot2.id,
          issuedGrossWeightMg: 5000,
          issuedPurityPct: 100,
        },
        firmId
      );

      await expect(
        karigarFlowService.recordLabourInGold(unclosed.id, 250, firmId)
      ).rejects.toThrow(ERR.INVALID_KARIGAR_ISSUE_STATUS);
    });
  });

  describe('reverseKarigarIssue() (P3-FIX-3 Build Blocker)', () => {
    let issue: any;
    let lot: any;

    beforeEach(async () => {
      sqlite.exec(`DELETE FROM karigar_issues; DELETE FROM karigar_returns; DELETE FROM karigar_ledger; DELETE FROM item_events; DELETE FROM old_metal_lots;`);

      lot = oldMetalLotRepository.insert(db as any, {
        id: 'lot-rev-test',
        firmId,
        receivedFrom: 'Melt Batch',
        receivedDate: '2026-10-10',
        grossWeightMg: 15000,
        metal: 'GOLD',
        purityPercent: 91.6,
        fineWeightMg: 13740,
        metalSource: 'MELT_OUTPUT',
        status: 'RECEIVED',
      } as any);

      issue = await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar1,
          sourceLotId: lot.id,
          issuedGrossWeightMg: 15000,
          issuedPurityPct: 91.6,
        },
        firmId
      );
    });

    it('successfully reverses an ISSUED issue atomically', async () => {
      await karigarFlowService.reverseKarigarIssue(
        issue.id,
        'Wrong karigar selected by operator',
        firmId
      );

      // 1. Check karigar_issue status is REVERSED
      const updatedIssue = karigarFlowRepository.getIssueById(db as any, issue.id, firmId);
      expect(updatedIssue?.status).toBe('REVERSED');

      // 2. Check sourceLot status returned to RECEIVED
      const updatedLot = oldMetalLotRepository.getById(db as any, lot.id, firmId);
      expect(updatedLot?.status).toBe('RECEIVED');

      // 3. Check karigar_ledger has METAL_OUT_REVERSAL
      const entries = karigarLedgerRepository.getEntriesByKarigar(firmId, karigar1);
      const revEntry = entries.find((e) => e.type === 'METAL_OUT_REVERSAL');
      expect(revEntry).toBeDefined();
      expect(revEntry?.weightMg).toBe(15000);
      expect(revEntry?.purityPct).toBe(91.6);

      // Karigar balance should now be 0
      const balance = karigarLedgerRepository.getMetalBalance(firmId, karigar1);
      expect(balance).toBe(0);

      // 4. Check ItemEvent appended
      const itemEvts = sqlite
        .prepare(`SELECT * FROM item_events WHERE event_type = 'KARIGAR_ISSUE_REVERSED'`)
        .all();
      expect(itemEvts).toHaveLength(1);
      expect(itemEvts[0].item_id).toBe(issue.id);
      expect(itemEvts[0].reason).toBe('Wrong karigar selected by operator');

      // 5. Check audit log OLD_METAL_LOT_STATUS_CHANGED
      const audit = sqlite
        .prepare(`SELECT * FROM audit_logs WHERE event_type = 'OLD_METAL_LOT_STATUS_CHANGED'`)
        .all();
      expect(audit.length).toBeGreaterThan(0);
    });

    it('rejects reversal if returns already exist (KARIGAR_ISSUE_HAS_RETURNS)', async () => {
      // Record a return
      await karigarFlowService.recordKarigarReturn(
        issue.id,
        {
          grossWeightMg: 5000,
          purityPct: 91.6,
        },
        firmId
      );

      await expect(
        karigarFlowService.reverseKarigarIssue(issue.id, 'Trying to reverse', firmId)
      ).rejects.toThrow(ERR.KARIGAR_ISSUE_HAS_RETURNS);
    });

    it('FIX-P4-SANITIZE-1: rejects reversal with invalid text content', async () => {
      // HTML only reason strips to empty
      await expect(
        karigarFlowService.reverseKarigarIssue(issue.id, '   <script></script>   ', firmId)
      ).rejects.toThrow(ERR.INVALID_TEXT_CONTENT);
    });
  });
});
