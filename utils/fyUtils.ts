/**
 * Indian Financial Year Logic
 * A financial year starts on April 1st and ends on March 31st of the following calendar year.
 * Example:
 * - Date: Feb 12, 2026 -> FY: 2025-2026 (Started Apr 1, 2025)
 * - Date: Apr 02, 2026 -> FY: 2026-2027 (Started Apr 1, 2026)
 */
export function getCurrentFYBounds(date: Date = new Date()): { start: string; end: string; name: string } {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (Jan=0, Mar=2, Apr=3)

  // If Jan, Feb, or March (0, 1, 2) -> We are in the FY that started last year
  const fyStartYear = month < 3 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;

  return {
    start: `${fyStartYear}-04-01`,
    end: `${fyEndYear}-03-31`,
    name: `${fyStartYear}-${fyEndYear}`, // e.g. "2025-2026"
  };
}