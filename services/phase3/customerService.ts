// services/phase3/customerService.ts — Phase 3 Customer Master Service
// Adheres strictly to STEP 1 Specification (v4.8 Cross-FY, v5.5 SEARCH-P3, v5.9 FIX-CUSTOMER-URD-1)

import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { fyService } from '@/services/phase1/fyService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { validateGSTIN } from '@/utils/validateGSTIN';
import { getDeviceId } from '@/utils/deviceId';
import { Customer, CreateCustomerInput, UpdateCustomerInput } from '@/types/phase3/phase3.types';

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

export const customerService = {
  /**
   * Creates a new customer.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * Firm-scoped identity (firmId required).
   * Mobile is soft-unique: warns if duplicate exists, does not block.
   * GSTIN is optional (B2B buyers); validated via validateGSTIN() if present.
   * Logs canonical audit event: CUSTOMER_CREATED with deviceId.
   */
  async createCustomer(input: CreateCustomerInput, customTx?: any): Promise<Customer> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('CUSTOMER_NAME_REQUIRED');
    }

    // Validate GSTIN if provided (optional — B2B buyers only)
    if (input.gstin && input.gstin.trim()) {
      validateGSTIN(input.gstin.trim());
    }

    return executeTransaction(async (tx) => {
      // Soft-unique mobile check: warn UI / log, do NOT block
      if (input.mobile && input.mobile.trim()) {
        const dup = customerRepository.findByMobile(tx, input.firmId, input.mobile.trim());
        if (dup) {
          console.warn(
            `[customerService] Soft duplicate mobile warning: A customer with mobile ${input.mobile} already exists (${dup.name}). Allowing creation.`
          );
        }
      }

      // Resolve fyId if omitted (metadata for creation FY ONLY — not a scope limiter)
      let fyId = input.fyId;
      if (!fyId) {
        try {
          fyId = fyService.resolveTransactionFyId(input.firmId, new Date().toISOString(), tx);
        } catch {
          const activeFy = await fyService.getActiveFY(input.firmId);
          fyId = activeFy?.id || 'DEFAULT_FY';
        }
      }

      const customer = customerRepository.insert(tx, {
        id: crypto.randomUUID(),
        firmId: input.firmId,
        fyId,
        name: input.name.trim(),
        mobile: input.mobile?.trim() || null,
        gstin: input.gstin?.trim() || null,
        address: input.address?.trim() || null,
        aadhaarNumber: input.aadhaarNumber?.trim() || null,
        panNumber: input.panNumber?.trim() || null,
        isDeleted: 0,
      });

      // Canonical Phase 3 Audit Log (v5.4 GAP 1 FIX)
      auditRepository.log(tx, {
        eventType: 'CUSTOMER_CREATED',
        firmId: input.firmId,
        entityId: customer.id,
        deviceId: getSafeDeviceId(),
        payload: {
          name: customer.name,
          aadhaarNumber: customer.aadhaarNumber ?? null,
          panNumber: customer.panNumber ?? null,
        },
      });

      return customer;
    }, customTx);
  },

  /**
   * SEARCH-P3 (v5.5): Typeahead search by customer name or mobile.
   * READ-ONLY — no dual guards — no audit write — no tx.
   * Enforces min 2 characters.
   */
  async searchCustomers(firmId: string, query: string): Promise<Customer[]> {
    if (!query || query.trim().length < 2) {
      throw new Error(ERR.CUSTOMER_SEARCH_QUERY_TOO_SHORT);
    }
    return customerRepository.searchByNameOrMobile(firmId, query.trim());
  },

  /**
   * Gets a customer by ID within a firm.
   * READ-ONLY lookup.
   */
  async getCustomerById(firmId: string, id: string): Promise<Customer | null> {
    if (!firmId || !id) return null;
    return customerRepository.findById(firmId, id);
  },

  /**
   * Lists all active customers for a firm across all FYs.
   * READ-ONLY lookup.
   */
  async listCustomers(firmId: string): Promise<Customer[]> {
    if (!firmId) return [];
    return customerRepository.listByFirm(firmId);
  },

  /**
   * Updates an existing customer.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * Validates GSTIN if updated.
   */
  async updateCustomer(
    firmId: string,
    id: string,
    updates: UpdateCustomerInput,
    customTx?: any
  ): Promise<Customer> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) throw new Error('CUSTOMER_NOT_FOUND');

    if (updates.gstin && updates.gstin.trim()) {
      validateGSTIN(updates.gstin.trim());
    }

    return executeTransaction(async (tx) => {
      const existing = customerRepository.findById(tx, firmId, id);
      if (!existing) throw new Error('CUSTOMER_NOT_FOUND');

      const updated = customerRepository.update(tx, firmId, id, {
        name: updates.name !== undefined ? updates.name.trim() : existing.name,
        mobile: updates.mobile !== undefined ? updates.mobile?.trim() || null : existing.mobile,
        gstin: updates.gstin !== undefined ? updates.gstin?.trim() || null : existing.gstin,
        address: updates.address !== undefined ? updates.address?.trim() || null : existing.address,
        aadhaarNumber: updates.aadhaarNumber !== undefined ? updates.aadhaarNumber?.trim() || null : existing.aadhaarNumber,
        panNumber: updates.panNumber !== undefined ? updates.panNumber?.trim() || null : existing.panNumber,
      });

      return updated;
    }, customTx);
  },

  /**
   * Soft-deletes a customer.
   * CONSTITUTIONAL RULE: Hard delete is structurally prevented.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   */
  async softDeleteCustomer(firmId: string, id: string, customTx?: any): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    return executeTransaction(async (tx) => {
      const existing = customerRepository.findById(tx, firmId, id);
      if (!existing) throw new Error('CUSTOMER_NOT_FOUND');

      customerRepository.softDelete(tx, firmId, id);
    }, customTx);
  },

  /**
   * Derives customer balance: SUM(posted invoices) - SUM(payments) across all FYs.
   * Balance is never stored; always derived dynamically at query time.
   */
  async getCustomerBalance(firmId: string, customerId: string): Promise<number> {
    if (!firmId || !customerId) return 0;
    return accountingTruthService.deriveCustomerBalance(customerId, firmId);
  },
};
