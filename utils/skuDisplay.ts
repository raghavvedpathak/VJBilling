// utils/skuDisplay.ts — Phase 2 v2.24 Canonical SKU Display Helper
// SKU-DISPLAY-1 (v1.43) & FIX-SKU-DISPLAY-2 (v1.51)
// UI-only smart formatter. NEVER affects stored SKU values.

export function formatSKUDisplay(sku: string): string {
  // SKU format: [M=1][DES=3-4][MMYY=4][SEQ=4] — last 4 characters are the sequence
  if (!sku || sku.length < 4) return sku;

  const prefix = sku.slice(0, -4);
  const seqPart = sku.slice(-4);

  // If the last 4 characters are not strictly digits, return original SKU
  if (!/^\d{4}$/.test(seqPart)) return sku;

  const seqNum = parseInt(seqPart, 10);
  if (isNaN(seqNum)) return sku;

  // FIX-SKU-DISPLAY-2: Minimum 2 digits ('01' through '09', '10' through '9999')
  const displaySeq = seqNum < 10 ? `0${seqNum}` : String(seqNum);

  return `${prefix}${displaySeq}`;
}
