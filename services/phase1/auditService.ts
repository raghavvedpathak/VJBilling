// services/phase1/auditService.ts — Phase 1 & 2 Canonical Audit Service

import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import type { AuditPayload } from '@/types/phase1/audit';

export type AuditEventType =
  // --- Phase 1 Canonical Event Types (All 22 Events) ---
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
  // --- Phase 2 Event Types ---
  | 'URD_PURCHASE_CREATED'
  | 'URD_PURCHASE_CONFIRMED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_SOFT_DELETED'
  | 'DESIGN_CREATED'
  | 'DESIGN_UPDATED'
  | 'DESIGN_SOFT_DELETED'
  | 'STONE_CREATED'
  | 'ITEM_CREATED'
  | 'HUID_ADDED'
  | 'ITEM_STATUS_CHANGED'
  | 'WEIGHT_ADJUSTED'
  | 'BARCODE_REPRINTED'
  | 'OLD_GOLD_LOT_CREATED'
  | 'OLD_GOLD_LOT_STATUS_CHANGED'
  | 'FY_CLOSE_FINE_BALANCE'
  | 'FY_ARCHIVE_INDEXED'
  | 'ITEM_DELETED'
  | 'METAL_SOURCE_CORRECTED'
  | 'HUID_CORRECTED'
  | 'GEMSTONE_LOT_CREATED'
  | 'GEMSTONE_LOT_STATUS_CHANGED'
  | 'ITEM_EDITED'
  | 'ITEM_SENT_TO_KARIGAR'
  | 'ITEM_RETURNED_FROM_KARIGAR';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const auditService = {
  /**
   * Logs a critical system event.
   * G41-compliant: passes tx through to auditRepository.
   * tx: null is normalized to undefined so repo defaults to global db.
   */
  async log(
    tx: any | undefined | null,
    firmId: string | null,
    eventType: AuditEventType | AuditPayload['eventType'],
    payload: object,
    deviceIdOverride?: string
  ) {
    const deviceId = deviceIdOverride || getSafeDeviceId();
    const activeTx = tx || undefined;

    const payloadObj = typeof payload === 'string' ? JSON.parse(payload) : payload;

    if (typeof (auditRepository as any).log === 'function') {
      (auditRepository as any).log(activeTx ?? null, {
        firmId,
        eventType: eventType as string,
        payload: JSON.stringify(payloadObj),
        deviceId,
      });
    } else {
      auditRepository.create(
        {
          firmId,
          eventType: eventType as string,
          payload: JSON.stringify(payloadObj),
          deviceId,
        },
        activeTx
      );
    }
  },

  /**
   * Returns firm-scoped logs + device-level system logs, sorted newest first.
   */
  async getEvents(firmId: string) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: Firm ID is strictly required to fetch audit logs.');
    }

    const firmLogs = await auditRepository.getByFirmId(firmId, 100);
    const systemLogs = await auditRepository.getSystemLogs(50);

    return [...firmLogs, ...systemLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};

export default auditService;