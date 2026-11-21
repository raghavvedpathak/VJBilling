// db/safeTransaction.ts — the only file allowed to call db.transaction (FIX-V740-8, FIX-V741-7)
import dbDefault, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';

export type DrizzleTransaction = Parameters<Parameters<typeof dbDefault.transaction>[0]>[0];

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  !!v && typeof (v as any).then === 'function';

export function safeTransaction<T>(fn: (tx: DrizzleTransaction) => T): T {
  const activeDb = (dbNamed ?? dbDefault) as typeof dbDefault;
  return activeDb.transaction((tx: any) => {
    const result = fn(tx);
    if (isThenable(result)) {
      result.then(undefined, () => {}); // swallow the late rejection; the error below is the one that surfaces
      throw new Error(
        ERR.ASYNC_TX_CALLBACK +
          ': transaction callbacks must be synchronous (REPOSITORY SYNC CONTRACT)'
      );
    }
    return result; // throwing above rolls the whole transaction back
  });
}
