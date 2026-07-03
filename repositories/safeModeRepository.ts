import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { safeModeState } from '../db/schema';

export type SafeModeStateRow = typeof safeModeState.$inferSelect;
export type NewSafeModeState = typeof safeModeState.$inferInsert;

type DbOrTx = any;

export const safeModeRepository = {

  /**
   * Reads the current Safe Mode state from DB.
   * Row ID is always 1 — this is a singleton row.
   * 
   * FIX-V718-1: Synchronous execution using .get()
   */
  get(tx: DbOrTx = db): SafeModeStateRow | null {
    const result = tx
      .select()
      .from(safeModeState)
      .where(eq(safeModeState.id, 1))
      .limit(1)
      .get();

    return result ?? null;
  },

  /**
   * Upserts the Safe Mode singleton row (ID=1).
   *
   * FIX: The onConflictDoUpdate `set` payload previously included `id: 1`.
   * Including the primary key in the SET clause is redundant (the id cannot
   * change on conflict by definition) and can trigger SQLite immutability
   * guards on some versions. The SET payload now explicitly excludes `id`
   * using destructuring — only the actual data fields are updated.
   * 
   * FIX-V718-1: Parameter order swapped to (tx, data) to match spec calls.
   * Execution is completely synchronous using .run().
   */
  upsert(tx: DbOrTx, data: Partial<NewSafeModeState>) {
    const { id: _ignored, ...updateFields } = { ...data, id: 1 };

    tx.insert(safeModeState)
      .values({ ...data, id: 1 } as NewSafeModeState)
      .onConflictDoUpdate({
        target: safeModeState.id,
        set: updateFields, // id excluded — never update the primary key
      })
      .run();
  },
};