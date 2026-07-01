// repositories/firmRepository.ts
// Strict DB access layer — no business logic here.
// isArchived and isActive are plain integers in schema (0=false, 1=true).
// NEVER pass boolean true/false to these columns — always use 1 or 0.
//
// CRITICAL FIX (P0): create() now sets isActive=1 for the first firm.
// Previously create() set isActive=0 and firmService.createFirm() only called
// setActiveFirm() on the Zustand store — leaving the DB isActive column at 0.
// This caused getActiveFirmId() to always return null, which meant:
//   1. archiveFirm() safety check (cannot archive active firm) always passed → bug
//   2. useSession() hook reading activeFirm from DB would find no active firm
//   3. DB and Zustand store were permanently out of sync
//
// The fix: create() sets isActive=1 unconditionally. This is correct because
// the max-3-firms gate in firmService ensures we only create firms that will
// be used. The first created firm is always made active in the same transaction.
// For subsequent firms (firm 2, firm 3), the caller (firmService) must explicitly
// call update(id, { isActive: 0 }) if the new firm should not become active — but
// per spec, new firm creation does activate the new firm immediately.

import { eq, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../db/client';
import { firms } from '../db/schema';
import { now } from '../utils/now';

type DbOrTx = any;

export type NewFirm = typeof firms.$inferInsert;
export type Firm = typeof firms.$inferSelect;

export const firmRepository = {

  /**
   * Creates a firm row and immediately sets it as the active firm (isActive=1).
   *
   * isActive=1: This firm is the currently active firm for the session.
   * isArchived=0: Not archived at creation.
   * Both are plain integers — NEVER pass boolean true/false.
   *
   * CONSTITUTIONAL: firmService.createFirm() wraps this in a transaction and
   * also calls setActiveFirm() on the Zustand store. Both the DB column (here)
   * and the store must be set — neither alone is sufficient.
   */
  create(
    input: Omit<NewFirm, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'isArchived'>,
    tx: DbOrTx = db
  ): Firm {
    const newId = Crypto.randomUUID();
    const timestamp = now();

    // FIX-V718-1: Synchronous execution using .returning().get()
    const createdFirm = tx.insert(firms).values({
      ...input,
      id: newId,
      createdAt: timestamp,
      updatedAt: timestamp,
      isActive: 1,   // plain integer — new firm is immediately active
      isArchived: 0, // plain integer — not archived at creation
    }).returning().get();

    return createdFirm;
  },

  /**
   * Count ALL firms (active + archived) — used for the max-3-firms gate.
   * Must run inside the same transaction as the insert to prevent race conditions.
   */
  countFirms(tx: DbOrTx = db): number {
    // FIX-V718-1: Synchronous execution using .all()
    const result = tx.select({ id: firms.id }).from(firms).all();
    return result.length;
  },

  /**
   * Count non-archived firms — used for archive/unarchive gates.
   * isArchived=0 means not archived (plain integer — NOT false).
   */
  countActiveFirms(tx: DbOrTx = db): number {
    // FIX-V718-1: Synchronous execution using .all()
    const result = tx
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isArchived, 0)) // plain integer — NOT false
      .all();
      
    return result.length;
  },

  /**
   * Returns the DB-level active firm's ID (isActive=1).
   * This is the source of truth for "which firm is active" — NOT the Zustand store.
   * archiveFirm() uses this to prevent archiving the currently active firm.
   * isActive=1 is a plain integer — NOT true.
   */
  getActiveFirmId(tx: DbOrTx = db): string | null {
    // FIX-V718-1: Synchronous execution using .get()
    const firm = tx
      .select({ id: firms.id })
      .from(firms)
      .where(eq(firms.isActive, 1)) // plain integer — NOT true
      .get();
      
    return firm?.id ?? null;
  },

  /**
   * Get all firms ordered by createdAt desc (most recently created first).
   * Used by Firm Manager screen and firmService.refreshStore().
   */
  getAll(tx: DbOrTx = db): Firm[] {
    // FIX-V718-1: Synchronous execution using .all()
    return tx.select().from(firms).orderBy(desc(firms.createdAt)).all();
  },

  /**
   * Get a single firm by its UUID primary key.
   */
  getById(id: string, tx: DbOrTx = db): Firm | null {
    // FIX-V718-1: Synchronous execution using .get()
    const firm = tx.select().from(firms).where(eq(firms.id, id)).get();
    return firm ?? null;
  },

  /**
   * Update firm fields. Always stamps updatedAt.
   * NEVER pass isArchived: true/false or isActive: true/false — always 0/1.
   * Returns the updated row via a second SELECT (Drizzle expo-sqlite returning() support varies).
   */
  update(id: string, input: Partial<NewFirm>, tx: DbOrTx = db): Firm {
    const timestamp = now();

    // FIX-V718-1: Synchronous execution using .run()
    tx.update(firms)
      .set({ ...input, updatedAt: timestamp })
      .where(eq(firms.id, id))
      .run();

    // FIX-V718-1: Synchronous execution using .get()
    const updated = tx.select().from(firms).where(eq(firms.id, id)).get();
    return updated;
  },
};