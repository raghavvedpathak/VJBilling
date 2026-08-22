// tests/phase2_compile_checks.test.ts
// Phase 2 v2.15 Compile-Time Type Safety & Immutability Proofs

import { itemService } from '@/services/phase2/itemService';

// TEST 5: Weight Immutability, metalSource & metal Immutability (TypeScript static analysis proofs)
// FIX-IMM-1 (v1.23) & FIX-IMM-2 (v1.95)
// This file is tested by running `npx tsc --noEmit` and via Jest.

describe('Compile-Time Checks', () => {
  it('prevents mutation of immutable fields', () => {
    // We wrap this in a function that is never called at runtime,
    // so we don't get TypeError: tx.update is not a function.
    // The TypeScript compiler still verifies this.
    function compileCheckOnly() {
      // @ts-expect-error: metalSource is WRITE-ONCE and excluded from UpdateableItemDraftFields
      itemService.updateItem('item_1', 'FIRM', { metalSource: 'KARIGAR' });
      
      // @ts-expect-error: metal is WRITE-ONCE (FIX-IMM-2 v1.95) and excluded from UpdateableItemDraftFields
      itemService.updateItem('item_1', 'FIRM', { metal: 'SILVER' });

      // @ts-expect-error: netWeightMg is immutable in updateItem; must route via adjustWeight
      itemService.updateItem('item_1', 'FIRM', { netWeightMg: 1000 });
      
      // @ts-expect-error: fineWeightMg is immutable in updateItem; must route via adjustWeight
      itemService.updateItem('item_1', 'FIRM', { fineWeightMg: 900 });

      // @ts-expect-error: grossWeightMg is immutable in updateItem; must route via adjustWeight
      itemService.updateItem('item_1', 'FIRM', { grossWeightMg: 1200 });

      // @ts-expect-error: sku is permanently immutable across all statuses
      itemService.updateItem('item_1', 'FIRM', { sku: 'GNEW01260001' });

      // @ts-expect-error: barcode is permanently immutable across all statuses
      itemService.updateItem('item_1', 'FIRM', { barcode: 'GNEW01260001' });
    }

    expect(true).toBe(true);
  });
});
