// services/fyService.ts
import { fyRepository } from '../repositories/fyRepository';
import { auditRepository } from '../repositories/auditRepository';
import { auditArchiveIndex } from '../db/schema';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { generateId } from '../utils/deviceId';
import { now } from '../utils/now';
import { db } from '../db/client';

export const fyService = {
  async getActiveFY(firmId: string) {
    return await fyRepository.getActiveFY(firmId);
  },

  async resolveTransactionFyId(firmId: string, entryDate: string) {
    return await fyRepository.resolveTransactionFyId(firmId, entryDate);
  },

  /**
   * STEP 5 HARDENING: FY CLOSE — IMPLEMENTED
   * Logic: Atomic close + Archive Audit Log entry + Retention Purge
   */
  async closeFY(firmId: string, fyId: string) {
    // 1. DUAL GUARD
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    const timestamp = now();
    
    // 2. Execution (Atomic)
    await db.transaction(async (tx) => {
      // A. Close the FY in database
      await fyRepository.closeFY(firmId, fyId, tx);

      // B. Create Archive Index Record
      const fy = await fyRepository.getById(fyId);
      await tx.insert(auditArchiveIndex).values({
        id: generateId(),
        firmId: firmId,
        fyId: fyId,
        fyLabel: fy!.label,
        archiveDate: timestamp,
        rowCount: await auditRepository.countByFy(fyId),
      });

      // C. AUDIT-RETENTION-ENFORCE (RED-8 Compliance)
      // Delete audit logs older than the retention threshold ONLY for this closed FY
      await auditRepository.deleteByRetention(firmId, fyId, tx);
    });
  }
};