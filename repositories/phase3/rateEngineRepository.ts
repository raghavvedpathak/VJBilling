// repositories/phase3/rateEngineRepository.ts — Phase 3 Rate Engine Data Access Layer
import { eq } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { rateEngineConfig } from '@/db/schema';
import { RateEngineConfig } from '@/types/phase3/phase3.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const rateEngineRepository = {
  getByFirmId(firmId: string, customTx?: any): RateEngineConfig | null {
    const conn = getDb(customTx);
    const expectedId = `${firmId}_rate_config`;
    const res = conn
      .select()
      .from(rateEngineConfig)
      .where(eq(rateEngineConfig.id, expectedId))
      .get();
    return (res as RateEngineConfig) || null;
  },

  upsert(data: RateEngineConfig, customTx?: any): void {
    const conn = getDb(customTx);
    conn
      .insert(rateEngineConfig)
      .values({
        id: data.id,
        firmId: data.firmId,
        gold24BasePer10gPaise: data.gold24BasePer10gPaise,
        gold22BasePer10gPaise: data.gold22BasePer10gPaise,
        goldCashPer10gPaise: data.goldCashPer10gPaise,
        silverCashPerKgPaise: data.silverCashPerKgPaise,
        lastUpdatedAt: data.lastUpdatedAt,
      })
      .onConflictDoUpdate({
        target: rateEngineConfig.id,
        set: {
          gold24BasePer10gPaise: data.gold24BasePer10gPaise,
          gold22BasePer10gPaise: data.gold22BasePer10gPaise,
          goldCashPer10gPaise: data.goldCashPer10gPaise,
          silverCashPerKgPaise: data.silverCashPerKgPaise,
          lastUpdatedAt: data.lastUpdatedAt,
        },
      })
      .run();
  },
};
