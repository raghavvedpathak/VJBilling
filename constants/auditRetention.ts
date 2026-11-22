// constants/auditRetention.ts
export const MIN_AUDIT_RETENTION_DAYS = 30;
export const MAX_AUDIT_RETENTION_DAYS = 3650;
export const MAX_CLOCK_GAP_DAYS = 90;
export const PURGE_EXEMPT_EVENTS = ['DEVICE_ID_GENERATED', 'FIRM_CODE_SET'] as const;
export const ALLOWED_DATE_TOKENS = [
  'dd/MM/yyyy',
  'd MMMM yyyy',
  'd MMM yyyy',
  'dd-MM-yyyy',
  'dd MMM yyyy',
  'yyyy-MM-dd',
  'd/M/yyyy',
] as const;

