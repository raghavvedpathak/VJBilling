// repositories/phase3/supplierRepository.ts — Phase 3 Supplier Master Data Access Layer
// Adheres strictly to STEP 2 Specification (SEARCH-P3 v5.5, External purchase parties only)
// CONSTITUTIONAL RULE: Hard delete is structurally prevented. No delete() method exists.

import * as Crypto from 'expo-crypto';
import { eq, and, or, like, asc } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { suppliers } from '@/db/schema';
import { Supplier, NewSupplier } from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const supplierRepository = {
  /**
   * Inserts a new supplier record.
   * Supports both (tx, supplier) and (supplier, tx?) call signatures.
   */
  insert(arg1: any, arg2?: any): Supplier {
    let supplierData: NewSupplier;
    let customTx: any = undefined;

    if (arg1 && typeof arg1 === 'object' && 'name' in arg1 && 'firmId' in arg1) {
      supplierData = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      supplierData = arg2;
    }

    const conn = getDb(customTx);
    const timestamp = now();

    const toInsert = {
      id: supplierData.id || Crypto.randomUUID(),
      firmId: supplierData.firmId,
      name: supplierData.name,
      mobile: supplierData.mobile ?? null,
      gstin: supplierData.gstin ?? null,
      address: supplierData.address ?? null,
      type: supplierData.type || 'SUPPLIER',
      bankName: supplierData.bankName ?? null,
      bankAccount: supplierData.bankAccount ?? null,
      ifsc: supplierData.ifsc ?? null,
      isArchived: supplierData.isArchived ?? 0,
      isDeleted: supplierData.isDeleted ?? 0,
      createdAt: supplierData.createdAt || timestamp,
      updatedAt: supplierData.updatedAt || timestamp,
    };

    conn.insert(suppliers).values(toInsert).run();

    return toInsert as Supplier;
  },

  /**
   * Finds supplier by ID within a firm.
   * By default filters out archived/deleted suppliers.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  findById(arg1: any, arg2: any, arg3?: any): Supplier | null {
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
      .from(suppliers)
      .where(
        and(
          eq(suppliers.firmId, firmId),
          eq(suppliers.id, id),
          eq(suppliers.isArchived, 0),
          eq(suppliers.isDeleted, 0)
        )
      )
      .get();

    return (res as Supplier) || null;
  },

  /**
   * Finds supplier by mobile number within a firm.
   * Supports (firmId, mobile, tx?) and (tx, firmId, mobile).
   */
  findByMobile(arg1: any, arg2: any, arg3?: any): Supplier | null {
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
      .from(suppliers)
      .where(
        and(
          eq(suppliers.firmId, firmId),
          eq(suppliers.mobile, mobile),
          eq(suppliers.isArchived, 0),
          eq(suppliers.isDeleted, 0)
        )
      )
      .get();

    return (res as Supplier) || null;
  },

  /**
   * SEARCH-P3 (v5.5): Supplier name/mobile typeahead search.
   * READ-ONLY — no tx required — no dual guards — no audit write.
   * SQL: WHERE firm_id = ? AND is_deleted = 0 AND (name LIKE '%'||?||'%' OR mobile LIKE '%'||?||'%') ORDER BY name ASC LIMIT 20
   */
  searchByNameOrMobile(firmId: string, query: string, customTx?: any): Supplier[] {
    if (!firmId) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.firmId, firmId),
          eq(suppliers.isDeleted, 0),
          or(like(suppliers.name, `%${trimmed}%`), like(suppliers.mobile, `%${trimmed}%`))
        )
      )
      .orderBy(asc(suppliers.name))
      .limit(20)
      .all();

    return (results as Supplier[]) || [];
  },

  /**
   * Lists all active suppliers for a firm.
   * Ordered by name ASC.
   */
  listByFirm(firmId: string, customTx?: any): Supplier[] {
    if (!firmId) return [];
    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.firmId, firmId),
          eq(suppliers.isArchived, 0),
          eq(suppliers.isDeleted, 0)
        )
      )
      .orderBy(asc(suppliers.name))
      .all();

    return (results as Supplier[]) || [];
  },

  /**
   * Updates an existing supplier record.
   * Supports (firmId, id, updates, tx?) and (tx, firmId, id, updates).
   */
  update(arg1: any, arg2: any, arg3?: any, arg4?: any): Supplier {
    let firmId: string;
    let id: string;
    let updates: Partial<Supplier>;
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
    if (updates.type !== undefined) updatePayload.type = updates.type;
    if (updates.bankName !== undefined) updatePayload.bankName = updates.bankName;
    if (updates.bankAccount !== undefined) updatePayload.bankAccount = updates.bankAccount;
    if (updates.ifsc !== undefined) updatePayload.ifsc = updates.ifsc;

    conn
      .update(suppliers)
      .set(updatePayload)
      .where(and(eq(suppliers.firmId, firmId), eq(suppliers.id, id)))
      .run();

    const updated = this.findById(firmId, id, customTx);
    if (!updated) throw new Error('SUPPLIER_NOT_FOUND');
    return updated;
  },

  /**
   * Soft-archives a supplier record.
   * CONSTITUTIONAL RULE: Hard delete is structurally prevented. No delete() method exists.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  archive(arg1: any, arg2: any, arg3?: any): void {
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
      .update(suppliers)
      .set({ isArchived: 1, isDeleted: 1, updatedAt: now() })
      .where(and(eq(suppliers.firmId, firmId), eq(suppliers.id, id)))
      .run();
  },
};
