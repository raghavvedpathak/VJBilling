// repositories/phase2/oldGoldLotRepository.ts — Phase 2 v2.24 Canonical Repository

import { eq, and, or, inArray, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { oldGoldLots } from '@/db/schema';
import type { DrizzleTransaction, OldGoldLot, OldGoldLotStatus, NewOldGoldLot } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface OldGoldLotRepository {
  // --- getById (Overloaded for (id), (id, firmId), (tx, id), and (tx, firmId, id)) ---
  getById(id: string): Promise<OldGoldLot | null>;
  getById(id: string, firmId: string): Promise<OldGoldLot | null>;
  getById(tx: DrizzleTransaction, id: string): OldGoldLot | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): OldGoldLot | null;

  // --- insert (Step 12.6 createOldGoldLot) ---
  insert(tx: DrizzleTransaction, data: NewOldGoldLot): OldGoldLot;

  // --- update ---
  update(tx: DrizzleTransaction, id: string, data: Partial<NewOldGoldLot>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<NewOldGoldLot>): void;

  // --- findByFirmId (Sync tx overload required by closeFY, async standalone for UI) ---
  findByFirmId(firmId: string): Promise<OldGoldLot[]>;
  findByFirmId(tx: DrizzleTransaction, firmId: string): OldGoldLot[];

  // --- updateStatus (Step 12.6 updateOldGoldLotStatus) ---
  updateStatus(tx: DrizzleTransaction, id: string, status: OldGoldLotStatus): void;
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: OldGoldLotStatus): void;

  // --- delete ---
  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- findAvailableForIssuance (DOMAIN-FIX-1 v1.22 + FIX-IDX-3 v1.25 + FIX-P2-SYNC-CONTRACT-1) ---
  findAvailableForIssuance(firmId: string): Promise<OldGoldLot[]>;
  findAvailableForIssuance(tx: DrizzleTransaction, firmId: string): OldGoldLot[];

  // --- getPendingRefineryLots (FEAT-GAP5-REFINERYPENDING-1 v1.66) ---
  getPendingRefineryLots(firmId: string): Promise<OldGoldLot[]>;
  getPendingRefineryLots(tx: DrizzleTransaction, firmId: string): OldGoldLot[];
}

export const oldGoldLotRepository: OldGoldLotRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        // 2-arg async call: supports both (id, firmId) and (firmId, id)
        return db
          .select()
          .from(oldGoldLots)
          .where(
            or(
              and(eq(oldGoldLots.id, first), eq(oldGoldLots.firmId, second)),
              and(eq(oldGoldLots.id, second), eq(oldGoldLots.firmId, first))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      return db
        .select()
        .from(oldGoldLots)
        .where(eq(oldGoldLots.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      // 3-arg call: getById(tx, firmId, id)
      const res = tx
        .select()
        .from(oldGoldLots)
        .where(and(eq(oldGoldLots.id, third), eq(oldGoldLots.firmId, second!)))
        .get();
      return (res as OldGoldLot) || null;
    }
    // 2-arg call: getById(tx, id)
    const res = tx.select().from(oldGoldLots).where(eq(oldGoldLots.id, second!)).get();
    return (res as OldGoldLot) || null;
  },

  insert(tx: DrizzleTransaction, data: NewOldGoldLot): OldGoldLot {
    const id = data.id ?? Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(oldGoldLots).values(row).run();
    const result = tx.select().from(oldGoldLots).where(eq(oldGoldLots.id, id)).get();
    return result as OldGoldLot;
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<NewOldGoldLot>,
    fourth?: Partial<NewOldGoldLot>
  ): void {
    if (fourth !== undefined) {
      tx.update(oldGoldLots)
        .set({ ...fourth, updatedAt: fourth.updatedAt ?? now() })
        .where(and(eq(oldGoldLots.id, third as string), eq(oldGoldLots.firmId, second)))
        .run();
    } else {
      const data = third as Partial<NewOldGoldLot>;
      tx.update(oldGoldLots)
        .set({ ...data, updatedAt: data.updatedAt ?? now() })
        .where(eq(oldGoldLots.id, second))
        .run();
    }
  },

  findByFirmId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldGoldLots)
        .where(eq(oldGoldLots.firmId, first))
        .orderBy(desc(oldGoldLots.receivedDate), desc(oldGoldLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldGoldLots)
      .where(eq(oldGoldLots.firmId, firmId))
      .orderBy(desc(oldGoldLots.receivedDate), desc(oldGoldLots.createdAt))
      .all() as OldGoldLot[];
  },

  updateStatus(
    tx: DrizzleTransaction,
    second: string,
    third: string | OldGoldLotStatus,
    fourth?: OldGoldLotStatus
  ): void {
    if (typeof fourth === 'string') {
      // 4-arg call: updateStatus(tx, firmId, id, status)
      tx.update(oldGoldLots)
        .set({ status: fourth, updatedAt: now() })
        .where(and(eq(oldGoldLots.id, third as string), eq(oldGoldLots.firmId, second)))
        .run();
    } else {
      // 3-arg call: updateStatus(tx, id, status)
      tx.update(oldGoldLots)
        .set({ status: third as OldGoldLotStatus, updatedAt: now() })
        .where(eq(oldGoldLots.id, second))
        .run();
    }
  },

  delete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      tx.delete(oldGoldLots).where(eq(oldGoldLots.id, second)).run();
    } else {
      tx.delete(oldGoldLots).where(and(eq(oldGoldLots.id, third), eq(oldGoldLots.firmId, second))).run();
    }
  },

  // DOMAIN-FIX-1 (v1.22) + FIX-IDX-3 (v1.25): only MELT_OUTPUT lots with RECEIVED status are issuable
  findAvailableForIssuance(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldGoldLots)
        .where(
          and(
            eq(oldGoldLots.firmId, first),
            eq(oldGoldLots.status, 'RECEIVED'),
            eq(oldGoldLots.metalSource, 'MELT_OUTPUT')
          )
        )
        .orderBy(desc(oldGoldLots.receivedDate));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldGoldLots)
      .where(
        and(
          eq(oldGoldLots.firmId, firmId),
          eq(oldGoldLots.status, 'RECEIVED'),
          eq(oldGoldLots.metalSource, 'MELT_OUTPUT')
        )
      )
      .orderBy(desc(oldGoldLots.receivedDate))
      .all() as OldGoldLot[];
  },

  // FEAT-GAP5-REFINERYPENDING-1 (v1.66)
  getPendingRefineryLots(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldGoldLots)
        .where(
          and(
            eq(oldGoldLots.firmId, first),
            inArray(oldGoldLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
          )
        )
        .orderBy(desc(oldGoldLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldGoldLots)
      .where(
        and(
          eq(oldGoldLots.firmId, firmId),
          inArray(oldGoldLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
        )
      )
      .orderBy(desc(oldGoldLots.createdAt))
      .all() as OldGoldLot[];
  },
};