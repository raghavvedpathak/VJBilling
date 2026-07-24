# VJ Billing — Phase 2 Inventory Truth & Stock Control Master Summary

**Project:** VJ Billing (Indian Jewellery GST Billing & Inventory Management System)  
**Target Platform:** Android (Offline-First, Expo SQLite JSI, Drizzle ORM, MMKV)  
**Phase 2 Status:** IN PROGRESS / VERIFIED FOUNDATION (36/36 Phase 2 Inventory Integration Tests Passing, 0 TypeScript Errors)  
**Role:** Project Leader, Lead Architect, Lead Developer & Lead Tester  

---

## 1. Executive Summary & Domain Isolation Contract

### Architect's Opinion & Inventory Truth Charter:
Phase 2 establishes the **PHYSICAL INVENTORY TRUTH** of the VJ Billing system. It owns all physical stock items, metal purities, jewellery designs, gemstone lots, old gold buybacks, and URD purchases.

1. **Strict Phase Isolation**: Phase 2 produces Inventory Truth; Phase 3 consumes that truth for Money. Phase 3 & 4 must NOT write raw Drizzle queries against Phase 2 tables except for the two registered exceptions (`postInvoice()` read & `restoreItemFromSale()` write).
2. **Dual Guard Write Governance**: Every Phase 2 mutation method (`createItem`, `updateItem`, `adjustWeight`, `createDesign`, `createCategory`, `createOldGoldLot`, `createURDPurchase`) begins with `await leaseService.assertNoActiveLease()` and `safeModeService.assertNotInSafeMode()`.
3. **Weight & Purity Math Integrity**: All weights stored in integer milligrams (`mg`). All carat weights stored as `caratX100` (integer). Purity rounding for regular 99.50/99.9/99.99 Gold & 99.9 Silver regular stock and MELT_OUTPUT lots stores exact physical gaps in `purityRoundingDeltaMg`.
4. **Terminal Status Locking**: `adjustWeight()` and weight updates are permanently locked for terminal statuses (`SOLD`, `MELTED`, `RETURNED`, `PHANTOM_SOLD`).

---

## 2. Complete Phase 2 Step Breakdown (Steps 0 – 12)

### STEP 0 — Constitutional Boundaries & 10 Red Lines
- **RED-1**: `metalSource` is WRITE-ONCE and omitted from `UpdateableItemFields`.
- **RED-2 (v1.77)**: Weight edits locked for terminal statuses (`['SOLD', 'MELTED', 'RETURNED', 'PHANTOM_SOLD']`).
- **RED-3**: Phase 3 direct status mutation restricted to registered exceptions only.
- **RED-4**: `netWeightMg` & `fineWeightMg` columns are mandatory and preserved.
- **RED-5 (v1.90/v1.91)**: Trade-convention purity rounding via `resolveFineWeightMg()` preserves gap in `purityRoundingDeltaMg`.
- **RED-6**: ZERO floats in weight/money storage. Milligram integers + `Math.round()`.
- **RED-7**: `LIMIT 20` search pagination cap enforced on all search queries.
- **RED-8**: `closeFY()` requires `'CLOSE_FY'` writer lease.
- **RED-9**: `firmId` mandatory parameter on all repository methods (`WHERE firm_id = ?`).
- **RED-10**: `fineGoldChargedMg` is a COST attribute only. Metal balance always uses `fineWeightMg`.

### STEP 1 — Category Master & Code Generator
- **Table:** `categories` (`id`, `firm_id`, `name`, `metal`, `code`, `is_active`, `low_stock_threshold`).
- **Code Generator:** Sequential display code `CAT0001`, `CAT0002` per firm.

### STEP 2 — Design Master & Metal Scoping
- **Table:** `designs` (`id`, `name`, `code`, `metal`, `default_hsn`, `firm_id`, `is_active`).
- **Constraint:** Composite unique index `uniqueDesign(name, metal, firmId)`. Display code `DES0001`.

### STEP 3 — Stone Master & Gemstone Lot Inventory
- **Tables:** `stones` (master types: `DIAMOND`, `RUBY`, `EMERALD`, `SAPPHIRE`) and `gemstone_lots` (`weight_carat_x100`, `quantity`, `purchase_rate_paise_per_carat`, `certification_ref`, `status`).
- **State Machine:** Gemstone lot transitions: `AVAILABLE` → `SOLD` / `DAMAGED`.

### STEP 4 — HSN Code Master
- **Table:** `hsn_codes` (`code`, `description`, `chapter`).
- **Standard Jewellery HSN:** `7113` (Gold/Silver Jewellery with or without stones).

### STEP 5 — Item SKU & Barcode Generation Engine
- **Table:** `sequence_counters` (`id`, `firm_id`, `month`, `year`, `current_seq`).
- **Dual Scope Sequences:** SKU items use month-scoped counter `{firmId}_{MMYY}`; document sequences use FY-scoped counter `{firmId}_{type}_{fyLabel}`.

### STEP 6 — Item Creation & Weight Adjustment Engine
- **Net & Fine Formulas:**
  - `netWeightMg = grossWeightMg - stoneWeightMg - beadsWeightMg`
  - `fineWeightMg = resolveFineWeightMg(netWeightMg, purityPercent, metal).fineWeightMg`
  - `fineGoldChargedMg = Math.round(fineWeightMg * (1 + wastagePercent / 100))` (Cost only)
- **Weight Adjustment:** `adjustWeight()` checks terminal status lock (`ITEM_EDIT_LOCKED_TERMINAL_STATUS`), updates weights, and logs `WEIGHT_ADJUSTED` audit event.

### STEP 7 — HUID Management & Barcode Reprints
- **HUID:** 6-character alphanumeric hallmark identifier (`huid`). Unique index `idx_items_huid`.
- **Audit:** `addHuid()` logs `HUID_ADDED` item event; `reprintBarcode()` sets `barcodeReprintRequired = 1` and logs `BARCODE_REPRINTED`.

### STEP 8 — Item Status Transitions & State Machine
- **State Machine (`ALLOWED_TRANSITIONS`):**
  - `DRAFT` → `AVAILABLE`, `DAMAGED`
  - `AVAILABLE` → `SOLD`, `SENT_TO_REFINERY`, `DAMAGED`
  - `SENT_TO_REFINERY` → `MELTED`, `SENT_TO_MELT`
  - `SENT_TO_MELT` → `MELTED`
  - `DAMAGED` → `SENT_TO_KARIGAR`, `RETURNED`
  - `RETURNED` → `AVAILABLE`
  - `SENT_TO_KARIGAR` → `AVAILABLE`, `SENT_TO_REFINERY`, `DAMAGED`

### STEP 9 — Item Events Append-Only Audit Trail
- **Table:** `item_events` (`id`, `item_id`, `firm_id`, `event_type`, `severity`, `performed_by`, `reason`, `old_value`, `new_value`, `timestamp`).
- **Immutability:** Append-only history of every item lifecycle transition.

### STEP 10 — Phantom Inventory System
- **Statuses:** `PHANTOM_AVAILABLE`, `PHANTOM_SOLD`.
- **Purpose:** Manages unbarcoded or legacy stock items gracefully during transition or invoice creation. `createPhantomItem()` and `reconcilePhantomItem()` control lifecycle.

### STEP 11 — Old Gold Lot Management & Refinery Intake
- **Table:** `old_gold_lots` (`id`, `firm_id`, `received_from`, `received_date`, `gross_weight_mg`, `purity_percent`, `metal_source`, `status`, `fine_weight_mg`, `purity_rounding_delta_mg`, `total_amount_paise`).
- **Sources:** `CUSTOMER`, `KARIGAR`, `EXCHANGE`, `PURCHASE`, `MELT_OUTPUT`. `MELT_OUTPUT` lots receive trade purity rounding.

### STEP 12 — URD Purchase System
- **Table:** `urd_purchases` (`id`, `firm_id`, `fy_id`, `urd_number`, `purchase_date`, `customer_name`, `gross_weight_mg`, `purity_percent`, `rate_per_gram_paise`, `total_value_paise`, `old_gold_lot_id`, `status`).
- **Flow:** Creates standalone purchase record from unregistered customer and automatically seeds linked `old_gold_lots` record.

---

## 3. Verification & Compliance Matrix

| Audit Check | Target / Command | Result |
| :--- | :--- | :--- |
| **TypeScript Compiler** | `npx tsc --noEmit` | **0 Errors (Passed)** |
| **Phase 2 Integration Test Suite** | `npm test -- -t "Phase 2"` | **36 / 36 Tests Passed (100%)** |
| **Phase 1 & 2 Master Suite** | `npm test` | **95 / 95 Tests Passed (100%)** |

---

**Summary:** Phase 2 Inventory Truth schema, repositories, services, types, and test suites are fully defined, compliant, and verified.
