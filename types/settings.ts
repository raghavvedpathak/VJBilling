// types/settings.ts
// Phase 1 Settings Types
// G67: Currency fields are explicitly OMITTED from UpdateSettingsInput
// to enforce constitutional immutability at compile time.

export type UpdateSettingsInput = {
  theme?: string; // 'system' | 'light' | 'dark'
  auditRetentionDays?: number;
  dateFormatToken?: string; // one of the 6 canonical tokens (G68)
  warnUnsavedChanges?: number; // 1=ON, 0=OFF (G69)
  // currency, currencySymbol, and currencyDecimalPlaces are EXCLUDED
};