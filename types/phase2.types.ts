// types/phase2.types.ts
// Phase 2 canonical type definitions — aligned with Phase 2 v1.73

import { db } from '../db/client';
import {
  items, categories, designs, oldGoldLots, financialYears,
  sequenceCounters, itemEvents, stones, gemstoneLots, hsnCodes, urdPurchases
} from '../db/schema';

// P4-FIX-1 (v1.9): SENT_TO_MELT added
export type StockStatus = 'DRAFT' | 'AVAILABLE' | 'SOLD' | 'SENT_TO_KARIGAR' |
'SENT_TO_REFINERY' | 'MELTED' | 'DAMAGED' | 'RETURNED' | 'SENT_TO_MELT' | 'PHANTOM_AVAILABLE' |
'PHANTOM_SOLD'; // FEAT-PHANTOM-INVENTORY-1 (v1.67): phantom item statuses

// ALLOWED STATE TRANSITIONS — enforced in updateItemStatus()
// Phantom states managed exclusively via createPhantomItem() + reconcilePhantomItem()
export const ALLOWED_TRANSITIONS: Record<StockStatus, StockStatus[]> = {
  DRAFT:             ['AVAILABLE', 'DAMAGED'],
  AVAILABLE:         ['SOLD', 'SENT_TO_REFINERY', 'DAMAGED'],
  SOLD:              [], // Terminal in Phase 2
  SENT_TO_REFINERY:  ['MELTED', 'SENT_TO_MELT'],
  SENT_TO_MELT:      ['MELTED'],
  MELTED:            [], // Terminal
  DAMAGED:           ['SENT_TO_KARIGAR', 'RETURNED'],
  RETURNED:          ['AVAILABLE'],
  SENT_TO_KARIGAR:   ['AVAILABLE', 'SENT_TO_REFINERY', 'DAMAGED'],
  PHANTOM_AVAILABLE: [], // managed by createPhantomItem/reconcilePhantomItem only
  PHANTOM_SOLD:      [], // managed by reconcilePhantomItem only
};

export const TERMINAL_ITEM_STATUSES = ['SOLD', 'MELTED', 'RETURNED', 'PHANTOM_SOLD'];

// GEMSTONE-1 (v1.21): State machine for Gemstone Lots
export const GEMSTONE_LOT_TRANSITIONS: Record<GemstoneStatus, GemstoneStatus[]> = {
  AVAILABLE: ['SOLD', 'DAMAGED'],
  SOLD: [], // Terminal in Phase 2
  DAMAGED: [], // Terminal
};

// P4-FIX-1b (v1.10) + ALIGN-FIX-2 (v1.11)
export type OldGoldLotStatus = 'RECEIVED' | 'PENDING' |
'SENT_TO_REFINERY' | 'SETTLED' | 'SENT_TO_MELT' | 'ISSUED_TO_KARIGAR';

// Kept for backward compatibility with existing usages of OldGoldStatus
export type OldGoldStatus = OldGoldLotStatus;

export type FYStatus = 'ACTIVE' | 'CLOSED';
export type Metal = 'GOLD' | 'SILVER';
export type GemstoneStatus = 'AVAILABLE' | 'SOLD' | 'DAMAGED'; // GEMSTONE-1 v1.21

export type URDPurchaseStatus = 'DRAFT' | 'CONFIRMED';
export type URDMetalType = 'GOLD' | 'SILVER';

// P4-FIX-2 (v1.9) + ALIGN-FIX-1 (v1.11) + FIX-MS-1 (v1.19)
export type MetalSource =
 | 'CUSTOMER' // legacy + default
 | 'KARIGAR'
 | 'EXCHANGE'
 | 'PURCHASE'
 | 'MELT_OUTPUT' // Phase 4 melt batch output lots
 | 'CUSTOMER_OLD_GOLD' // ALIGN-FIX-1 v1.11
 | 'SUPPLIER_PURCHASE' // ALIGN-FIX-1 v1.11 — default for new items
 | 'REFINERY_OUTPUT' // ALIGN-FIX-1 v1.11
 | 'JOB_WORK_RETURN' // FIX-MS-1 v1.19
 | 'OPENING_BALANCE'; // FIX-MS-1 v1.19 — set by opening balance flow only

export type ItemEventType = 'CREATED' | 'ITEM_STATUS_CHANGED' | 
 'WEIGHT_ADJUSTED' | 'HUID_ADDED' | 'BARCODE_REPRINTED' | 'ITEM_RETURNED' |
 'ITEM_SENT_TO_KARIGAR' | 'ITEM_RETURNED_FROM_KARIGAR' | 'ITEM_EDITED' | 'PHANTOM_CREATED' |
'PHANTOM_RECONCILED' | 'SKU_CHANGED' | 'ITEM_ENTRY_DATE_CORRECTED' | 'HUID_CORRECTED' |
'METAL_SOURCE_CORRECTED';

// FIX-IMM-1 (v1.23): Restricted update type — excludes WRITE-ONCE fields
export type UpdateableItemFields = Omit<
  Partial<Item>,
  'metalSource' | 'sku' | 'barcode' | 'id' | 'firmId' | 'createdAt'
>;

export interface CreateItemInput {
  designId: string;
  categoryId: string; // FIX-CAT-ITEM-FK (v1.42): items own their category
  grossWeightMg: number; // MUST be > 0 (validated in createItem)
  stoneWeightMg?: number; // default 0
  beadsWeightMg?: number; // default 0
  purityPercent: number; // MUST be > 0 and <= 100 (validated in createItem)
  purityKarat: number; // resolved via percentToKarat() at intake
  wastagePercent?: number; // default 0 — cost attribute only, NOT in fine calc
  purchaseRatePaise?: number | null;
  primaryStoneId?: string | null;
  metalSource?: MetalSource; // default 'SUPPLIER_PURCHASE' — WRITE-ONCE after creation
  hsnCode: string; // FIX-HSN-ITEM-1 (v1.44): MANDATORY
  makingChargePaise?: number | null; // FIX-COST-1
  stoneCostPaise?: number | null; // FIX-COST-2
  location?: string | null; // FIX-LOC-1
  huid?: string | null; // ADDED: FIX-HUID-FORMAT-1 (v1.44)
  sizeValue?: number | null;
  sizeUnit?: 'INCH'|'MM'|'CM'|'RING_SIZE' | null;
}

export interface BulkItemInput extends Omit<CreateItemInput, 'huid'> { clientRef?: string; }

export interface CreateOldGoldLotInput {
  receivedFrom: string;
  receivedDate: string; // ISO date YYYY-MM-DD
  grossWeightMg: number;
  purityPercent: number;
  metalSource?: MetalSource; // defaults to 'CUSTOMER'
  customerId?: string | null; // FIX-OLDGOLD-CUSTOMER-1 (v1.49): nullable FK -> customers.id.
  purchaseRatePaise?: number; // FIX-OLDGOLD-COST-1 (v1.51): paise per gram.
  notes?: string | null;
}

// GEMSTONE-1 (v1.21)
export interface CreateGemstoneLotInput {
  stoneId: string; // FK -> stones.id
  name: string; // e.g. 'Round Diamond 0.50ct'
  weightCaratX100: number; // carats x 100, MUST be > 0
  quantity?: number; // default 1, MUST be > 0
  purchaseRatePaisePerCarat?: number | null;
  totalPurchaseAmountPaise?: number | null;
  supplierName?: string | null;
  certificationRef?: string | null;
  notes?: string | null;
}

export interface CreateStoneInput {
  name: string;
  type: 'DIAMOND' | 'RUBY' | 'EMERALD' | 'SAPPHIRE';
}

export type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface VerifyIssue {
  code: string; 
  severity: 'CRITICAL' | 'WARNING' | 'INFO'; 
  message: string;
}

// Entity types (inferred from Drizzle schemas)
export type Item = typeof items.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Design = typeof designs.$inferSelect;
export type Stone = typeof stones.$inferSelect;
export type OldGoldLot = typeof oldGoldLots.$inferSelect;
export type URDPurchase = typeof urdPurchases.$inferSelect;

export interface CreateURDPurchaseInput {
  purchaseDate: string; // ISO date YYYY-MM-DD
  customerId?: string | null; // optional FK -> customers.id
  customerName: string; // NOT NULL — required for bill
  customerAddress?: string | null;
  customerMobile?: string | null;
  customerAadhaar?: string | null; // OPTIONAL
  customerPAN?: string | null; // OPTIONAL
  metalType: URDMetalType;
  grossWeightMg: number; // must be > 0
  purityPercent: number; // must be > 0 and <= 100
  ratePerGramPaise: number; // must be > 0
  paymentMode: 'CASH' | 'BANK' | 'UPI';
  bankAccountId?: string | null; // required if BANK or UPI
  notes?: string | null;
}

export const VALID_LOT_TRANSITIONS: Record<OldGoldLotStatus, OldGoldLotStatus[]> = {
  RECEIVED: ['PENDING', 'SENT_TO_MELT', 'ISSUED_TO_KARIGAR'],
  PENDING: ['SENT_TO_REFINERY', 'RECEIVED'],
  SENT_TO_REFINERY: ['SETTLED'],
  SENT_TO_MELT: [],
  ISSUED_TO_KARIGAR: ['RECEIVED'],
  SETTLED: [],
};

export type FinancialYear = typeof financialYears.$inferSelect;
export type SequenceCounter = typeof sequenceCounters.$inferSelect;

// SequenceCounterType — compile-time guard for all sequence counter type strings.
export type SequenceCounterType = 'URD'; // GAP-I1 (v1.73): Phase 2 OWNS 'URD' ONLY.

export type ItemEvent = typeof itemEvents.$inferSelect;
export type GemstoneLot = typeof gemstoneLots.$inferSelect; // GEMSTONE-1 v1.21
export type HsnCode = typeof hsnCodes.$inferSelect; // FIX-HSN-MASTER-1 (v1.46)

// SEARCH-1 (v1.13): Item-level search result
export type ItemSearchResult = {
  itemId: string; sku: string; designName: string; categoryName: string;
  metal: 'GOLD' | 'SILVER'; grossWeightMg: number; purityPercent: number;
  huid: string | null; status: StockStatus; 
  barcode: string; netWeightMg: number; purityKarat: number; location: string | null;
}

// SEARCH-1 (v1.13) + BLOCK-5 (v1.15): Design-level aggregated stock
export type DesignStockResult = {
  designId: string; designName: string; categoryName: string;
  metal: 'GOLD' | 'SILVER'; purityPercent: number; // from items grouping
  totalGrossWeightMg: number; availableCount: number;
}

// Weight display rule (RULE-1A-WEIGHT-DISPLAY v1.54) — CONSTITUTIONAL
// jewellery: (mg / 1000).toFixed(3) + ' g'
// gemstone:  (weightCaratX100 / 100).toFixed(2) + ' ct'

// Currency display rule (CURRENCY-DISPLAY-RULE v1.54):
// getCurrencySymbol() + (paise / 100).toFixed(2)

// Types for drill-down screens (FEAT-DRILL-DOWN-1 v1.65)
export type ItemDetail = {
  // Identity
  id: string;
  sku: string;
  barcode: string;
  huid: string | null;
  // Design & Category
  designId: string;
  designName: string;
  categoryId: string;
  categoryName: string;
  // Metal
  metal: 'GOLD' | 'SILVER';
  purityPercent: number;
  purityKarat: number;
  // Weights — all in mg. Display via RULE-1A-WEIGHT-DISPLAY (v1.54)
  grossWeightMg: number;
  stoneWeightMg: number;
  beadsWeightMg: number;
  netWeightMg: number;
  fineWeightMg: number;
  wastagePercent: number;
  fineGoldChargedMg: number | null; // <--- FIX: ADDED HERE!
  sizeValue: number | null;
  sizeUnit: 'INCH'|'MM'|'CM'|'RING_SIZE' | null;
  // Status & Location
  status: StockStatus;
  location: string | null; // SHOP | LOCKER | KARIGAR | REFINERY | TRANSIT | null
  metalSource: string;
  hsnCode: string;
  // Cost fields — display only. Phase 7 WAC reads these.
  purchaseRatePaise: number | null;
  makingChargePaise: number | null;
  stoneCostPaise: number | null;
  // DORMANT until Phase 3 postInvoice() writes it. Always null in Phase 2.
  invoiceId: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  // Timeline — ordered ASC by timestamp (oldest first)
  timeline: ItemTimelineEvent[];
};

export type ItemTimelineEvent = {
  id: string;
  eventType: ItemEventType;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  timestamp: string; // ISO string. Display as DD MMM YYYY + HH:MM AM/PM
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  performedBy: string; // deviceId
  karigarName?: string; // ITEM_SENT_TO_KARIGAR + ITEM_RETURNED_FROM_KARIGAR
  outcome?: string; // ITEM_RETURNED_FROM_KARIGAR outcome value
  changes?: Record<string, { old: unknown; new: unknown }>; // ITEM_EDITED sparse map
};

export type DesignCategoryStockResult = {
  designId: string;
  designName: string;
  metal: 'GOLD' | 'SILVER';
  purityPercent: number;
  purityKarat: number;
  availableCount: number;
  totalNetWeightMg: number;
};

// Phantom inventory types (FEAT-PHANTOM-INVENTORY-1 v1.67)
export type CreatePhantomItemInput = {
  designId: string;
  categoryId: string;
  hsnCode: string;
  grossWeightMg: number;
  stoneWeightMg?: number;
  beadsWeightMg?: number;
  purityPercent: number;
  purityKarat: number;
  primaryStoneId?: string | null;
  location?: string | null;
};

// Karigar issued items (FEAT-GAP6-KARIGAR-SUMMARY-1 v1.66)
export type KarigarIssuedItem = {
id: string; sku: string; barcode: string;
designName: string;
metal: 'GOLD' | 'SILVER'; purityPercent: number; purityKarat: number;
grossWeightMg: number; netWeightMg: number;
karigarName: string | null; // extracted from audit_logs payload JSON
updatedAt: string; // ISO string — when item was sent to karigar
};

// Stock weight summary (FEAT-STOCK-SUMMARY-1 v1.63 + FEAT-PHANTOM-INVENTORY-1 v1.67)
export interface StockWeightSummary {
  goldNetWeightMg: number;
  silverNetWeightMg: number;
  goldPhantomDebtMg: number;     // v1.67: unreconciled phantom debt
  goldBalanceMg: number;         // goldNetWeightMg - goldPhantomDebtMg
  silverPhantomDebtMg: number;
  silverBalanceMg: number;
}

// Metal source breakdown (FEAT-GAP4-METALSOURCE-1 v1.66)
export type MetalSourceStockResult = {
  metalSource: string; // e.g. 'PURCHASE' | 'KARIGAR' | 'CUSTOMER_OLD_GOLD' etc.
  metal: 'GOLD' | 'SILVER';
  totalNetWeightMg: number; // display: (totalNetWeightMg / 1000).toFixed(3) + ' g'
  itemCount: number;
};

// Barcode label (FEAT-BARCODE-LABEL-1 v1.66)
export type BarcodeLabel = {
  frontSide: {
    designName: string; // designs.name — display as item name
    purityDisplay: string; // getDisplayPurity(purityPercent, purityKarat, metal)
    grossWeightDisplay: string; // (grossWeightMg / 1000).toFixed(3) + ' g'
    netWeightDisplay: string; // (netWeightMg / 1000).toFixed(3) + ' g'
  };
  backSide: {
    firmCode: string; // firms.firmCode — read-only from Phase 1
    barcodeValue: string; // items.barcode (= items.sku) — raw, used for barcode encoding
    skuDisplay: string; // formatSKUDisplay(items.sku) — human-readable text below barcode
  };
};

export type UpdateableItemDraftFields = Partial<{
  purityPercent: number; // re-assay correction
  purityKarat: number; // display karat correction
  primaryStoneId: string | null;
  location: string | null; // SHOP|LOCKER|KARIGAR|REFINERY|TRANSIT
  makingChargePaise: number | null;
  stoneCostPaise: number | null;
  purchaseRatePaise: number | null;
  sizeValue: number | null; // GAP-P2-SIZE-EDIT-1 (v1.78): now editable, pairing-guarded
  sizeUnit: 'INCH'|'MM'|'CM'|'RING_SIZE' | null; // GAP-P2-SIZE-EDIT-1 (v1.78): now editable, pairing-guarded
}>;

// Low stock (FEAT-GAP3-LOWSTOCK-1 v1.66)
export interface LowStockCategory {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  lowStockThreshold: number;
}

export type Phase2AuditPayload =
 | { eventType: 'CATEGORY_UPDATED'; payload: { categoryId: string; oldName: string; newName: string } }
 | { eventType: 'CATEGORY_SOFT_DELETED'; payload: { categoryId: string; name: string } }
 | { eventType: 'DESIGN_UPDATED'; payload: { designId: string; changes: Record<string, unknown> } }
 | { eventType: 'DESIGN_SOFT_DELETED'; payload: { designId: string; name: string } }
 | { eventType: 'STONE_CREATED'; payload: { name: string; type: string } }
 | { eventType: 'GEMSTONE_LOT_CREATED'; payload: { lotId: string; stoneId: string; name: string; weightCaratX100: number; quantity: number; purchaseRatePaisePerCarat: number; totalPurchaseAmountPaise: number } }
 | { eventType: 'GEMSTONE_LOT_STATUS_CHANGED'; payload: { lotId: string; oldStatus: string; newStatus: string; reason: string | null } }
 | { eventType: 'ITEM_CREATED'; payload: { sku: string; designId: string; categoryId: string; netWeightMg: number; fineWeightMg: number; purityRoundingDeltaMg: number; wastagePercent: number; fineGoldChargedMg: number | null; purchaseRatePaise: number | null; purityPercent: number; makingChargePaise: number | null; stoneCostPaise: number | null; location: string | null; metalSource: string; hsnCode: string; huid?: string | null; sizeValue?: number | null; sizeUnit?: string | null; } }
 | { eventType: 'ITEM_EDITED'; payload: { itemId: string; sku: string; changes: Record<string, { old: unknown; new: unknown }>; reason: string | null } }
 | { eventType: 'ITEM_STATUS_CHANGED'; payload: { itemId: string; oldStatus: string; newStatus: string; sku: string } }
 | { eventType: 'ITEM_SENT_TO_KARIGAR'; payload: { itemId: string; sku: string; karigarName: string; reason: string; priorKarigarCount: number } }
 | { eventType: 'ITEM_RETURNED_FROM_KARIGAR'; payload: { itemId: string; sku: string; outcome: string; nextStatus: string; karigarName: string; reason: string | null } }
 | { eventType: 'DRAFT_ITEM_DISCARDED'; payload: { sku: string; designId: string } }
 | { eventType: 'WEIGHT_ADJUSTED'; payload: { itemId: string; sku: string; oldGrossWeightMg: number; newGrossWeightMg: number; newNetWeightMg: number; newFineWeightMg: number; newPurityRoundingDeltaMg: number; newFineGoldChargedMg: number; reason: string } }
 | { eventType: 'BARCODE_REPRINTED'; payload: { itemId: string; sku: string } }
 | { eventType: 'PHANTOM_ITEM_CREATED'; payload: { sku: string; designId: string; categoryId: string; netWeightMg: number; fineWeightMg: number; purityPercent: number; hsnCode: string; reason: string } }
 | { eventType: 'PHANTOM_RECONCILED'; payload: { phantomItemId: string; phantomSku: string; realItemId: string; realItemSku: string; netWeightMg: number; fineWeightMg: number } }
 | { eventType: 'OLD_GOLD_LOT_CREATED'; payload: { lotId: string; grossWeightMg: number; purityPercent: number; metalSource: string; receivedFrom: string; receivedDate: string; fineWeightMg: number; purityRoundingDeltaMg: number; purchaseRatePaise: number | null; totalAmountPaise: number | null } }
 | { eventType: 'OLD_GOLD_LOT_STATUS_CHANGED'; payload: { lotId: string; oldStatus: string; newStatus: string; reason: string | null } }
 | { eventType: 'URD_PURCHASE_CREATED'; payload: { urdId: string; lotId: string; customerName: string; customerId: string | null; grossWeightMg: number; purityPercent: number; fineWeightMg: number; totalValuePaise: number } }
 | { eventType: 'URD_PURCHASE_CONFIRMED'; payload: { urdId: string; urdNumber: string; totalValuePaise: number } }
 | { eventType: 'FY_CLOSED'; payload: { fyId: string; closedAt: string } }
 | { eventType: 'FY_CLOSE_FINE_BALANCE'; payload: { fyId: string; closedAt: string; fineBalanceComponents: { karigarOutstandingFineMg: number; refineryOutstandingFineMg: number; openGoldLotFineMg: number; totalOpeningFineMg: number } } }
 | { eventType: 'FY_ARCHIVE_INDEXED'; payload: { fyId: string; fyLabel: string; rowCount: number } }
 | { eventType: 'ITEM_DELETED'; payload: { itemId: string; sku: string; designId: string; priorStatus: string; reason: string } }
 | { eventType: 'METAL_SOURCE_CORRECTED'; payload: { itemId: string; sku: string; oldMetalSource: string; newMetalSource: string; reason: string } }
 | { eventType: 'HUID_CORRECTED'; payload: { itemId: string; sku: string; oldHuid: string; newHuid: string; reason: string } };