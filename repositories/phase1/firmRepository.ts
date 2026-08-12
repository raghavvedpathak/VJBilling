// repositories/firmRepository.ts
// Strict DB access layer — no business logic here.
// isArchived and isActive are plain integers in schema (0=false, 1=true).
// NEVER pass boolean true/false to these columns — always use 1 or 0.

import { eq, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { firms } from '@/db/schema';
import { now } from '@/utils/now';

type DbOrTx = any;

export type NewFirm = typeof firms.$inferInsert;
export type Firm = typeof firms.$inferSelect;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

function resolveTxAndId(arg1: any, arg2: any): { tx: DbOrTx; id: string } {
  if (typeof arg1 === 'string') {
    return { id: arg1, tx: getDb(arg2) };
  }
  return { tx: getDb(arg1), id: arg2 };
}

export const firmRepository = {
  /**
   * Primary insert method — supports both (tx, data) and (data, tx) parameter orders.
   */
  insert(arg1: any, arg2?: any): Firm {
    let tx: DbOrTx;
    let data: Partial<NewFirm> = {};

    if (arg1 && typeof arg1 === 'object' && ('name' in arg1 || 'firmCode' in arg1 || 'proprietor' in arg1)) {
      data = arg1;
      tx = getDb(arg2);
    } else {
      tx = getDb(arg1);
      data = arg2 || {};
    }

    const newId = data.id || Crypto.randomUUID();
    const timestamp = now();

    tx.insert(firms)
      .values({
        ...data,
        id: newId,
        createdAt: data.createdAt || timestamp,
        updatedAt: timestamp,
        isActive: data.isActive ?? 1,   // plain integer 1
        isArchived: data.isArchived ?? 0, // plain integer 0
      } as NewFirm)
      .run();

    const created = tx.select().from(firms).where(eq(firms.id, newId)).get();
    return created as Firm;
  },

  /**
   * Alias for insert
   */
  create(input: Omit<NewFirm, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'isArchived'>, tx?: DbOrTx): Firm {
    return this.insert(tx, input);
  },

  /**
   * Find firm by ID — supports both (tx, id) and (id, tx).
   */
  findById(arg1: any, arg2?: any): Firm | null {
    const { tx, id } = resolveTxAndId(arg1, arg2);
    const firm = tx.select().from(firms).where(eq(firms.id, id)).get();
    return firm ?? null;
  },

  /**
   * Alias for findById
   */
  getById(id: string, tx?: DbOrTx): Firm | null {
    return this.findById(tx, id);
  },

  /**
   * Count ALL firms (active + archived) — used for max-3-firms gate.
   */
  countFirms(tx?: DbOrTx): number {
    const targetTx = getDb(tx);
    const result = targetTx.select({ id: firms.id }).from(firms).all();
    return result.length;
  },

  /**
   * Count non-archived firms (isArchived = 0).
   */
  countActiveFirms(tx?: DbOrTx): number {
    const targetTx = getDb(tx);
    const result = targetTx
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isArchived, 0))
      .all();
    return result.length;
  },

  /**
   * Returns DB-level active firm's ID (isActive = 1).
   */
  getActiveFirmId(tx?: DbOrTx): string | null {
    const targetTx = getDb(tx);
    const firm = targetTx
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isActive, 1))
      .get();
    return firm?.id ?? null;
  },

  /**
   * Get all firms ordered by createdAt desc.
   */
  getAll(tx?: DbOrTx): Firm[] {
    const targetTx = getDb(tx);
    return targetTx.select().from(firms).orderBy(desc(firms.createdAt)).all();
  },

  /**
   * Update firm fields — supports both (tx, id, data) and (id, data, tx).
   */
  update(arg1: any, arg2: any, arg3?: any): Firm {
    let tx: DbOrTx;
    let id: string = '';
    let data: Partial<NewFirm> = {};

    if (typeof arg1 === 'string') {
      id = arg1;
      data = arg2;
      tx = getDb(arg3);
    } else {
      tx = getDb(arg1);
      id = arg2;
      data = arg3 || {};
    }

    const timestamp = now();

    tx.update(firms)
      .set({ ...data, updatedAt: timestamp })
      .where(eq(firms.id, id))
      .run();

    const updated = tx.select().from(firms).where(eq(firms.id, id)).get();
    return updated as Firm;
  },

  /**
   * Soft-delete archive firm (isArchived = 1, isActive = 0).
   */
  archive(arg1: any, arg2?: any): Firm {
    const { tx, id } = resolveTxAndId(arg1, arg2);
    return this.update(tx, id, { isArchived: 1, isActive: 0 });
  },

  /**
   * Unarchive firm (isArchived = 0).
   */
  unarchive(arg1: any, arg2?: any): Firm {
    const { tx, id } = resolveTxAndId(arg1, arg2);
    return this.update(tx, id, { isArchived: 0 });
  },
};