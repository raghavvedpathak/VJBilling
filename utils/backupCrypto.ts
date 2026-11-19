// utils/backupCrypto.ts - Canonical Phase 1 v8.0 Implementation
// Implements FIX-V740-1, FIX-V741-3, FIX-V7411-3, FIX-V745-1, FIX-V746-6, FIX-V747-2
// CI RULE (FIX-V746-6): ASCII characters only in this file.
import * as SecureStore from 'expo-secure-store';
import { ERR } from '@/constants/errorCodes';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const BACKUP_KDF_ITERATIONS = 600_000;
export const MIN_KDF_ITERATIONS = 100_000;
export const MAX_KDF_ITERATIONS = 2_000_000;

const DEVICE_KEK_STORE_KEY = 'vjbilling_backup_device_kek_v1';
const APP_KEK_SEED = 'vjbilling_portable_backup_key_v1'; // v7.45 FIX-V745-1: NOT a secret (owner-accepted portable trade-off)

export type BackupKdfMode = 'PBKDF2-SHA256' | 'APP_KEY' | 'DEVICE_KEY';

export interface EncryptedEnvelopeFields {
  encryptionVersion: 2;
  passwordProtected: boolean;
  kdf: BackupKdfMode;
  kdfIterations: number;
  salt: string;
  keyWrapIv: string;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
}

export interface BackupHeaderMeta {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  encryptionVersion: 2;
  passwordProtected: boolean;
  kdf: BackupKdfMode;
  kdfIterations: number;
}

// Chunked base64 helpers (FIX-V740-1: avoids String.fromCharCode(...bytes) stack overflow on large backups)
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return btoa(parts.join(''));
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

// ASCII vertical bar "|" (0x7C) pinned per FIX-V746-6
export function aadFor(meta: BackupHeaderMeta): Uint8Array {
  const parts = [
    'vjbilling-backup-v2',
    String(meta.schemaVersion),
    meta.appVersion,
    meta.exportedAt,
    String(meta.encryptionVersion),
    meta.passwordProtected ? '1' : '0',
    meta.kdf,
    String(meta.kdfIterations),
  ];
  return enc.encode(parts.join('|'));
}

// Preflight check (FIX-V741-3, FIX-V746-6, FIX-V747-2): runs BEFORE PIN gate and in headless task
export async function assertCryptoAvailable(): Promise<void> {
  const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    // 0. SHA-256 known answer (v7.46 FIX-V746-6, printed in v7.47 FIX-V747-2): digest of ASCII 'abc'
    if (
      hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('abc')))) !==
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    ) {
      throw new Error('SHA-256 known-answer mismatch');
    }
    // 1. PBKDF2-HMAC-SHA256 known answer: password="password", salt="salt", c=1, dkLen=32
    const km = await crypto.subtle.importKey('raw', enc.encode('password'), 'PBKDF2', false, [
      'deriveBits',
      'deriveKey',
    ]);
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode('salt') as any, iterations: 1, hash: 'SHA-256' },
        km,
        256
      )
    );
    if (hex(bits) !== '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b') {
      throw new Error('PBKDF2 known-answer mismatch');
    }
    // 2. PIN path: deriveKey -> extractable HMAC key -> exportKey (pinService.deriveKey)
    const hk = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new Uint8Array(16) as any, iterations: 1, hash: 'SHA-256' },
      km,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      true,
      ['sign']
    );
    if ((await crypto.subtle.exportKey('raw', hk)).byteLength !== 32) {
      throw new Error('HMAC exportKey length');
    }
    // 3. AES-GCM round trip WITH additionalData; a wrong AAD must be rejected (backup header binding)
    const k = await crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = new Uint8Array(12);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as any, additionalData: enc.encode('a') as any },
      k,
      enc.encode('x')
    );
    const pt = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as any, additionalData: enc.encode('a') as any },
        k,
        ct
      )
    );
    if (pt.length !== 1 || pt[0] !== 120) {
      throw new Error('AES-GCM round trip');
    }
    let rejected = false;
    try {
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as any, additionalData: enc.encode('b') as any },
        k,
        ct
      );
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error('AES-GCM additionalData is not enforced');
    }
    // 4. HMAC sign/verify and randomness
    const mk = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const sig = await crypto.subtle.sign('HMAC', mk, enc.encode('m'));
    if (!(await crypto.subtle.verify('HMAC', mk, sig, enc.encode('m')))) {
      throw new Error('HMAC verify');
    }
    if (crypto.getRandomValues(new Uint8Array(16)).every((b) => b === 0)) {
      throw new Error('getRandomValues returned zeros');
    }
  } catch (e) {
    throw new Error(ERR.CRYPTO_UNAVAILABLE + ': ' + String(e));
  }
}

async function getPasswordKek(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_KDF_ITERATIONS ||
    iterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid KDF iterations');
  }
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// v7.45 FIX-V745-1: Portable app-level KEK for passwordless automatic and FY-close backups
async function getAppKek(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(APP_KEK_SEED));
  return crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

// Keystore-backed device KEK for pre-migration snapshots and legacy v7.40-v7.44 DEVICE_KEY backups
async function getDeviceKek(createIfMissing: boolean): Promise<CryptoKey> {
  const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  try {
    let b64 = await SecureStore.getItemAsync(DEVICE_KEK_STORE_KEY, opts);
    if (!b64) {
      if (!createIfMissing) {
        throw new Error(ERR.BACKUP_DEVICE_KEY_UNAVAILABLE + ': no device backup key in Keystore');
      }
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      b64 = bytesToBase64(rawKey);
      await SecureStore.setItemAsync(DEVICE_KEK_STORE_KEY, b64, opts);
    }
    const keyBytes = base64ToBytes(b64);
    if (keyBytes.byteLength !== 32) {
      throw new Error(ERR.BACKUP_DEVICE_KEY_UNAVAILABLE + ': malformed device backup key');
    }
    return await crypto.subtle.importKey('raw', keyBytes as any, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  } catch (e: any) {
    if (String(e?.message ?? e).includes(ERR.BACKUP_DEVICE_KEY_UNAVAILABLE)) throw e;
    throw new Error(ERR.BACKUP_DEVICE_KEY_UNAVAILABLE + ': ' + String(e));
  }
}

export async function encryptBackup(
  plaintextJson: string,
  header: { schemaVersion: number; appVersion: string; exportedAt: string },
  password?: string
): Promise<EncryptedEnvelopeFields> {
  const passwordProtected = typeof password === 'string' && password.length > 0;
  const kdf: BackupKdfMode = passwordProtected ? 'PBKDF2-SHA256' : 'APP_KEY';
  const kdfIterations = passwordProtected ? BACKUP_KDF_ITERATIONS : 0;
  const saltBytes = passwordProtected ? crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(0);

  const meta: BackupHeaderMeta = {
    schemaVersion: header.schemaVersion,
    appVersion: header.appVersion,
    exportedAt: header.exportedAt,
    encryptionVersion: 2,
    passwordProtected,
    kdf,
    kdfIterations,
  };
  const aad = aadFor(meta);

  // 1. Generate random per-backup 256-bit DEK and encrypt payload
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const dek = await crypto.subtle.importKey('raw', dekBytes, 'AES-GCM', false, ['encrypt']);
  const payloadIv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: payloadIv as any, additionalData: aad as any },
    dek,
    enc.encode(plaintextJson)
  );

  // 2. Wrap DEK with KEK (PBKDF2 password key or portable APP_KEY)
  const kek = passwordProtected
    ? await getPasswordKek(password as string, saltBytes, BACKUP_KDF_ITERATIONS)
    : await getAppKek();
  const keyWrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKeyBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: keyWrapIv as any, additionalData: aad as any },
    kek,
    dekBytes
  );
  dekBytes.fill(0);

  return {
    encryptionVersion: 2,
    passwordProtected,
    kdf,
    kdfIterations,
    salt: passwordProtected ? bytesToBase64(saltBytes) : '',
    keyWrapIv: bytesToBase64(keyWrapIv),
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKeyBuf)),
    iv: bytesToBase64(payloadIv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

export async function decryptBackup(
  file: BackupHeaderMeta & {
    salt: string;
    keyWrapIv: string;
    wrappedKey: string;
    iv: string;
    ciphertext: string;
  },
  password?: string
): Promise<string> {
  if (file.passwordProtected && (!password || password.length === 0)) {
    throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required to decrypt backup');
  }
  if (file.passwordProtected && file.kdf !== 'PBKDF2-SHA256') {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid KDF for password-protected backup');
  }
  if (!file.passwordProtected && file.kdf !== 'APP_KEY' && file.kdf !== 'DEVICE_KEY') {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid KDF for passwordless backup');
  }

  const aad = aadFor(file);
  let kek: CryptoKey;
  try {
    kek = file.passwordProtected
      ? await getPasswordKek(password as string, base64ToBytes(file.salt), file.kdfIterations)
      : file.kdf === 'APP_KEY'
        ? await getAppKek()
        : await getDeviceKek(false);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (
      msg.includes(ERR.BACKUP_DEVICE_KEY_UNAVAILABLE) ||
      msg.includes(ERR.BACKUP_FILE_INVALID)
    ) {
      throw e;
    }
    throw new Error(ERR.CHECKSUM_MISMATCH + ': failed to derive backup key');
  }

  let dekBytes: Uint8Array;
  try {
    const rawDek = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(file.keyWrapIv) as any, additionalData: aad as any },
      kek,
      base64ToBytes(file.wrappedKey) as any
    );
    dekBytes = new Uint8Array(rawDek);
  } catch {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': wrong backup password or tampered header');
  }

  try {
    const dek = await crypto.subtle.importKey('raw', dekBytes as any, 'AES-GCM', false, ['decrypt']);
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(file.iv) as any, additionalData: aad as any },
      dek,
      base64ToBytes(file.ciphertext) as any
    );
    return dec.decode(ptBuf);
  } catch {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': backup ciphertext authentication failed');
  } finally {
    dekBytes.fill(0);
  }
}

// Legacy v1 decryption (FIX-V740-1, FIX-V741-5: uses deviceId inside the v1 envelope)
export async function decryptLegacyV1Backup(
  file: {
    passwordProtected?: boolean;
    deviceId: string;
    iv: string;
    salt: string;
    ciphertext: string;
  },
  password?: string
): Promise<string> {
  const isPasswordProtected = file.passwordProtected === true;
  if (isPasswordProtected && (!password || password.length === 0)) {
    throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required to decrypt backup');
  }
  try {
    const keyMaterialBytes = isPasswordProtected
      ? enc.encode(password as string)
      : await getDeviceDerivedKeyMaterial(file.deviceId);
    const km = await crypto.subtle.importKey('raw', keyMaterialBytes as any, 'PBKDF2', false, [
      'deriveKey',
    ]);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: base64ToBytes(file.salt) as any, iterations: 100_000, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(file.iv) as any },
      key,
      base64ToBytes(file.ciphertext) as any
    );
    return dec.decode(ptBuf);
  } catch {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': legacy v1 decryption failed');
  }
}

// Pre-migration snapshot encryption/decryption (FIX-V7411-3: uses Keystore device KEK)
const SNAPSHOT_AAD = enc.encode('vjbilling-premigration-snapshot-v2');

export async function encryptSnapshot(plaintextJson: string): Promise<string> {
  const kek = await getDeviceKek(true);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any, additionalData: SNAPSHOT_AAD as any },
    kek,
    enc.encode(plaintextJson)
  );
  return JSON.stringify({
    v: 2,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
  });
}

export async function decryptSnapshot(serialized: string): Promise<string> {
  let parsed: { v?: number; iv?: string; ciphertext?: string };
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid snapshot JSON');
  }
  if (parsed?.v !== 2 || typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid snapshot format');
  }
  const kek = await getDeviceKek(false);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) as any, additionalData: SNAPSHOT_AAD as any },
      kek,
      base64ToBytes(parsed.ciphertext) as any
    );
    return dec.decode(pt);
  } catch {
    throw new Error(ERR.CHECKSUM_MISMATCH + ': snapshot decryption failed');
  }
}
