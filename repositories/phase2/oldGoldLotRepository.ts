// repositories/phase2/oldGoldLotRepository.ts — Phase 2 v2.34 Canonical Repository
// Aligned with FIX-OLDMETAL-RENAME-1 (v2.32), FIX-OLDMETAL-VOID-1 (v2.33), FIX-OLDGOLD-TXNLINK-1 (v2.31), FIX-P2-SYNC-CONTRACT-1 (v1.81)

import { eq, and, or, inArray, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { oldMetalLots } from '@/db/schema';
import type { DrizzleTransaction, OldMetalLot, OldMetalLotStatus, NewOldMetalLot } from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface OldMetalLotRepository {
  // --- getById (Overloaded for (id), (id, firmId), (tx, id), and (tx, firmId, id)) ---
  getById(id: string): Promise<OldMetalLot | null>;
  getById(id: string, firmId: string): Promise<OldMetalLot | null>;
  getById(tx: DrizzleTransaction, id: string): OldMetalLot | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): OldMetalLot | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): OldMetalLot | null;

  // --- findBySaleInvoiceId (FIX-OLDMETAL-VOID-1 v2.33 / v2.34) ---
  findBySaleInvoiceId(firmId: string, saleInvoiceId: string): Promise<OldMetalLot | null>;
  findBySaleInvoiceId(tx: DrizzleTransaction, firmId: string, saleInvoiceId: string): OldMetalLot | null;

  // --- insert (Step 12.6 createOldMetalLot) ---
  insert(tx: DrizzleTransaction, data: NewOldMetalLot): OldMetalLot;

  // --- update ---
  update(tx: DrizzleTransaction, id: string, data: Partial<NewOldMetalLot>): void;
  update(tx: DrizzleTransaction, id: string, firmId: string, data: Partial<NewOldMetalLot>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<NewOldMetalLot>): void;

  // --- findByFirmId (Sync tx overload required by closeFY, async standalone for UI) ---
  findByFirmId(firmId: string): Promise<OldMetalLot[]>;
  findByFirmId(tx: DrizzleTransaction, firmId: string): OldMetalLot[];

  // --- updateStatus (Step 12.6 updateOldMetalLotStatus) ---
  updateStatus(tx: DrizzleTransaction, id: string, status: OldMetalLotStatus): void;
  updateStatus(tx: DrizzleTransaction, id: string, firmId: string, status: OldMetalLotStatus): void;
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: OldMetalLotStatus): void;

  // --- delete ---
  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, id: string, firmId: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- findAvailableForIssuance (DOMAIN-FIX-1 v1.22 + FIX-IDX-3 v1.25 + FIX-P2-SYNC-CONTRACT-1) ---
  findAvailableForIssuance(firmId: string): Promise<OldMetalLot[]>;
  findAvailableForIssuance(tx: DrizzleTransaction, firmId: string): OldMetalLot[];

  // --- getPendingRefineryLots (FEAT-GAP5-REFINERYPENDING-1 v1.66) ---
  getPendingRefineryLots(firmId: string): Promise<OldMetalLot[]>;
  getPendingRefineryLots(tx: DrizzleTransaction, firmId: string): OldMetalLot[];
}

export const oldMetalLotRepository: OldMetalLotRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        return db
          .select()
          .from(oldMetalLots)
          .where(
            or(
              and(eq(oldMetalLots.id, first), eq(oldMetalLots.firmId, second)),
              and(eq(oldMetalLots.id, second), eq(oldMetalLots.firmId, first))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      return db
        .select()
        .from(oldMetalLots)
        .where(eq(oldMetalLots.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      const res = tx
        .select()
        .from(oldMetalLots)
        .where(
          or(
            and(eq(oldMetalLots.id, third), eq(oldMetalLots.firmId, second!)),
            and(eq(oldMetalLots.id, second!), eq(oldMetalLots.firmId, third))
          )
        )
        .get();
      return (res as OldMetalLot) || null;
    }
    const res = tx.select().from(oldMetalLots).where(eq(oldMetalLots.id, second!)).get();
    return (res as OldMetalLot) || null;
  },

  // FIX-OLDMETAL-VOID-1 (v2.33): Lookup lot linked to sale invoice for voiding
  findBySaleInvoiceId(
    first: DrizzleTransaction | string,
    second: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      const firmId = first;
      const saleInvoiceId = second;
      return db
        .select()
        .from(oldMetalLots)
        .where(and(eq(oldMetalLots.firmId, firmId), eq(oldMetalLots.saleInvoiceId, saleInvoiceId)))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    const firmId = second;
    const saleInvoiceId = third!;
    const res = tx
      .select()
      .from(oldMetalLots)
      .where(and(eq(oldMetalLots.firmId, firmId), eq(oldMetalLots.saleInvoiceId, saleInvoiceId)))
      .get();
    return (res as OldMetalLot) || null;
  },

  insert(tx: DrizzleTransaction, data: NewOldMetalLot): OldMetalLot {
    const id = data.id ?? Crypto.randomUUID();
    const row = { ...data, id };
    tx.insert(oldMetalLots).values(row).run();
    const result = tx.select().from(oldMetalLots).where(eq(oldMetalLots.id, id)).get();
    return result as OldMetalLot;
  },

  update(
    tx: DrizzleTransaction,
    second: string,
    third: string | Partial<NewOldMetalLot>,
    fourth?: Partial<NewOldMetalLot>
  ): void {
    if (fourth !== undefined) {
      const a = second;
      const b = third as string;
      tx.update(oldMetalLots)
        .set({ ...fourth, updatedAt: fourth.updatedAt ?? now() })
        .where(
          or(
            and(eq(oldMetalLots.id, b), eq(oldMetalLots.firmId, a)),
            and(eq(oldMetalLots.id, a), eq(oldMetalLots.firmId, b))
          )
        )
        .run();
    } else {
      const data = third as Partial<NewOldMetalLot>;
      tx.update(oldMetalLots)
        .set({ ...data, updatedAt: data.updatedAt ?? now() })
        .where(eq(oldMetalLots.id, second))
        .run();
    }
  },

  findByFirmId(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldMetalLots)
        .where(eq(oldMetalLots.firmId, first))
        .orderBy(desc(oldMetalLots.receivedDate), desc(oldMetalLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldMetalLots)
      .where(eq(oldMetalLots.firmId, firmId))
      .orderBy(desc(oldMetalLots.receivedDate), desc(oldMetalLots.createdAt))
      .all() as OldMetalLot[];
  },

  updateStatus(
    tx: DrizzleTransaction,
    second: string,
    third: string | OldMetalLotStatus,
    fourth?: OldMetalLotStatus
  ): void {
    if (typeof fourth === 'string') {
      const a = second;
      const b = third as string;
      tx.update(oldMetalLots)
        .set({ status: fourth, updatedAt: now() })
        .where(
          or(
            and(eq(oldMetalLots.id, b), eq(oldMetalLots.firmId, a)),
            and(eq(oldMetalLots.id, a), eq(oldMetalLots.firmId, b))
          )
        )
        .run();
    } else {
      tx.update(oldMetalLots)
        .set({ status: third as OldMetalLotStatus, updatedAt: now() })
        .where(eq(oldMetalLots.id, second))
        .run();
    }
  },

  delete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      tx.delete(oldMetalLots).where(eq(oldMetalLots.id, second)).run();
    } else {
      const a = second;
      const b = third;
      tx.delete(oldMetalLots)
        .where(
          or(
            and(eq(oldMetalLots.id, b), eq(oldMetalLots.firmId, a)),
            and(eq(oldMetalLots.id, a), eq(oldMetalLots.firmId, b))
          )
        )
        .run();
    }
  },

  // DOMAIN-FIX-1 (v1.22) + FIX-IDX-3 (v1.25): only MELT_OUTPUT lots with RECEIVED status are issuable
  findAvailableForIssuance(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldMetalLots)
        .where(
          and(
            eq(oldMetalLots.firmId, first),
            eq(oldMetalLots.status, 'RECEIVED'),
            eq(oldMetalLots.metalSource, 'MELT_OUTPUT')
          )
        )
        .orderBy(desc(oldMetalLots.receivedDate));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldMetalLots)
      .where(
        and(
          eq(oldMetalLots.firmId, firmId),
          eq(oldMetalLots.status, 'RECEIVED'),
          eq(oldMetalLots.metalSource, 'MELT_OUTPUT')
        )
      )
      .orderBy(desc(oldMetalLots.receivedDate))
      .all() as OldMetalLot[];
  },

  // FEAT-GAP5-REFINERYPENDING-1 (v1.66)
  getPendingRefineryLots(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db
        .select()
        .from(oldMetalLots)
        .where(
          and(
            eq(oldMetalLots.firmId, first),
            inArray(oldMetalLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
          )
        )
        .orderBy(desc(oldMetalLots.receivedDate), desc(oldMetalLots.createdAt));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    return tx
      .select()
      .from(oldMetalLots)
      .where(
        and(
          eq(oldMetalLots.firmId, firmId),
          inArray(oldMetalLots.status, ['RECEIVED', 'PENDING', 'SENT_TO_REFINERY'])
        )
      )
      .orderBy(desc(oldMetalLots.receivedDate), desc(oldMetalLots.createdAt))
      .all() as OldMetalLot[];
  },
};

// Backward-compatibility alias
export const oldGoldLotRepository = oldMetalLotRepository;