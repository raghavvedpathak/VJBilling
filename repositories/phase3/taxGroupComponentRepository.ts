// repositories/phase3/taxGroupComponentRepository.ts — Phase 3 Tax Group Component Data Access Layer
import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { taxGroupComponents } from '@/db/schema';
import { TaxGroupComponent, NewTaxGroupComponent } from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const taxGroupComponentRepository = {
  getByTaxGroupId(taxGroupId: string, customTx?: any): TaxGroupComponent[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxGroupComponents)
      .where(eq(taxGroupComponents.taxGroupId, taxGroupId))
      .all() as TaxGroupComponent[];
  },

  getByTaxRateId(taxRateId: string, customTx?: any): TaxGroupComponent[] {
    const conn = getDb(customTx);
    return conn
      .select()
      .from(taxGroupComponents)
      .where(eq(taxGroupComponents.taxRateId, taxRateId))
      .all() as TaxGroupComponent[];
  },

  insert(data: NewTaxGroupComponent, customTx?: any): TaxGroupComponent {
    const conn = getDb(customTx);
    const id = data.id || Crypto.randomUUID();

    const row = {
      id,
      taxGroupId: data.taxGroupId,
      taxRateId: data.taxRateId,
    };

    conn.insert(taxGroupComponents).values(row).run();
    return row as TaxGroupComponent;
  },
};
