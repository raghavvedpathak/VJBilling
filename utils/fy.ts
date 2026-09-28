// utils/fy.ts — Canonical Financial Year Calculation
// Formats canonical label: 'FY YYYY-YY' (e.g. 'FY 2025-26')

export interface FYBounds {
  label: string;
  startDate: string;
  endDate: string;
  name: string;
  start: string;
  end: string;
}

/**
 * Indian Financial Year Logic (Apr 1 -> Mar 31)
 */
export function getCurrentFYBounds(inputDate: Date | string = new Date()): FYBounds {
  const date = typeof inputDate === 'string' ? new Date(inputDate) : inputDate;
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3

  const fyStartYear = month < 3 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;

  const startDate = `${fyStartYear}-04-01`;
  const endDate = `${fyEndYear}-03-31`;
  const endYearShort = String(fyEndYear).slice(-2);
  const label = `FY ${fyStartYear}-${endYearShort}`;

  return {
    label,
    startDate,
    endDate,
    name: label,
    start: startDate,
    end: endDate,
  };
}

export default getCurrentFYBounds;
