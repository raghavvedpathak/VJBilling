// tests/__mocks__/setup.ts
// Jest native module mocks — pure JS only, zero native compilation required.
// NOTE: db/client mock is NOT here — it lives in phase1_fortress.test.ts
// because jest.mock() module resolution must be in the same file as the test.

declare global {
  var __testLibsqlClient: any;
  var __testDrizzleDb: any;
}

const mockKvStore: Record<string, string> = { 'vjbilling_device_id': 'test-device-123' };
const mockAsyncStore: Record<string, string> = { 'vjbilling_device_id': 'test-device-123' };

// ─── 1. MOCK: expo-sqlite ─────────────────────────────────────────────────────

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => {},
    getFirstSync: () => ({ count: 0 }),
    getAllSync: () => [],
  }),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: () => ({}),
}));

jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: () => ({ success: true, error: null }),
}));

// ─── 2. MOCK: expo-crypto ─────────────────────────────────────────────────────

jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: async (_algo: any, data: string) => {
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    },
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  };
});

// ─── 3. MOCK: react-native-mmkv ──────────────────────────────────────────────

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: (key: string, value: string | boolean | number) => {
      mockKvStore[key] = String(value);
    },
    getString: (key: string) => mockKvStore[key] ?? undefined,
    getBoolean: (key: string) => mockKvStore[key] === 'true',
    delete: (key: string) => { delete mockKvStore[key]; },
  })),
}));

// ─── 4. MOCK: expo-device ─────────────────────────────────────────────────────

jest.mock('expo-device', () => ({
  modelName: 'Jest Test Device',
  osName: 'Node.js',
}));

// ─── 5. MOCK: expo-file-system ───────────────────────────────────────────────

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async () => ({ exists: false }),
  writeAsStringAsync: async () => {},
  readAsStringAsync: async () => '{}',
  deleteAsync: async () => {},
  makeDirectoryAsync: async () => {},
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/vjbilling-test/',
  cacheDirectory: '/tmp/vjbilling-test/',
  getInfoAsync: async () => ({ exists: false }),
  deleteAsync: async () => {},
}));

// ─── 6. MOCK: @react-native-async-storage/async-storage ──────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: async (key: string, value: string) => { mockAsyncStore[key] = value; },
  getItem: async (key: string) => mockAsyncStore[key] ?? null,
  removeItem: async (key: string) => { delete mockAsyncStore[key]; },
}));

// ─── 7. MOCK: react-native ───────────────────────────────────────────────────

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: () => ({ remove: () => {} }),
  },
  Alert: {
    alert: () => {},
  },
}));

// ─── 8. MOCK: expo-updates ───────────────────────────────────────────────────

jest.mock('expo-updates', () => ({
  reloadAsync: async () => {},
}));

// ─── 9. MOCK: expo-sharing ──────────────────────────────────────────────────

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));

export {};