// types/phase2.types.ts
// Phase 2 canonical type definitions — aligned with Phase 2 v1.73

export type Metal = 'GOLD' | 'SILVER';
export type MetalSource = 'PURCHASE' | 'OLD_GOLD' | 'KARIGAR_RETURN' | 'RECEIVED';

// StockStatus enum — includes phantom states (FEAT-PHANTOM-INVENTORY-1 v1.67)
export type StockStatus =
  | 'DRAFT'
  | 'AVAILABLE'
  | 'SOLD'
  | 'DAMAGED'
  | 'SENT_TO_KARIGAR'
  | 'RETURNED'          // from sale (restoreItemFromSale)
  | 'DISCARDED'
  | 'PHANTOM_AVAILABLE' // v1.67: billed but not yet in inventory
  | 'PHANTOM_SOLD';     // v1.67: phantom item billed via Phase 3 invoice

// ALLOWED STATE TRANSITIONS — enforced in updateItemStatus()
// Phantom states managed exclusively via createPhantomItem() + reconcilePhantomItem()
export const ALLOWED_TRANSITIONS: Record<StockStatus, StockStatus[]> = {
  DRAFT:             ['AVAILABLE', 'DISCARDED'],
  AVAILABLE:         ['SOLD', 'DAMAGED', 'DISCARDED'],  // NOT SENT_TO_KARIGAR (v1.71 clarification)
  SOLD:              ['RETURNED'],
  DAMAGED:           ['SENT_TO_KARIGAR', 'DISCARDED'],
  SENT_TO_KARIGAR:   ['AVAILABLE'],                     // back from karigar repair
  RETURNED:          [],                                // terminal
  DISCARDED:         [],                                // terminal
  PHANTOM_AVAILABLE: [],                                // managed by createPhantomItem/reconcilePhantomItem only
  PHANTOM_SOLD:      [],                                // managed by reconcilePhantomItem only
};

export type ItemEventType =
  | 'ITEM_CREATED'
  | 'ITEM_EDITED'
  | 'STATUS_CHANGED'
  | 'WEIGHT_ADJUSTED'
  | 'ITEM_SENT_TO_KARIGAR'
  | 'ITEM_RETURNED_FROM_KARIGAR'
  | 'BARCODE_REPRINTED'
  | 'PHANTOM_CREATED'    // v1.67
  | 'PHANTOM_RECONCILED' // v1.67

export type OldGoldStatus = 'RECEIVED' | 'PENDING' | 'SENT_TO_REFINERY' | 'REFINED';

export type URDStatus = 'DRAFT' | 'CONFIRMED';

export type SequenceCounterType = 'URD'; // Phase 3 reserves 'SALE' | 'CREDIT_NOTE'

// Weight display rule (RULE-1A-WEIGHT-DISPLAY v1.54) — CONSTITUTIONAL
// jewellery: (mg / 1000).toFixed(3) + ' g'
// gemstone:  (weightCaratX100 / 100).toFixed(2) + ' ct'
// NO component in any phase may use a different decimal count or skip the unit suffix.

// Currency display rule (CURRENCY-DISPLAY-RULE v1.54):
// getCurrencySymbol() + (paise / 100).toFixed(2)

// Types for drill-down screens (FEAT-DRILL-DOWN-1 v1.65)
export interface ItemDetail {
  item: Item;
  timeline: ItemTimelineEvent[];
  invoiceId: string | null; // Phase 3 Touch-Point — null in Phase 2
}

export interface ItemTimelineEvent {
  eventType: ItemEventType;
  createdAt: string;
  payload: string | null;
  karigarName?: string;
  karigarOutcome?: string;
}

export interface DesignCategoryStockResult {
  designId: string;
  designName: string;
  categoryId: string;
  categoryName: string;
  metal: Metal;
  purityPercent: number;
  availableCount: number;
  totalNetWeightMg: number;
}

// Phantom inventory types (FEAT-PHANTOM-INVENTORY-1 v1.67)
export interface CreatePhantomItemInput {
  firmId: string;
  designId: string;
  categoryId: string;
  metal: Metal;
  purityPercent: number;
  grossWeightMg: number;
  netWeightMg: number;
  stoneWeightMg?: number;
  location?: string;
}

// Karigar issued items (FEAT-GAP6-KARIGAR-SUMMARY-1 v1.66)
export interface KarigarIssuedItem {
  itemId: string;
  sku: string;
  designName: string;
  metal: Metal;
  purityPercent: number;
  netWeightMg: number;
  issuedAt: string;
  karigarName: string | null;
}

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
export interface MetalSourceStockResult {
  metal: Metal;
  metalSource: MetalSource;
  totalNetWeightMg: number;
  availableCount: number;
}

// Barcode label (FEAT-BARCODE-LABEL-1 v1.66)
export interface BarcodeLabel {
  sku: string;
  barcodeValue: string;
  designName: string;
  purityDisplay: string;
  grossWeightG: string;  // formatted per RULE-1A
  netWeightG: string;    // formatted per RULE-1A
  firmCode: string;
}

// Low stock (FEAT-GAP3-LOWSTOCK-1 v1.66)
export interface LowStockCategory {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  lowStockThreshold: number;
}

// Placeholder — actual Item type comes from schema inference
export type Item = any; // replaced by typeof items.$inferSelect once schema exists