// repositories/phase3/karigarMasterRepository.ts — Phase 3 Karigar Master Data Access Layer
// Adheres strictly to STEP 3 Specification (SEARCH-P3 v5.5, Independent job-work party)
// CONSTITUTIONAL RULE: Hard delete is structurally prevented. No delete() method exists.

import * as Crypto from 'expo-crypto';
import { eq, and, or, like, asc } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { karigar } from '@/db/schema/phase3_money_truth';
import { Karigar, NewKarigar, UpdateKarigarInput } from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const karigarMasterRepository = {
  /**
   * Inserts a new karigar record.
   * Supports both (tx, karigar) and (karigar, tx?) call signatures.
   */
  insert(arg1: any, arg2?: any): Karigar {
    let karigarData: NewKarigar;
    let customTx: any = undefined;

    if (arg1 && typeof arg1 === 'object' && 'name' in arg1 && 'firmId' in arg1) {
      karigarData = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      karigarData = arg2;
    }

    const conn = getDb(customTx);
    const timestamp = now();

    const toInsert = {
      id: karigarData.id || Crypto.randomUUID(),
      firmId: karigarData.firmId,
      name: karigarData.name,
      mobile: karigarData.mobile ?? null,
      address: karigarData.address ?? null,
      speciality: karigarData.speciality ?? null,
      bankName: karigarData.bankName ?? null,
      bankAccount: karigarData.bankAccount ?? null,
      ifsc: karigarData.ifsc ?? null,
      isArchived: karigarData.isArchived ?? 0,
      isDeleted: karigarData.isDeleted ?? 0,
      createdAt: karigarData.createdAt || timestamp,
      updatedAt: karigarData.updatedAt || timestamp,
    };

    conn.insert(karigar).values(toInsert).run();

    return toInsert as Karigar;
  },

  /**
   * Finds karigar by ID within a firm.
   * By default filters out archived/deleted karigars.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  findById(arg1: any, arg2: any, arg3?: any): Karigar | null {
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
      .from(karigar)
      .where(
        and(
          eq(karigar.firmId, firmId),
          eq(karigar.id, id),
          eq(karigar.isArchived, 0),
          eq(karigar.isDeleted, 0)
        )
      )
      .get();

    return (res as Karigar) || null;
  },

  /**
   * Finds karigar by mobile number within a firm.
   * Supports (firmId, mobile, tx?) and (tx, firmId, mobile).
   */
  findByMobile(arg1: any, arg2: any, arg3?: any): Karigar | null {
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
      .from(karigar)
      .where(
        and(
          eq(karigar.firmId, firmId),
          eq(karigar.mobile, mobile),
          eq(karigar.isArchived, 0),
          eq(karigar.isDeleted, 0)
        )
      )
      .get();

    return (res as Karigar) || null;
  },

  /**
   * SEARCH-P3 (v5.5): Karigar name/mobile typeahead search.
   * READ-ONLY — no tx required — no dual guards — no audit write.
   * SQL: WHERE firm_id = ? AND is_deleted = 0 AND (name LIKE '%'||?||'%' OR mobile LIKE '%'||?||'%') ORDER BY name ASC LIMIT 20
   */
  searchByNameOrMobile(firmId: string, query: string, customTx?: any): Karigar[] {
    if (!firmId) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(karigar)
      .where(
        and(
          eq(karigar.firmId, firmId),
          eq(karigar.isDeleted, 0),
          or(like(karigar.name, `%${trimmed}%`), like(karigar.mobile, `%${trimmed}%`))
        )
      )
      .orderBy(asc(karigar.name))
      .limit(20)
      .all();

    return (results as Karigar[]) || [];
  },

  /**
   * Lists all active karigars for a firm.
   * Ordered by name ASC.
   */
  listByFirm(firmId: string, customTx?: any): Karigar[] {
    if (!firmId) return [];
    const conn = getDb(customTx);
    const results = conn
      .select()
      .from(karigar)
      .where(
        and(
          eq(karigar.firmId, firmId),
          eq(karigar.isArchived, 0),
          eq(karigar.isDeleted, 0)
        )
      )
      .orderBy(asc(karigar.name))
      .all();

    return (results as Karigar[]) || [];
  },

  /**
   * Updates an existing karigar.
   * Supports (firmId, id, updates, tx?) and (tx, firmId, id, updates).
   */
  update(arg1: any, arg2: any, arg3: any, arg4?: any): Karigar {
    let firmId: string;
    let id: string;
    let updates: UpdateKarigarInput;
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
    const timestamp = now();

    const patch: Record<string, any> = {
      updatedAt: timestamp,
    };

    if (updates.name !== undefined) patch.name = updates.name.trim();
    if (updates.mobile !== undefined) patch.mobile = updates.mobile?.trim() || null;
    if (updates.address !== undefined) patch.address = updates.address?.trim() || null;
    if (updates.speciality !== undefined) patch.speciality = updates.speciality?.trim() || null;
    if (updates.bankName !== undefined) patch.bankName = updates.bankName?.trim() || null;
    if (updates.bankAccount !== undefined) patch.bankAccount = updates.bankAccount?.trim() || null;
    if (updates.ifsc !== undefined) patch.ifsc = updates.ifsc?.trim()?.toUpperCase() || null;

    conn
      .update(karigar)
      .set(patch)
      .where(and(eq(karigar.firmId, firmId), eq(karigar.id, id)))
      .run();

    const updated = this.findById(firmId, id, customTx);
    if (!updated) {
      throw new Error('KARIGAR_NOT_FOUND');
    }
    return updated;
  },

  /**
   * Soft-archives a karigar.
   * Hard delete is structurally prevented.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  archive(arg1: any, arg2: any, arg3?: any): boolean {
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
    const timestamp = now();

    conn
      .update(karigar)
      .set({
        isArchived: 1,
        isDeleted: 1,
        updatedAt: timestamp,
      })
      .where(and(eq(karigar.firmId, firmId), eq(karigar.id, id)))
      .run();

    return true;
  },
};
