// services/phase1/firmService.ts
// v2.8 FULL COMPLIANCE: Dual Guard Pattern (assertNoActiveLease + assertNotInSafeMode)
// v7.0 G70: GSTIN + stateCode cross-validation, pincode validation
// v6.6 BUG FIX: BIS logo archival on licence removal via UUID
// v7.35 FIX-V735-1: GSTIN_ALREADY_SET implementation
// isArchived and isActive are plain integers in schema — ALWAYS use 0/1, NEVER true/false

import { eq } from 'drizzle-orm';
import { firms } from '@/db/schema';
import { firmRepository, NewFirm } from '@/repositories/phase1/firmRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { bisLogoRepository } from '@/repositories/phase1/bisLogoRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import db, { db as dbNamed } from '@/db/client';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { validateGSTIN } from '@/utils/validateGSTIN';
import { validateFirmCode } from '@/utils/validateFirmCode';
import { validatePincode } from '@/utils/validatePincode';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import type { CreateFirmInput, UpdateFirmInput } from '@/types/phase1/firm';

export type { CreateFirmInput, UpdateFirmInput };

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  let currentDb: any = dbNamed || db;
  try {
    const client = require('@/db/client');
    currentDb = client.db || client.default || currentDb;
  } catch {}
  return (currentDb as any)?.db ? (currentDb as any).db : currentDb;
}

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

function logAudit(tx: any, eventType: string, firmId: string | null, payload: any, deviceId: string) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (typeof (auditRepository as any).log === 'function') {
    (auditRepository as any).log(tx, {
      eventType,
      firmId,
      deviceId,
      payload: payloadStr,
    });
  } else if (typeof (auditRepository as any).create === 'function') {
    (auditRepository as any).create(
      {
        firmId,
        eventType,
        payload: payloadStr,
        deviceId,
      },
      tx
    );
  }
}

async function assertSystemIsWritable() {
  await leaseService.assertNoActiveLease();
  safeModeService.assertNotInSafeMode();
}

export const firmService = {
  /**
   * Creates a new firm with strict validation, race condition fix, and atomic transaction.
   * v7.0 G70: validates GSTIN, stateCode cross-match, pincode.
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

    const sanitizedName = sanitizeText(input.name);
    const sanitizedProprietor = sanitizeText(input.proprietor);
    const sanitizedAddressLine1 = sanitizeText(input.addressLine1);
    const sanitizedCity = sanitizeText(input.city);
    const sanitizedAddressLine2 = input.addressLine2 ? sanitizeText(input.addressLine2) : input.addressLine2;
    const sanitizedBisLicence = input.bisLicence ? sanitizeText(input.bisLicence) : input.bisLicence;

    const deviceId = getSafeDeviceId();
    const currentYear = new Date().getFullYear();
    const hasClockSkew = currentYear < 2020 || currentYear > 2040;
    const targetDb = getDb();

    const result = await targetDb.transaction((tx: any) => {
      // RACE CONDITION FIX: count inside transaction
      const count = firmRepository.countFirms(tx);
      if (count >= 3) {
        throw new Error('MAX_FIRMS_REACHED: Cannot create more than 3 firms total.');
      }

      const { bisLogoUri, ...dbInput } = input;
      const newFirm = firmRepository.create(
        {
          ...dbInput,
          name: sanitizedName,
          proprietor: sanitizedProprietor,
          addressLine1: sanitizedAddressLine1,
          addressLine2: sanitizedAddressLine2,
          city: sanitizedCity,
          bisLicence: sanitizedBisLicence,
        },
        tx
      );

      fyRepository.createInitialFY(newFirm.id, tx);

      if (bisLogoUri) {
        const logoId = bisLogoRepository.insert({ firmId: newFirm.id, fileRef: bisLogoUri }, tx);
        firmRepository.update(newFirm.id, { bisLogoRef: logoId }, tx);
      }

      logAudit(
        tx,
        'FIRM_CODE_SET',
        newFirm.id,
        {
          firmId: newFirm.id,
          firmCode: input.firmCode,
          assignedAt: now(),
        },
        deviceId
      );

      logAudit(
        tx,
        'FIRM_CREATED',
        newFirm.id,
        {
          name: newFirm.name,
          gstin: newFirm.gstin,
          proprietor: newFirm.proprietor,
        },
        deviceId
      );

      if (hasClockSkew) {
        logAudit(
          tx,
          'FY_CLOCK_SKEW',
          newFirm.id,
          {
            detectedYear: currentYear,
            message: 'Device clock is outside safe boundaries (<2020 or >2040).',
          },
          deviceId
        );
      }

      return newFirm;
    });

    await this.refreshStore();
    try {
      await taxMasterService.seedDefaults(result.id);
    } catch (e) {
      console.warn('[FirmService] Failed to seed tax defaults for firm:', e);
    }
    return result;
  },

  /**
   * Updates an existing firm.
   */
  async updateFirm(firmId: string, input: UpdateFirmInput) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('FIRM_EDIT', firmId);

    try {
      const deviceId = getSafeDeviceId();
      const existingFirm = firmRepository.getById(firmId);
      if (!existingFirm) throw new Error('FIRM_NOT_FOUND');

      // Canonical Spec Step 7: firmCode is strictly immutable post-creation
      if ('firmCode' in input) {
        throw new Error('FIRM_CODE_IMMUTABLE: firmCode cannot be changed after creation. Firm Code is immutable.');
      }

      // v7.35 FIX-V735-1: One-time GSTIN addition (null -> value). Locked once set.
      if ('gstin' in input) {
        if (existingFirm.gstin) {
          throw new Error('GSTIN_ALREADY_SET: GSTIN cannot be modified once set');
        }
        if (input.gstin) {
          validateGSTIN(input.gstin);
          const gstinStateCode = input.gstin.slice(0, 2);
          const targetStateCode = input.stateCode || existingFirm.stateCode;
          if (gstinStateCode !== targetStateCode) {
            throw new Error(
              `GSTIN_STATE_MISMATCH: GSTIN state code ${gstinStateCode} does not match firm stateCode ${targetStateCode}`
            );
          }
        }
      }

      // v7.14 FIX-V714-3: stateCode update blocked if firm already has a GSTIN
      if ('stateCode' in input && existingFirm.gstin) {
        throw new Error(
          'GSTIN_STATE_UPDATE_BLOCKED: stateCode cannot be changed independently when firm has a GSTIN — GSTIN prefix already encodes stateCode'
        );
      }

      if (input.pincode) {
        validatePincode(input.pincode);
      }

      const { bisLogoUri, ...restInput } = input;
      const updatePayload: Partial<NewFirm> = { ...restInput };

      if (updatePayload.name) updatePayload.name = sanitizeText(updatePayload.name);
      if (updatePayload.proprietor) updatePayload.proprietor = sanitizeText(updatePayload.proprietor);
      if (updatePayload.addressLine1) updatePayload.addressLine1 = sanitizeText(updatePayload.addressLine1);
      if (updatePayload.addressLine2) updatePayload.addressLine2 = sanitizeText(updatePayload.addressLine2);
      if (updatePayload.city) updatePayload.city = sanitizeText(updatePayload.city);
      if (updatePayload.bisLicence) updatePayload.bisLicence = sanitizeText(updatePayload.bisLicence);

      const auditEvents: Array<{ eventType: string; payload: string }> = [];

      if (bisLogoUri && !input.bisLicence && !existingFirm.bisLicence) {
        throw new Error('ILLEGAL_OPERATION: Cannot upload a BIS Logo without a valid BIS Licence.');
      }

      const targetDb = getDb();
      const updatedFirm = await targetDb.transaction((tx: any) => {
        // v6.6 BUG FIX: Archive active BIS logo record by UUID when licence is removed
        const clearingBisLicence = ('bisLicence' in input) && (!input.bisLicence) && !!existingFirm.bisLogoRef;
        if (clearingBisLicence) {
          updatePayload.bisLogoRef = null;
          let bisLogoRow: any;
          try {
            bisLogoRow = bisLogoRepository.findActiveByFirmId(tx, firmId);
          } catch {
            bisLogoRow = (bisLogoRepository as any).findActiveByFirmId(firmId, tx);
          }

          if (bisLogoRow) {
            try {
              bisLogoRepository.archive(tx, bisLogoRow.id, 'licence_removed');
            } catch {
              (bisLogoRepository as any).archive(bisLogoRow.id, 'licence_removed', tx);
            }
          }
          auditEvents.push({
            eventType: 'BIS_LOGO_ARCHIVED',
            payload: JSON.stringify({ reason: 'licence_removed' }),
          });
        } else if (bisLogoUri) {
          const logoId = bisLogoRepository.insert({ firmId: existingFirm.id, fileRef: bisLogoUri }, tx);
          updatePayload.bisLogoRef = logoId;
        }

        const result = firmRepository.update(firmId, updatePayload, tx);

        logAudit(
          tx,
          'FIRM_UPDATED',
          firmId,
          { changes: Object.keys(updatePayload) },
          deviceId
        );

        for (const event of auditEvents) {
          logAudit(tx, event.eventType, firmId, event.payload, deviceId);
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
      const deviceId = getSafeDeviceId();
      const targetDb = getDb();

      await targetDb.transaction((tx: any) => {
        const target = tx.select().from(firms).where(eq(firms.id, firmId)).limit(1).all();
        if (!target.length || target[0].isArchived) throw new Error('FIRM_NOT_FOUND: ' + firmId);

        tx.update(firms).set({ isActive: 0 }).run();
        tx.update(firms).set({ isActive: 1 }).where(eq(firms.id, firmId)).run();

        logAudit(
          tx,
          'FIRM_SWITCHED',
          firmId,
          { switchedToFirmId: firmId, switchedAt: new Date().toISOString() },
          deviceId
        );
      });

      await this.refreshStore();
      useFirmStore.getState().switchFirm(firmId);
    } finally {
      await leaseService.release(leaseId);
    }
  },

  async archiveFirm(firmId: string) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('ARCHIVE', firmId);

    try {
      const deviceId = getSafeDeviceId();
      const targetDb = getDb();

      await targetDb.transaction((tx: any) => {
        const activeCount = firmRepository.countActiveFirms(tx);
        if (activeCount <= 1) {
          throw new Error('LAST_FIRM: Cannot archive the only active firm.');
        }

        const activeFirmId = firmRepository.getActiveFirmId(tx);
        if (firmId === activeFirmId) {
          throw new Error('CANNOT_ARCHIVE_ACTIVE_FIRM: Switch to another firm first.');
        }

        firmRepository.update(firmId, { isArchived: 1, isActive: 0 }, tx);

        logAudit(
          tx,
          'FIRM_ARCHIVED',
          firmId,
          { archivedAt: now() },
          deviceId
        );
      });

      await this.refreshStore();
    } finally {
      await leaseService.release(leaseId);
    }
  },

  async unarchiveFirm(firmId: string) {
    await assertSystemIsWritable();
    const leaseId = await leaseService.acquire('ARCHIVE', firmId);

    try {
      const deviceId = getSafeDeviceId();
      const targetDb = getDb();

      await targetDb.transaction((tx: any) => {
        const activeCount = firmRepository.countActiveFirms(tx);
        if (activeCount >= 3) {
          throw new Error('MAX_FIRMS_REACHED: Unarchive would exceed 3 active firms.');
        }

        firmRepository.update(firmId, { isArchived: 0 }, tx);

        logAudit(
          tx,
          'FIRM_UNARCHIVED',
          firmId,
          { unarchivedAt: now() },
          deviceId
        );
      });

      await this.refreshStore();
    } finally {
      await leaseService.release(leaseId);
    }
  },

  async hasFirms() {
    const count = firmRepository.countFirms();
    return count > 0;
  },

  async refreshStore() {
    const allFirms = firmRepository.getAll();
    useFirmStore.getState().setFirms(allFirms);
  },
};

export const createFirm = firmService.createFirm.bind(firmService);
export const updateFirm = firmService.updateFirm.bind(firmService);
export const switchFirm = firmService.switchFirm.bind(firmService);
export const archiveFirm = firmService.archiveFirm.bind(firmService);
export const unarchiveFirm = firmService.unarchiveFirm.bind(firmService);
export default firmService;