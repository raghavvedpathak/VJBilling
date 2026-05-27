// utils/formatDate.ts
// v6.2 G68 — Constitutional date display utility
// ALL date rendering in every phase MUST call this function.
// NO component may hardcode a date format string.
//
// RULE: reads dateFormatToken from appSettingsStore (Zustand).
// Changing the setting updates all displays app-wide — no migration needed.
// Stored ISO-8601 values are never modified — this is display-only.
//
// CALLERS: invoice dates, FY labels, audit log timestamps, dashboard,
// backup/restore preview screens, Firm Manager dates.

import { format, parseISO } from 'date-fns';
import { useAppSettingsStore } from '../store/appSettingsStore';

/**
 * Formats an ISO-8601 date string using the user's selected date format token.
 * Reads dateFormatToken from appSettingsStore — always current, never stale.
 *
 * @param isoString - ISO-8601 date or datetime string (e.g. '2025-04-01' or '2025-04-01T10:30:00.000Z')
 * @returns Formatted date string per user's preference (e.g. '01/04/2025')
 *
 * @example
 * formatDate('2025-04-01')        // → '01/04/2025' (default dd/MM/yyyy)
 * formatDate('2025-04-01T10:30Z') // → '01/04/2025'
 */
export function formatDate(isoString: string): string {
  // FIX-V72-1: date-fns v3 lowercase tokens — dd/MM/yyyy NOT DD/MM/YYYY
  const token =
    useAppSettingsStore.getState().dateFormatToken ?? 'dd/MM/yyyy';

  try {
    return format(parseISO(isoString), token);
  } catch {
    // Graceful fallback — never crash on a bad date string
    return isoString;
  }
}

/**
 * Formats today's date using the user's selected token.
 * Used by the Date Format Picker live preview (G68).
 */
export function formatToday(): string {
  const token =
    useAppSettingsStore.getState().dateFormatToken ?? 'dd/MM/yyyy';
  try {
    return format(new Date(), token);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}