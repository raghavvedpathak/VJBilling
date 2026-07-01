import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { auditArchiveIndex, auditLogs } from '../db/schema';
import type { DrizzleTransaction, FinancialYear } from '../types/phase2.types';

// ALIGN-P1-V74 (v1.39)
export const auditArchiveIndexRepository = {
  // FIX-V718-1: Synchronous execution using .run() (No async/await)
  insert(tx: DrizzleTransaction, data: {
    id: string; firmId: string; fyId: string; fyLabel: string;
    archiveDate: string; rowCount: number; storageRef: string | null;
  }): void {
    tx.insert(auditArchiveIndex).values(data).run();
  },

  // FIX-V718-1: Synchronous execution using .get() (No async/await)
  countByFirmAndFY(tx: DrizzleTransaction, firmId: string, fyId: string, fy: FinancialYear): number {
    const result = tx
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, firmId), 
          gte(auditLogs.createdAt, fy.startDate),
          lte(auditLogs.createdAt, fy.endDate)
        )
      )
      .get();
      
    return result?.count ?? 0;
  },
};