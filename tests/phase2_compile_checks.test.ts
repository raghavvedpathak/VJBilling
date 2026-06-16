// tests/phase2_compile_checks.test.ts

import { itemRepository } from '../repositories/itemRepository';
import { itemService } from '../services/itemService';
import { db } from '../db/client';

// TEST 5: Weight Immutability & metalSource Immutability (TypeScript static analysis proofs)
// This file is tested by running `npx tsc --noEmit` and via Jest.

describe('Compile-Time Checks', () => {
  it('prevents mutation of immutable fields', () => {
    const tx = {} as any; // Mock transaction

    // We wrap this in a function that is never called at runtime,
    // so we don't get TypeError: tx.update is not a function.
    // The TypeScript compiler still checks this.
    function compileCheckOnly() {
      // @ts-expect-error: metalSource should not be updateable via service
      const p1 = itemService.updateItem('item_1', 'FIRM', { metalSource: 'KARIGAR' });
      
      // @ts-expect-error: netWeightMg should not be updateable
      const p2 = itemService.updateItem('item_1', 'FIRM', { netWeightMg: 1000 });
      
      // @ts-expect-error: fineWeightMg should not be updateable
      const p3 = itemService.updateItem('item_1', 'FIRM', { fineWeightMg: 900 });
    }

    expect(true).toBe(true);
  });
});
