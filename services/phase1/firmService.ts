// services/phase1/firmService.ts
// Phase 1 v7.47 Canonical Implementation
// Implements FIX-V735-1, FIX-V740-3, FIX-V740-8, FIX-V740-9, FIX-V742-9, FIX-V743-1, FIX-V743-5, FIX-V744-4, FIX-V744-6

import { eq } from 'drizzle-orm';
import { firms } from '@/db/schema';
import { safeTransaction } from '@/db/safeTransaction';
import { firmRepository, NewFirm } from '@/repositories/phase1/firmRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { bisLogoRepository } from '@/repositories/phase1/bisLogoRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { assertValidState } from '@/utils/indianStates';
import { validateGSTIN } from '@/utils/validateGSTIN';
import { validateFirmCode } from '@/utils/validateFirmCode';
import { validatePincode } from '@/utils/validatePincode';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import { ERR } from '@/constants/errorCodes';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import type { CreateFirmInput, UpdateFirmInput } from '@/types/phase1/firm';

export type { CreateFirmInput, UpdateFirmInput };

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

function logAudit(
  tx: any,
  eventType: string,
  firmId: string | null,
  payload: any,
  deviceId: string
): void {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  auditRepository.log(tx, {
    eventType,
    firmId,
    deviceId,
    payload: payloadStr,
  });
}

async function assertSystemIsWritable(): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2
}

export const firmService = {
  /**
   * Creates a new firm with strict validation, race condition fix, and atomic transaction.
   * Implements FIX-V740-9, FIX-V742-9, FIX-V744-4.
   */
  async createFirm(input: CreateFirmInput) {
    await assertSystemIsWritable();

    if (input.bisLogoUri && !input.bisLicence) {
      throw new Error(
        'ILLEGAL_OPERATION: Cannot upload a BIS Logo without a valid BIS Licence Number.'
      );
    }

    // FIX-V744-4: Trim and uppercase GSTIN before validation and persistence
    const normalizedGstin = input.gstin ? input.gstin.trim().toUpperCase() : input.gstin;
    if (normalizedGstin) {
      validateGSTIN(normalizedGstin);
      if (normalizedGstin.substring(0, 2) !== input.stateCode) {
        throw new Error(
          `${ERR.GSTIN_STATE_MISMATCH}: GSTIN state code ${normalizedGstin.substring(0, 2)} does not match firm stateCode ${input.stateCode}`
        );
      }
    }

    validatePincode(input.pincode);
    validateFirmCode(input.firmCode);
    assertValidState(input.stateCode, input.stateName); // FIX-V740-9

    // FIX-V740-9: Sanitize all free-text fields before persistence
    const sanitizedName = sanitizeText(input.name);
    const sanitizedProprietor = sanitizeText(input.proprietor);
    const sanitizedAddressLine1 = sanitizeText(input.addressLine1);
    const sanitizedAddressLine2 = input.addressLine2
      ? sanitizeText(input.addressLine2)
      : input.addressLine2;
    const sanitizedCity = sanitizeText(input.city);
    const sanitizedPhone1 = sanitizeText(input.phone1);
    const sanitizedPhone2 = input.phone2 ? sanitizeText(input.phone2) : input.phone2;
    const sanitizedPhone3 = input.phone3 ? sanitizeText(input.phone3) : input.phone3;
    const sanitizedBisLicence = input.bisLicence
      ? sanitizeText(input.bisLicence)
      : input.bisLicence;

    const deviceId = getSafeDeviceId();
    const currentYear = new Date().getFullYear();
    const hasClockSkew = currentYear < 2020 || currentYear > 2040;

    // FIX-V740-8 & FIX-V742-9: Synchronous transaction via safeTransaction()
    const result = safeTransaction((tx) => {
      // RACE CONDITION FIX: count inside transaction (atomic)
      const existing = firmRepository.countFirms(tx);
      if (existing >= 3) {
        throw new Error(ERR.MAX_FIRMS_REACHED + ': Cannot create more than 3 firms total.');
      }

      const { bisLogoUri, ...dbInput } = input;
      const newFirm = firmRepository.insert(tx, {
        ...dbInput,
        gstin: normalizedGstin ?? null,
        name: sanitizedName,
        proprietor: sanitizedProprietor,
        addressLine1: sanitizedAddressLine1,
        addressLine2: sanitizedAddressLine2,
        city: sanitizedCity,
        phone1: sanitizedPhone1,
        phone2: sanitizedPhone2,
        phone3: sanitizedPhone3,
        bisLicence: sanitizedBisLicence,
        isActive: existing === 0 ? 1 : 0, // FIX-V742-9: first firm is active
      });

      fyRepository.insertInitial(tx, newFirm.id);

      if (bisLogoUri) {
        const logoId = bisLogoRepository.insert(tx, {
          firmId: newFirm.id,
          fileRef: bisLogoUri,
        });
        firmRepository.update(tx, newFirm.id, { bisLogoRef: logoId });
      }

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

      logAudit(
        tx,
        'FIRM_CODE_SET',
        newFirm.id,
        {
          firmId: newFirm.id,
          firmCode: newFirm.firmCode,
          assignedAt: now(),
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

    // FIX-V742-9 (SETSTATE-OUTSIDE-TX): Update activeFirmId after commit when first firm is created
    if (result.isActive === 1) {
      useFirmStore.setState({ activeFirmId: result.id });
    }
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
   * Implements canonical FIX-V744-4 (combines FIX-V740-9, FIX-V735-1, FIX-V743-1, and v6.6 BUG FIX).
   */
  async updateFirm(firmId: string, input: UpdateFirmInput) {
    await assertSystemIsWritable();

    // Canonical Spec Step 7: firmCode is strictly immutable post-creation
    if ('firmCode' in input) {
      throw new Error(
        ERR.FIRM_CODE_IMMUTABLE +
          ': firmCode cannot be changed after creation. Firm Code is immutable.'
      );
    }

    // FIX-V740-9 & FIX-V744-4: Sanitize and validate all stored fields before any DB read/write
    const clean: UpdateFirmInput = { ...input };
    for (const k of ['name', 'proprietor', 'addressLine1', 'city', 'phone1'] as const) {
      if (input[k] !== undefined) {
        const v = sanitizeText(input[k] as string);
        if (v.length === 0) {
          throw new Error(ERR.INVALID_TEXT_CONTENT + ': ' + k + ' cannot be empty');
        }
        (clean as any)[k] = v;
      }
    }
    for (const k of ['addressLine2', 'phone2', 'phone3', 'bisLicence'] as const) {
      if (input[k] != null && input[k] !== '') {
        (clean as any)[k] = sanitizeText(input[k] as string);
      }
    }
    if (input.pincode !== undefined) {
      validatePincode(input.pincode);
    }

    const existingFirm = firmRepository.findById(firmId);
    if (!existingFirm) {
      throw new Error(ERR.FIRM_NOT_FOUND + ': ' + firmId);
    }

    // v7.14 FIX-V714-3: stateCode update blocked if firm already has a GSTIN
    if ('stateCode' in input && existingFirm.gstin) {
      throw new Error(
        ERR.GSTIN_STATE_UPDATE_BLOCKED +
          ': stateCode cannot be changed independently when firm has a GSTIN — GSTIN prefix already encodes stateCode'
      );
    }

    if ((input.stateCode !== undefined) !== (input.stateName !== undefined)) {
      throw new Error(
        ERR.INVALID_STATE_CODE + ': stateCode and stateName must be updated together'
      );
    }
    if (input.stateCode !== undefined && input.stateName !== undefined) {
      assertValidState(input.stateCode, input.stateName);
    }

    // v7.35 FIX-V735-1 & v7.43 FIX-V743-1: One-time GSTIN addition (null -> value)
    if ('gstin' in input) {
      if (existingFirm.gstin) {
        throw new Error(ERR.GSTIN_ALREADY_SET + ': GSTIN cannot be modified once set');
      }
      if (input.gstin) {
        const gstinNorm = input.gstin.trim().toUpperCase();
        clean.gstin = gstinNorm;
        validateGSTIN(gstinNorm);
        const effectiveStateCode = clean.stateCode ?? existingFirm.stateCode;
        if (gstinNorm.substring(0, 2) !== effectiveStateCode) {
          throw new Error(
            `${ERR.GSTIN_STATE_MISMATCH}: GSTIN state code ${gstinNorm.substring(0, 2)} does not match firm stateCode ${effectiveStateCode}`
          );
        }
      }
    }

    if (clean.bisLogoUri && !clean.bisLicence && !existingFirm.bisLicence) {
      throw new Error(
        'ILLEGAL_OPERATION: Cannot upload a BIS Logo without a valid BIS Licence.'
      );
    }

    const deviceId = getSafeDeviceId();
    const { bisLogoUri, ...restClean } = clean;
    let updatePayload: Partial<NewFirm> = { ...restClean };

    const updatedFirm = safeTransaction((tx) => {
      const existing = firmRepository.findById(tx, firmId);
      if (!existing) throw new Error(ERR.FIRM_NOT_FOUND);

      // v6.6 BUG FIX & G55: Archive active BIS logo record by UUID when licence is cleared
      const clearingBisLicence =
        'bisLicence' in clean &&
        (clean.bisLicence === null || clean.bisLicence === '') &&
        !!existing.bisLogoRef;

      if (clearingBisLicence) {
        const bisLogoRow = bisLogoRepository.findActiveByFirmId(tx, firmId);
        if (bisLogoRow) {
          bisLogoRepository.archive(tx, bisLogoRow.id, 'licence_removed');
        }
        updatePayload = { ...updatePayload, bisLogoRef: null };
        logAudit(
          tx,
          'BIS_LOGO_ARCHIVED',
          firmId,
          { reason: 'licence_removed' },
          deviceId
        );
      } else if (bisLogoUri) {
        const logoId = bisLogoRepository.insert(tx, {
          firmId: existing.id,
          fileRef: bisLogoUri,
        });
        updatePayload = { ...updatePayload, bisLogoRef: logoId };
      }

      const result = firmRepository.update(tx, firmId, updatePayload);

      logAudit(
        tx,
        'FIRM_UPDATED',
        firmId,
        { changes: Object.keys(updatePayload) },
        deviceId
      );

      return result;
    });

    await this.refreshStore();
    return updatedFirm;
  },

  /**
   * Switches the active firm (v7.14 FIX-V714-7, v7.21 FIX-V721-2, v7.40 FIX-V740-3).
   */
  async switchFirm(firmId: string): Promise<void> {
    await assertSystemIsWritable();
    const deviceId = getSafeDeviceId();

    safeTransaction((tx) => {
      const target = tx
        .select()
        .from(firms)
        .where(eq(firms.id, firmId))
        .limit(1)
        .all();
      if (!target.length || target[0].isArchived) {
        throw new Error(ERR.FIRM_NOT_FOUND + ': ' + firmId);
      }

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

    // SETSTATE-OUTSIDE-TX COROLLARY: update Zustand store after transaction commits
    useFirmStore.getState().switchFirm(firmId);
    await this.refreshStore();
  },

  /**
   * Archives a firm (v2.6 G19, v2.7 Fix, v7.40 FIX-V740-8).
   */
  async archiveFirm(firmId: string): Promise<void> {
    await assertSystemIsWritable();
    const deviceId = getSafeDeviceId();

    safeTransaction((tx) => {
      const activeCount = firmRepository.countActiveFirms(tx);
      if (activeCount <= 1) {
        throw new Error(ERR.LAST_FIRM + ': cannot archive the only active firm');
      }

      const firm = firmRepository.findById(tx, firmId);
      if (!firm) {
        throw new Error(ERR.FIRM_NOT_FOUND);
      }

      // v2.7 FIX: Read activeFirmId from DB inside transaction, not from Zustand
      const activeFirmId = firmRepository.getActiveFirmId(tx);
      if (firmId === activeFirmId) {
        throw new Error(ERR.CANNOT_ARCHIVE_ACTIVE_FIRM + ': switch first');
      }

      firmRepository.archive(tx, firmId);

      logAudit(tx, 'FIRM_ARCHIVED', firmId, { archivedAt: now() }, deviceId);
    });

    await this.refreshStore();
  },

  /**
   * Unarchives a firm (v2.5 G15, v7.40 FIX-V740-8).
   */
  async unarchiveFirm(firmId: string) {
    await assertSystemIsWritable();
    const deviceId = getSafeDeviceId();

    const updated = safeTransaction((tx) => {
      // v2.5 G15: 3-FIRM ACTIVE LIMIT CHECK — must be inside transaction (atomic)
      const activeCount = firmRepository.countActiveFirms(tx);
      if (activeCount >= 3) {
        throw new Error(
          ERR.MAX_FIRMS_REACHED + ': unarchive would exceed 3 active firms'
        );
      }

      const unarchived = firmRepository.unarchive(tx, firmId);

      logAudit(tx, 'FIRM_UNARCHIVED', firmId, { unarchivedAt: now() }, deviceId);

      return unarchived;
    });

    await this.refreshStore();
    return updated;
  },

  async hasFirms(): Promise<boolean> {
    const count = firmRepository.countFirms();
    return count > 0;
  },

  async refreshStore(): Promise<void> {
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
