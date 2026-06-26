// services/firmService.ts
// v2.8 FULL COMPLIANCE: Dual Guard Pattern (assertNoActiveLease + assertNotInSafeMode)
// v7.0 G70: GSTIN + stateCode cross-validation, pincode validation
// v6.5 Gap B: BIS logo archival on licence removal
// isArchived and isActive are plain integers in schema — ALWAYS use 0/1, NEVER true/false

import { eq } from 'drizzle-orm';
import { firms } from '../db/schema';

import { firmRepository, NewFirm } from '../repositories/firmRepository';
import { fyRepository } from '../repositories/fyRepository';
import { auditRepository } from '../repositories/auditRepository';
import { bisLogoRepository } from '../repositories/bisLogoRepository';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { db } from '../db/client';
import { useFirmStore } from '../store/firmStore';
import { validateGSTIN } from '../utils/validateGSTIN';
import { validateFirmCode } from '../utils/validateFirmCode';
import { validatePincode } from '../utils/validatePincode';
import { getDeviceId } from '../utils/deviceId';
import { now } from '../utils/now';

type CreateFirmInput = Omit<NewFirm, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'isArchived' | 'bisLogoRef'> & {
  firmCode: string;
  bisLogoUri?: string | null;
  firmLogoRef?: string | null;
};

type UpdateFirmInput = Partial<Omit<NewFirm, 'bisLogoRef'>> & {
  bisLogoUri?: string | null;
  firmLogoRef?: string | null;
};

// ============================================================================
// v2.8 FULL COMPLIANCE: The Dual Guard Pattern
// Both guards MUST fire before ANY write operation in this service.
// ============================================================================
async function assertSystemIsWritable() {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();
}

export const firmService = {

  /**
   * Creates a new firm with strict validation, race condition fix, and atomic transaction.
   * v7.0 G70: validates GSTIN, stateCode cross-match, pincode.
   * firmCode is set immutably at creation — DB trigger prevent_firm_code_update enforces this.
   */
  async createFirm(input: CreateFirmInput) {
    await assertSystemIsWritable();

    if (input.bisLogoUri && !input.bisLicence) {
      throw new Error('ILLEGAL_OPERATION: Cannot upload a BIS Logo without a valid BIS Licence Number.');
    }

    if (input.gstin) {
      validateGSTIN(input.gstin);
      if (input.gstin.substring(0, 2) !== input.stateCode) {
        throw new Error(
          `GSTIN_STATE_MISMATCH: GSTIN state code ${input.gstin.substring(0, 2)} does not match firm stateCode ${input.stateCode}`
        );
      }
    }

    validatePincode(input.pincode);
    validateFirmCode(input.firmCode);

    const deviceId = await getDeviceId();
    const currentYear = new Date().getFullYear();
    const hasClockSkew = currentYear < 2020 || currentYear > 2040;

    const result = await db.transaction(async (tx) => {
      // RACE CONDITION FIX: count inside transaction
      const count = await firmRepository.countFirms(tx);
      if (count >= 3) {
        throw new Error('MAX_FIRMS_REACHED: Cannot create more than 3 firms total.');
      }

      const { bisLogoUri, ...dbInput } = input;
      const newFirm = await firmRepository.create(dbInput, tx);

      await fyRepository.createInitialFY(newFirm.id, tx);

      if (bisLogoUri) {
        const logoId = await bisLogoRepository.insert({ firmId: newFirm.id, fileRef: bisLogoUri }, tx);
        await firmRepository.update(newFirm.id, { bisLogoRef: logoId }, tx);
      }

      // FIX: now() for assignedAt — was new Date().toISOString()
      await auditRepository.create(
        {
          firmId: newFirm.id,
          eventType: 'FIRM_CODE_SET',
          payload: JSON.stringify({
            firmId: newFirm.id,
            firmCode: input.firmCode,
            assignedAt: now(),
          }),
          deviceId,
        },
        tx
      );

      await auditRepository.create(
        {
          firmId: newFirm.id,
          eventType: 'FIRM_CREATED',
          payload: JSON.stringify({
            name: newFirm.name,
            gstin: newFirm.gstin,
            proprietor: newFirm.proprietor,
          }),
          deviceId,
        },
        tx
      );

      if (hasClockSkew) {
        await auditRepository.create(
          {
            firmId: newFirm.id,
            eventType: 'FY_CLOCK_SKEW',
            payload: JSON.stringify({
              detectedYear: currentYear,
              message: 'Device clock is outside safe boundaries (<2020 or >2040).',
            }),
            deviceId,
          },
          tx
        );
      }

      return newFirm;
    });

    await this.refreshStore();
    return result;
  },

  /**
   * Updates an existing firm.
   * GSTIN is immutable after creation. firmCode is immutable.
   * stateCode is locked when GSTIN registered.
   * BIS logo is archived when bisLicence is removed (Gap B).
   */
  async updateFirm(firmId: string, input: UpdateFirmInput) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('FIRM_EDIT', firmId);

    try {
      const deviceId = await getDeviceId();
      const existingFirm = await firmRepository.getById(firmId);
      if (!existingFirm) throw new Error('FIRM_NOT_FOUND');

      if ('gstin' in input && input.gstin !== existingFirm.gstin) {
        throw new Error(
          'ILLEGAL_OPERATION: GSTIN is a statutory signal and cannot be added, removed, or changed after firm creation.'
        );
      }

      if ('firmCode' in input && input.firmCode !== existingFirm.firmCode) {
        throw new Error('ILLEGAL_OPERATION: Firm Code is immutable and cannot be updated.');
      }

      if ('stateCode' in input && input.stateCode !== existingFirm.stateCode && existingFirm.gstin) {
        throw new Error(
          'ILLEGAL_OPERATION: State cannot be changed because it is locked to the registered GSTIN.'
        );
      }

      if (input.pincode) {
        validatePincode(input.pincode);
      }

      const { bisLogoUri, ...restInput } = input;
      const updatePayload: Partial<NewFirm> = { ...restInput };
      const auditEvents: Array<{ eventType: string; payload: string }> = [];

      if (bisLogoUri && !input.bisLicence && !existingFirm.bisLicence) {
        throw new Error('ILLEGAL_OPERATION: Cannot upload a BIS Logo without a valid BIS Licence.');
      }

      const updatedFirm = await db.transaction(async (tx) => {
        // Gap B: Archive BIS logo when bisLicence is removed
        if ('bisLicence' in input && !input.bisLicence && existingFirm.bisLogoRef) {
          updatePayload.bisLogoRef = null;
          await bisLogoRepository.archive(existingFirm.id, existingFirm.bisLogoRef, 'licence_removed', tx);
          auditEvents.push({
            eventType: 'BIS_LOGO_ARCHIVED',
            payload: JSON.stringify({ reason: 'licence_removed' }),
          });
        } else if (bisLogoUri) {
          const logoId = await bisLogoRepository.insert({ firmId: existingFirm.id, fileRef: bisLogoUri }, tx);
          updatePayload.bisLogoRef = logoId;
        }

        const result = await firmRepository.update(firmId, updatePayload, tx);

        await auditRepository.create(
          {
            firmId,
            eventType: 'FIRM_UPDATED',
            payload: JSON.stringify({ changes: Object.keys(updatePayload) }),
            deviceId,
          },
          tx
        );

        for (const event of auditEvents) {
          await auditRepository.create(
            { firmId, eventType: event.eventType, payload: event.payload, deviceId },
            tx
          );
        }

        return result;
      });

      await this.refreshStore();
      return updatedFirm;

    } finally {
      await leaseService.release(leaseId);
    }
  },

  async switchFirm(firmId: string): Promise<void> {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('SWITCH', firmId);

    try {
      const deviceId = await getDeviceId();
      await db.transaction(async (tx) => {
        const target = await tx.select().from(firms).where(eq(firms.id, firmId)).limit(1);
        if (!target.length || target[0].isArchived) throw new Error('FIRM_NOT_FOUND: ' + firmId);
        
        await tx.update(firms).set({ isActive: 0 });
        await tx.update(firms).set({ isActive: 1 }).where(eq(firms.id, firmId));
        
        await auditRepository.create(
          {
            firmId,
            eventType: 'FIRM_SWITCHED',
            payload: JSON.stringify({ switchedToFirmId: firmId, switchedAt: new Date().toISOString() }),
            deviceId,
          },
          tx
        );
      });

      await this.refreshStore();
      useFirmStore.getState().switchFirm(firmId);
    } finally {
      await leaseService.release(leaseId);
    }
  },

  /**
   * Archives a firm (soft-delete).
   * Cannot archive the last active firm or the currently active firm.
   * isArchived = 1, isActive = 0 — plain integers, NOT boolean.
   */
  async archiveFirm(firmId: string) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('ARCHIVE', firmId);

    try {
      const deviceId = await getDeviceId();

      await db.transaction(async (tx) => {
        const activeCount = await firmRepository.countActiveFirms(tx);
        if (activeCount <= 1) {
          throw new Error('LAST_FIRM: Cannot archive the only active firm.');
        }

        const activeFirmId = await firmRepository.getActiveFirmId(tx);
        if (firmId === activeFirmId) {
          throw new Error('CANNOT_ARCHIVE_ACTIVE_FIRM: Switch to another firm first.');
        }

        await firmRepository.update(firmId, { isArchived: 1, isActive: 0 }, tx);

        await auditRepository.create(
          {
            firmId,
            eventType: 'FIRM_UPDATED',
            payload: JSON.stringify({ action: 'ARCHIVED' }),
            deviceId,
          },
          tx
        );
      });

      await this.refreshStore();
    } finally {
      await leaseService.release(leaseId);
    }
  },

  /**
   * Unarchives a firm. Cannot exceed 3 active firms total.
   * isArchived = 0 — plain integer, NOT false.
   */
  async unarchiveFirm(firmId: string) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('ARCHIVE', firmId);

    try {
      const deviceId = await getDeviceId();

      await db.transaction(async (tx) => {
        const activeCount = await firmRepository.countActiveFirms(tx);
        if (activeCount >= 3) {
          throw new Error('MAX_FIRMS_REACHED: Unarchive would exceed 3 active firms.');
        }

        await firmRepository.update(firmId, { isArchived: 0 }, tx);

        await auditRepository.create(
          {
            firmId,
            eventType: 'FIRM_UPDATED',
            payload: JSON.stringify({ action: 'UNARCHIVED' }),
            deviceId,
          },
          tx
        );
      });

      await this.refreshStore();
    } finally {
      await leaseService.release(leaseId);
    }
  },

  async hasFirms() {
    const count = await firmRepository.countFirms();
    return count > 0;
  },

  /**
   * FIX: Uses firmRepository.getAll() instead of db.select() directly.
   * Services must never query the DB layer without going through a repository.
   * firmRepository.getAll() orders by createdAt DESC — matches Firm Manager expectation.
   */
  async refreshStore() {
    const allFirms = await firmRepository.getAll();
    useFirmStore.getState().setFirms(allFirms);
  },
};