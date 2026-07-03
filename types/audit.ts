// types/audit.ts
// v7.24 FIX-V724-4 / v7.25 FIX-V725-6 CANONICAL IMPLEMENTATION
// AuditPayload discriminated union covering all Phase 1 event types.

export type AuditPayload =
  | { eventType: 'FIRM_CREATED'; firmCode?: string; name?: string; proprietor?: string; gstin?: string | null }
  | { eventType: 'FIRM_UPDATED'; changes?: string[]; reason?: string; action?: string }
  | { eventType: 'FIRM_SWITCHED'; switchedToFirmId?: string; switchedAt?: string }
  | { eventType: 'FIRM_ARCHIVED'; archivedAt?: string; action?: string }
  | { eventType: 'FIRM_UNARCHIVED'; unarchivedAt?: string; action?: string }
  | { eventType: 'FIRM_CODE_SET'; firmCode?: string; assignedAt?: string; firmId?: string }
  | { eventType: 'SAFE_MODE_ACTIVATED'; reason?: string; missingTable?: string; schemaVersionConfirmed?: boolean }
  | { eventType: 'SAFE_MODE_CLEARED' }
  | { eventType: 'BACKUP_CREATED'; exportedAt?: string; fileName?: string; fileSizeBytes?: number }
  | { eventType: 'RESTORE_COMPLETED'; backupSchema?: number; backupDate?: string; firmCount?: number; restoredAt?: string }
  | { eventType: 'RESTORE_OLD_SCHEMA'; backupSchema?: number; currentSchema?: number; appSchema?: number }
  | { eventType: 'RESTORE_FAILED'; reason?: string }
  | { eventType: 'FY_CLOSED'; fyId?: string; fyLabel?: string; closedAt?: string }
  | { eventType: 'FY_CLOCK_SKEW'; detectedYear?: number; message?: string }
  | { eventType: 'SETTINGS_CHANGED'; fields?: string[]; oldValues?: Record<string, any>; newValues?: Record<string, any> }
  | { eventType: 'DEVICE_ID_GENERATED'; deviceId?: string; generatedAt?: string; deviceName?: string; os?: string }
  | { eventType: 'BIS_LOGO_ARCHIVED'; reason?: string; fileRef?: string }
  | { eventType: 'PRE_MIGRATION_SNAPSHOT_FAILED'; error?: string }
  | { eventType: 'AUDIT_RETENTION_PURGE_EXECUTED'; deletedCount?: number; auditRetentionDays?: number; cutoff?: string; executedAt?: string }
  | { eventType: 'DEVICE_ID_CHANGED'; oldDeviceId?: string; newDeviceId?: string; reason?: 'reinstall_or_new_device' }
  | { eventType: 'FACTORY_RESET_EXECUTED'; confirmedFirmCode?: string; executedAt?: string };