import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { urdPurchases } from '../db/schema';
import type { DrizzleTransaction, URDPurchase } from '../types/phase2.types';

export const urdPurchaseRepository = {
  async insert(tx: DrizzleTransaction, data: typeof urdPurchases.$inferInsert): Promise<URDPurchase> {
    const result = await tx.insert(urdPurchases).values(data).returning();
    return result[0];
  },

  async getById(tx: DrizzleTransaction, firmId: string, id: string): Promise<URDPurchase | null> {
    const result = await tx.select().from(urdPurchases).where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId))).limit(1);
    return result[0] || null;
  },

  async update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<typeof urdPurchases.$inferInsert>): Promise<void> {
    await tx.update(urdPurchases).set(data).where(and(eq(urdPurchases.id, id), eq(urdPurchases.firmId, firmId)));
  },

  async findByFirmId(firmId: string): Promise<URDPurchase[]> {
    return db.select()
      .from(urdPurchases)
      .where(eq(urdPurchases.firmId, firmId))
      .orderBy(desc(urdPurchases.purchaseDate), desc(urdPurchases.createdAt));
  },

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
