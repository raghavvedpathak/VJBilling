import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

// Safe extraction to bypass strict SDK 54 TypeScript definitions and missing runtime properties
const getSafeDir = () => {
  const modernFs = FileSystem as any;
  const legacyFs = LegacyFileSystem as any;

  // Try to find the document directory in either the modern or legacy object
  const dir = modernFs.documentDirectory || legacyFs.documentDirectory || modernFs.cacheDirectory || legacyFs.cacheDirectory;
  
  if (dir && typeof dir === 'string') {
    // Ensure trailing slash for safe path concatenation
    return dir.endsWith('/') ? dir : `${dir}/`;
  }
  
  // Absolute physical fallback for Android if Expo APIs are fully unavailable
  return 'file:///data/user/0/com.vjbilling/files/'; 
};

const BASE_DIR = getSafeDir();

export const STORAGE_PATHS = {
  PRE_MIGRATION_SNAPSHOT: `${BASE_DIR}vjbilling_premigration_snapshot.json`,
  RAW_DB_DIR: `${BASE_DIR}SQLite/`,
  // ARCHITECT FIX: Synced exactly with db/client.ts
  DB_FILENAME: 'vjbilling_v2.db' 
};