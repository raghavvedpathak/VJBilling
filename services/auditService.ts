import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';

// v2.0 Hardened: Expanded Event Types aligned with db/schema.ts
export type AuditEventType =
  | 'FIRM_CREATED'
  | 'FIRM_UPDATED'
  | 'FIRM_SWITCHED'
  | 'FIRM_CODE_SET'                  // Review Item 11
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
  | 'PRE_MIGRATION_SNAPSHOT_FAILED'  // Review Item 10
  | 'BIS_LOGO_ARCHIVED'              // FIX: was missing — firmService emits this event
  | 'SETTINGS_CHANGED';

export const auditService = {

  /**
   * Logs a critical system event.
   * G41-compliant: passes tx through to auditRepository.
   * tx: null is normalized to undefined so repo defaults to global db.
   */
  async log(
    tx: any | undefined | null,
    firmId: string | null,
    eventType: AuditEventType,
    payload: object,
    deviceIdOverride?: string
  ) {
    const deviceId = deviceIdOverride || await getDeviceId();
    const activeTx = tx || undefined;

    await auditRepository.create({
      firmId,
      eventType,
      payload: JSON.stringify(payload),
      deviceId,
    }, activeTx);
  },

  /**
   * STEP 6 HARDENING: FIRM ISOLATION
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