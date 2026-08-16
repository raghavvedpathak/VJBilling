import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const MAX_DIM = 1024;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export async function processAndSaveFirmImage(
  rawUri: string,
  prefix: 'firm' | 'bis_firm',
  firmId: string
): Promise<string | null> {
  try {
    // 1. Resize while preserving aspect ratio
    const manipulated = await manipulateAsync(
      rawUri,
      [{ resize: { width: MAX_DIM } }], // Preserves aspect ratio automatically when height is omitted
      { compress: 0.9, format: SaveFormat.PNG }
    );

    // 2. Check file size
    const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > MAX_BYTES) {
      throw new Error('Image exceeds 2MB limit after processing.');
    }

    // 3. Ensure target directory exists
    const docDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
    const logosDir = `${docDir}logos/`;
    await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true });

    // 4. Save file
    const targetPath = `${logosDir}${prefix}_${firmId}_${Date.now()}.png`;
    await FileSystem.copyAsync({ from: manipulated.uri, to: targetPath });

    return targetPath;
  } catch (error) {
    console.error(`[processAndSaveFirmImage] Failed for ${prefix}:`, error);
    return null;
  }
}
