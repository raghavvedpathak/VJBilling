// SKU-DISPLAY-1 (v1.43): formatSKUDisplay() — UI-only display helper. 
// NEVER affects stored SKU value.
// GAP-I6 (v1.73): ⚠️ UI LAYER ONLY — do NOT import in services/, repositories/, or db/.

export function formatSKUDisplay(sku: string): string {
  // SKU format: [M=1][DES=3-4][MMYY=4][SEQ=4] — last 4 chars are always the 4-digit seq
  if (sku.length < 4) return sku; // guard: malformed — return as-is
  
  const prefix = sku.slice(0, -4); // everything before the 4-digit seq
  const seqPart = sku.slice(-4); // always 4 chars: e.g. '0001', '0099', '0100'
  const seqNum = parseInt(seqPart, 10); // parse numeric value for display formatting
  
  // FIX-SKU-DISPLAY-2 (v1.51): min 2 digits
  const displaySeq = seqNum < 10 ? `0${seqNum}` : String(seqNum); 
  
  return `${prefix}${displaySeq}`; // smart: 01, 10, 100, 1000
}
