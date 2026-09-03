// tests/backup_restore_reinstall.test.ts
// Validates unpassworded backup decryption resilience across device ID resets & reinstalls.

jest.mock('@/db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const schema = require('@/db/schema');

  const sqlite = new Database(':memory:');
  const dbInstance = drizzle(sqlite, { schema });
  
  dbInstance.__rawClient = {
    execute: async (query: string) => {
      sqlite.exec(query);
    }
  };

  return {
    db: dbInstance,
    default: dbInstance,
    expoDb: {
      execSync: () => {},
      runSync: () => {},
      getFirstSync: () => ({ count: 0 }),
      getAllSync: () => [],
    },
    useDatabase: () => ({ isLoaded: true, error: null }),
  };
});

import { backupService } from '@/services/phase1/backupService';
import { restoreService } from '@/services/phase1/restoreService';
import { getOrGenerateDeviceId } from '@/utils/deviceId';
import { storage } from '@/utils/storage';
import { db } from '@/db/client';
import { firms } from '@/db/schema';
import * as FileSystem from 'expo-file-system/legacy';

beforeAll(async () => {
  const _rawClient = (db as any).__rawClient;

  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS safe_mode_state (
    id INTEGER PRIMARY KEY DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 0, reason TEXT, activated_at TEXT, cleared_at TEXT
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1, theme TEXT NOT NULL DEFAULT 'saffron', audit_retention_days INTEGER NOT NULL DEFAULT 30, audit_retention_last_run_at TEXT, currency TEXT NOT NULL DEFAULT 'INR', currency_symbol TEXT NOT NULL DEFAULT '₹', currency_decimal_places INTEGER NOT NULL DEFAULT 2, date_format_token TEXT NOT NULL DEFAULT 'dd/MM/yyyy', warn_unsaved_changes INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT ''
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY, current_version INTEGER NOT NULL DEFAULT 1
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_delete_gate (
    id INTEGER PRIMARY KEY DEFAULT 1, gate_open INTEGER NOT NULL DEFAULT 0
  )`);
  await _rawClient.execute(`INSERT OR IGNORE INTO audit_delete_gate (id, gate_open) VALUES (1, 0)`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    firm_code TEXT NOT NULL UNIQUE, proprietor TEXT NOT NULL,
    gstin TEXT, bis_licence TEXT, bis_logo_ref TEXT, firm_logo_ref TEXT,
    address_line1 TEXT NOT NULL DEFAULT '', address_line2 TEXT, city TEXT NOT NULL DEFAULT '',
    state_code TEXT NOT NULL DEFAULT '27', state_name TEXT NOT NULL DEFAULT 'Maharashtra',
    pincode TEXT NOT NULL DEFAULT '000000', phone1 TEXT NOT NULL DEFAULT '0000000000',
    phone2 TEXT, phone3 TEXT, is_archived INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS financial_years (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, label TEXT NOT NULL, start_date TEXT NOT NULL,
    end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS writer_leases (
    id TEXT PRIMARY KEY, lease_type TEXT NOT NULL, firm_id TEXT, acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, device_id TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, firm_id TEXT, entity_id TEXT,
    device_id TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS audit_archive_index (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, fy_id TEXT NOT NULL, fy_label TEXT NOT NULL,
    archive_date TEXT NOT NULL, row_count INTEGER NOT NULL, storage_ref TEXT
  )`);
  await _rawClient.execute(`CREATE TABLE IF NOT EXISTS bis_logos (
    id TEXT PRIMARY KEY, firm_id TEXT NOT NULL, file_ref TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT, archived_reason TEXT, created_at TEXT NOT NULL
  )`);
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
    size_value REAL, size_unit TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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

  // Seed initial firm
  try {
    db.insert(firms).values({
      id: 'test-firm-1',
      name: 'Test Firm 1',
      firmCode: 'TF1',
      proprietor: 'Owner',
      addressLine1: 'Address 1',
      city: 'City',
      stateCode: '27',
      stateName: 'Maharashtra',
      pincode: '400001',
      phone1: '9999999999',
      isActive: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
  } catch {}
});

describe('Backup & Restore Reinstall Recovery', () => {
  test('Unpassworded backup can be decrypted after app data clear / device ID wipe', async () => {
    const deviceIdBefore = await getOrGenerateDeviceId();
    expect(deviceIdBefore).toBeDefined();

    // 1. Create backup before app data clear
    const result = await backupService.createBackup();
    expect(result.filePath).toBeDefined();

    // Read the created backup file content
    const backupContent = await FileSystem.readAsStringAsync(result.filePath, { encoding: 'utf8' as any });
    const envelope = JSON.parse(backupContent);
    expect(envelope.deviceId).toBe(deviceIdBefore);
    expect(envelope.passwordProtected).toBe(false);

    // 2. Simulate app data clear & reinstall by wiping MMKV device ID storage key
    storage.delete('vjbilling_device_id');

    // Generate NEW device ID (simulating fresh reinstall)
    const deviceIdAfter = await getOrGenerateDeviceId();
    expect(deviceIdAfter).not.toBe(deviceIdBefore);

    // 3. Restore backup using the new installation's context (Cryptographic Candidate Chain)
    await expect(restoreService.restore(backupContent)).resolves.not.toThrow();
  });
});