// repositories/phase3/taxGroupRepository.ts — Phase 3 Tax Group Data Access Layer
import { eq, and, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { taxGroups } from '@/db/schema';
import { now } from '@/utils/now';
import { TaxGroup, NewTaxGroup } from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const taxGroupRepository = {
  getById(id: string, customTx?: any): TaxGroup | null {
    const conn = getDb(customTx);
    const result = conn
      .select()
      .from(taxGroups)
      .where(eq(taxGroups.id, id))
      .get();
    return (result as TaxGroup) || null;
  },

  getByFirmId(firmId: string, customTx?: any): TaxGroup[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxGroups)
      .where(eq(taxGroups.firmId, firmId))
      .all() as TaxGroup[];
  },

  getActiveByFirmId(firmId: string, customTx?: any): TaxGroup[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxGroups)
      .where(and(eq(taxGroups.firmId, firmId), eq(taxGroups.isActive, 1)))
      .all() as TaxGroup[];
  },

  getByName(firmId: string, name: string, customTx?: any): TaxGroup | null {
    const conn = getDb(customTx);
    const result = conn
      .select()
      .from(taxGroups)
      .where(
        and(
          eq(taxGroups.firmId, firmId),
          sql`lower(${taxGroups.groupName}) = ${name.trim().toLowerCase()}`
        )
      )
      .get();
    return (result as TaxGroup) || null;
  },

  countByFirmId(firmId: string, customTx?: any): number {
    const conn = getDb(customTx);
    const res = conn
      .select({ count: sql<number>`count(*)` })
      .from(taxGroups)
      .where(eq(taxGroups.firmId, firmId))
      .get();
    return res?.count || 0;
  },

  insert(data: NewTaxGroup, customTx?: any): TaxGroup {
    const conn = getDb(customTx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = data.createdAt || now();

    const row = {
      id,
      firmId: data.firmId,
      groupName: data.groupName.trim(),
      isActive: data.isActive ?? 1,
      createdAt: timestamp,
      updatedAt: data.updatedAt || timestamp,
    };

    conn.insert(taxGroups).values(row).run();
    return row as TaxGroup;
  },

  updateName(id: string, name: string, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .update(taxGroups)
      .set({
        groupName: name.trim(),
        updatedAt: now(),
      })
      .where(eq(taxGroups.id, id))
      .run();
  },

  deactivate(id: string, firmId: string, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .update(taxGroups)
      .set({
        isActive: 0,
        updatedAt: now(),
      })
      .where(and(eq(taxGroups.id, id), eq(taxGroups.firmId, firmId)))
      .run();
  },
};
