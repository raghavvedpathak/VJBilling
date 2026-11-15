// services/phase1/restoreService.ts — Phase 1 v7.47 & Phase 2–4 Canonical Restore Service
// Implements FIX-V740-2, FIX-V741-5, FIX-V7411-6, FIX-V7411-7, FIX-V742-4, FIX-V742-5,
// FIX-V742-10, FIX-V743-2, FIX-V743-4, FIX-V744-1, FIX-V747-5

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';
import { eq } from 'drizzle-orm';
import { safeTransaction } from '@/db/safeTransaction';
import {
  firms as firmsTable,
  financialYears as financialYearsTable,
  auditLogs as auditLogsTable,
  safeModeState as safeModeStateTable,
  writerLeases as writerLeasesTable,
  appSettings as appSettingsTable,
  bisLogos as bisLogosTable,
  auditDeleteGate as auditDeleteGateTable,
  auditArchiveIndex as auditArchiveIndexTable,
} from '@/db/schema/phase1_core';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { decryptBackup, decryptLegacyV1Backup } from '@/utils/backupCrypto';
import { clearVerifyCache } from '@/utils/verifyCache';
import { useLeaseStore } from '@/store/phase1/leaseStore';
import { storage } from '@/utils/storage';
import { safeModeService } from '@/services/phase1/safeModeService';
import { SCHEMA_VERSION, BACKUP_SCHEMA_VERSION, MIN_AUDIT_RETENTION_DAYS } from '@/constants';
import { ERR } from '@/constants/errorCodes';
import type { BackupEnvelope } from '@/services/phase1/backupService';
import { getRestoreHandlers } from '@/services/phase1/backupService';

export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024; // 50 MB ceiling (FIX-V741-5 / FIX-V7411-7)
const UUID_SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

async function decryptBackupEnvelope(
  parsedBlob: any,
  password?: string
): Promise<BackupEnvelope> {
  if (!parsedBlob || typeof parsedBlob !== 'object') {
    throw new Error(ERR.BACKUP_FILE_INVALID + ': backup envelope must be a JSON object');
  }

  if (parsedBlob.encryptionVersion === 2) {
    if (
      !parsedBlob.passwordProtected &&
      (parsedBlob.kdfIterations !== 0 || (parsedBlob.salt && parsedBlob.salt !== ''))
    ) {
      throw new Error(ERR.BACKUP_FILE_INVALID + ': invalid passwordless KDF header');
    }
    const jsonStr = await decryptBackup(parsedBlob, password);
    let payload: any;
    try {
      payload = JSON.parse(jsonStr);
    } catch {
      throw new Error(ERR.BACKUP_FILE_INVALID + ': decrypted payload is not valid JSON');
    }
    return {
      ...parsedBlob,
      deviceId: payload.deviceId ?? parsedBlob.deviceId ?? 'UNKNOWN',
      payload,
    } as BackupEnvelope;
  }

  // Legacy encryptionVersion === 1 path (FIX-V740-1, FIX-V741-5: uses deviceId inside the file)
  if (parsedBlob.encryptionVersion === 1) {
    if (parsedBlob.passwordProtected === true && !password) {
      throw new Error(ERR.BACKUP_PASSWORD_REQUIRED + ': password required for this backup');
    }
    if (!parsedBlob.salt || !parsedBlob.iv || !parsedBlob.ciphertext) {
      throw new Error(ERR.CHECKSUM_MISMATCH + ': Corrupted backup envelope structure');
    }
    const jsonStr = await decryptLegacyV1Backup(
      {
        passwordProtected: parsedBlob.passwordProtected === true,
        deviceId: parsedBlob.deviceId || getSafeDeviceId(),
        iv: parsedBlob.iv,
        salt: parsedBlob.salt,
        ciphertext: parsedBlob.ciphertext,
      },
      password
    );
    const payload = JSON.parse(jsonStr);
    return {
      ...parsedBlob,
      deviceId: parsedBlob.deviceId ?? payload?.deviceId ?? 'UNKNOWN',
      payload,
    } as BackupEnvelope;
  }

  throw new Error(ERR.BACKUP_FILE_INVALID + ': unsupported encryptionVersion');
}

/**
 * v7.40 FIX-V740-2 & v7.47 FIX-V747-5: Integrity dry-run BEFORE any table is deleted.
 * Throws ERR.RESTORE_VALIDATION_FAILED on any violation and NEVER activates Safe Mode (FIX-V741-5a).
 */
export function assertPayloadIntegrity(payload: any): void {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.firms)) {
    throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Invalid payload structure.');
  }
  if (payload.firms.length > 3) {
    throw new Error(
      ERR.RESTORE_VALIDATION_FAILED +
        `: Backup contains ${payload.firms.length} firms. Maximum capacity is 3.`
    );
  }

  const firmIds = new Set<string>();
  const firmCodes = new Set<string>();
  for (const f of payload.firms) {
    if (!f?.id || !f?.name || !f?.firmCode) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Firm record missing required fields.');
    }
    if (firmIds.has(f.id) || firmCodes.has(f.firmCode)) {
      throw new Error(ERR.RESTORE_VALIDATION_FAILED + ': Duplicate firm id or firmCode in backup.');
    }
    firmIds.add(f.id);
    firmCodes.add(f.firmCode);
  }

  const activeFyCountByFirm = new Map<string, number>();
  for (const fy of payload.financialYears ?? []) {
    if (!fy?.id || !fy?.firmId || !firmIds.has(fy.firmId)) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED +
          `: Financial year ${fy?.id ?? ''} references non-existent firm ${fy?.firmId ?? ''}.`
      );
    }
    if (fy.status === 'ACTIVE') {
      const nextCount = (activeFyCountByFirm.get(fy.firmId) ?? 0) + 1;
      if (nextCount > 1) {
        throw new Error(
          ERR.RESTORE_VALIDATION_FAILED +
            `: Firm ${fy.firmId} has multiple ACTIVE financial years in backup.`
        );
      }
      activeFyCountByFirm.set(fy.firmId, nextCount);
    }
  }

  for (const logo of payload.bisLogos ?? []) {
    if (!logo?.id || !logo?.firmId || !firmIds.has(logo.firmId)) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED +
          `: BIS logo ${logo?.id ?? ''} references non-existent firm ${logo?.firmId ?? ''}.`
      );
    }
  }

  if (Array.isArray(payload.settings) && payload.settings.length > 1) {
    throw new Error(
      ERR.RESTORE_VALIDATION_FAILED + ': Backup settings table must contain at most 1 row.'
    );
  }
}

export const restoreService = {
  async inspectBackupFile(
    password?: string
  ): Promise<{ backup: BackupEnvelope; fileContent: string; warning?: string } | null> {
    await leaseService.assertNoActiveLease();

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return null;

    const asset = result.assets[0];
    // FIX-V7411-7: Check picker file size before reading into memory
    if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_FILE_BYTES) {
      throw new Error(ERR.BACKUP_FILE_INVALID + ': Backup file exceeds maximum size limit (50 MB).');
    }

    const fileUri = asset.uri;
    let fileContent = '';
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error(ERR.BACKUP_FILE_INVALID + ': Backup file exceeds maximum size limit (50 MB).');
      }
      fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as any });
    } catch (e: any) {
      if (String(e?.message ?? e).includes(ERR.BACKUP_FILE_INVALID)) throw e;
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED +
          ': Could not read the selected file. Ensure it is a valid .vjb backup.'
      );
    }

    let parsedBlob: any;
    try {
      parsedBlob = JSON.parse(fileContent);
    } catch {
      throw new Error(ERR.BACKUP_FILE_INVALID + ': File is not valid JSON data.');
    }

    const backup = await decryptBackupEnvelope(parsedBlob, password);
    const schemaCheck = await this.validateBackupSchema(backup);
    assertPayloadIntegrity(backup.payload);

    return {
      backup,
      fileContent,
      ...(schemaCheck && 'warning' in schemaCheck ? { warning: schemaCheck.warning } : {}),
    };
  },

  async restoreFromFile(
    password?: string
  ): Promise<'CANCELED' | 'COMPLETED' | 'COMPLETED_WITH_ISSUES'> {
    const inspected = await this.inspectBackupFile(password);
    if (!inspected) return 'CANCELED';

    const { backup, fileContent, warning } = inspected;
    const {
      firms: backupFirms,
      financialYears: backupFYs,
      auditLogs: backupLogs,
      safeModeState: backupSmState,
      settings: backupSettings,
    } = backup.payload!;

    const isSafeModeBackedUp = !!(backupSmState && backupSmState.isActive === 1);
    const isCrossDevice =
      !!backup.deviceId &&
      backup.deviceId !== 'UNKNOWN' &&
      backup.deviceId !== getSafeDeviceId();

    const firmDetails = backupFirms
      .map((f: any) => {
        const fyCount = backupFYs?.filter((fy: any) => fy.firmId === f.id).length || 0;
        return `- ${f.name} (${f.firmCode}): ${fyCount} FYs`;
      })
      .join('\n');

    const hasEmbeddedLogos = !!(
      backup.payload?.logoAssets &&
      (backup.payload.logoAssets.firmLogos.length > 0 ||
        backup.payload.logoAssets.bisLogos.length > 0)
    );

    await new Promise<void>((resolve, reject) => {
      Alert.alert(
        'PREVIEW — NOT RESTORED YET',
        `BACKUP INFORMATION\n` +
          `Created: ${new Date(backup.exportedAt).toLocaleString()}\n` +
          `App Version: ${backup.appVersion}\n` +
          `Device ID: ${(backup.deviceId ?? 'UNKNOWN').slice(-8)}\n` +
          `Schema: v${backup.schemaVersion}\n\n` +
          (warning ? `⚠️ ${warning}\n\n` : '') +
          (isCrossDevice
            ? `⚠️ CROSS-DEVICE BACKUP: Created on another device or previous install.\n\n`
            : '') +
          `FIRMS IN BACKUP\n${firmDetails || 'None'}\n\n` +
          `RECORD COUNTS\n` +
          `Audit Logs: ${backupLogs?.length || 0}\n` +
          `Settings: ${backupSettings?.length || 0}\n\n` +
          (!hasEmbeddedLogos
            ? `⚠️ Logo images are not included in this backup and will need to be re-uploaded.\n\n`
            : '') +
          (isSafeModeBackedUp
            ? `⚠️ SAFE MODE ACTIVE IN BACKUP ⚠️\nRestoring it will re-activate Safe Mode.\n\n`
            : '') +
          `Restoring will permanently replace all current data.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => reject(new Error('RESTORE_CANCELED')),
          },
          {
            text: 'I understand — Continue to Confirm',
            style: 'destructive',
            onPress: () => resolve(),
          },
        ]
      );
    });

    await this.restore(fileContent, password);

    return isSafeModeBackedUp ? 'COMPLETED_WITH_ISSUES' : 'COMPLETED';
  },

  /**
   * Canonical restore() (FIX-V742-4, FIX-V742-5, FIX-V743-2, FIX-V743-4, FIX-V744-1, FIX-V747-5).
   * G40: restore() does NOT call assertNotInSafeMode() (PATH 2 Safe Mode resolution).
   */
  async restore(encryptedFileContent: string, password?: string): Promise<void> {
    if (encryptedFileContent.length > MAX_BACKUP_FILE_BYTES) {
      throw new Error(ERR.BACKUP_FILE_INVALID + ': Backup content exceeds 50 MB limit.');
    }

    await leaseService.assertNoActiveLease();
    const leaseId = await leaseService.acquire('RESTORE');
    const stagedFiles: Array<{ tmpUri: string; finalUri: string }> = [];

    try {
      const currentDeviceId = getSafeDeviceId();
      let parsedBlob: any;
      try {
        parsedBlob = JSON.parse(encryptedFileContent);
      } catch {
        throw new Error(ERR.BACKUP_FILE_INVALID + ': File is not valid JSON.');
      }

      const backup = await decryptBackupEnvelope(parsedBlob, password);
      await this.validateBackupSchema(backup);

      // FIX-V747-5 (FIX-V741-5a): Dry-run integrity check with NO try/catch activating Safe Mode.
      // A bad file throws RESTORE_VALIDATION_FAILED before any delete and leaves Safe Mode untouched.
      assertPayloadIntegrity(backup.payload);

      const inner = backup.payload!;
      const currentMaxSchema = BACKUP_SCHEMA_VERSION ?? SCHEMA_VERSION;
      const oldSchema = backup.schemaVersion < currentMaxSchema;

      // FIX-V741-5, FIX-V7411-6 & FIX-V742-4: Stage embedded logos to .tmp files BEFORE the transaction,
      // and move them to their final deterministic paths ONLY AFTER the transaction commits.
      const logosDir = (FileSystem.documentDirectory ?? '') + 'logos/';
      await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true }).catch(() => {});

      const firmLogoUriMap = new Map<string, string>();
      for (const asset of inner.logoAssets?.firmLogos ?? []) {
        if (!asset?.firmId || !UUID_SAFE_ID_REGEX.test(asset.firmId) || !asset.base64) continue;
        const finalUri = `${logosDir}firm_${asset.firmId}.jpg`;
        const tmpUri = `${finalUri}.tmp`;
        try {
          await FileSystem.writeAsStringAsync(tmpUri, asset.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          stagedFiles.push({ tmpUri, finalUri });
          firmLogoUriMap.set(asset.firmId, finalUri);
        } catch {
          /* write failure leaves ref null; G62 handles on next boot */
        }
      }

      const bisLogoUriMap = new Map<string, string>();
      for (const asset of inner.logoAssets?.bisLogos ?? []) {
        if (!asset?.bisLogoId || !UUID_SAFE_ID_REGEX.test(asset.bisLogoId) || !asset.base64) continue;
        const finalUri = `${logosDir}bis_${asset.bisLogoId}.jpg`;
        const tmpUri = `${finalUri}.tmp`;
        try {
          await FileSystem.writeAsStringAsync(tmpUri, asset.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          stagedFiles.push({ tmpUri, finalUri });
          bisLogoUriMap.set(asset.bisLogoId, finalUri);
        } catch {
          /* write failure keeps original fileRef; G62 archives on next boot */
        }
      }

      const firmsToInsert = inner.logoAssets
        ? inner.firms.map((f: any) => ({
            ...f,
            firmLogoRef: firmLogoUriMap.get(f.id) ?? null,
          }))
        : inner.firms;

      // FIX-V740-2: bis_logos.file_ref is NOT NULL — fall back to l.fileRef if not in bisLogoUriMap
      const bisLogosToInsert = inner.logoAssets
        ? (inner.bisLogos ?? []).map((l: any) => ({
            ...l,
            fileRef: bisLogoUriMap.get(l.id) ?? l.fileRef,
          }))
        : (inner.bisLogos ?? []);

      // FIX-V742-10: Clamp auditRetentionDays >= 30 for older backups
      const settingsToInsert = (inner.settings ?? []).map((s: any) => ({
        ...s,
        auditRetentionDays: Math.max(
          MIN_AUDIT_RETENTION_DAYS,
          typeof s.auditRetentionDays === 'number'
            ? Math.floor(s.auditRetentionDays)
            : MIN_AUDIT_RETENTION_DAYS
        ),
      }));

      // Synchronous JSI Transaction Callback via safeTransaction() (FIX-V740-8)
      safeTransaction((tx) => {
        // v7.12 FIX-V712-1 / v7.13 FIX-V713-1: Open audit_delete_gate before deleting audit_logs
        tx.update(auditDeleteGateTable)
          .set({ gateOpen: 1 })
          .where(eq(auditDeleteGateTable.id, 1))
          .run();
        tx.delete(auditLogsTable).run();
        tx.update(auditDeleteGateTable)
          .set({ gateOpen: 0 })
          .where(eq(auditDeleteGateTable.id, 1))
          .run();

        // Clear registered extensions first in reverse dependency order (Phase 4 -> Phase 3 -> Phase 2)
        const handlers = Array.from(getRestoreHandlers().entries());
        for (const [id, handler] of [...handlers].reverse()) {
          try {
            handler.clear(tx);
          } catch (err) {
            console.warn(`[Restore] Extension '${id}' clear failed (non-fatal):`, err);
          }
        }

        // FIX-V740-2: Delete child tables (including auditArchiveIndex) before parent firms/FYs
        try {
          tx.delete(auditArchiveIndexTable).run();
        } catch {
          /* table may not exist in test environments or older DB schemas */
        }
        tx.delete(bisLogosTable).run();
        tx.delete(financialYearsTable).run();
        tx.delete(writerLeasesTable).run();
        tx.delete(firmsTable).run();
        tx.delete(appSettingsTable).run();
        tx.delete(safeModeStateTable).run();

        if (firmsToInsert?.length) tx.insert(firmsTable).values(firmsToInsert).run();
        if (inner.financialYears?.length) {
          tx.insert(financialYearsTable).values(inner.financialYears).run();
        }
        if (settingsToInsert?.length) {
          tx.insert(appSettingsTable).values(settingsToInsert).run();
        }
        if (inner.auditLogs?.length) {
          tx.insert(auditLogsTable).values(inner.auditLogs).run();
        }
        if (bisLogosToInsert?.length) {
          tx.insert(bisLogosTable).values(bisLogosToInsert).run();
        }

        if (inner.safeModeState) {
          const smRow = Array.isArray(inner.safeModeState)
            ? inner.safeModeState[0]
            : inner.safeModeState;
          if (smRow) {
            tx.insert(safeModeStateTable)
              .values(smRow)
              .onConflictDoUpdate({ target: safeModeStateTable.id, set: smRow })
              .run();
          }
        }

        // Restore registered extensions in forward dependency order (Phase 2 -> Phase 3 -> Phase 4)
        for (const [id, handler] of handlers) {
          try {
            handler.restore(tx, inner);
          } catch (err) {
            console.warn(`[Restore] Extension '${id}' restore failed:`, err);
          }
        }

        // FIX-V743-2 & FIX-V744-1: RESTORE_COMPLETED carries oldSchema inside the transaction
        auditRepository.log(tx, {
          eventType: 'RESTORE_COMPLETED',
          firmId: null,
          deviceId: currentDeviceId,
          payload: JSON.stringify({
            backupSchema: backup.schemaVersion,
            backupDate: backup.exportedAt,
            firmCount: firmsToInsert.length,
            restoredAt: new Date().toISOString(),
            oldSchema,
          }),
        });
      });

      // FIX-V7411-6 & FIX-V742-4: Move staged logo files into place AFTER transaction commits
      for (const f of stagedFiles) {
        try {
          await FileSystem.deleteAsync(f.finalUri, { idempotent: true });
          await FileSystem.moveAsync({ from: f.tmpUri, to: f.finalUri });
        } catch {
          /* missing logo caught by G62 on next boot */
        }
      }

      // FIX-V743-4 & FIX-V744-1: Delete persisted firm-store and lease-store so bootstrap Step 6 reconciles from DB
      storage.delete('firm-store');
      storage.delete('lease-store');
      clearVerifyCache();
      useLeaseStore.getState().setActiveLease(null);

      // v6.3 FIX 3: clearSafeMode() called outside transaction before reloadAsync()
      await safeModeService.clear();

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      storage.set('vjbilling_post_restore_logo_check_pending', 'true');

      // Step 10: Full app restart
      try {
        await Updates.reloadAsync();
      } catch (reloadErr) {
        console.warn(
          '[Restore] Updates.reloadAsync() skipped (development build or test):',
          reloadErr
        );
      }
    } catch (error: any) {
      // Clean up any staged .tmp logo files on failure
      for (const f of stagedFiles) {
        await FileSystem.deleteAsync(f.tmpUri, { idempotent: true }).catch(() => {});
      }
      throw error;
    } finally {
      await leaseService.release(leaseId).catch(console.error);
    }
  },

  /**
   * Validates backup schema version (v6.1 / v6.3 FIX 2 / v7.43 FIX-V743-2).
   * MUST be called OUTSIDE any transaction. Writes NO audit row (FIX-V743-2).
   */
  async validateBackupSchema(
    backup: BackupEnvelope
  ): Promise<{ warning?: string } | void> {
    const { schemaVersion } = backup;

    if (schemaVersion === undefined || schemaVersion === null) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED +
          ': Backup has no schemaVersion field — may be corrupted.'
      );
    }

    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion <= 0) {
      throw new Error(
        ERR.RESTORE_VALIDATION_FAILED +
          `: Invalid schemaVersion ${schemaVersion} — must be a positive integer.`
      );
    }

    const currentMaxSchema = BACKUP_SCHEMA_VERSION ?? SCHEMA_VERSION;

    // FUTURE schema: backup is newer than this app — block immediately
    if (schemaVersion > currentMaxSchema) {
      throw new Error(
        `${ERR.RESTORE_VALIDATION_FAILED}: backup schema ${schemaVersion} is newer than app ${currentMaxSchema}. Update the app first.`
      );
    }

    // PAST schema: warn the user, do NOT block, and do NOT write an audit row here (FIX-V743-2)
    if (schemaVersion < currentMaxSchema) {
      let warning = `${ERR.RESTORE_OLD_SCHEMA}: backup v${schemaVersion} < app ${currentMaxSchema}. Proceed with user acknowledgement.`;
      if (schemaVersion === 5) {
        warning =
          'This backup was created before Gold Intelligence features were available.\n' +
          'Refinery batches, melt batches, and karigar issue history will NOT be in this backup.\n' +
          'All current Phase 4 data will be permanently lost on restore.';
      } else if (schemaVersion < 5) {
        warning =
          `This backup was created before Gold Intelligence features were available (schema v${schemaVersion} < 5).\n` +
          'Earlier phase warning escalation applies; refinery batches, melt batches, and karigar issue history will NOT be in this backup.\n' +
          'All current Phase 4 data will be permanently lost on restore.';
      }

      return { warning };
    }
  },
};

export const restore = restoreService.restore.bind(restoreService);
export const validateBackupSchema = restoreService.validateBackupSchema.bind(restoreService);
export default restoreService;
