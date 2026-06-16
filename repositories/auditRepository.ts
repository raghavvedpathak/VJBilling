// repositories/auditRepository.ts
// Append-only audit trail — no update or delete methods exist by design.
//
// v4.0 G41: tx is required for all events EXCEPT the 3 exempt events.
// v7.4 AUDIT-ARCHIVE: countByFy + deleteByRetention added for fyService.closeFY().
//
// CONSTITUTIONAL RULES:
//   - No UPDATE method exists — audit_logs is immutable (DB trigger + no service method).
//   - No DELETE method exists for general use — deleteByRetention is the SOLE exception,
//     called ONLY by fyService.closeFY(), and it is a Phase 1 NO-OP because the
//     prevent_audit_delete DB trigger in client.ts will ABORT any DELETE on audit_logs.
//     The method exists as a Phase 2 activation seam — DO NOT remove it.
//   - G41 whitelist: RESTORE_OLD_SCHEMA, DEVICE_ID_GENERATED, BACKUP_CREATED are the
//     ONLY 3 events that may be written without a tx context.

import * as Crypto from 'expo-crypto';
import { eq, desc, isNull, and, gte, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs, financialYears } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export const auditRepository = {

  /**
   * Writes an audit log entry.
   * Hardened: Append-only logic. No update/delete methods exist.
   *
   * v4.0 G41 Contract: tx is permitted to be absent ONLY for these EXACT 3 call sites.
   * In all other cases, tx must be provided to ensure atomic integrity.
   * Whitelist: RESTORE_OLD_SCHEMA, DEVICE_ID_GENERATED, BACKUP_CREATED
   */
  async create(
    input: {
      firmId: string | null;
      eventType: string;
      payload: string;
      deviceId: string;
    },
    tx?: DbOrTx
  ) {
    if (
      !tx &&
      input.eventType !== 'RESTORE_OLD_SCHEMA' &&
      input.eventType !== 'DEVICE_ID_GENERATED' &&
      input.eventType !== 'BACKUP_CREATED'
    ) {
      throw new Error(
        `AUDIT_TX_REQUIRED: A valid transaction context must be provided for event ${input.eventType}`
      );
    }

    const dbContext = tx ?? db;
    const newId = Crypto.randomUUID();

    await dbContext.insert(auditLogs).values({
      id: newId,
      firmId: input.firmId,
      eventType: input.eventType as any,
      payload: input.payload,
      deviceId: input.deviceId,
      createdAt: now(),
    });
  },

  async log(
    tx: DbOrTx,
    input: {
      eventType: string;
      firmId: string | null;
      entityId?: string | null;
      deviceId: string;
      payload: string;
    }
  ) {
    if (
      !tx &&
      input.eventType !== 'RESTORE_OLD_SCHEMA' &&
      input.eventType !== 'DEVICE_ID_GENERATED' &&
      input.eventType !== 'BACKUP_CREATED'
    ) {
      throw new Error(
        `AUDIT_TX_REQUIRED: A valid transaction context must be provided for event ${input.eventType}`
      );
    }

    const dbContext = tx ?? db;
    const newId = Crypto.randomUUID();

    await dbContext.insert(auditLogs).values({
      id: newId,
      firmId: input.firmId,
      entityId: input.entityId ?? null,
      eventType: input.eventType as any,
      payload: input.payload,
      deviceId: input.deviceId,
      createdAt: now(),
    });
  },

  /**
   * STEP 6 HARDENING: FIRM ISOLATION
   * Explicitly requires firmId. Cross-firm queries are structurally impossible.
   */
  async getByFirmId(firmId: string, limit: number = 50, tx: DbOrTx = db) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: firmId is strictly required to fetch audit logs.');
    }

    return await tx
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.firmId, firmId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  },

  /**
   * STEP 6 HARDENING: SYSTEM ISOLATION
   * Fetches only global events (Safe Mode, Bootstraps) where firmId is null.
   */
  async getSystemLogs(limit: number = 50, tx: DbOrTx = db) {
    return await tx
      .select()
      .from(auditLogs)
      .where(isNull(auditLogs.firmId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  },

  /**
   * Checks if an event type exists anywhere in the audit log.
   * Used by deviceId Phase B to detect if DEVICE_ID_GENERATED was already written.
   */
  async hasEvent(eventType: string, tx: DbOrTx = db): Promise<boolean> {
    const result = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.eventType, eventType as any))
      .limit(1);

    return result.length > 0;
  },

  /**
   * Counts audit log rows that fall within the date range of a given FY.
   * Called by fyService.closeFY() to populate audit_archive_index.rowCount.
   *
   * IMPLEMENTATION NOTE:
   * audit_logs has no fy_id column. We resolve the FY date range from
   * financial_years and count rows by createdAt window for this firm.
   * This is the spec-correct approach — audit rows are scoped to a firm
   * and a time window, not tagged with a fyId directly.
   *
   * @param fyId - UUID of the financial year — used to look up startDate/endDate
   * @param tx   - Drizzle transaction context — MUST be the same tx as closeFY caller
   */
  async countByFy(fyId: string, tx: DbOrTx = db): Promise<number> {
    // Step 1: Resolve the FY's date range
    const [fy] = await tx
      .select({
        firmId: financialYears.firmId,
        startDate: financialYears.startDate,
        endDate: financialYears.endDate,
      })
      .from(financialYears)
      .where(eq(financialYears.id, fyId));

    if (!fy) {
      // FY not found — return 0 rather than crashing the archive index write
      console.warn(`[AuditRepo] countByFy: FY ${fyId} not found — rowCount will be 0`);
      return 0;
    }

    // Step 2: Count audit_logs rows for this firm within the FY date window
    // createdAt is stored as ISO-8601 datetime — string comparison is correct for
    // ISO-8601 because lexicographic order == chronological order.
    // FY startDate is 'YYYY-MM-DD' → rows from start of that day onward.
    // FY endDate is 'YYYY-MM-DD' → rows up to and including that date (endDate + 'T23:59:59')
    const rows = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, fy.firmId),
          gte(auditLogs.createdAt, fy.startDate),           // >= '2025-04-01'
          lte(auditLogs.createdAt, fy.endDate + 'T23:59:59.999Z') // <= '2026-03-31T23:59:59.999Z'
        )
      );

    return rows.length;
  },

  /**
   * AUDIT-RETENTION-ENFORCE — Deletes audit log rows beyond the retention threshold.
   * Called ONLY by fyService.closeFY() as Step C (RED-8 Compliance).
   *
   * PHASE 1 STATUS: NO-OP STUB.
   *
   * Reason this is a no-op in Phase 1:
   * The prevent_audit_delete DB trigger installed in db/client.ts will ABORT
   * any DELETE statement on audit_logs unconditionally. Attempting a real delete
   * here would throw 'AUDIT_LOG_IMMUTABLE: audit logs cannot be deleted' and
   * roll back the entire closeFY transaction.
   *
   * Phase 2 activation: When the spec lifts this constraint for retention-scoped
   * deletes, this method will be implemented with the actual DELETE query.
   * The trigger in client.ts must be updated simultaneously to allow retention deletes.
   *
   * DO NOT REMOVE this method — fyService.closeFY() calls it unconditionally.
   * DO NOT implement the DELETE query until Phase 2 spec explicitly authorises it.
   *
   * @param firmId - Firm scoping (Phase 2 will use this for the WHERE clause)
   * @param fyId   - FY scoping (Phase 2 will use this for the date range filter)
   * @param tx     - Transaction context (Phase 2 will use this for atomicity)
   */
  async deleteByRetention(firmId: string, fyId: string, tx: DbOrTx = db): Promise<void> {
    // PHASE 1 NO-OP — prevent_audit_delete trigger blocks all DELETEs on audit_logs.
    // Phase 2: implement retention-scoped DELETE with auditRetentionDays from app_settings.
    console.log(
      `[AuditRepo] deleteByRetention: Phase 1 no-op — ` +
      `firm=${firmId} fy=${fyId}. Retention enforcement activates in Phase 2.`
    );
  },
};