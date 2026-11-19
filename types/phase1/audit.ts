// types/phase1/audit.ts — Phase 1 v8.0 Canonical Audit Types
// Implements FIX-VSEC-9, FIX-V724-4, FIX-V730-1, FIX-V743-2, FIX-V744-7, FIX-V745-2, FIX-V745-6, FIX-V747-4

import type { BackupKind } from '@/constants/backup';
import type { AutoBackupReason, BackupTrigger } from '@/constants/autoBackup';

export type Phase1AuditPayload =
  // --- Canonical Phase 1 Event Types (v8.0) ---
  | {
      eventType: 'FIRM_CREATED';
      firmCode: string;
      name: string;
      proprietor?: string;
      gstin?: string | null;
    }
  | { eventType: 'FIRM_UPDATED'; changes: string[]; reason?: string; action?: string }
  | { eventType: 'FIRM_SWITCHED'; switchedToFirmId: string; switchedAt: string }
  | { eventType: 'FIRM_ARCHIVED'; archivedAt: string; action?: string }
  | { eventType: 'FIRM_UNARCHIVED'; unarchivedAt: string; action?: string }
  | { eventType: 'FIRM_CODE_SET'; firmCode: string; assignedAt: string; firmId?: string }
  | {
      eventType: 'SAFE_MODE_ACTIVATED';
      reason: string;
      missingTable?: string;
      schemaVersionConfirmed?: boolean;
    }
  | { eventType: 'SAFE_MODE_CLEARED' }
  | {
      eventType: 'BACKUP_CREATED';
      exportedAt: string;
      fileName: string;
      fileSizeBytes: number;
      shared: boolean;
      kind: BackupKind;
      trigger: BackupTrigger;
    }
  | {
      eventType: 'RESTORE_COMPLETED';
      backupSchema: number;
      backupDate: string;
      firmCount: number;
      restoredAt: string;
      oldSchema: boolean;
    }
  | {
      eventType: 'RESTORE_OLD_SCHEMA'; // Historical read-only (superseded in v7.43 FIX-V743-2 by oldSchema in RESTORE_COMPLETED)
      backupSchema: number;
      currentSchema: number;
      appSchema?: number;
    }
  | { eventType: 'FY_CLOSED'; fyId: string; fyLabel: string; closedAt: string }
  | {
      eventType: 'SETTINGS_CHANGED';
      fields: string[];
      oldValues: Record<string, unknown>;
      newValues: Record<string, unknown>;
    }
  | {
      eventType: 'DEVICE_ID_GENERATED';
      deviceId: string;
      generatedAt?: string;
      deviceName?: string;
      os?: string;
    }
  | { eventType: 'BIS_LOGO_ARCHIVED'; reason: string; fileRef?: string }
  | { eventType: 'PRE_MIGRATION_SNAPSHOT_FAILED'; error: string }
  | {
      eventType: 'AUDIT_RETENTION_PURGE_EXECUTED';
      deletedCount: number;
      auditRetentionDays: number;
      cutoff: string;
      executedAt: string;
    }
  | {
      eventType: 'DEVICE_ID_CHANGED';
      oldDeviceId: string;
      newDeviceId: string;
      reason: 'reinstall_or_new_device';
    }
  | { eventType: 'FACTORY_RESET_EXECUTED'; confirmedFirmCode: string; executedAt: string }
  | { eventType: 'PIN_SET'; pinLength: 4 | 6; setAt: string }
  | { eventType: 'PIN_CHANGED'; oldPinLength: 4 | 6; newPinLength: 4 | 6; changedAt: string }
  | { eventType: 'PIN_SKIPPED'; skippedAt: string }
  | {
      eventType: 'AUTO_BACKUP_FAILED';
      reason: AutoBackupReason;
      failCount: number;
      failedAt: string;
    }
  | {
      eventType: 'AUTO_BACKUP_SETTING_CHANGED';
      enabled: boolean;
      publicFolderGranted?: boolean;
      notificationsGranted?: boolean;
      changedAt: string;
    }

  // --- Supplementary & Diagnostic Phase 1 Events ---
  | { eventType: 'RESTORE_FAILED'; reason?: string }
  | { eventType: 'FY_ARCHIVE_INDEXED'; fyId?: string; fyLabel?: string; rowCount?: number }
  | { eventType: 'FY_CLOCK_SKEW'; detectedYear?: number; message?: string }
  | { eventType: 'PRE_MIGRATION_SNAPSHOT_CREATED'; snapshotPath?: string; timestamp?: string }
  | { eventType: 'PRE_MIGRATION_SNAPSHOT_PURGED'; purgedAt?: string };

export type AuditPayload = Phase1AuditPayload;
