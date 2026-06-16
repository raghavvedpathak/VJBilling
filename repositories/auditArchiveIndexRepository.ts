import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { auditArchiveIndex, auditLogs } from '../db/schema';
import type { DrizzleTransaction, FinancialYear } from '../types/phase2.types';

// ALIGN-P1-V74 (v1.39)
export const auditArchiveIndexRepository = {
  async insert(tx: DrizzleTransaction, data: {
    id: string; firmId: string; fyId: string; fyLabel: string;
    archiveDate: string; rowCount: number; storageRef: string | null;
  }): Promise<void> {
    await tx.insert(auditArchiveIndex).values(data);
  },

  async countByFirmAndFY(tx: DrizzleTransaction, firmId: string, fyId: string, fy: FinancialYear): Promise<number> {
    const result = await tx
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, firmId), 
          gte(auditLogs.createdAt, fy.startDate),
          lte(auditLogs.createdAt, fy.endDate)
        )
      );
    return result[0]?.count ?? 0;
  },
};
