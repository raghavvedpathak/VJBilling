// tests/phase2_inventory.test.ts — Phase 2 v2.24 Full Verification Test Suite

// ─── MOCK db/client FIRST ──────────────────────────
jest.mock('@/db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const sqlite = new Database(':memory:');
  const schema = require('@/db/schema');
  const dbInstance = drizzle(sqlite, { schema });

  // Patch transaction to prevent better-sqlite3 from swallowing Promise rejections
  dbInstance.transaction = (cb: any) => {
    return cb(dbInstance);
  };

  dbInstance.__rawClient = {
    execute: async (query: string) => {
      sqlite.exec(query);
    }
  };
  return {
    db: dbInstance,
    default: dbInstance,
    expoDb: {
      execSync: (query: string) => sqlite.exec(query),
      runSync: (query: string) => sqlite.prepare(query).run(),
      getFirstSync: (query: string) => sqlite.prepare(query).get(),
      getAllSync: (query: string) => sqlite.prepare(query).all(),
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

jest.mock('@/services/phase1/safeModeService', () => ({
  safeModeService: {
    assertNotInSafeMode: jest.fn(),
    clear: jest.fn(),
    activate: jest.fn().mockResolvedValue(undefined),
  }
}));

// ─── IMPORTS ───────────────────────────────────────
import { db } from '@/db/client';
import { eq, and } from 'drizzle-orm';
import { 
  categories, designs, items, itemEvents, sequenceCounters, oldGoldLots,
  gemstoneLots, stones, hsnCodes, auditLogs, auditArchiveIndex, designCategoryMap,
  financialYears, firms, appSettings, safeModeState, bisLogos, auditDeleteGate,
  designPurityThresholds, looseStockLots, looseStockEvents, urdPurchases, schemaVersion, writerLeases
} from '@/db/schema';
import { generateDesignPrefix, formatSKUDisplay } from '@/services/phase2/skuEngine';
import { ERR } from '@/constants/errorCodes';
import { 
  computeEffectivePricePaisePerGram, 
  computeEstTotalCostPaise 
} from '@/utils/calculations';
import { resolveFineWeightMg } from '@/utils/purity.constants';
import { gemstoneLotService } from '@/services/phase2/gemstoneLotService';
import { oldGoldLotService } from '@/services/phase2/oldGoldLotService';
import { inventorySearchService } from '@/services/phase2/inventorySearchService';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { itemService } from '@/services/phase2/itemService';
import { designService } from '@/services/phase2/designService';
import { karigarService } from '@/services/phase2/karigarService';
import { barcodeLabelService } from '@/services/phase2/barcodeLabelService';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { oldGoldLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { fyService } from '@/services/phase1/fyService';
import { urdPurchaseService } from '@/services/phase2/urdPurchaseService';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';

// ─── SETUP & TEARDOWN ──────────────────────────────────────────────────
beforeAll(async () => {
  const _rawClient = (db as any).__rawClient;

  // Phase 1 tables
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, firm_id TEXT, entity_id TEXT, device_id TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_archive_index (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, fy_id TEXT NOT NULL, fy_label TEXT NOT NULL, archive_date TEXT NOT NULL, row_count INTEGER NOT NULL, storage_ref TEXT
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS writer_leases (
    id TEXT PRIMARY KEY, lease_type TEXT NOT NULL, firm_id TEXT, acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL, device_id TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS safe_mode_state (
    id INTEGER PRIMARY KEY DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 0, reason TEXT, activated_at TEXT, cleared_at TEXT
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1, theme TEXT NOT NULL DEFAULT 'system', audit_retention_days INTEGER NOT NULL DEFAULT 30, audit_retention_last_run_at TEXT, currency TEXT NOT NULL DEFAULT 'INR', currency_symbol TEXT NOT NULL DEFAULT '₹', currency_decimal_places INTEGER NOT NULL DEFAULT 2, date_format_token TEXT NOT NULL DEFAULT 'dd/MM/yyyy', warn_unsaved_changes INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS bis_logos (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, file_ref TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0, archived_at TEXT, archived_reason TEXT, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_delete_gate (
    id INTEGER PRIMARY KEY DEFAULT 1, gate_open INTEGER NOT NULL DEFAULT 0
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY DEFAULT 1, current_version INTEGER NOT NULL DEFAULT 2
  )`);

  // Phase 2 tables (v2.24 canonical schema)
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', description TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', description TEXT, default_hsn TEXT, metal TEXT NOT NULL, stock_type TEXT NOT NULL DEFAULT 'SERIALIZED', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS design_purity_thresholds (
    design_id TEXT NOT NULL, purity_percent REAL NOT NULL, low_stock_threshold INTEGER NOT NULL, PRIMARY KEY (design_id, purity_percent)
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT NOT NULL, huid TEXT, design_id TEXT NOT NULL, category_id TEXT NOT NULL DEFAULT '', hsn_code TEXT NOT NULL DEFAULT '',
    metal TEXT NOT NULL, purity_percent REAL NOT NULL, purity_karat INTEGER NOT NULL,
    gross_weight_mg INTEGER NOT NULL, stone_weight_mg INTEGER NOT NULL DEFAULT 0, beads_weight_mg INTEGER NOT NULL DEFAULT 0, net_weight_mg INTEGER NOT NULL,
    fine_weight_mg INTEGER NOT NULL, wastage_percent REAL NOT NULL DEFAULT 0, fine_gold_charged_mg INTEGER, purchase_rate_paise INTEGER, making_charge_paise INTEGER, stone_cost_paise INTEGER, purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, metal_source TEXT NOT NULL, primary_stone_id TEXT, location TEXT, sale_invoice_id TEXT, purchase_invoice_id TEXT, phantom_stock_id TEXT DEFAULT NULL, barcode_reprint_required INTEGER NOT NULL DEFAULT 0,
    size_value REAL, size_unit TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS item_events (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL, firm_id TEXT NOT NULL, karigar_id TEXT, event_type TEXT NOT NULL, severity TEXT NOT NULL, performed_by TEXT NOT NULL, reason TEXT, old_value TEXT, new_value TEXT, timestamp TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS sequence_counters (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, month TEXT NOT NULL, year TEXT NOT NULL, current_seq INTEGER NOT NULL, last_used_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS stones (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS gemstone_lots (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, stone_id TEXT NOT NULL, name TEXT NOT NULL, weight_carat_x100 INTEGER NOT NULL, quantity INTEGER NOT NULL, purchase_rate_paise_per_carat INTEGER, total_purchase_amount_paise INTEGER, supplier_name TEXT, certification_ref TEXT, notes TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS old_gold_lots (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, received_from TEXT NOT NULL, received_date TEXT NOT NULL, customer_id TEXT, gross_weight_mg INTEGER NOT NULL, purity_percent REAL NOT NULL, fine_weight_mg INTEGER NOT NULL DEFAULT 0, purity_rounding_delta_mg INTEGER NOT NULL DEFAULT 0, purchase_rate_paise INTEGER, total_amount_paise INTEGER, metal_source TEXT NOT NULL, notes TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS urd_purchases (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, fy_id TEXT NOT NULL, urd_number TEXT, purchase_date TEXT NOT NULL,
    customer_id TEXT, customer_name TEXT NOT NULL, customer_address TEXT, customer_mobile TEXT, customer_aadhaar TEXT, customer_pan TEXT,
    metal_type TEXT NOT NULL, gross_weight_mg INTEGER NOT NULL, purity_percent REAL NOT NULL, fine_weight_mg INTEGER NOT NULL,
    rate_per_gram_paise INTEGER NOT NULL, total_value_paise INTEGER NOT NULL, payment_mode TEXT NOT NULL, bank_account_id TEXT,
    old_gold_lot_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS loose_stock_lots (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, design_id TEXT NOT NULL, purity_percent REAL NOT NULL, purity_karat INTEGER, metal TEXT NOT NULL, piece_count INTEGER NOT NULL DEFAULT 0, total_weight_mg INTEGER NOT NULL DEFAULT 0, hsn_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS loose_stock_events (
    id TEXT PRIMARY KEY, lot_id TEXT NOT NULL, firm_id TEXT NOT NULL, event_type TEXT NOT NULL, piece_count_delta INTEGER NOT NULL, weight_mg_delta INTEGER NOT NULL, purchase_rate_paise INTEGER, wastage_percent REAL, sale_invoice_id TEXT, performed_by TEXT NOT NULL, timestamp TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS hsn_codes (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, description TEXT NOT NULL, chapter TEXT NOT NULL DEFAULT '71', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS design_category_map (
    id TEXT PRIMARY KEY, design_id TEXT NOT NULL, category_id TEXT NOT NULL, firm_id TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS financial_years (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, label TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, firm_code TEXT NOT NULL UNIQUE, proprietor TEXT NOT NULL,
    gstin TEXT, bis_licence TEXT, bis_logo_ref TEXT, firm_logo_ref TEXT,
    address_line1 TEXT NOT NULL, address_line2 TEXT, city TEXT NOT NULL,
    state_code TEXT NOT NULL, state_name TEXT NOT NULL, pincode TEXT NOT NULL,
    phone1 TEXT NOT NULL, phone2 TEXT, phone3 TEXT, is_archived INTEGER DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
});

beforeEach(async () => {
  await db.delete(items);
  await db.delete(itemEvents);
  await db.delete(designs);
  await db.delete(designPurityThresholds);
  await db.delete(categories);
  await db.delete(sequenceCounters);
  await db.delete(stones);
  await db.delete(gemstoneLots);
  await db.delete(oldGoldLots);
  await db.delete(urdPurchases);
  await db.delete(looseStockLots);
  await db.delete(looseStockEvents);
  await db.delete(auditLogs);
  await db.delete(auditArchiveIndex);
  await db.delete(hsnCodes);
  await db.delete(designCategoryMap);
  await db.delete(financialYears);
  await db.delete(appSettings);
  await db.delete(safeModeState);
  await db.delete(bisLogos);
  await db.delete(auditDeleteGate);
  await db.delete(schemaVersion);
  await db.delete(writerLeases);
  await db.delete(firms);

  // Seed default settings and safe mode states
  await db.insert(appSettings).values({
    id: 1, theme: 'system', auditRetentionDays: 30, currency: 'INR', currencySymbol: '₹', currencyDecimalPlaces: 2, dateFormatToken: 'dd/MM/yyyy', warnUnsavedChanges: 1, updatedAt: new Date().toISOString()
  });
  await db.insert(safeModeState).values({
    id: 1, isActive: 0, reason: null, activatedAt: null, clearedAt: null
  });
  await db.insert(auditDeleteGate).values({
    id: 1, gateOpen: 0
  });
  await db.insert(schemaVersion).values({
    id: 1, currentVersion: 2
  });

  // Seed default firm
  await db.insert(firms).values({
    id: FIRM_ID,
    name: 'Test Firm',
    firmCode: 'TST',
    proprietor: 'Tester',
    addressLine1: 'Road 1',
    city: 'Mumbai',
    stateCode: '27',
    stateName: 'Maharashtra',
    pincode: '400001',
    phone1: '9999999999',
    isArchived: 0,
    isActive: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Insert mock category and HSN
  await db.insert(categories).values({
    id: 'CAT_1', firmId: FIRM_ID, name: 'Test Category', code: 'CAT',
    isActive: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  await db.insert(hsnCodes).values({
    id: 'HSN_7113', code: '7113', description: 'Jewellery', chapter: '71',
    isActive: 1, createdAt: new Date().toISOString()
  });
  await db.insert(financialYears).values({
    id: 'mock_fy', firmId: FIRM_ID, label: '2020-2030', 
    startDate: '2020-01-01', endDate: '2030-12-31', 
    status: 'ACTIVE', createdAt: new Date().toISOString()
  });
});

// ─── FIXTURES ──────────────────────────────────────
const FIRM_ID = 'TEST_FIRM_1';
let designCounter = 1;
async function createTestDesign(metal: 'GOLD' | 'SILVER' = 'GOLD') {
  const designId = 'mock_design_' + designCounter++;
  const name = metal === 'GOLD' ? 'Test Ring' : 'Silver Anklet';
  const code = metal === 'GOLD' ? 'RNG' : 'ANK';
  await db.insert(designs).values({
    id: designId,
    firmId: FIRM_ID,
    name,
    code,
    metal,
    stockType: 'SERIALIZED',
    defaultHsn: '7113',
    isActive: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id: designId, name, code, metal };
}

// ============================================================================
// TEST 1: SKU Engine & Price Preview Calculations
// ============================================================================
describe('SKU Engine & Price Preview Calculations', () => {
  it('generates correct Design Prefix (generateDesignPrefix)', () => {
    expect(generateDesignPrefix('Ring', 'GOLD')).toBe('RIN');
    expect(generateDesignPrefix('Ladies Ring', 'GOLD')).toBe('LRIN');
    expect(generateDesignPrefix('Gold Chain', 'GOLD')).toBe('GCHA');
    expect(generateDesignPrefix('Silver Payal', 'SILVER')).toBe('SPAY');
  });

  it('formats SKU Display correctly (formatSKUDisplay)', () => {
    expect(formatSKUDisplay('RIN-1225-0001')).toBe('RIN-1225-01'); // Minimum 2 digits
    expect(formatSKUDisplay('LRIN-0125-0010')).toBe('LRIN-0125-10');
    expect(formatSKUDisplay('CHA-1225-0100')).toBe('CHA-1225-100'); // 3 digits shown as is
  });

  it('computes effective price per gram and est total cost (FEAT-EFFECTIVE-PRICE-1 / FIX-EFFPRICE-PURITYROUND-1 v2.14)', () => {
    const effPrice22K = computeEffectivePricePaisePerGram(600000, 91.6, 5, 'GOLD');
    expect(effPrice22K).toBe(579600);

    const estTotalCost = computeEstTotalCostPaise(effPrice22K, 12000);
    expect(estTotalCost).toBe(6955200);

    const effPrice24K = computeEffectivePricePaisePerGram(700000, 99.9, 0, 'GOLD');
    expect(effPrice24K).toBe(700000);
  });
});

// ============================================================================
// TEST 2 & 3 & 11: createItem Validation, Wastage, Fine Weight
// ============================================================================
describe('createItem Validation & Weight Calculations', () => {
  it('throws ITEM_GROSS_WEIGHT_INVALID for <= 0 gross weight', async () => {
    const d = await createTestDesign();
    await expect(itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 0 }, FIRM_ID)).rejects.toThrow('ITEM_GROSS_WEIGHT_INVALID');
  });

  it('throws ITEM_PURITY_PERCENT_INVALID for > 100 purity', async () => {
    const d = await createTestDesign();
    await expect(itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 105, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID)).rejects.toThrow('ITEM_PURITY_PERCENT_INVALID');
  });

  it('throws ITEM_NET_WEIGHT_INVALID if stone+beads >= gross', async () => {
    const d = await createTestDesign();
    await expect(itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22,
      grossWeightMg: 1000, stoneWeightMg: 800, beadsWeightMg: 200 }, FIRM_ID)).rejects.toThrow('ITEM_NET_WEIGHT_INVALID');
  });

  it('calculates netWeightMg, fineWeightMg, and fineGoldChargedMg correctly', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22,
      grossWeightMg: 10000, stoneWeightMg: 1000, wastagePercent: 10,
    }, FIRM_ID);

    expect(item.netWeightMg).toBe(9000);
    expect(item.fineWeightMg).toBe(8244);
    expect(item.fineGoldChargedMg).toBe(9144);
  });

  it('leaves fineGoldChargedMg as null when wastage is 0', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22,
      grossWeightMg: 10000, wastagePercent: 0 }, FIRM_ID);
    expect(item.fineGoldChargedMg).toBeNull();
  });
});

// ============================================================================
// TEST 4: adjustWeight Guard & Logic
// ============================================================================
describe('adjustWeight Guard', () => {
  it('succeeds for DRAFT items and recalculates properly', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22,
      grossWeightMg: 10000, wastagePercent: 10 }, FIRM_ID);

    await itemService.adjustWeight(item.id, FIRM_ID, 12000, item.stoneWeightMg || 0, item.beadsWeightMg || 0, 'Typo');
    
    const [updated] = await db.select().from(items).where(eq(items.id, item.id));
    expect(updated?.netWeightMg).toBe(12000);
    expect(updated?.fineWeightMg).toBe(Math.round(12000 * 0.916));
    expect(updated?.fineGoldChargedMg).toBe(12192);

    const events = await db.select().from(itemEvents).where(eq(itemEvents.itemId, item.id));
    expect(events.map((e: any) => e.eventType)).toContain('WEIGHT_ADJUSTED');
  });

  it('throws ITEM_EDIT_LOCKED_TERMINAL_STATUS for SOLD items', async () => {
    const mockDesign = await createTestDesign();
    const item = await itemService.createItem({
      designId: mockDesign.id, categoryId: 'CAT_1', hsnCode: '7113', grossWeightMg: 10000,
      stoneWeightMg: 0, beadsWeightMg: 0, purityPercent: 91.6, purityKarat: 22,
    }, FIRM_ID);

    await db.update(items).set({ status: 'SOLD' }).where(eq(items.id, item.id));

    await expect(itemService.adjustWeight(item.id, FIRM_ID, 12000, item.stoneWeightMg || 0, item.beadsWeightMg || 0, 'Typo'))
      .rejects.toThrow('ITEM_EDIT_LOCKED_TERMINAL_STATUS');
  });
});

// ============================================================================
// TEST 6: Gemstone Validation
// ============================================================================
describe('Gemstone Validation', () => {
  it('throws for zero/negative weight and quantity', async () => {
    await db.insert(stones).values({ id: 'S1', firmId: FIRM_ID, name: 'Ruby', type: 'RUBY', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    
    await expect(gemstoneLotService.createGemstoneLot({
      stoneId: 'S1', name: 'Test', weightCaratX100: 0, quantity: 1
    }, FIRM_ID)).rejects.toThrow('GEMSTONE_WEIGHT_INVALID');

    await expect(gemstoneLotService.createGemstoneLot({
      stoneId: 'S1', name: 'Test', weightCaratX100: 100, quantity: 0
    }, FIRM_ID)).rejects.toThrow('GEMSTONE_QUANTITY_INVALID');
  });
});

// ============================================================================
// TEST 7: Design Soft-Delete
// ============================================================================
describe('Design Soft-Delete', () => {
  it('throws DESIGN_HAS_ACTIVE_ITEMS if design has AVAILABLE/DRAFT/KARIGAR items', async () => {
    const d = await createTestDesign();
    await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID);

    await expect(designService.softDeleteDesign(d.id, FIRM_ID))
      .rejects.toThrow('DESIGN_HAS_ACTIVE_ITEMS');
  });

  it('succeeds if items are SOLD', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID);
    await itemService.updateItemStatus(item.id, FIRM_ID, 'AVAILABLE');
    await itemService.updateItemStatus(item.id, FIRM_ID, 'SOLD');

    await expect(designService.softDeleteDesign(d.id, FIRM_ID)).resolves.not.toThrow();
  });
});

// ============================================================================
// TEST 10: FY Close
// ============================================================================
describe('FY Close', () => {
  it('is blocked by DRAFT items, delete unblocks it', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID);

    await db.delete(financialYears).where(eq(financialYears.firmId, FIRM_ID));
    await db.insert(financialYears).values({
      id: 'FY1', firmId: FIRM_ID, label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'ACTIVE', createdAt: new Date().toISOString()
    });

    const preClose = await fyService.preCloseChecks('FY1', FIRM_ID);
    expect(preClose.issues.some(i => i.code === 'FY_CLOSE_BLOCKED_DRAFT_ITEMS')).toBe(true);

    await itemService.deleteItem(item.id, FIRM_ID, 'Draft block resolution');

    const preCloseAfter = await fyService.preCloseChecks('FY1', FIRM_ID);
    expect(preCloseAfter.issues.some(i => i.code === 'FY_CLOSE_BLOCKED_DRAFT_ITEMS')).toBe(false);
  });

  it('successfully closes the financial year and records audit retention archive', async () => {
    await db.delete(financialYears).where(eq(financialYears.firmId, FIRM_ID));
    await db.insert(financialYears).values({
      id: 'FY1', firmId: FIRM_ID, label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'ACTIVE', createdAt: new Date().toISOString()
    });

    let hookFired = false;
    fyService.registerFYCloseHook((_tx, _firmId, _fyId) => {
      hookFired = true;
    });

    await fyService.closeFY('FY1', FIRM_ID);

    const closedFy = await db.select().from(financialYears).where(eq(financialYears.id, 'FY1')).limit(1).get() as any;
    expect(closedFy.status).toBe('CLOSED');
    expect(hookFired).toBe(true);

    const archiveRow = await db.select().from(auditArchiveIndex).where(eq(auditArchiveIndex.fyId, 'FY1')).limit(1).get() as any;
    expect(archiveRow).toBeDefined();
    expect(archiveRow.fyLabel).toBe('2026-27');
  });
});

// ============================================================================
// TEST 12: updateItem Guard & Extensions
// ============================================================================
describe('updateItem Guard', () => {
  it('allows updates for non-terminal items and records sparse changes', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID);

    await itemService.updateItem(item.id, FIRM_ID, { location: 'LOCKER' });
    
    const events = await db.select().from(itemEvents).where(eq(itemEvents.itemId, item.id));
    const editedEvent = events.find(e => e.eventType === 'ITEM_EDITED');
    expect(editedEvent).toBeDefined();

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, item.id));
    const editAudit = audits.find(a => a.eventType === 'ITEM_EDITED');
    const payload = JSON.parse(editAudit?.payload || '{}');
    expect(payload.changes.location).toBeDefined();
    expect(payload.changes.location.new).toBe('LOCKER');

    await db.update(items).set({ status: 'SOLD' }).where(eq(items.id, item.id));
    await expect(itemService.updateItem(item.id, FIRM_ID, { location: 'SHOP' }))
      .rejects.toThrow('ITEM_EDIT_LOCKED_TERMINAL_STATUS');
  });

  it('handles sizeValue and sizeUnit editing with pairing guard (GAP-P2-SIZE-EDIT-1)', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 1000 }, FIRM_ID);

    await expect(itemService.updateItem(item.id, FIRM_ID, { sizeValue: 10 }))
      .rejects.toThrow('ITEM_SIZE_PAIRING_INVALID');
    await expect(itemService.updateItem(item.id, FIRM_ID, { sizeUnit: 'INCH' }))
      .rejects.toThrow('ITEM_SIZE_PAIRING_INVALID');

    await itemService.updateItem(item.id, FIRM_ID, { sizeValue: 10, sizeUnit: 'INCH' });
    const detail = await inventoryDrillDownService.getItemDetail(FIRM_ID, item.id);
    expect(detail.sizeValue).toBe(10);
    expect(detail.sizeUnit).toBe('INCH');

    await itemService.updateItem(item.id, FIRM_ID, { sizeValue: null, sizeUnit: null });
    const detailCleared = await inventoryDrillDownService.getItemDetail(FIRM_ID, item.id);
    expect(detailCleared.sizeValue).toBeNull();
    expect(detailCleared.sizeUnit).toBeNull();
  });
});

// ============================================================================
// TEST 14: Phantom Inventory
// ============================================================================
describe('Phantom Inventory', () => {
  it('creates and reconciles phantom items properly', async () => {
    const d = await createTestDesign();
    const phantom = await itemService.createPhantomItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 5000 }, FIRM_ID);
    
    expect(phantom.status).toBe('PHANTOM_AVAILABLE');

    const realItem = await itemService.createItem({
      designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 5000 }, FIRM_ID);
    
    await db.update(items).set({ status: 'PHANTOM_SOLD' }).where(eq(items.id, phantom.id));
    await itemService.updateItemStatus(realItem.id, FIRM_ID, 'AVAILABLE');
    await itemService.reconcilePhantomItem(phantom.id, realItem.id, FIRM_ID);

    const [pAfter] = await db.select().from(items).where(eq(items.id, phantom.id));
    const [rAfter] = await db.select().from(items).where(eq(items.id, realItem.id));

    expect(pAfter?.status).toBe('PHANTOM_SOLD');
    expect(pAfter?.phantomStockId).toBe(realItem.id);
    expect(rAfter?.status).toBe('SOLD');
    expect(rAfter?.phantomStockId).toBe(phantom.id);
  });
});

// ============================================================================
// TEST 17: URD Purchases
// ============================================================================
describe('URD Purchases', () => {
  it('creates and confirms URD purchase with correct sequence numbering', async () => {
    const urd = await urdPurchaseService.createURDPurchase({
      customerName: 'Customer Test',
      purchaseDate: '2026-07-14',
      metalType: 'GOLD',
      grossWeightMg: 10000,
      purityPercent: 91.6,
      ratePerGramPaise: 600000,
      paymentMode: 'CASH',
    }, FIRM_ID);

    expect(urd.status).toBe('DRAFT');
    expect(urd.urdNumber).toBeNull();
    
    const oldGoldLot = await oldGoldLotRepository.getById(db as any, FIRM_ID, urd.oldGoldLotId);
    expect(oldGoldLot).toBeDefined();
    expect(oldGoldLot?.receivedFrom).toBe('Customer Test');
    expect(oldGoldLot?.grossWeightMg).toBe(10000);
    expect(oldGoldLot?.status).toBe('RECEIVED');

    const confirmed = await urdPurchaseService.confirmURDPurchase(urd.id, FIRM_ID);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.urdNumber).toBe('URD/2020-2030/0001');
  });
});

// ============================================================================
// TEST 18: Barcode Label and HUID Services
// ============================================================================
describe('Barcode Label and HUID Services', () => {
  it('generates barcode label data and logs barcode reprint events correctly', async () => {
    const d = await createTestDesign();
    const item = await itemService.createItem({
      designId: d.id,
      categoryId: 'CAT_1',
      hsnCode: '7113',
      purityPercent: 91.6,
      purityKarat: 22,
      grossWeightMg: 5000,
      stoneWeightMg: 500,
      beadsWeightMg: 500,
    }, FIRM_ID);

    const label = await barcodeLabelService.generateBarcodeLabel(item.id, FIRM_ID);
    expect(label.frontSide.designName).toBe(d.name);
    expect(label.frontSide.purityDisplay).toBe('22K');
    expect(label.frontSide.grossWeightDisplay).toBe('5.000 g');
    expect(label.frontSide.netWeightDisplay).toBe('4.000 g');
    expect(label.backSide.firmCode).toBe('TST');
    expect(label.backSide.barcodeValue).toBe(item.sku);
    expect(label.backSide.skuDisplay).toBe(formatSKUDisplay(item.sku));

    const updatedItem = await itemService.addHUID(item.id, FIRM_ID, 'HU1234');
    expect(updatedItem.huid).toBe('HU1234');
    expect(updatedItem.barcodeReprintRequired).toBe(1);

    await expect(
      itemService.addHUID(item.id, FIRM_ID, 'HU5678')
    ).rejects.toThrow('HUID_ALREADY_SET');

    await barcodeLabelService.logBarcodeReprint(item.id, FIRM_ID);
    const itemInDb = await db.select().from(items).where(eq(items.id, item.id)).limit(1).get() as any;
    expect(itemInDb.barcodeReprintRequired).toBe(0);
  });
});

// ============================================================================
// TEST 19: Low Stock Threshold (v2.13 FIX-LOWSTOCK-PURITYGRAIN-1)
// ============================================================================
describe('Low Stock Threshold (v2.13 FIX-LOWSTOCK-PURITYGRAIN-1)', () => {
  it('enforces low stock threshold configurations and alerts on variant grain', async () => {
    const d = await createTestDesign();
    
    await designService.updateDesignPurityLowStockThreshold(d.id, FIRM_ID, 91.6, 2);
    
    const [thresh] = await db.select().from(designPurityThresholds)
      .where(and(eq(designPurityThresholds.designId, d.id), eq(designPurityThresholds.purityPercent, 91.6)));
    expect(thresh.lowStockThreshold).toBe(2);

    let lowStock = await inventoryDrillDownService.getLowStockDesignPurityVariants(FIRM_ID);
    expect(lowStock.some(c => c.designId === d.id && c.purityPercent === 91.6)).toBe(true);

    for (let i = 0; i < 3; i++) {
      const item = await itemService.createItem({
        designId: d.id, categoryId: 'CAT_1', hsnCode: '7113', purityPercent: 91.6, purityKarat: 22, grossWeightMg: 5000
      }, FIRM_ID);
      await itemService.updateItemStatus(item.id, FIRM_ID, 'AVAILABLE');
    }

    lowStock = await inventoryDrillDownService.getLowStockDesignPurityVariants(FIRM_ID);
    expect(lowStock.some(c => c.designId === d.id && c.purityPercent === 91.6)).toBe(false);
  });
});