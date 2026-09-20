// services/phase3/supplierService.ts — Phase 3 Supplier Master Service
// Adheres strictly to STEP 2 Specification (External purchase parties only, SEARCH-P3 v5.5)
// CONSTITUTIONAL RULE: KARIGAR IS A SEPARATE ENTITY (Step 3). Putting Karigar under Supplier is a violation.

import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { validateGSTIN } from '@/utils/validateGSTIN';
import { getDeviceId } from '@/utils/deviceId';
import { Supplier, CreateSupplierInput, UpdateSupplierInput, SupplierType } from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

const ALLOWED_SUPPLIER_TYPES: SupplierType[] = ['SUPPLIER', 'REFINERY', 'VENDOR'];

export const supplierService = {
  /**
   * Creates a new supplier.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * CONSTITUTIONAL GUARD: Karigar is strictly a separate entity (Step 3).
   * Types: SUPPLIER | REFINERY | VENDOR
   */
  async createSupplier(input: CreateSupplierInput, customTx?: any): Promise<Supplier> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('SUPPLIER_NAME_REQUIRED');
    }

    // Constitutional Guard: KARIGAR IS A SEPARATE ENTITY
    const rawType = (input.type as string | undefined)?.toUpperCase();
    if (rawType === 'KARIGAR') {
      throw new Error(
        'KARIGAR_IS_SEPARATE_ENTITY: Karigars must be managed under Karigar Master (Step 3). Putting Karigar under Supplier is a constitutional violation.'
      );
    }

    const type: SupplierType = input.type && ALLOWED_SUPPLIER_TYPES.includes(input.type)
      ? input.type
      : 'SUPPLIER';

    // Validate GSTIN if provided
    if (input.gstin && input.gstin.trim()) {
      validateGSTIN(input.gstin.trim());
    }

    return executeTransaction(async (tx) => {
      // Soft-unique mobile check: warn UI / log, do NOT block
      if (input.mobile && input.mobile.trim()) {
        const dup = supplierRepository.findByMobile(tx, input.firmId, input.mobile.trim());
        if (dup) {
          console.warn(
            `[supplierService] Soft duplicate mobile warning: A supplier with mobile ${input.mobile} already exists (${dup.name}). Allowing creation.`
          );
        }
      }

      const supplier = supplierRepository.insert(tx, {
        id: crypto.randomUUID(),
        firmId: input.firmId,
        name: input.name.trim(),
        mobile: input.mobile?.trim() || null,
        gstin: input.gstin?.trim() || null,
        address: input.address?.trim() || null,
        type,
        bankName: input.bankName?.trim() || null,
        bankAccount: input.bankAccount?.trim() || null,
        ifsc: input.ifsc?.trim()?.toUpperCase() || null,
        isArchived: 0,
        isDeleted: 0,
      });

      // Canonical Audit Log
      auditRepository.log(tx, {
        eventType: 'SUPPLIER_CREATED',
        firmId: input.firmId,
        entityId: supplier.id,
        deviceId: getSafeDeviceId(),
        payload: {
          name: supplier.name,
          type: supplier.type,
          gstin: supplier.gstin ?? null,
        },
      });

      return supplier;
    }, customTx);
  },

  /**
   * SEARCH-P3 (v5.5): Typeahead search by supplier name or mobile.
   * READ-ONLY — no dual guards — no audit write — no tx.
   * Enforces min 2 characters.
   */
  async searchSuppliers(firmId: string, query: string): Promise<Supplier[]> {
    if (!query || query.trim().length < 2) {
      throw new Error(ERR.SUPPLIER_SEARCH_QUERY_TOO_SHORT);
    }
    return supplierRepository.searchByNameOrMobile(firmId, query.trim());
  },

  /**
   * Gets a supplier by ID within a firm.
   * READ-ONLY lookup.
   */
  async getSupplierById(firmId: string, id: string): Promise<Supplier | null> {
    if (!firmId || !id) return null;
    return supplierRepository.findById(firmId, id);
  },

  /**
   * Lists all active suppliers for a firm.
   * READ-ONLY lookup.
   */
  async listSuppliers(firmId: string): Promise<Supplier[]> {
    if (!firmId) return [];
    return supplierRepository.listByFirm(firmId);
  },

  /**
   * Updates an existing supplier.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * Constitutional Guard on Karigar type.
   */
  async updateSupplier(
    firmId: string,
    id: string,
    updates: UpdateSupplierInput,
    customTx?: any
  ): Promise<Supplier> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) throw new Error(ERR.SUPPLIER_NOT_FOUND);

    if (updates.type) {
      const rawType = (updates.type as string).toUpperCase();
      if (rawType === 'KARIGAR') {
        throw new Error(
          'KARIGAR_IS_SEPARATE_ENTITY: Karigars must be managed under Karigar Master (Step 3).'
        );
      }
      if (!ALLOWED_SUPPLIER_TYPES.includes(updates.type)) {
        throw new Error('INVALID_SUPPLIER_TYPE');
      }
    }

    if (updates.gstin && updates.gstin.trim()) {
      validateGSTIN(updates.gstin.trim());
    }

    return executeTransaction(async (tx) => {
      const existing = supplierRepository.findById(tx, firmId, id);
      if (!existing) throw new Error(ERR.SUPPLIER_NOT_FOUND);

      const updated = supplierRepository.update(tx, firmId, id, {
        name: updates.name !== undefined ? updates.name.trim() : existing.name,
        mobile: updates.mobile !== undefined ? updates.mobile?.trim() || null : existing.mobile,
        gstin: updates.gstin !== undefined ? updates.gstin?.trim() || null : existing.gstin,
        address: updates.address !== undefined ? updates.address?.trim() || null : existing.address,
        type: updates.type !== undefined ? updates.type : existing.type,
        bankName: updates.bankName !== undefined ? updates.bankName?.trim() || null : existing.bankName,
        bankAccount: updates.bankAccount !== undefined ? updates.bankAccount?.trim() || null : existing.bankAccount,
        ifsc: updates.ifsc !== undefined ? updates.ifsc?.trim()?.toUpperCase() || null : existing.ifsc,
      });

      return updated;
    }, customTx);
  },

  /**
   * Soft-archives a supplier.
   * CONSTITUTIONAL RULE: Hard delete is structurally prevented.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   */
  async archiveSupplier(firmId: string, id: string, customTx?: any): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return executeTransaction(async (tx) => {
      const existing = supplierRepository.findById(tx, firmId, id);
      if (!existing) throw new Error(ERR.SUPPLIER_NOT_FOUND);

      supplierRepository.archive(tx, firmId, id);
    }, customTx);
  },

  /**
   * Derives supplier balance: SUM(credit) - SUM(debit) across all FYs.
   * Cached in MMKV with a 60-second TTL via accountingTruthService.
   */
  async getSupplierBalance(firmId: string, supplierId: string): Promise<number> {
    if (!firmId || !supplierId) return 0;
    return accountingTruthService.deriveSupplierBalance(supplierId, firmId);
  },
};
