// repositories/phase1/auditRepository.ts
// Append-only audit trail — strictly immutable.
// v4.0 G41: tx required for all events EXCEPT the 3 exempt events.
// Cycle Fix: reads deviceId from storage directly to eliminate circular require with utils/deviceId.ts

import * as Crypto from 'expo-crypto';
import { eq, desc, isNull, and, gte, lte } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { auditLogs, financialYears } from '@/db/schema';
import { now } from '@/utils/now';
import { storage } from '@/utils/storage';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function resolveTxAndInput(arg1: any, arg2?: any): { tx: DbOrTx | null; input: any } {
  if (arg1 && typeof arg1 === 'object' && ('eventType' in arg1 || 'firmId' in arg1)) {
    return { input: arg1, tx: arg2 || null };
  }
  return { tx: arg1 || null, input: arg2 || {} };
}

export const auditRepository = {
  /**
   * Writes an audit log entry. Supports both (input, tx) and (tx, input).
   * G41 Contract: tx is permitted to be absent ONLY for RESTORE_OLD_SCHEMA,
   * DEVICE_ID_GENERATED, and BACKUP_CREATED.
   */
  log(arg1: any, arg2?: any): void {
    const { tx, input } = resolveTxAndInput(arg1, arg2);

    const eventType = input.eventType;
    if (
      !tx &&
      eventType !== 'RESTORE_OLD_SCHEMA' &&
      eventType !== 'DEVICE_ID_GENERATED' &&
      eventType !== 'BACKUP_CREATED'
    ) {
      throw new Error(
        `AUDIT_TX_REQUIRED: A valid transaction context must be provided for event ${eventType}`
      );
    }

    const dbContext = getDb(tx);
    const newId = Crypto.randomUUID();
    const payloadStr = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload ?? {});
    
    // Cycle-safe direct storage read — does not import utils/deviceId.ts
    const deviceId = input.deviceId || storage.getString('vjbilling_device_id') || 'DEV-DEVICE-ID';

    dbContext.insert(auditLogs).values({
      id: newId,
      firmId: input.firmId ?? null,
      entityId: input.entityId ?? null,
      eventType: eventType as any,
      payload: payloadStr,
      deviceId,
      createdAt: now(),
    }).run();
  },

  /**
   * Alias for log — maintains backward compatibility across both (input, tx) and (tx, input).
   */
  create(arg1: any, arg2?: any): void {
    this.log(arg1, arg2);
  },

  /**
   * Explicitly requires firmId for firm isolation.
   */
  getByFirmId(firmId: string, limit: number = 50, tx?: DbOrTx) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: firmId is strictly required to fetch audit logs.');
    }

    const targetTx = getDb(tx);
    return targetTx
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.firmId, firmId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();
  },

  /**
   * Fetches global system events (where firmId is null).
   */
  getSystemLogs(limit: number = 50, tx?: DbOrTx) {
    const targetTx = getDb(tx);
    return targetTx
      .select()
      .from(auditLogs)
      .where(isNull(auditLogs.firmId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();
  },

  /**
   * Checks if an event type exists anywhere in the audit log.
   */
  hasEvent(eventType: string, tx?: DbOrTx): boolean {
    const targetTx = getDb(tx);
    const result = targetTx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.eventType, eventType as any))
      .limit(1)
      .get();

    return !!result;
  },

  /**
   * Counts audit log rows that fall within the date range of a given FY.
   */
  countByFy(fyId: string, tx?: DbOrTx): number {
    const targetTx = getDb(tx);
    const fy = targetTx
      .select({
        firmId: financialYears.firmId,
        startDate: financialYears.startDate,
        endDate: financialYears.endDate,
      })
      .from(financialYears)
      .where(eq(financialYears.id, fyId))
      .get();

    if (!fy) {
      console.warn(`[AuditRepo] countByFy: FY ${fyId} not found — rowCount will be 0`);
      return 0;
    }

    const endDateBound = fy.endDate.length === 10
      ? `${fy.endDate}T23:59:59.999Z`
      : fy.endDate;

    const rows = targetTx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, fy.firmId),
          gte(auditLogs.createdAt, fy.startDate),
          lte(auditLogs.createdAt, endDateBound)
        )
      )
      .all();

    return rows.length;
  },

  /**
   * AUDIT-RETENTION-ENFORCE stub interface.
   */
  deleteByRetention(firmId: string, fyId: string, tx: DbOrTx = db): void {
    console.log(
      `[AuditRepo] deleteByRetention called for firm=${firmId} fy=${fyId}.`
    );
  },
};

export const log = auditRepository.log.bind(auditRepository);
export const create = auditRepository.create.bind(auditRepository);
export const getByFirmId = auditRepository.getByFirmId.bind(auditRepository);
export const getSystemLogs = auditRepository.getSystemLogs.bind(auditRepository);
export const hasEvent = auditRepository.hasEvent.bind(auditRepository);
export const countByFy = auditRepository.countByFy.bind(auditRepository);
export const deleteByRetention = auditRepository.deleteByRetention.bind(auditRepository);
export default auditRepository;