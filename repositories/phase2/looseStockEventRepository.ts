// repositories/phase2/looseStockEventRepository.ts — Phase 2 v2.24 Canonical Repository
// FEAT-LOOSE-STOCK-1 (v2.23 / v2.24) / STEP 6.9 & FIX-P2-SYNC-CONTRACT-1
// APPEND-ONLY audit trail for pooled loose stock lots

import { eq, and, desc, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { looseStockEvents } from '@/db/schema';
import type {
  DrizzleTransaction,
  LooseStockEvent,
  NewLooseStockEvent,
} from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface LooseStockEventRepository {
  // --- insert (Step 6.9: append-only ledger write) ---
  insert(tx: DrizzleTransaction, data: Omit<NewLooseStockEvent, 'id'> & { id?: string }): LooseStockEvent;

  // --- findByLotId (Sync tx overload and async standalone) ---
  findByLotId(lotId: string): Promise<LooseStockEvent[]>;
  findByLotId(lotId: string, firmId: string): Promise<LooseStockEvent[]>;
  findByLotId(tx: DrizzleTransaction, lotId: string): LooseStockEvent[];
  findByLotId(tx: DrizzleTransaction, lotId: string, firmId: string): LooseStockEvent[];
  findByLotId(tx: DrizzleTransaction, firmId: string, lotId: string): LooseStockEvent[];
}

export const looseStockEventRepository: LooseStockEventRepository = {
  insert(tx: DrizzleTransaction, data: Omit<NewLooseStockEvent, 'id'> & { id?: string }): LooseStockEvent {
    const id = data.id ?? Crypto.randomUUID();
    const row = {
      ...data,
      id,
      purchaseRatePaise: data.purchaseRatePaise ?? null,
      wastagePercent: data.wastagePercent ?? null,
      saleInvoiceId: data.saleInvoiceId ?? null,
      timestamp: data.timestamp ?? now(),
    };
    tx.insert(looseStockEvents).values(row).run();
    return row as LooseStockEvent;
  },

  findByLotId(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      const a = first;
      const b = second;

      if (b !== undefined) {
        return db
          .select()
          .from(looseStockEvents)
          .where(
            or(
              and(eq(looseStockEvents.lotId, a), eq(looseStockEvents.firmId, b)),
              and(eq(looseStockEvents.lotId, b), eq(looseStockEvents.firmId, a))
            )
          )
          .orderBy(desc(looseStockEvents.timestamp));
      }

      return db
        .select()
        .from(looseStockEvents)
        .where(eq(looseStockEvents.lotId, a))
        .orderBy(desc(looseStockEvents.timestamp));
    }

    const tx = first as DrizzleTransaction;
    const a = second!;
    const b = third;

    if (b !== undefined) {
      return tx
        .select()
        .from(looseStockEvents)
        .where(
          or(
            and(eq(looseStockEvents.lotId, a), eq(looseStockEvents.firmId, b)),
            and(eq(looseStockEvents.lotId, b), eq(looseStockEvents.firmId, a))
          )
        )
        .orderBy(desc(looseStockEvents.timestamp))
        .all() as LooseStockEvent[];
    }

    return tx
      .select()
      .from(looseStockEvents)
      .where(eq(looseStockEvents.lotId, a))
      .orderBy(desc(looseStockEvents.timestamp))
      .all() as LooseStockEvent[];
  },
};