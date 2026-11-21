// tests/__mocks__/setup.ts — Phase 1 v8.1 Canonical Jest Mocks
// FIX-V81-1: StorageAccessFramework mock returns realistic Android SAF document URIs.

import { AppState, Alert } from 'react-native';

declare global {
  var __testLibsqlClient: any;
  var __testDrizzleDb: any;
}

// ─── 0. POLYFILL: Web Crypto API (Node.js WebCrypto for AES-GCM / PBKDF2) ───
const nodeCrypto = require('crypto');
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto?.subtle) {
  try {
    Object.defineProperty(globalThis, 'crypto', {
      value: nodeCrypto.webcrypto ?? nodeCrypto,
      writable: true,
      configurable: true,
    });
  } catch {}
}

const mockKvStore: Record<string, string> = { vjbilling_device_id: 'test-device-123' };
const mockAsyncStore: Record<string, string> = { vjbilling_device_id: 'test-device-123' };
const mockSecureStore: Record<string, string> = {};

// ─── 1. MOCK: expo-sqlite & expo-secure-store ─────────────────────────────────

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => {},
    getFirstSync: (query?: string) => {
      if (typeof query === 'string' && query.includes('cipher_version')) {
        return { cipher_version: '4.5.0' };
      }
      if (typeof query === 'string' && query.includes('foreign_keys')) {
        return { foreign_keys: 1 };
      }
      return { count: 0, n: 0 };
    },
    getAllSync: () => [],
    closeSync: () => {},
  }),
  deleteDatabaseAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, val: string) => {
    mockSecureStore[key] = val;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: () => ({}),
}));

jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: () => ({ success: true, error: null }),
  migrate: jest.fn().mockResolvedValue(undefined),
}));

// ─── 2. MOCK: expo-crypto & react-native-quick-crypto ─────────────────────────

jest.mock('expo-crypto', () => {
  const cryptoModule = require('crypto');
  return {
    randomUUID: () => cryptoModule.randomUUID(),
    getRandomBytes: (length: number) => new Uint8Array(cryptoModule.randomBytes(length)),
    getRandomValues: (array: Uint8Array) => {
      const bytes = cryptoModule.randomBytes(array.length);
      array.set(bytes);
      return array;
    },
    digestStringAsync: async (_algo: any, data: string) => {
      return cryptoModule.createHash('sha256').update(data).digest('hex');
    },
    CryptoDigestAlgorithm: {
      SHA256: 'SHA-256',
      SHA384: 'SHA-384',
      SHA512: 'SHA-512',
    },
  };
});

jest.mock('react-native-quick-crypto', () => {
  const cryptoModule = require('crypto');
  return {
    ...cryptoModule,
    install: jest.fn(),
    default: { ...cryptoModule, install: jest.fn() },
    Buffer: global.Buffer || require('buffer').Buffer,
  };
});

// ─── 3. MOCK: react-native-mmkv ──────────────────────────────────────────────

jest.mock('react-native-mmkv', () => {
  const createMockInstance = () => ({
    set: jest.fn((key: string, value: string | boolean | number) => {
      mockKvStore[key] = String(value);
    }),
    getString: jest.fn((key: string) => mockKvStore[key] ?? undefined),
    getBoolean: jest.fn((key: string) => mockKvStore[key] === 'true'),
    getNumber: jest.fn((key: string) =>
      mockKvStore[key] !== undefined ? Number(mockKvStore[key]) : undefined
    ),
    contains: jest.fn((key: string) => key in mockKvStore),
    remove: jest.fn((key: string) => {
      delete mockKvStore[key];
    }),
    delete: jest.fn((key: string) => {
      delete mockKvStore[key];
    }),
    clearAll: jest.fn(() => {
      Object.keys(mockKvStore).forEach((k) => delete mockKvStore[k]);
    }),
    getAllKeys: jest.fn(() => Object.keys(mockKvStore)),
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

// ─── 5. MOCK: expo-file-system & legacy (FIX-V81-1 real-format SAF URIs) ─────

const SAF_DOCUMENTS_TREE =
  'content://com.android.externalstorage.documents/tree/primary%3ADocuments';

const buildSafChildUri = (parentUri: string, childName: string): string => {
  const treeMatch = parentUri.match(/^(content:\/\/[^/]+\/tree\/[^/]+)/);
  const treeBase = treeMatch?.[1] ?? SAF_DOCUMENTS_TREE;
  const parentDocId = parentUri.includes('/document/')
    ? decodeURIComponent(parentUri.split('/document/').pop() ?? 'primary:Documents')
    : decodeURIComponent(treeBase.split('/tree/').pop() ?? 'primary:Documents');
  const nextDocId = parentDocId.endsWith(':')
    ? `${parentDocId}${childName}`
    : `${parentDocId}/${childName}`;
  return `${treeBase}/document/${encodeURIComponent(nextDocId)}`;
};

const mockFileSystem = {
  documentDirectory: '/tmp/vjbilling-test/',
  cacheDirectory: '/tmp/vjbilling-test/',
  getInfoAsync: jest.fn().mockImplementation(async (uri: string) => ({
    exists: uri === (global as any).__mockWriteFileUri,
    size: (global as any).__mockWriteFileContent
      ? (global as any).__mockWriteFileContent.length
      : 0,
  })),
  writeAsStringAsync: jest.fn().mockImplementation(async (uri: string, content: string) => {
    (global as any).__mockWriteFileUri = uri;
    (global as any).__mockWriteFileContent = content;
  }),
  readAsStringAsync: jest.fn().mockImplementation(async (uri: string) => {
    if (uri === (global as any).__mockWriteFileUri) {
      return (global as any).__mockWriteFileContent;
    }
    return '{}';
  }),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: {
    UTF8: 'utf8',
    Base64: 'base64',
  },
  StorageAccessFramework: {
    getUriForDirectoryInRoot: jest.fn().mockReturnValue(SAF_DOCUMENTS_TREE),
    requestDirectoryPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ granted: true, directoryUri: SAF_DOCUMENTS_TREE }),
    readDirectoryAsync: jest.fn().mockResolvedValue([]),
    makeDirectoryAsync: jest
      .fn()
      .mockImplementation(async (parentUri: string, dirName: string) =>
        buildSafChildUri(parentUri, dirName)
      ),
    createFileAsync: jest
      .fn()
      .mockImplementation(async (parentUri: string, fileName: string) =>
        buildSafChildUri(parentUri, fileName)
      ),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
  },
};

jest.mock('expo-file-system/legacy', () => mockFileSystem);
jest.mock('expo-file-system', () => mockFileSystem);

// ─── 6. MOCK: @react-native-async-storage/async-storage ──────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: async (key: string, value: string) => {
    mockAsyncStore[key] = value;
  },
  getItem: async (key: string) => mockAsyncStore[key] ?? null,
  removeItem: async (key: string) => {
    delete mockAsyncStore[key];
  },
  getAllKeys: async () => Object.keys(mockAsyncStore),
  multiGet: async (keys: string[]) => keys.map((k) => [k, mockAsyncStore[k] ?? null]),
  clear: async () => {
    Object.keys(mockAsyncStore).forEach((k) => delete mockAsyncStore[k]);
  },
}));

// ─── 7. MOCK: react-native ───────────────────────────────────────────────────

jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as any);
jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

// ─── 8. MOCK: expo-sharing, expo-updates, expo-notifications, background ──────

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

// ─── 10. MOCK: expo-haptics ──────────────────────────────────────────────────

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// ─── 11. MOCK: expo-document-picker ──────────────────────────────────────────

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: '/tmp/vjbilling-test/mock-backup.vjb', name: 'mock-backup.vjb' }],
  }),
}));

// ─── 12. MOCK: react-native-nitro-modules & worklets ─────────────────────────

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    getNativeModule: jest.fn(),
    createHybridObject: jest.fn(),
    hasNativeModule: jest.fn(() => false),
  },
}));

jest.mock('react-native-worklets', () => ({
  useWorkletCallback: (fn: any) => fn,
  createWorklet: (fn: any) => fn,
  runOnJS: (fn: any) => fn,
  runOnUI: (fn: any) => fn,
}));

export {};
