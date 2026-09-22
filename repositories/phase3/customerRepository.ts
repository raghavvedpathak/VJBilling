// repositories/phase3/customerRepository.ts — Phase 3 Customer Master Data Access Layer
// Adheres strictly to STEP 1 Specification (v4.8 Cross-FY, v5.5 SEARCH-P3, v5.9 FIX-CUSTOMER-URD-1)
// CONSTITUTIONAL RULE: Structurally prevented — NO hard delete method exists in this repository.

import * as Crypto from 'expo-crypto';
import { eq, and, or, like, asc } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { customers } from '@/db/schema';
import { Customer, NewCustomer } from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const customerRepository = {
  /**
   * Inserts a new customer record.
   * Supports both (tx, customer) and (customer, tx?) call signatures.
   */
  insert(arg1: any, arg2?: any): Customer {
    let customerData: NewCustomer;
    let customTx: any = undefined;

    if (arg1 && typeof arg1 === 'object' && 'name' in arg1 && 'firmId' in arg1) {
      customerData = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      customerData = arg2;
    }

    const conn = getDb(customTx);
    const timestamp = now();

    const toInsert = {
      id: customerData.id || Crypto.randomUUID(),
      firmId: customerData.firmId,
      fyId: customerData.fyId,
      name: customerData.name,
      mobile: customerData.mobile ?? null,
      gstin: customerData.gstin ?? null,
      address: customerData.address ?? null,
      aadhaarNumber: customerData.aadhaarNumber ?? null,
      panNumber: customerData.panNumber ?? null,
      isDeleted: customerData.isDeleted ?? 0,
      createdAt: customerData.createdAt || timestamp,
      updatedAt: customerData.updatedAt || timestamp,
    };

    conn.insert(customers).values(toInsert).run();

    return toInsert as Customer;
  },

  /**
   * Finds customer by ID within a firm. FirmId is strictly required.
   * By default filters out soft-deleted customers.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  findById(arg1: any, arg2: any, arg3?: any): Customer | null {
    let firmId: string;
    let id: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      id = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      id = arg3;
    }

    if (!firmId || !id) return null;

    const conn = getDb(customTx);
    const res = conn
      .select()
      .from(customers)
      .where(and(eq(customers.firmId, firmId), eq(customers.id, id), eq(customers.isDeleted, 0)))
      .get();

    return (res as Customer) || null;
  },

  /**
   * Finds customer by mobile number within a firm.
   * Used for soft-uniqueness check on creation.
   * Supports (firmId, mobile, tx?) and (tx, firmId, mobile).
   */
  findByMobile(arg1: any, arg2: any, arg3?: any): Customer | null {
    let firmId: string;
    let mobile: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      mobile = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      mobile = arg3;
    }

    if (!firmId || !mobile) return null;

    const conn = getDb(customTx);
    const res = conn
      .select()
      .from(customers)
      .where(and(eq(customers.firmId, firmId), eq(customers.mobile, mobile), eq(customers.isDeleted, 0)))
      .get();

    return (res as Customer) || null;
  },

  /**
   * SEARCH-P3 (v5.5): Customer name/mobile typeahead search.
   * READ-ONLY — no tx required — no dual guards — no audit write.
   * Enforces: is_deleted = 0 · Cross-FY rule (v4.8) · firmId MANDATORY.
   * SQL: WHERE firm_id = ? AND is_deleted = 0 AND (name LIKE '%'||?||'%' OR mobile LIKE '%'||?||'%') ORDER BY name ASC LIMIT 20
   */
  searchByNameOrMobile(firmId: string, query: string, customTx?: any): Customer[] {
    if (!firmId) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.firmId, firmId),
          eq(customers.isDeleted, 0),
          or(like(customers.name, `%${trimmed}%`), like(customers.mobile, `%${trimmed}%`))
        )
      )
      .orderBy(asc(customers.name))
      .limit(20)
      .all();

    return (results as Customer[]) || [];
  },

  /**
   * Lists all active (non-deleted) customers for a firm across all FYs.
   * Ordered by name ASC.
   */
  listByFirm(firmId: string, customTx?: any): Customer[] {
    if (!firmId) return [];
    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(customers)
      .where(and(eq(customers.firmId, firmId), eq(customers.isDeleted, 0)))
      .orderBy(asc(customers.name))
      .all();

    return (results as Customer[]) || [];
  },

  /**
   * Updates an existing customer record within a firm.
   * Supports (firmId, id, updates, tx?) and (tx, firmId, id, updates).
   */
  update(arg1: any, arg2: any, arg3?: any, arg4?: any): Customer {
    let firmId: string;
    let id: string;
    let updates: Partial<Customer>;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      id = arg2;
      updates = arg3;
      customTx = arg4;
    } else {
      customTx = arg1;
      firmId = arg2;
      id = arg3;
      updates = arg4;
    }

    const conn = getDb(customTx);
    const updatePayload: Record<string, any> = {
      updatedAt: now(),
    };

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.mobile !== undefined) updatePayload.mobile = updates.mobile;
    if (updates.gstin !== undefined) updatePayload.gstin = updates.gstin;
    if (updates.address !== undefined) updatePayload.address = updates.address;
    if (updates.aadhaarNumber !== undefined) updatePayload.aadhaarNumber = updates.aadhaarNumber;
    if (updates.panNumber !== undefined) updatePayload.panNumber = updates.panNumber;

    conn
      .update(customers)
      .set(updatePayload)
      .where(and(eq(customers.firmId, firmId), eq(customers.id, id)))
      .run();

    const updated = this.findById(firmId, id, customTx);
    if (!updated) throw new Error('CUSTOMER_NOT_FOUND');
    return updated;
  },

  /**
   * Soft-deletes a customer record.
   * CONSTITUTIONAL RULE: Hard delete is structurally prevented. No delete() method exists.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  softDelete(arg1: any, arg2: any, arg3?: any): void {
    let firmId: string;
    let id: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      id = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      id = arg3;
    }

    const conn = getDb(customTx);
    conn
      .update(customers)
      .set({ isDeleted: 1, updatedAt: now() })
      .where(and(eq(customers.firmId, firmId), eq(customers.id, id)))
      .run();
  },
};
