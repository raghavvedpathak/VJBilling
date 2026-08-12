// repositories/phase1/auditArchiveIndexRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { auditArchiveIndex, auditLogs } from '@/db/schema';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import type { DrizzleTransaction, FinancialYear } from '@/types/phase2/phase2.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const auditArchiveIndexRepository = {
  /**
   * Inserts a row into audit_archive_index.
   * Supports both (tx, data) and (data, tx) argument orders.
   */
  insert(arg1: any, arg2?: any): void {
    let tx: DbOrTx = db;
    let data: any = {};

    if (arg1 && typeof arg1 === 'object' && ('fyId' in arg1 || 'firmId' in arg1)) {
      data = arg1;
      tx = getDb(arg2);
    } else {
      tx = getDb(arg1);
      data = arg2 || {};
    }

    const targetTx = getDb(tx);
    targetTx.insert(auditArchiveIndex).values(data).run();
  },

  /**
   * Counts audit logs for a firm and FY.
   * Appends T23:59:59.999Z to YYYY-MM-DD endDate to correctly capture logs created on the final day.
   * Supports flexible parameter ordering: (tx, firmId, fyId, fy?) or (firmId, fyId, tx?, fy?).
   */
  countByFirmAndFY(arg1: any, arg2?: any, arg3?: any, arg4?: any): number {
    let tx: DbOrTx = db;
    let firmId = '';
    let fyId = '';
    let fy: any = null;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      fyId = arg2;
      if (arg3 && typeof arg3 === 'object' && 'select' in arg3) {
        tx = arg3;
        fy = arg4;
      } else {
        tx = db;
        fy = arg3;
      }
    } else {
      tx = arg1 || db;
      firmId = arg2 || '';
      fyId = arg3 || '';
      fy = arg4;
    }

    const targetTx = getDb(tx);
    const resolvedFy = fy ?? fyRepository.getById(targetTx, firmId, fyId) ?? fyRepository.getById(targetTx, fyId);
    if (!resolvedFy) return 0;

    const endDateBound = resolvedFy.endDate.length === 10
      ? `${resolvedFy.endDate}T23:59:59.999Z`
      : resolvedFy.endDate;

    const result = targetTx
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, firmId),
          gte(auditLogs.createdAt, resolvedFy.startDate),
          lte(auditLogs.createdAt, endDateBound)
        )
      )
      .get();

    return Number(result?.count) || 0;
  },

  /**
   * Alias for countByFirmAndFY
   */
  countByFyAndFirm(arg1: any, arg2?: any, arg3?: any, arg4?: any): number {
    return this.countByFirmAndFY(arg1, arg2, arg3, arg4);
  },
};