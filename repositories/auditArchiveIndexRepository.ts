// repositories/auditArchiveIndexRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { auditArchiveIndex, auditLogs } from '../db/schema';
import { fyRepository } from './fyRepository';
import type { DrizzleTransaction, FinancialYear } from '../types/phase2.types';

// ALIGN-P1-V74 (v1.39) & FIX-ARCHIVE-COUNT-1 (v1.46)
export const auditArchiveIndexRepository = {
  // --- insert (Step 5.5 / closeFY) ---
  insert(tx: DrizzleTransaction, data: {
    id: string;
    firmId: string;
    fyId: string;
    fyLabel: string;
    archiveDate: string;
    rowCount: number;
    storageRef: string | null;
  }): void {
    tx.insert(auditArchiveIndex).values(data).run();
  },

  // --- countByFirmAndFY (Step 5.5 / closeFY) ---
  // Overloaded to support both 3-arg and 4-arg calls
  countByFirmAndFY(
    tx: DrizzleTransaction,
    firmId: string,
    fyId: string,
    fy?: FinancialYear
  ): number {
    // Resolve financial year object if not provided by caller
    const resolvedFy = fy ?? fyRepository.getById(tx, firmId, fyId) ?? fyRepository.getById(tx, fyId);
    if (!resolvedFy) return 0;

    const result = tx
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, firmId), 
          gte(auditLogs.createdAt, resolvedFy.startDate),
          lte(auditLogs.createdAt, resolvedFy.endDate)
        )
      )
      .get();
      
    return Number(result?.count) || 0;
  },
};