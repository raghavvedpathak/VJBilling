// utils/fy.ts — Canonical Financial Year Calculation

export interface FYBounds {
  // DB Schema aligned keys
  label: string;
  startDate: string;
  endDate: string;
  // Utility aliases
  name: string;
  start: string;
  end: string;
}

/**
 * Indian Financial Year Logic
 * FY starts April 1st and ends March 31st of the following calendar year.
 * Examples:
 * - Feb 12, 2026 -> FY: 2025-2026 (Apr 01, 2025 – Mar 31, 2026)
 * - Aug 20, 2026 -> FY: 2026-2027 (Apr 01, 2026 – Mar 31, 2027)
 */
export function getCurrentFYBounds(inputDate: Date | string = new Date()): FYBounds {
  const date = typeof inputDate === 'string' ? new Date(inputDate) : inputDate;
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3

  // If Jan, Feb, or Mar (0, 1, 2) -> FY started previous year
  const fyStartYear = month < 3 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;

  const startDate = `${fyStartYear}-04-01`;
  const endDate = `${fyEndYear}-03-31`;
  const label = `${fyStartYear}-${fyEndYear}`;

  return {
    label,
    startDate,
    endDate,
    name: label,
    start: startDate,
    end: endDate,
  };
}