// tests/__mocks__/setup.ts
// Jest native module mocks — pure JS only, zero native compilation required.
// NOTE: db/client mock is NOT here — it lives in phase1_fortress.test.ts
// because jest.mock() module resolution must be in the same file as the test.

import { AppState, Alert } from 'react-native';

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
    getRandomBytes: (length: number) => new Uint8Array(nodeCrypto.randomBytes(length)),
    getRandomValues: (array: Uint8Array) => {
      const bytes = nodeCrypto.randomBytes(array.length);
      array.set(bytes);
      return array;
    },
    digestStringAsync: async (_algo: any, data: string) => {
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    },
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  };
});

// ─── 3. MOCK: react-native-mmkv ──────────────────────────────────────────────

jest.mock('react-native-mmkv', () => {
  const createMockInstance = () => ({
    set: (key: string, value: string | boolean | number) => {
      mockKvStore[key] = String(value);
    },
    getString: (key: string) => mockKvStore[key] ?? undefined,
    getBoolean: (key: string) => mockKvStore[key] === 'true',
    remove: (key: string) => { delete mockKvStore[key]; },
    delete: (key: string) => { delete mockKvStore[key]; },
  });
  return {
    createMMKV: jest.fn().mockImplementation(createMockInstance),
    MMKV: jest.fn().mockImplementation(createMockInstance),
  };
});

// ─── 4. MOCK: expo-device ─────────────────────────────────────────────────────

jest.mock('expo-device', () => ({
  modelName: 'Jest Test Device',
  osName: 'Node.js',
}));

// ─── 5. MOCK: expo-file-system ───────────────────────────────────────────────

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async () => ({ exists: false }),
  writeAsStringAsync: async (uri: string, content: string) => {
    (global as any).__mockWriteFileUri = uri;
    (global as any).__mockWriteFileContent = content;
  },
  readAsStringAsync: async (uri: string) => {
    if (uri === (global as any).__mockWriteFileUri) {
      return (global as any).__mockWriteFileContent;
    }
    return '{}';
  },
  deleteAsync: async () => {},
  makeDirectoryAsync: async () => {},
  EncodingType: {
    UTF8: 'utf8',
  },
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/vjbilling-test/',
  cacheDirectory: '/tmp/vjbilling-test/',
  getInfoAsync: async () => ({ exists: false }),
  writeAsStringAsync: async (uri: string, content: string) => {
    (global as any).__mockWriteFileUri = uri;
    (global as any).__mockWriteFileContent = content;
  },
  readAsStringAsync: async (uri: string) => {
    if (uri === (global as any).__mockWriteFileUri) {
      return (global as any).__mockWriteFileContent;
    }
    return '{}';
  },
  deleteAsync: async () => {},
  makeDirectoryAsync: async () => {},
  EncodingType: {
    UTF8: 'utf8',
  },
}));

// ─── 6. MOCK: @react-native-async-storage/async-storage ──────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: async (key: string, value: string) => { mockAsyncStore[key] = value; },
  getItem: async (key: string) => mockAsyncStore[key] ?? null,
  removeItem: async (key: string) => { delete mockAsyncStore[key]; },
}));

// ─── 7. MOCK: react-native ───────────────────────────────────────────────────

// Safely intercept React Native methods without destroying the module initialization order (RN 0.85+)
jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as any);
jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

// ─── 8. MOCK: expo-updates ───────────────────────────────────────────────────

jest.mock('expo-updates', () => ({
  reloadAsync: async () => {},
}));

// ─── 9. MOCK: expo-sharing ──────────────────────────────────────────────────

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));

// ─── 10. MOCK: react-native-nitro-modules ─────────────────────────────────────

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    getNativeModule: jest.fn(),
    createHybridObject: jest.fn(),
    hasNativeModule: jest.fn(() => false),
  },
}));

// ─── 11. MOCK: react-native-worklets ──────────────────────────────────────────

jest.mock('react-native-worklets', () => ({
  useWorkletCallback: (fn: any) => fn,
  createWorklet: (fn: any) => fn,
  runOnJS: (fn: any) => fn,
  runOnUI: (fn: any) => fn,
}));

export {};