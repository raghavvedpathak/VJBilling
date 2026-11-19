// services/phase1/backupService.ts
// Phase 1 v8.0 Canonical Implementation (FIX-V740-1, FIX-V742-3, FIX-V742-5, FIX-V742-10, FIX-V744-7, FIX-V745-1..3, FIX-V747-3..4)

import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { storage } from '@/utils/storage';
import { safeTransaction } from '@/db/safeTransaction';
import {
  firms,
  financialYears,
  auditLogs,
  safeModeState,
  appSettings,
  bisLogos,
} from '@/db/schema/phase1_core';
import { leaseService } from '@/services/phase1/leaseService';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { encryptBackup, type BackupKdfMode } from '@/utils/backupCrypto';
import {
  SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  APP_VERSION,
  ERR,
  MIN_BACKUP_PASSWORD_LENGTH,
  BACKUP_FILE_PREFIX,
  AUTO_BACKUP_FILE_REGEX,
  AUTO_BACKUP_KEEP,
  type BackupKind,
  type BackupTrigger,
} from '@/constants';

export const BACKUP_DIR = (FileSystem.documentDirectory ?? '') + 'backups/';

export type BackupExporter = (tx: any) => Record<string, any>;
export type RestoreHandler = {
  clear: (tx: any) => void;
  restore: (tx: any, payload: Record<string, any>) => void;
};

const backupExporters = new Map<string, BackupExporter>();
const restoreHandlers = new Map<string, RestoreHandler>();

export function registerBackupExporter(id: string, exporter: BackupExporter): void {
  backupExporters.set(id, exporter);
}

export function registerRestoreHandler(id: string, handler: RestoreHandler): void {
  restoreHandlers.set(id, handler);
}

export function getBackupExporters(): Map<string, BackupExporter> {
  return backupExporters;
}

export function getRestoreHandlers(): Map<string, RestoreHandler> {
  return restoreHandlers;
}

export interface BackupResult {
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  mirroredToPublicStorage: boolean;
}

export interface BackupOptions {
  share?: boolean | undefined;
  kind?: BackupKind | undefined;
  trigger?: BackupTrigger | undefined;
  leaseTtlMinutes?: number | undefined;
}

export interface BackupInnerPayload {
  deviceId: string;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  firmId: string | null;
  firms: (typeof firms.$inferSelect)[];
  financialYears: (typeof financialYears.$inferSelect)[];
  settings: (typeof appSettings.$inferSelect)[];
  auditLogs: (typeof auditLogs.$inferSelect)[];
  bisLogos: (typeof bisLogos.$inferSelect)[];
  safeModeState: typeof safeModeState.$inferSelect | null;
  writerLeases: any[];
  logoAssets?: {
    firmLogos: Array<{ firmId: string; base64: string }>;
    bisLogos: Array<{ bisLogoId: string; base64: string }>;
  };
  tables?: Record<string, any[]>;
  [key: string]: any;
}

export interface BackupEnvelope {
  format?: 'vjb';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deviceId?: string; // Present on legacy v1 envelopes only; v2 encrypts deviceId inside payload (FIX-V740-1)
  encryptionVersion: 1 | 2;
  passwordProtected: boolean;
  kdf?: BackupKdfMode;
  kdfIterations?: number;
  salt: string;
  keyWrapIv?: string;
  wrappedKey?: string;
  iv: string;
  ciphertext: string;
  payload: BackupInnerPayload;
}

export async function getOrCreateSafFolder(parentUri: string, name: string): Promise<string> {
  const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
  for (const childUri of children) {
    const decodedName = decodeURIComponent(childUri.split('/').pop() ?? '');
    if (decodedName === name || decodedName.endsWith(`:${name}`)) {
      return childUri;
    }
  }
  return await StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

export async function createBackup(
  password?: string,
  opts: BackupOptions = {}
): Promise<BackupResult> {
  // v7.42 FIX-V742-10: Reject empty or short passwords (< 8 chars); never treat "" as "no password"
  if (password !== undefined && password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    throw new Error(
      `${ERR.INVALID_SETTINGS_VALUE}: backup password must be at least ${MIN_BACKUP_PASSWORD_LENGTH} characters`
    );
  }

  const kind: BackupKind = opts.kind ?? 'MANUAL';
  const trigger: BackupTrigger = opts.trigger ?? 'NOW';
  const shouldShare = opts.share !== false && kind === 'MANUAL';

  // G40: createBackup() does NOT call assertNotInSafeMode() — backup is a read operation
  await leaseService.assertNoActiveLease();
  const leaseId = await leaseService.acquire('BACKUP', undefined, opts.leaseTtlMinutes);

  try {
    // 1. Synchronous JSI transaction callback DB reads (FIX-V717-1, FIX-V740-8)
    const payload = safeTransaction((tx) => {
      const firmsRows = tx.select().from(firms).all();
      const financialYearsRows = tx.select().from(financialYears).all();
      const settingsRows = tx.select().from(appSettings).all();
      const auditLogsRows = tx.select().from(auditLogs).all();
      const safeModeStateRows = tx.select().from(safeModeState).all();
      const bisLogosRows = tx.select().from(bisLogos).all();

      const corePayload: Record<string, any> = {
        firms: firmsRows,
        financialYears: financialYearsRows,
        settings: settingsRows,
        auditLogs: auditLogsRows,
        bisLogos: bisLogosRows,
        safeModeState:
          safeModeStateRows.length > 0
            ? safeModeStateRows[0]
            : { id: 1, isActive: 0, reason: null, activatedAt: null, clearedAt: null },
        writerLeases: [],
      };

      // Collect registered extension data (Phase 2–4 tables)
      for (const [id, exporter] of backupExporters.entries()) {
        try {
          const extensionData = exporter(tx);
          Object.assign(corePayload, extensionData);
        } catch (err) {
          console.warn(`[Backup] Extension '${id}' export failed (non-fatal):`, err);
        }
      }

      return corePayload;
    });

    // 2. v7.36 FIX-V736-1: Read logo binaries outside transaction
    const logoAssets: {
      firmLogos: Array<{ firmId: string; base64: string }>;
      bisLogos: Array<{ bisLogoId: string; base64: string }>;
    } = { firmLogos: [], bisLogos: [] };

    for (const firm of payload.firms) {
      if (!firm.firmLogoRef) continue;
      try {
        const base64 = await FileSystem.readAsStringAsync(firm.firmLogoRef, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoAssets.firmLogos.push({ firmId: firm.id, base64 });
      } catch {
        /* missing/unreadable logo skipped silently */
      }
    }

    for (const logo of payload.bisLogos) {
      if (logo.isArchived !== 0 || !logo.fileRef) continue;
      try {
        const base64 = await FileSystem.readAsStringAsync(logo.fileRef, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoAssets.bisLogos.push({ bisLogoId: logo.id, base64 });
      } catch {
        /* missing/unreadable logo skipped silently */
      }
    }

    let deviceIdStr: string;
    try {
      deviceIdStr = getDeviceId();
    } catch {
      deviceIdStr = 'DEV-DEVICE-ID';
    }

    const exportedAt = new Date().toISOString();
    const effectiveSchemaVersion = BACKUP_SCHEMA_VERSION ?? SCHEMA_VERSION;

    const tables: Record<string, any[]> = {
      // Phase 1
      firms: payload.firms ?? [],
      financial_years: payload.financialYears ?? payload.financial_years ?? [],
      audit_log: payload.auditLogs ?? payload.audit_log ?? [],
      safe_mode_state: payload.safeModeState
        ? Array.isArray(payload.safeModeState)
          ? payload.safeModeState
          : [payload.safeModeState]
        : [],
      settings: payload.settings ?? [],

      // Phase 2
      categories: payload.categories ?? [],
      designs: payload.designs ?? [],
      stones: payload.stones ?? [],
      designPurityThresholds: payload.designPurityThresholds ?? [],
      designCategoryMap: payload.designCategoryMap ?? [],
      gemstoneLots: payload.gemstoneLots ?? [],
      hsnCodes: payload.hsnCodes ?? [],
      items: payload.items ?? [],
      looseStockLots: payload.looseStockLots ?? [],
      looseStockEvents: payload.looseStockEvents ?? [],
      itemEvents: payload.itemEvents ?? [],
      oldMetalLots: payload.oldMetalLots ?? payload.oldGoldLots ?? [],
      sequenceCounters: payload.sequenceCounters ?? [],
      bisLogos: payload.bisLogos ?? [],

      // Phase 3
      customers: payload.customers ?? [],
      suppliers: payload.suppliers ?? [],
      karigar: payload.karigar ?? [],
      karigar_ledger: payload.karigar_ledger ?? payload.karigarLedger ?? [],
      bank_accounts: payload.bank_accounts ?? payload.bankAccounts ?? [],
      invoice_number_config: payload.invoice_number_config ?? payload.invoiceNumberConfig ?? [],
      tax_groups: payload.tax_groups ?? payload.taxGroups ?? [],
      tax_rates: payload.tax_rates ?? payload.taxRates ?? [],
      tax_group_components: payload.tax_group_components ?? payload.taxGroupComponents ?? [],
      sale_invoices: payload.sale_invoices ?? payload.saleInvoices ?? [],
      sale_invoice_items: payload.sale_invoice_items ?? payload.saleInvoiceItems ?? [],
      purchase_invoices: payload.purchase_invoices ?? payload.purchaseInvoices ?? [],
      purchase_invoice_items: payload.purchase_invoice_items ?? payload.purchaseInvoiceItems ?? [],
      payments: payload.payments ?? [],
      ledger_entries: payload.ledger_entries ?? payload.ledgerEntries ?? [],
      credit_notes: payload.credit_notes ?? payload.creditNotes ?? [],
      debit_notes: payload.debit_notes ?? payload.debitNotes ?? [],
      migration_log: payload.migration_log ?? payload.migrationLog ?? [],
      invoice_print_settings: payload.invoice_print_settings ?? payload.invoicePrintSettings ?? [],
      estimate_invoices: payload.estimate_invoices ?? payload.estimateInvoices ?? [],
      estimate_items: payload.estimate_items ?? payload.estimateItems ?? [],
      supplier_metal_payments:
        payload.supplier_metal_payments ?? payload.supplierMetalPayments ?? [],

      // Phase 4
      refinery_batches: payload.refinery_batches ?? payload.refineryBatches ?? [],
      refinery_batch_lots: payload.refinery_batch_lots ?? payload.refineryBatchLots ?? [],
      refinery_output_lots: payload.refinery_output_lots ?? payload.refineryOutputLots ?? [],
      melt_batches: payload.melt_batches ?? payload.meltBatches ?? [],
      melt_batch_inputs: payload.melt_batch_inputs ?? payload.meltBatchInputs ?? [],
      karigar_issues: payload.karigar_issues ?? payload.karigarIssues ?? [],
      karigar_returns: payload.karigar_returns ?? payload.karigarReturns ?? [],
    };

    const firmId = payload.firms?.[0]?.id ?? null;

    // FIX-V740-1: deviceId lives exclusively inside the encrypted payload in v2
    const innerPayload: BackupInnerPayload = {
      deviceId: deviceIdStr,
      schemaVersion: effectiveSchemaVersion,
      appVersion: APP_VERSION,
      exportedAt,
      firmId,
      firms: payload.firms,
      financialYears: payload.financialYears,
      settings: payload.settings,
      auditLogs: payload.auditLogs,
      bisLogos: payload.bisLogos,
      safeModeState: payload.safeModeState,
      writerLeases: payload.writerLeases,
      tables,
      ...payload,
      logoAssets,
    };

    const headerMeta = {
      schemaVersion: effectiveSchemaVersion,
      appVersion: APP_VERSION,
      exportedAt,
    };

    // 3. Encrypt payload via canonical v2 AEAD key-wrapping (FIX-V740-1, FIX-V745-1)
    const encryptedFields = await encryptBackup(
      JSON.stringify(innerPayload),
      headerMeta,
      password
    );

    // FIX-V740-1: Plaintext outer v2 envelope carries NO deviceId
    const encryptedBlob = JSON.stringify({
      format: 'vjb',
      ...headerMeta,
      ...encryptedFields,
    });

    const timestamp = exportedAt.replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const prefix = BACKUP_FILE_PREFIX[kind] ?? BACKUP_FILE_PREFIX.MANUAL;
    const fileName = `${prefix}${timestamp}.vjb`;
    const filePath = BACKUP_DIR + fileName;

    // 4. Primary write to app internal document directory
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(filePath, encryptedBlob, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const fileSizeBytes =
      fileInfo.exists && 'size' in fileInfo
        ? ((fileInfo as any).size ?? 0)
        : encryptedBlob.length;

    // 5. Optional system share sheet (FIX-V742-3: skipped when share === false or non-manual kind)
    let shared = false;
    if (shouldShare) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/octet-stream',
            dialogTitle: 'Save VJ Billing Backup',
          });
          shared = true;
        }
      } catch {
        shared = false;
      }
    }

    // 6. v7.33 FIX-V733-4 / FIX-V733-5: Best-effort public storage mirror (Android SAF Documents/VJ Billing/backups/)
    let mirroredToPublicStorage = false;
    try {
      const publicDirUri = storage.getString('vjbilling_public_backup_dir_uri');
      if (publicDirUri) {
        await StorageAccessFramework.readDirectoryAsync(publicDirUri);
        const appFolderUri = await getOrCreateSafFolder(publicDirUri, 'VJ Billing');
        const backupsFolderUri = await getOrCreateSafFolder(appFolderUri, 'backups');
        const mirrorUri = await StorageAccessFramework.createFileAsync(
          backupsFolderUri,
          fileName,
          'application/octet-stream'
        );
        await FileSystem.writeAsStringAsync(mirrorUri, encryptedBlob, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        mirroredToPublicStorage = true;
      }
    } catch {
      mirroredToPublicStorage = false;
    }

    if (trigger !== 'BACKGROUND') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }

    // 7. G41: Audit write OUTSIDE transaction (Call Site 2; FIX-V744-7, FIX-V745-2, FIX-V747-4)
    auditRepository.log(null, {
      eventType: 'BACKUP_CREATED',
      firmId: null,
      deviceId: deviceIdStr,
      payload: JSON.stringify({
        exportedAt,
        fileName,
        fileSizeBytes,
        shared,
        kind,
        trigger,
      }),
    });

    return { fileName, filePath, fileSizeBytes, mirroredToPublicStorage };
  } catch (error) {
    console.error('[Backup] Error:', error);
    throw error;
  } finally {
    await leaseService.release(leaseId).catch(console.error);
  }
}

/**
 * v7.45 FIX-V745-3: Retains the 7 newest automatic backup files (vjbilling_auto_*.vjb)
 * in both internal BACKUP_DIR and the public SAF folder after a confirmed success.
 * Never touches manual or FY-close backups.
 */
export async function pruneAutoBackups(justWritten: string): Promise<void> {
  const names = (await FileSystem.readDirectoryAsync(BACKUP_DIR))
    .filter((n) => AUTO_BACKUP_FILE_REGEX.test(n))
    .sort()
    .reverse();
  if (names.includes(justWritten)) {
    for (const n of names.slice(AUTO_BACKUP_KEEP)) {
      await FileSystem.deleteAsync(BACKUP_DIR + n, { idempotent: true });
    }
  }

  const dirUri = storage.getString('vjbilling_public_backup_dir_uri');
  if (!dirUri) return;
  const appFolder = await getOrCreateSafFolder(dirUri, 'VJ Billing');
  const folder = await getOrCreateSafFolder(appFolder, 'backups');
  const entries = (await StorageAccessFramework.readDirectoryAsync(folder))
    .map((uri) => {
      const decodedTail = decodeURIComponent(uri).split('/').pop() ?? '';
      const baseName = (decodedTail.split(':').pop() ?? decodedTail).replace(/\.bin$/, '');
      return { uri, name: baseName };
    })
    .filter((e) => AUTO_BACKUP_FILE_REGEX.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!entries.some((e) => e.name === justWritten)) return;
  for (const e of entries.slice(AUTO_BACKUP_KEEP)) {
    await StorageAccessFramework.deleteAsync(e.uri).catch(() => {});
  }
}

export const backupService = {
  createBackup,
  pruneAutoBackups,
  getOrCreateSafFolder,
};

export default backupService;
