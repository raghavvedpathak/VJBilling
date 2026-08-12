import * as FileSystem from 'expo-file-system/legacy';

const getSafeDir = () => {
  const fs = FileSystem as any;

  const dir = fs.documentDirectory || fs.cacheDirectory;
  
  if (dir && typeof dir === 'string') {
    return dir.endsWith('/') ? dir : `${dir}/`;
  }
  
  return 'file:///data/user/0/com.vjbilling/files/'; 
};

const BASE_DIR = getSafeDir();

export const STORAGE_PATHS = {
  PRE_MIGRATION_SNAPSHOT: `${BASE_DIR}vjbilling_premigration_snapshot.json`,
  RAW_DB_DIR: `${BASE_DIR}SQLite/`,
  // ARCHITECT FIX: Synced exactly with db/client.ts
  DB_FILENAME: 'vjbilling_v2.db' 
};