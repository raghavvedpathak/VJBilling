import * as FileSystem from 'expo-file-system/legacy';

const getSafeDir = (): string => {
  const fs = FileSystem as any;
  const dir = fs.documentDirectory || fs.cacheDirectory;

  if (dir && typeof dir === 'string') {
    return dir.endsWith('/') ? dir : `${dir}/`;
  }

  return 'file:///data/user/0/com.vjbilling/files/';
};

const BASE_DIR = getSafeDir();

export const STORAGE_PATHS = {
  BASE_DIR,
  BACKUP_DIR: `${BASE_DIR}backups/`,
  LOGOS_DIR: `${BASE_DIR}logos/`,
  PRE_MIGRATION_SNAPSHOT: `${BASE_DIR}backups/vjbilling_premigration_snapshot.enc`,
  PRE_MIGRATION_SNAPSHOT_LEGACY: `${BASE_DIR}vjbilling_premigration_snapshot.json`,
  RAW_DB_DIR: `${BASE_DIR}SQLite/`,
  DB_FILENAME: 'vjbilling_v2.db',
};