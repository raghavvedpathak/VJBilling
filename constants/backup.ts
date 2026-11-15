// constants/backup.ts
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

export type BackupKind = 'MANUAL' | 'AUTO' | 'FYCLOSE';

export const BACKUP_FILE_PREFIX: Record<BackupKind, string> = {
  MANUAL: 'vjbilling_', // unchanged: every file written before v7.45 has this prefix
  AUTO: 'vjbilling_auto_',
  FYCLOSE: 'vjbilling_fyclose_',
};

export const AUTO_BACKUP_FILE_REGEX = /^vjbilling_auto_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.vjb$/;
export const ANY_BACKUP_FILE_REGEX = /^vjbilling_.*\.vjb$/;

