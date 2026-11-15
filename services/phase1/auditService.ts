// services/phase1/auditService.ts — Phase 1 v7.47 & Phase 2 Canonical Audit Service
// v3.0 G39: entityId traceability support added
// G41 (FIX-V743-2, FIX-V744-3): Strict transaction context passthrough + MMKV pre-DB queue

import { auditRepository } from '@/repositories/phase1/auditRepository';
import { safeTransaction } from '@/db/safeTransaction';
import { getDeviceId } from '@/utils/deviceId';
import { storage } from '@/utils/storage';
import type { AuditPayload } from '@/types/phase1/audit';

export type AuditEventType =
  // --- Phase 1 Canonical Event Types (All 24 Active Events in v7.47) ---
  | 'FIRM_CREATED'
  | 'FIRM_UPDATED'
  | 'FIRM_SWITCHED'
  | 'FIRM_CODE_SET'
  | 'FIRM_ARCHIVED'
  | 'FIRM_UNARCHIVED'
  | 'FY_CREATED'
  | 'FY_CLOSED'
  | 'FY_CLOCK_SKEW'
  | 'BACKUP_CREATED'
  | 'RESTORE_COMPLETED'
  | 'RESTORE_FAILED'
  | 'RESTORE_OLD_SCHEMA'
  | 'SAFE_MODE_ACTIVATED'
  | 'SAFE_MODE_CLEARED'
  | 'DEVICE_ID_GENERATED'
  | 'DEVICE_ID_CHANGED'
  | 'FACTORY_RESET_EXECUTED'
  | 'PIN_SET'
  | 'PIN_CHANGED'
  | 'PIN_SKIPPED'
  | 'PRE_MIGRATION_SNAPSHOT_CREATED'
  | 'PRE_MIGRATION_SNAPSHOT_FAILED'
  | 'PRE_MIGRATION_SNAPSHOT_PURGED'
  | 'BIS_LOGO_ARCHIVED'
  | 'SETTINGS_CHANGED'
  | 'AUDIT_RETENTION_PURGE_EXECUTED'
  | 'AUTO_BACKUP_FAILED'
  | 'AUTO_BACKUP_SETTING_CHANGED';

const PENDING_AUDIT_MMKV_KEY = 'vjbilling_pending_audit_queue';

export interface PendingAuditItem {
  eventType: AuditEventType | AuditPayload['eventType'];
  firmId: string | null;
  payload: string;
  createdAt: string;
}

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

/**
 * v7.44 FIX-V744-3: Queues audit events raised before the database opens
 * (first-boot PIN_SET, PIN_SKIPPED, and deferred PRE_MIGRATION_SNAPSHOT_FAILED)
 * in MMKV to be flushed with a live transaction after bootstrap Step 7b.
 */
export function queuePendingAudit(
  eventType: AuditEventType | AuditPayload['eventType'],
  payload: Record<string, unknown> | string,
  firmId: string | null = null
): void {
  try {
    const raw = storage.getString(PENDING_AUDIT_MMKV_KEY);
    const list: PendingAuditItem[] = raw ? JSON.parse(raw) : [];
    list.push({
      eventType,
      firmId,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
      createdAt: new Date().toISOString(),
    });
    storage.set(PENDING_AUDIT_MMKV_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[AuditService] Failed to queue pre-DB audit event:', e);
  }
}

/**
 * v7.44 FIX-V744-3: Flushes queued pre-DB audit events inside safeTransaction()
 * after bootstrap Step 7b completes.
 */
export function flushPendingAudit(): void {
  const raw = storage.getString(PENDING_AUDIT_MMKV_KEY);
  if (!raw) return;

  let list: PendingAuditItem[] = [];
  try {
    list = JSON.parse(raw);
  } catch {
    storage.delete(PENDING_AUDIT_MMKV_KEY);
    return;
  }

  if (!Array.isArray(list) || list.length === 0) {
    storage.delete(PENDING_AUDIT_MMKV_KEY);
    return;
  }

  const deviceId = getSafeDeviceId();
  safeTransaction((tx) => {
    for (const item of list) {
      auditRepository.log(tx, {
        eventType: item.eventType,
        firmId: item.firmId ?? null,
        deviceId,
        payload: item.payload,
      });
    }
  });
  storage.delete(PENDING_AUDIT_MMKV_KEY);
}

export const auditService = {
  /**
   * Logs a critical system event synchronously (REPOSITORY SYNC CONTRACT).
   * G41-compliant: passes tx through to auditRepository.
   * Supports entityId for Phase 3 document and ledger traceability (v3.0 G39).
   */
  log(
    tx: any | undefined | null,
    firmId: string | null,
    eventType: AuditEventType | AuditPayload['eventType'],
    payload: object | string,
    entityId?: string | null,
    deviceIdOverride?: string
  ): void {
    const deviceId = deviceIdOverride || getSafeDeviceId();
    const payloadObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const resolvedEntityId = entityId ?? (payloadObj as any)?.entityId ?? null;

    auditRepository.log(tx ?? null, {
      firmId,
      entityId: resolvedEntityId,
      eventType: eventType as string,
      payload: JSON.stringify(payloadObj ?? {}),
      deviceId,
    });
  },

  queuePendingAudit,
  flushPendingAudit,

  /**
   * Returns firm-scoped logs + device-level system logs, sorted newest first.
   */
  async getEvents(firmId: string) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: Firm ID is strictly required to fetch audit logs.');
    }

    const firmLogs = auditRepository.getByFirmId(firmId, 100);
    const systemLogs = auditRepository.getSystemLogs(50);

    return [...firmLogs, ...systemLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};

export default auditService;
