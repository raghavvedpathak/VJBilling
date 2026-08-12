// utils/formatDate.ts — Phase 2 v2.11 Canonical Date Formatter

import { format, parseISO } from 'date-fns';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  const token = appSettingsStore.getState().dateFormatToken ?? 'dd/MM/yyyy';
  try {
    return format(parseISO(isoString), token);
  } catch (e) {
    console.error('Invalid date format or string:', e);
    return isoString;
  }
}