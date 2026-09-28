// utils/processFirmImage.ts — Canonical Image Processor for Logos
// G58 Compliant: Deterministic storage path, overwrites on update, zero orphan files

import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const MAX_DIM = 1024;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export async function processAndSaveFirmImage(
  rawUri: string,
  prefix: 'firm' | 'bis_firm',
  firmId: string
): Promise<string | null> {
  let manipulatedUri: string | null = null;

  try {
    // 1. Process image: compress and resize within 1024x1024 bounds (G58)
    const manipulated = await manipulateAsync(
      rawUri,
      [{ resize: { width: MAX_DIM } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    manipulatedUri = manipulated.uri;

    // 2. Enforce 2MB size cap post-processing
    const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > MAX_BYTES) {
      throw new Error(`IMAGE_SIZE_EXCEEDED: Image exceeds 2MB limit after processing (${Math.round(fileInfo.size / 1024)}KB).`);
    }

    // 3. Ensure target directory exists
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
    const normalizedBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    const logosDir = `${normalizedBase}logos/`;
    
    await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true });

    // 4. Save to deterministic path per G58: firm_{firmId}.jpg (overwrites cleanly)
    const targetPath = `${logosDir}${prefix}_${firmId}.jpg`;
    await FileSystem.copyAsync({ from: manipulated.uri, to: targetPath });

    return targetPath;
  } catch (error) {
    console.error(`[processAndSaveFirmImage] Failed for ${prefix}:`, error);
    return null;
  } finally {
    // 5. Clean up temporary cache file
    if (manipulatedUri) {
      FileSystem.deleteAsync(manipulatedUri, { idempotent: true }).catch(() => {});
    }
  }
}

// Named alias for backward compatibility
export const processFirmImage = processAndSaveFirmImage;
export default processAndSaveFirmImage;