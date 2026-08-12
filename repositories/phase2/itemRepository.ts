// repositories/phase2/itemRepository.ts — Phase 2 v2.11 Canonical Repository

import { eq, and, sql, inArray, like, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { items, designs, categories } from '@/db/schema';
import type {
  DrizzleTransaction, Item, NewItem, UpdateableItemFields,
  StockStatus, ItemSearchResult
} from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface ItemRepository {
  // --- getById (FIX-GETBYID-TX-1 v1.56 & FIX-P2-SYNC-CONTRACT-1 v1.81) ---
  getById(id: string): Promise<Item | null>;
  getById(tx: DrizzleTransaction, id: string): Item | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): Item | null;

  // --- findBySku ---
  findBySku(sku: string): Promise<Item | null>;
  findBySku(firmId: string, sku: string): Promise<Item | null>;
  findBySku(tx: DrizzleTransaction, firmId: string, sku: string): Item | null;

  // --- findByHUID (v1.85 / v1.86 FIX-HUID-DEDUP-SYNC-1) ---
  findByHUID(huid: string): Promise<Item | null>;
  findByHUID(tx: DrizzleTransaction, huid: string): Item | null;

  // --- findByStatus ---
  findByStatus(firmId: string, status: StockStatus): Promise<Item[]>;
  findByStatus(tx: DrizzleTransaction, firmId: string, status: StockStatus): Item[];
  findByStatusTx(tx: DrizzleTransaction, firmId: string, status: StockStatus): Item[];

  // --- findByCategoryId (FIX-CAT-ITEM-FK v1.42) ---
  findByCategoryId(categoryId: string, firmId: string): Promise<Item[]>;
  findByCategoryId(tx: DrizzleTransaction, categoryId: string, firmId: string): Item[];

  // --- findByDesignId (RED-9 firmId required) ---
  findByDesignId(designId: string, firmId: string): Promise<Item[]>;
  findByDesignId(tx: DrizzleTransaction, designId: string, firmId: string): Item[];
  findByDesignIdTx(tx: DrizzleTransaction, designId: string, firmId: string): Item[];

  // --- findByFirmId ---
  findByFirmId(firmId: string): Promise<Item[]>;

  // --- insert ---
  insert(tx: DrizzleTransaction, data: NewItem): Item;

  // --- update ---
  update(tx: DrizzleTransaction, id: string, data: Partial<Item>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: Partial<Item>): void;

  // --- updateStatus ---
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: StockStatus): void;

  // --- updateBarcodeReprintFlag ---
  updateBarcodeReprintFlag(tx: DrizzleTransaction, itemId: string, required: boolean): void;
  updateBarcodeReprintFlag(tx: DrizzleTransaction, firmId: string, itemId: string, required: boolean): void;

  // --- updateCreatedAt & updateSkuAndDate ---
  updateCreatedAt(tx: DrizzleTransaction, itemId: string, createdAt: string): void;
  updateSkuAndDate(
    tx: DrizzleTransaction,
    itemId: string,
    fields: { sku: string; barcode: string; createdAt: string; barcodeReprintRequired: boolean }
  ): void;

  // --- delete ---
  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  // --- getAvailableStockForDesign ---
  getAvailableStockForDesign(designId: string, firmId: string): Promise<{ totalNetWeightMg: number; count: number }>;

  // --- getStockWeightSummary ---
  getStockWeightSummary(firmId: string): Promise<{
    goldNetWeightMg: number;
    goldPhantomDebtMg: number;
    goldBalanceMg: number;
    silverNetWeightMg: number;
    silverPhantomDebtMg: number;
    silverBalanceMg: number;
  }>;

  // --- search ---
  search(firmId: string, query: string): Promise<ItemSearchResult[]>;
}

export const itemRepository: ItemRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(eq(items.id, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      const res = tx.select().from(items).where(and(eq(items.id, third), eq(items.firmId, second!))).get();
      return (res as Item) || null;
    }
    const res = tx.select().from(items).where(eq(items.id, second!)).get();
    return (res as Item) || null;
  },

  findBySku(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        return db.select().from(items).where(and(eq(items.sku, second), eq(items.firmId, first))).limit(1).then(r => r[0] || null);
      }
      return db.select().from(items).where(eq(items.sku, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    const firmId = second!;
    const sku = third!;
    const res = tx.select().from(items).where(and(eq(items.sku, sku), eq(items.firmId, firmId))).get();
    return (res as Item) || null;
  },

  findByHUID(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(eq(items.huid, first)).limit(1).then(r => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    const huid = second!;
    const res = tx.select().from(items).where(eq(items.huid, huid)).get();
    return (res as Item) || null;
  },

  findByStatus(first: DrizzleTransaction | string, second: string, third?: StockStatus): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(and(eq(items.firmId, first), eq(items.status, second as StockStatus)));
    }
    const tx = first as DrizzleTransaction;
    const firmId = second;
    const status = third!;
    return tx.select().from(items).where(and(eq(items.firmId, firmId), eq(items.status, status))).all() as Item[];
  },

  findByStatusTx(tx: DrizzleTransaction, firmId: string, status: StockStatus): Item[] {
    return this.findByStatus(tx, firmId, status);
  },

  findByCategoryId(first: DrizzleTransaction | string, second: string, third?: string): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(and(eq(items.categoryId, first), eq(items.firmId, second)));
    }
    const tx = first as DrizzleTransaction;
    const categoryId = second;
    const firmId = third!;
    return tx.select().from(items).where(and(eq(items.categoryId, categoryId), eq(items.firmId, firmId))).all() as Item[];
  },

  findByDesignId(first: DrizzleTransaction | string, second: string, third?: string): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(and(eq(items.designId, first), eq(items.firmId, second)));
    }
    const tx = first as DrizzleTransaction;
    const designId = second;
    const firmId = third!;
    return tx.select().from(items).where(and(eq(items.designId, designId), eq(items.firmId, firmId))).all() as Item[];
  },

  findByDesignIdTx(tx: DrizzleTransaction, designId: string, firmId: string): Item[] {
    return this.findByDesignId(tx, designId, firmId);
  },

  async findByFirmId(firmId: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.firmId, firmId));
  },

  insert(tx: DrizzleTransaction, data: NewItem): Item {
    tx.insert(items).values(data).run();
    const result = tx.select().from(items).where(eq(items.id, data.id)).get();
    return result as Item;
  },

  update(tx: DrizzleTransaction, second: string, third: string | Partial<Item>, fourth?: Partial<Item>): void {
    if (typeof third === 'object') {
      const id = second;
      const data = third as Partial<Item>;
      tx.update(items).set(data).where(eq(items.id, id)).run();
    } else {
      const firmId = second;
      const id = third as string;
      const data = fourth!;
      tx.update(items).set(data).where(and(eq(items.id, id), eq(items.firmId, firmId))).run();
    }
  },

  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: StockStatus): void {
    tx.update(items)
      .set({ status, updatedAt: now() })
      .where(and(eq(items.id, id), eq(items.firmId, firmId)))
      .run();
  },

  updateBarcodeReprintFlag(tx: DrizzleTransaction, second: string, third: string | boolean, fourth?: boolean): void {
    if (typeof third === 'boolean') {
      const itemId = second;
      const flag = third;
      tx.update(items)
        .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
        .where(eq(items.id, itemId))
        .run();
    } else {
      const firmId = second;
      const itemId = third as string;
      const flag = fourth!;
      tx.update(items)
        .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
        .where(and(eq(items.id, itemId), eq(items.firmId, firmId)))
        .run();
    }
  },

  updateCreatedAt(tx: DrizzleTransaction, itemId: string, createdAt: string): void {
    tx.update(items).set({ createdAt, updatedAt: now() }).where(eq(items.id, itemId)).run();
  },

  updateSkuAndDate(
    tx: DrizzleTransaction,
    itemId: string,
    fields: { sku: string; barcode: string; createdAt: string; barcodeReprintRequired: boolean }
  ): void {
    tx.update(items)
      .set({
        sku: fields.sku,
        barcode: fields.barcode,
        createdAt: fields.createdAt,
        barcodeReprintRequired: fields.barcodeReprintRequired ? 1 : 0,
        updatedAt: now(),
      })
      .where(eq(items.id, itemId))
      .run();
  },

  delete(tx: DrizzleTransaction, second: string, third?: string): void {
    if (third === undefined) {
      tx.delete(items).where(eq(items.id, second)).run();
    } else {
      tx.delete(items).where(and(eq(items.id, third), eq(items.firmId, second))).run();
    }
  },

  async getAvailableStockForDesign(designId: string, firmId: string): Promise<{ totalNetWeightMg: number; count: number }> {
    const result = await db
      .select({
        totalNetWeightMg: sql<number>`SUM(${items.grossWeightMg} - COALESCE(${items.stoneWeightMg}, 0) - COALESCE(${items.beadsWeightMg}, 0))`,
        count: sql<number>`COUNT(${items.id})`
      })
      .from(items)
      .where(
        and(
          eq(items.designId, designId),
          eq(items.firmId, firmId),
          eq(items.status, 'AVAILABLE')
        )
      );
    return {
      totalNetWeightMg: Number(result[0]?.totalNetWeightMg) || 0,
      count: Number(result[0]?.count) || 0
    };
  },

  async getStockWeightSummary(firmId: string) {
    const rows = await db
      .select({
        metal: items.metal,
        availableNetWeightMg: sql<number>`SUM(CASE WHEN ${items.status} = 'AVAILABLE' THEN ${items.netWeightMg} ELSE 0 END)`,
        phantomDebtMg: sql<number>`SUM(CASE WHEN ${items.status} IN ('PHANTOM_AVAILABLE','PHANTOM_SOLD') AND ${items.phantomStockId} IS NULL THEN ${items.netWeightMg} ELSE 0 END)`
      })
      .from(items)
      .where(and(
        eq(items.firmId, firmId),
        inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE', 'PHANTOM_SOLD'])
      ))
      .groupBy(items.metal);

    const summary = {
      goldNetWeightMg: 0,
      goldPhantomDebtMg: 0,
      goldBalanceMg: 0,
      silverNetWeightMg: 0,
      silverPhantomDebtMg: 0,
      silverBalanceMg: 0,
    };

    for (const row of rows) {
      const avail = Number(row.availableNetWeightMg) || 0;
      const debt = Number(row.phantomDebtMg) || 0;
      const balance = avail - debt;

      if (row.metal === 'GOLD') {
        summary.goldNetWeightMg = avail;
        summary.goldPhantomDebtMg = debt;
        summary.goldBalanceMg = balance;
      } else if (row.metal === 'SILVER') {
        summary.silverNetWeightMg = avail;
        summary.silverPhantomDebtMg = debt;
        summary.silverBalanceMg = balance;
      }
    }

    return summary;
  },

  async search(firmId: string, query: string): Promise<ItemSearchResult[]> {
    const tokens = query.trim().split(/\s+/);
    const sizeToken = tokens.find(t => /^\d+(\.\d+)?$/.test(t));
    const textQuery = tokens.filter(t => t !== sizeToken).join(' ');
    const safeQuery = `%${textQuery}%`;

    const conditions = [
      eq(items.firmId, firmId),
      inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE']),
      or(
        like(items.sku, safeQuery),
        like(items.barcode, safeQuery),
        like(items.huid, safeQuery),
        like(designs.name, safeQuery),
        like(categories.name, safeQuery)
      )
    ];

    if (sizeToken) {
      conditions.push(eq(items.sizeValue, Number(sizeToken)));
    }

    const results = await db
      .select({
        itemId: items.id,
        sku: items.sku,
        designName: designs.name,
        categoryName: categories.name,
        metal: items.metal,
        grossWeightMg: items.grossWeightMg,
        purityPercent: items.purityPercent,
        huid: items.huid,
        status: items.status,
        location: items.location,
        barcode: items.barcode,
        netWeightMg: items.netWeightMg,
        purityKarat: items.purityKarat,
        sizeValue: items.sizeValue,
        sizeUnit: items.sizeUnit,
      })
      .from(items)
      .innerJoin(designs, eq(items.designId, designs.id))
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .where(and(...conditions))
      .limit(20); // RED-7

    return results.map(r => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as 'AVAILABLE' | 'PHANTOM_AVAILABLE',
      sizeUnit: r.sizeUnit as 'INCH'|'MM'|'CM'|'RING_SIZE'|null
    }));
  }
};