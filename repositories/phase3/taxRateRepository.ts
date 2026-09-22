// repositories/phase3/taxRateRepository.ts — Phase 3 Tax Rate Data Access Layer
import { eq, and, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { taxRates } from '@/db/schema';
import { now } from '@/utils/now';
import { TaxRate, NewTaxRate } from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const taxRateRepository = {
  getById(id: string, customTx?: any): TaxRate | null {
    const conn = getDb(customTx);
    const result = conn
      .select()
      .from(taxRates)
      .where(eq(taxRates.id, id))
      .get();
    return (result as TaxRate) || null;
  },

  getByFirmId(firmId: string, customTx?: any): TaxRate[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxRates)
      .where(eq(taxRates.firmId, firmId))
      .all() as TaxRate[];
  },

  getActiveByFirmId(firmId: string, customTx?: any): TaxRate[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.firmId, firmId), eq(taxRates.isActive, 1)))
      .all() as TaxRate[];
  },

  getByName(firmId: string, name: string, customTx?: any): TaxRate | null {
    const conn = getDb(customTx);
    const result = conn
      .select()
      .from(taxRates)
      .where(
        and(
          eq(taxRates.firmId, firmId),
          sql`lower(${taxRates.taxName}) = ${name.trim().toLowerCase()}`
        )
      )
      .get();
    return (result as TaxRate) || null;
  },

  countByFirmId(firmId: string, customTx?: any): number {
    const conn = getDb(customTx);
    const res = conn
      .select({ count: sql<number>`count(*)` })
      .from(taxRates)
      .where(eq(taxRates.firmId, firmId))
      .get();
    return res?.count || 0;
  },

  insert(data: NewTaxRate, customTx?: any): TaxRate {
    const conn = getDb(customTx);
    const id = data.id || Crypto.randomUUID();
    const timestamp = data.createdAt || now();

    const row = {
      id,
      firmId: data.firmId,
      taxName: data.taxName.trim(),
      rateBps: data.rateBps,
      taxType: data.taxType,
      isActive: data.isActive ?? 1,
      createdAt: timestamp,
      updatedAt: data.updatedAt || timestamp,
    };

    conn.insert(taxRates).values(row).run();
    return row as TaxRate;
  },

  updateName(id: string, name: string, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .update(taxRates)
      .set({
        taxName: name.trim(),
        updatedAt: now(),
      })
      .where(eq(taxRates.id, id))
      .run();
  },

  deactivate(id: string, firmId: string, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .update(taxRates)
      .set({
        isActive: 0,
        updatedAt: now(),
      })
      .where(and(eq(taxRates.id, id), eq(taxRates.firmId, firmId)))
      .run();
  },

  activate(id: string, firmId: string, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .update(taxRates)
      .set({
        isActive: 1,
        updatedAt: now(),
      })
      .where(and(eq(taxRates.id, id), eq(taxRates.firmId, firmId)))
      .run();
  },
};
