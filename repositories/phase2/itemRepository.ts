// repositories/phase2/itemRepository.ts — Phase 2 v2.34 Canonical Repository
// Aligned with SEARCH-1 (v1.13), RED-7 (LIMIT 20), FEAT-STOCK-SUMMARY-1 (v1.63),
// FEAT-PHANTOM-INVENTORY-1 (v1.67), Step P2-BACKDATE-SIZE (v1.76)

import { eq, and, sql, inArray, like, or, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { items, designs, categories } from '@/db/schema';
import type {
  DrizzleTransaction, Item, NewItem, UpdateableItemFields,
  StockStatus, ItemSearchResult, StockWeightSummary
} from '@/types/phase2/phase2.types';
import { now } from '@/utils/now';

export interface ItemRepository {
  getById(id: string): Promise<Item | null>;
  getById(firmId: string, id: string): Promise<Item | null>;
  getById(tx: DrizzleTransaction, id: string): Item | null;
  getById(tx: DrizzleTransaction, firmId: string, id: string): Item | null;
  getById(tx: DrizzleTransaction, id: string, firmId: string): Item | null;

  findBySku(firmId: string, sku: string): Promise<Item | null>;
  findBySku(tx: DrizzleTransaction, firmId: string, sku: string): Item | null;

  findByHUID(huid: string): Promise<Item | null>;
  findByHUID(tx: DrizzleTransaction, huid: string): Item | null;

  findByStatus(firmId: string, status: StockStatus): Promise<Item[]>;
  findByStatus(tx: DrizzleTransaction, firmId: string, status: StockStatus): Item[];
  findByStatusTx(tx: DrizzleTransaction, firmId: string, status: StockStatus): Item[];

  findByCategoryId(categoryId: string, firmId: string): Promise<Item[]>;
  findByCategoryId(tx: DrizzleTransaction, categoryId: string, firmId: string): Item[];

  findByDesignId(designId: string, firmId: string): Promise<Item[]>;
  findByDesignId(tx: DrizzleTransaction, designId: string, firmId: string): Item[];
  findByDesignIdTx(tx: DrizzleTransaction, designId: string, firmId: string): Item[];

  findByFirmId(firmId: string): Promise<Item[]>;

  insert(tx: DrizzleTransaction, data: NewItem): Item;

  update(tx: DrizzleTransaction, id: string, data: UpdateableItemFields | Partial<Item>): void;
  update(tx: DrizzleTransaction, firmId: string, id: string, data: UpdateableItemFields | Partial<Item>): void;

  updateStatus(tx: DrizzleTransaction, id: string, status: StockStatus): void;
  updateStatus(tx: DrizzleTransaction, firmId: string, id: string, status: StockStatus): void;

  updateBarcodeReprintFlag(tx: DrizzleTransaction, itemId: string, required: boolean): void;
  updateBarcodeReprintFlag(tx: DrizzleTransaction, firmId: string, itemId: string, required: boolean): void;

  updateCreatedAt(tx: DrizzleTransaction, itemId: string, createdAt: string): void;
  updateSkuAndDate(
    tx: DrizzleTransaction,
    itemId: string,
    fields: { sku: string; barcode: string; createdAt: string; barcodeReprintRequired: boolean }
  ): void;

  delete(tx: DrizzleTransaction, id: string): void;
  delete(tx: DrizzleTransaction, firmId: string, id: string): void;

  getAvailableStockForDesign(designId: string, firmId: string): Promise<{ totalNetWeightMg: number; count: number }>;

  getStockWeightSummary(firmId: string): Promise<StockWeightSummary>;

  search(firmId: string, query: string): Promise<ItemSearchResult[]>;
}

export const itemRepository: ItemRepository = {
  getById(
    first: DrizzleTransaction | string,
    second?: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      if (second !== undefined) {
        return db
          .select()
          .from(items)
          .where(
            or(
              and(eq(items.id, second), eq(items.firmId, first)),
              and(eq(items.id, first), eq(items.firmId, second))
            )
          )
          .limit(1)
          .then((r) => r[0] || null);
      }
      return db
        .select()
        .from(items)
        .where(eq(items.id, first))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    if (third !== undefined) {
      const res = tx
        .select()
        .from(items)
        .where(
          or(
            and(eq(items.id, third), eq(items.firmId, second!)),
            and(eq(items.id, second!), eq(items.firmId, third))
          )
        )
        .get();
      return (res as Item) || null;
    }
    const res = tx.select().from(items).where(eq(items.id, second!)).get();
    return (res as Item) || null;
  },

  findBySku(
    first: DrizzleTransaction | string,
    second: string,
    third?: string
  ): any {
    if (typeof first === 'string') {
      const firmId = first;
      const sku = second;
      return db
        .select()
        .from(items)
        .where(and(eq(items.sku, sku), eq(items.firmId, firmId)))
        .limit(1)
        .then((r) => r[0] || null);
    }
    const tx = first as DrizzleTransaction;
    const firmId = second;
    const sku = third!;
    const res = tx
      .select()
      .from(items)
      .where(and(eq(items.sku, sku), eq(items.firmId, firmId)))
      .get();
    return (res as Item) || null;
  },

  findByHUID(first: DrizzleTransaction | string, second?: string): any {
    if (typeof first === 'string') {
      return db.select().from(items).where(eq(items.huid, first)).limit(1).then((r) => r[0] || null);
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
    if (typeof third === 'object' && third !== null) {
      const id = second;
      const data = third as Partial<Item>;
      tx.update(items).set(data).where(eq(items.id, id)).run();
    } else {
      const a = second;
      const b = third as string;
      const data = fourth!;
      tx.update(items).set(data).where(
        or(
          and(eq(items.id, a), eq(items.firmId, b)),
          and(eq(items.id, b), eq(items.firmId, a))
        )
      ).run();
    }
  },

  updateStatus(tx: DrizzleTransaction, second: string, third: string | StockStatus, fourth?: StockStatus): void {
    if (fourth === undefined) {
      const id = second;
      const status = third as StockStatus;
      tx.update(items)
        .set({ status, updatedAt: now() })
        .where(eq(items.id, id))
        .run();
    } else {
      const a = second;
      const b = third as string;
      const status = fourth;
      tx.update(items)
        .set({ status, updatedAt: now() })
        .where(
          or(
            and(eq(items.id, a), eq(items.firmId, b)),
            and(eq(items.id, b), eq(items.firmId, a))
          )
        )
        .run();
    }
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
      const a = second;
      const b = third as string;
      const flag = fourth!;
      tx.update(items)
        .set({ barcodeReprintRequired: flag ? 1 : 0, updatedAt: now() })
        .where(
          or(
            and(eq(items.id, a), eq(items.firmId, b)),
            and(eq(items.id, b), eq(items.firmId, a))
          )
        )
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
      const a = second;
      const b = third;
      tx.delete(items).where(
        or(
          and(eq(items.id, a), eq(items.firmId, b)),
          and(eq(items.id, b), eq(items.firmId, a))
        )
      ).run();
    }
  },

  async getAvailableStockForDesign(designId: string, firmId: string): Promise<{ totalNetWeightMg: number; count: number }> {
    const result = await db
      .select({
        totalNetWeightMg: sql<number>`SUM(${items.netWeightMg})`,
        count: sql<number>`COUNT(${items.id})`,
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
      count: Number(result[0]?.count) || 0,
    };
  },

  // STEP 9-Lite & FEAT-PHANTOM-INVENTORY-1: Net weight of AVAILABLE stock minus unreconciled phantom debt
  async getStockWeightSummary(firmId: string) {
    const rows = await db
      .select({
        metal: items.metal,
        availableNetWeightMg: sql<number>`SUM(CASE WHEN ${items.status} = 'AVAILABLE' THEN ${items.netWeightMg} ELSE 0 END)`,
        phantomDebtMg: sql<number>`SUM(CASE WHEN ${items.status} IN ('PHANTOM_AVAILABLE','PHANTOM_SOLD') AND ${items.phantomStockId} IS NULL THEN ${items.netWeightMg} ELSE 0 END)`,
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

  // SEARCH-1 (v1.13) / RED-7 (LIMIT 20) / Step P2-BACKDATE-SIZE (v1.76)
  // Supports compound search (e.g. "Ring 7") and pure numeric scans (e.g. "0001", "7")
  async search(firmId: string, query: string): Promise<ItemSearchResult[]> {
    const trimmedQuery = query.trim();
    const tokens = trimmedQuery.split(/\s+/).filter((t) => t.length > 0);
    const sizeToken = tokens.find((t) => /^\d+(\.\d+)?$/.test(t));
    const textTokens = tokens.filter((t) => t !== sizeToken);
    const textQuery = textTokens.join(' ');

    const conditions: any[] = [
      eq(items.firmId, firmId),
      inArray(items.status, ['AVAILABLE', 'PHANTOM_AVAILABLE']),
    ];

    if (textQuery.length > 0) {
      // Compound search (e.g. "Ring 7" -> text "Ring" AND size 7)
      const safeText = `%${textQuery}%`;
      conditions.push(
        or(
          like(items.sku, safeText),
          like(items.barcode, safeText),
          like(items.huid, safeText),
          like(designs.name, safeText),
          like(categories.name, safeText)
        )
      );

      if (sizeToken) {
        conditions.push(eq(items.sizeValue, Number(sizeToken)));
      }
    } else if (sizeToken) {
      // Pure numeric query (e.g. barcode scan "0001" or ring size "7")
      // Simultaneously matches barcode, SKU, HUID, design name, OR exact numeric size
      const safeToken = `%${sizeToken}%`;
      conditions.push(
        or(
          like(items.sku, safeToken),
          like(items.barcode, safeToken),
          like(items.huid, safeToken),
          like(designs.name, safeToken),
          eq(items.sizeValue, Number(sizeToken))
        )
      );
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
      .innerJoin(designs, and(eq(items.designId, designs.id), eq(designs.firmId, items.firmId)))
      .innerJoin(categories, and(eq(items.categoryId, categories.id), eq(categories.firmId, items.firmId)))
      .where(and(...conditions))
      .orderBy(asc(designs.name), asc(items.sku))
      .limit(20); // RED-7

    return results.map((r) => ({
      ...r,
      metal: r.metal as 'GOLD' | 'SILVER',
      status: r.status as 'AVAILABLE' | 'PHANTOM_AVAILABLE',
      sizeUnit: r.sizeUnit as 'INCH' | 'MM' | 'CM' | 'RING_SIZE' | null,
    }));
  },
};