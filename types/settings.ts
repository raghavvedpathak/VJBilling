// types/settings.ts — Phase 2 v2.11 Canonical Settings Types

export type UpdateSettingsInput = {
  theme?: string; // 'system' | 'light' | 'dark'
  auditRetentionDays?: number;
  dateFormatToken?: string; // one of the 6 canonical tokens (G68)
  warnUnsavedChanges?: number; // 1=ON, 0=OFF (G69)
  // currency, currencySymbol, and currencyDecimalPlaces are EXCLUDED
};