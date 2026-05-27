import * as Crypto from 'expo-crypto';
import { eq, desc, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export const auditRepository = {

  /**
   * Writes an audit log entry.
   * Hardened: Append-only logic. No update/delete methods exist.
   *
   * v4.0 G41 Contract: tx = null is permitted ONLY for these EXACT 3 call sites.
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
};