// tests/phase2_compile_checks.test.ts
// Phase 2 v2.34 Compile-Time Type Safety & Immutability Proofs
// Strictly verifies Step 6.5 UpdateableItemDraftFields & FIX-IMM-1 / FIX-IMM-2

import { itemService } from '@/services/phase2/itemService';

describe('Compile-Time Checks', () => {
  it('prevents mutation of immutable and excluded fields', () => {
    function compileCheckOnly() {
      // @ts-expect-error: metalSource is WRITE-ONCE and excluded from UpdateableItemDraftFields
      itemService.updateItem('item_1', 'FIRM', { metalSource: 'KARIGAR' });

      // @ts-expect-error: metal is WRITE-ONCE (FIX-IMM-2 v1.95) and excluded from UpdateableItemDraftFields
      itemService.updateItem('item_1', 'FIRM', { metal: 'SILVER' });

      // @ts-expect-error: netWeightMg is immutable in updateItem; must route via adjustWeight (RED-5)
      itemService.updateItem('item_1', 'FIRM', { netWeightMg: 1000 });

      // @ts-expect-error: fineWeightMg is immutable in updateItem; must route via adjustWeight (RED-5)
      itemService.updateItem('item_1', 'FIRM', { fineWeightMg: 900 });

      // @ts-expect-error: grossWeightMg is immutable in updateItem; must route via adjustWeight (RED-5)
      itemService.updateItem('item_1', 'FIRM', { grossWeightMg: 1200 });

      // @ts-expect-error: fineGoldChargedMg is recomputed atomically via adjustWeight only
      itemService.updateItem('item_1', 'FIRM', { fineGoldChargedMg: 1000 });

      // @ts-expect-error: wastagePercent is recomputed atomically via adjustWeight only
      itemService.updateItem('item_1', 'FIRM', { wastagePercent: 5 });

      // @ts-expect-error: sku is permanently immutable across all statuses (RED-1)
      itemService.updateItem('item_1', 'FIRM', { sku: 'GNEW01260001' });

      // @ts-expect-error: barcode is permanently immutable across all statuses (RED-1)
      itemService.updateItem('item_1', 'FIRM', { barcode: 'GNEW01260001' });

      // @ts-expect-error: id is primary key and immutable
      itemService.updateItem('item_1', 'FIRM', { id: 'item_2' });

      // @ts-expect-error: firmId is constitutional boundary and immutable (RED-9)
      itemService.updateItem('item_1', 'FIRM', { firmId: 'OTHER_FIRM' });

      // @ts-expect-error: createdAt is immutable in updateItem; must route via correctItemEntryDate
      itemService.updateItem('item_1', 'FIRM', { createdAt: '2026-01-01T00:00:00.000Z' });

      // @ts-expect-error: saleInvoiceId is DORMANT, Phase 3 postInvoice sole writer
      itemService.updateItem('item_1', 'FIRM', { saleInvoiceId: 'INV-001' });

      // @ts-expect-error: purchaseInvoiceId is DORMANT, Phase 3 postPurchaseInvoice sole writer
      itemService.updateItem('item_1', 'FIRM', { purchaseInvoiceId: 'PINV-001' });
    }

    expect(true).toBe(true);
  });
});
