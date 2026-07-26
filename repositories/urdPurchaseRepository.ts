import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { urdPurchases } from '../db/schema';
import type { DrizzleTransaction, URDPurchase } from '../types/phase2.types';

export const urdPurchaseRepository = {
  // FIX-V718-1: Synchronous execution using .run() and .get()
  insert(tx: DrizzleTransaction, data: typeof urdPurchases.$inferInsert): URDPurchase {
    tx.insert(urdPurchases).values(data).run();
    const result = tx.select().from(urdPurchases).where(and(eq(urdPurchases.id, data.id as string), eq(urdPurchases.firmId, data.firmId))).limit(1).get();
    return result as unknown as URDPurchase;
  },

  // FIX-V718-1: Synchronous execution using .get()
  getById(tx: DrizzleTransaction, firmId: string, id: string): URDPurchase | null {
    const result = tx.select().from(urdPurchases).where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId))).limit(1).get();
    return (result as unknown as URDPurchase) || null;
  },

  // FIX-V718-1: Synchronous execution using .run()
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<typeof urdPurchases.$inferInsert>): void {
    tx.update(urdPurchases).set(data).where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId))).run();
  },

  delete(tx: DrizzleTransaction, firmId: string, id: string): void {
    tx.delete(urdPurchases).where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId))).run();
  },

  // Operates globally outside a transaction — safely left as async
  async findByFirmId(firmId: string): Promise<URDPurchase[]> {
    return db.select()
      .from(urdPurchases)
      .where(eq(urdPurchases.firmId, firmId))
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  },

  // Operates globally outside a transaction — safely left as async
  async findByCustomerId(firmId: string, customerId: string): Promise<URDPurchase[]> {
    return db.select()
      .from(urdPurchases)
      .where(
        and(
          eq(urdPurchases.firmId, firmId),
          eq(urdPurchases.customerId, customerId)
        )
      )
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  }
};