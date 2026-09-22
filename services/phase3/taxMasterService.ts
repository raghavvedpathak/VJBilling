// services/phase3/taxMasterService.ts — Phase 3 Tax Master Service
// Strictly adheres to STEP 0 specification & rules (FIX-TAXMASTER-IMPL-1 v5.16, FIX-V520-3, FIX-V520-11)

import db, { expoDb } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import {
  taxRateRepository,
  taxGroupRepository,
  taxGroupComponentRepository,
} from '@/repositories';
import {
  TaxRate,
  TaxGroup,
  TaxGroupWithRates,
  CreateTaxRateInput,
  CreateTaxGroupInput,
} from '@/types/phase3/phase3.types';
import { taxGroupStore, getGroupsWithTTL } from '@/store/phase3/taxGroupStore';
import { sanitizeText } from '@/utils/sanitize';

async function executeTransaction<T>(cb: (tx: any) => Promise<T> | T): Promise<T> {
  const target: any = db;
  if (target && typeof target.transaction === 'function') {
    return await target.transaction(cb);
  }
  return await cb(target);
}

export const taxMasterService = {
  /**
   * Idempotently seeds default tax rates and groups for a given firm.
   * Default Seed:
   * - CGST 1.5% + SGST 1.5% -> Tax Group "GST 3%" (Metal)
   * - CGST 2.5% + SGST 2.5% -> Tax Group "GST 5%" (Making)
   */
  async seedDefaults(firmId: string): Promise<void> {
    if (!firmId) return;

    const existingCount = taxRateRepository.countByFirmId(firmId);
    if (existingCount > 0) {
      // Idempotent: rows already exist, exit immediately
      return;
    }

    await executeTransaction((tx: any) => {
      // 1. Metal Rates: CGST 1.5% + SGST 1.5%
      const cgst15 = taxRateRepository.insert(
        {
          firmId,
          taxName: 'CGST 1.5%',
          rateBps: 150,
          taxType: 'CGST',
          isActive: 1,
        },
        tx
      );

      const sgst15 = taxRateRepository.insert(
        {
          firmId,
          taxName: 'SGST 1.5%',
          rateBps: 150,
          taxType: 'SGST',
          isActive: 1,
        },
        tx
      );

      // Tax Group: GST 3%
      const group3 = taxGroupRepository.insert(
        {
          firmId,
          groupName: 'GST 3%',
          isActive: 1,
        },
        tx
      );

      taxGroupComponentRepository.insert(
        { taxGroupId: group3.id, taxRateId: cgst15.id },
        tx
      );
      taxGroupComponentRepository.insert(
        { taxGroupId: group3.id, taxRateId: sgst15.id },
        tx
      );

      // 2. Making Charges Rates: CGST 2.5% + SGST 2.5%
      const cgst25 = taxRateRepository.insert(
        {
          firmId,
          taxName: 'CGST 2.5%',
          rateBps: 250,
          taxType: 'CGST',
          isActive: 1,
        },
        tx
      );

      const sgst25 = taxRateRepository.insert(
        {
          firmId,
          taxName: 'SGST 2.5%',
          rateBps: 250,
          taxType: 'SGST',
          isActive: 1,
        },
        tx
      );

      // Tax Group: GST 5%
      const group5 = taxGroupRepository.insert(
        {
          firmId,
          groupName: 'GST 5%',
          isActive: 1,
        },
        tx
      );

      taxGroupComponentRepository.insert(
        { taxGroupId: group5.id, taxRateId: cgst25.id },
        tx
      );
      taxGroupComponentRepository.insert(
        { taxGroupId: group5.id, taxRateId: sgst25.id },
        tx
      );
    });

    // Invalidate cached groups
    taxGroupStore.getState().invalidate();
  },

  /**
   * Creates a new tax rate for the specified firm.
   * Throws DUPLICATE_TAX_RATE_NAME if a rate with the same name already exists.
   */
  async createTaxRate(input: CreateTaxRateInput, firmId: string): Promise<TaxRate> {
    if (!firmId) throw new Error('FIRM_ID_REQUIRED');
    const sanitizedName = sanitizeText(input.name);
    if (!sanitizedName) throw new Error('Tax rate name cannot be empty');

    if (input.rateBps <= 0 || !Number.isInteger(input.rateBps)) {
      throw new Error('Rate BPS must be a positive integer');
    }

    if (input.taxComponent !== 'CGST' && input.taxComponent !== 'SGST') {
      throw new Error('Tax component must be CGST or SGST');
    }

    const existing = taxRateRepository.getByName(firmId, sanitizedName);
    if (existing) {
      throw new Error(ERR.DUPLICATE_TAX_RATE_NAME);
    }

    return taxRateRepository.insert({
      firmId,
      taxName: sanitizedName,
      rateBps: input.rateBps,
      taxType: input.taxComponent,
      isActive: 1,
    });
  },

  /**
   * Updates a tax rate's name.
   * rateBps is immutable once created to preserve historical integrity.
   */
  async updateTaxRateName(taxRateId: string, newName: string, firmId: string): Promise<void> {
    const rate = taxRateRepository.getById(taxRateId);
    if (!rate || rate.firmId !== firmId) {
      throw new Error('TAX_RATE_NOT_FOUND');
    }

    const sanitized = sanitizeText(newName);
    if (!sanitized) throw new Error('Tax rate name cannot be empty');

    const existing = taxRateRepository.getByName(firmId, sanitized);
    if (existing && existing.id !== taxRateId) {
      throw new Error(ERR.DUPLICATE_TAX_RATE_NAME);
    }

    taxRateRepository.updateName(taxRateId, sanitized);
  },

  /**
   * Deactivates a tax rate.
   * RULE 3 — HISTORICAL IMMUTABILITY: Cannot deactivate if referenced by any active tax group.
   */
  async deactivateTaxRate(taxRateId: string, firmId: string): Promise<void> {
    const rate = taxRateRepository.getById(taxRateId);
    if (!rate || rate.firmId !== firmId) {
      throw new Error('TAX_RATE_NOT_FOUND');
    }

    // Check if referenced by any tax group component
    const components = taxGroupComponentRepository.getByTaxRateId(taxRateId);
    if (components.length > 0) {
      // Check if any referenced group is active
      for (const comp of components) {
        const group = taxGroupRepository.getById(comp.taxGroupId);
        if (group && group.isActive === 1) {
          throw new Error(ERR.TAX_RATE_IN_USE);
        }
      }
    }

    taxRateRepository.deactivate(taxRateId, firmId);
  },

  /**
   * Creates a new tax group.
   * RULE 1 — CGST/SGST SYMMETRY: Must contain exactly one CGST component and one SGST component.
   * RULE 2 — RATE SYMMETRY: CGST rateBps must equal SGST rateBps.
   */
  async createTaxGroup(input: CreateTaxGroupInput, firmId: string): Promise<TaxGroup> {
    if (!firmId) throw new Error('FIRM_ID_REQUIRED');
    const sanitizedName = sanitizeText(input.name);
    if (!sanitizedName) throw new Error('Tax group name cannot be empty');

    const existing = taxGroupRepository.getByName(firmId, sanitizedName);
    if (existing) {
      throw new Error('DUPLICATE_TAX_GROUP_NAME');
    }

    const cgst = taxRateRepository.getById(input.cgstRateId);
    const sgst = taxRateRepository.getById(input.sgstRateId);

    if (!cgst || !sgst || cgst.firmId !== firmId || sgst.firmId !== firmId) {
      throw new Error('TAX_RATE_NOT_FOUND');
    }

    // RULE 1: One CGST, one SGST
    if (cgst.taxType !== 'CGST' || sgst.taxType !== 'SGST') {
      throw new Error(ERR.TAX_GROUP_INVALID_COMPONENTS);
    }

    // RULE 2: Rate symmetry
    if (cgst.rateBps !== sgst.rateBps) {
      throw new Error(ERR.TAX_GROUP_ASYMMETRIC_RATES);
    }

    let createdGroup: TaxGroup | null = null;

    await executeTransaction((tx: any) => {
      createdGroup = taxGroupRepository.insert(
        {
          firmId,
          groupName: sanitizedName,
          isActive: 1,
        },
        tx
      );

      taxGroupComponentRepository.insert(
        { taxGroupId: createdGroup.id, taxRateId: cgst.id },
        tx
      );
      taxGroupComponentRepository.insert(
        { taxGroupId: createdGroup.id, taxRateId: sgst.id },
        tx
      );
    });

    // FIX-V520-3: Invalidate Zustand cache immediately
    taxGroupStore.setState({ groups: null, loadedAt: null });

    return createdGroup!;
  },

  /**
   * Deactivates a tax group.
   * Checks sale_invoice_items for references. Throws TAX_GROUP_IN_USE if referenced.
   */
  async deactivateTaxGroup(taxGroupId: string, firmId: string): Promise<void> {
    const group = taxGroupRepository.getById(taxGroupId);
    if (!group || group.firmId !== firmId) {
      throw new Error('TAX_GROUP_NOT_FOUND');
    }

    // Check if table sale_invoice_items exists and references this group
    try {
      const tableCheck = expoDb.getFirstSync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='sale_invoice_items'`
      );
      if (tableCheck && tableCheck.count > 0) {
        let usageCount = 0;
        try {
          const res = expoDb.getFirstSync<{ count: number }>(
            `SELECT count(*) as count FROM sale_invoice_items WHERE metal_tax_group_id = ? OR making_tax_group_id = ?`,
            [taxGroupId, taxGroupId]
          );
          usageCount = res?.count || 0;
        } catch {
          try {
            const res = expoDb.getFirstSync<{ count: number }>(
              `SELECT count(*) as count FROM sale_invoice_items WHERE tax_group_id = ?`,
              [taxGroupId]
            );
            usageCount = res?.count || 0;
          } catch {}
        }
        if (usageCount > 0) {
          throw new Error(ERR.TAX_GROUP_IN_USE);
        }
      }
    } catch (e: any) {
      if (e.message === ERR.TAX_GROUP_IN_USE) throw e;
    }

    taxGroupRepository.deactivate(taxGroupId, firmId);

    // Option A: Cascade deactivation to component tax rates if not used by another active group
    try {
      const components = taxGroupComponentRepository.getByTaxGroupId(taxGroupId);
      for (const comp of components) {
        const otherComps = taxGroupComponentRepository.getByTaxRateId(comp.taxRateId);
        const isUsedByOtherActiveGroup = otherComps.some((oc) => {
          if (oc.taxGroupId === taxGroupId) return false;
          const otherGroup = taxGroupRepository.getById(oc.taxGroupId);
          return otherGroup && otherGroup.isActive === 1;
        });
        if (!isUsedByOtherActiveGroup) {
          taxRateRepository.deactivate(comp.taxRateId, firmId);
        }
      }
    } catch (err) {
      console.warn('[taxMasterService] Cascade rate deactivation warning:', err);
    }

    // FIX-V520-3: Invalidate Zustand cache immediately
    taxGroupStore.setState({ groups: null, loadedAt: null });
  },

  /**
   * Activates a previously deactivated tax group and its component rates.
   */
  async activateTaxGroup(taxGroupId: string, firmId: string): Promise<void> {
    const group = taxGroupRepository.getById(taxGroupId);
    if (!group || group.firmId !== firmId) {
      throw new Error('TAX_GROUP_NOT_FOUND');
    }

    // Reactivate underlying rates
    try {
      const components = taxGroupComponentRepository.getByTaxGroupId(taxGroupId);
      for (const comp of components) {
        taxRateRepository.activate(comp.taxRateId, firmId);
      }
    } catch (err) {
      console.warn('[taxMasterService] Rate reactivation warning:', err);
    }

    taxGroupRepository.activate(taxGroupId, firmId);
    taxGroupStore.setState({ groups: null, loadedAt: null });
  },

  /**
   * Activates a previously deactivated tax rate.
   */
  async activateTaxRate(taxRateId: string, firmId: string): Promise<void> {
    const rate = taxRateRepository.getById(taxRateId);
    if (!rate || rate.firmId !== firmId) {
      throw new Error('TAX_RATE_NOT_FOUND');
    }
    taxRateRepository.activate(taxRateId, firmId);
  },

  /**
   * Returns active tax groups joined with their CGST and SGST rate rows.
   * Enforces 5-minute TTL cache via taxGroupStore.
   */
  async getActiveTaxGroups(firmId: string): Promise<TaxGroupWithRates[]> {
    if (!firmId) return [];

    // Check cache
    if (taxGroupStore.getState().isFresh(firmId)) {
      return taxGroupStore.getState().groups!;
    }

    const activeGroups = taxGroupRepository.getActiveByFirmId(firmId);
    const results: TaxGroupWithRates[] = [];

    for (const group of activeGroups) {
      const components = taxGroupComponentRepository.getByTaxGroupId(group.id);
      let cgstRate: TaxRate | null = null;
      let sgstRate: TaxRate | null = null;

      for (const comp of components) {
        const rate = taxRateRepository.getById(comp.taxRateId);
        if (rate) {
          if (rate.taxType === 'CGST') cgstRate = rate;
          if (rate.taxType === 'SGST') sgstRate = rate;
        }
      }

      if (cgstRate && sgstRate) {
        const combinedRateBps = cgstRate.rateBps + sgstRate.rateBps;
        results.push({
          id: group.id,
          firmId: group.firmId,
          groupName: group.groupName,
          isActive: group.isActive,
          cgstRate,
          sgstRate,
          combinedRateBps,
          combinedRatePercent: combinedRateBps / 100,
        });
      }
    }

    // Cache the fresh result
    taxGroupStore.getState().setGroups?.(firmId, results);

    return results;
  },

  /**
   * Resolves a specific tax group with rates for a firm.
   * Uses getGroupsWithTTL() cached active groups.
   */
  async getTaxGroupWithRates(taxGroupId: string, firmId: string): Promise<TaxGroupWithRates | null> {
    if (!taxGroupId || !firmId) return null;
    const groups = await getGroupsWithTTL(firmId);
    const found = groups.find((g) => g.id === taxGroupId && g.isActive === 1);
    return found || null;
  },

  /**
   * Returns all tax rates for a firm.
   */
  async getAllTaxRates(firmId: string): Promise<TaxRate[]> {
    return taxRateRepository.getByFirmId(firmId);
  },

  /**
   * Returns all tax groups for a firm with joined rates.
   */
  async getAllTaxGroups(firmId: string): Promise<TaxGroupWithRates[]> {
    const groups = taxGroupRepository.getByFirmId(firmId);
    const results: TaxGroupWithRates[] = [];

    for (const group of groups) {
      const components = taxGroupComponentRepository.getByTaxGroupId(group.id);
      let cgstRate: TaxRate | null = null;
      let sgstRate: TaxRate | null = null;

      for (const comp of components) {
        const rate = taxRateRepository.getById(comp.taxRateId);
        if (rate) {
          if (rate.taxType === 'CGST') cgstRate = rate;
          if (rate.taxType === 'SGST') sgstRate = rate;
        }
      }

      if (cgstRate && sgstRate) {
        const combinedRateBps = cgstRate.rateBps + sgstRate.rateBps;
        results.push({
          id: group.id,
          firmId: group.firmId,
          groupName: group.groupName,
          isActive: group.isActive,
          cgstRate,
          sgstRate,
          combinedRateBps,
          combinedRatePercent: combinedRateBps / 100,
        });
      }
    }

    return results;
  },
};
