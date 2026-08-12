// types/settings.ts — Phase 2 v2.11 Canonical Settings Types

export type UpdateSettingsInput = {
  theme?: string; // 'system' | 'saffron' | 'lotus_silk' | 'sandstone_ochre'
  auditRetentionDays?: number;
  dateFormatToken?: string; // date-fns v3 token
  warnUnsavedChanges?: number; // 1=ON, 0=OFF
  // currency, currencySymbol, and currencyDecimalPlaces are EXCLUDED
};