// utils/processFirmImage.ts — Phase 1 v8.0 Canonical Image Processor for Logos
// Implements G58 (max 1024x1024 without upscaling, 2MB cap, deterministic overwrite)
// & FIX-V715-12 / FIX-V737-1 (expo-image-manipulator v13+ builder API) & FIX-V733-9

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_DIM = 1024;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

function getImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null)
    );
  });
}

export async function processAndSaveFirmImage(
  rawUri: string,
  prefix: 'firm' | 'bis_firm',
  firmId: string
): Promise<string | null> {
  let tempSavedUri: string | null = null;

  try {
    // 1. Inspect source dimensions so images <= 1024x1024 are NEVER upscaled (G58)
    let dims = await getImageDimensions(rawUri);

    const context = ImageManipulator.manipulate(rawUri);
    let imageRef = null as Awaited<ReturnType<typeof context.renderAsync>> | null;

    if (dims) {
      if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
        if (dims.width >= dims.height) {
          context.resize({ width: MAX_DIM });
        } else {
          context.resize({ height: MAX_DIM });
        }
      }
      imageRef = await context.renderAsync();
    } else {
      // Fallback if Image.getSize fails on content:// URIs: inspect via initial renderAsync()
      const initialRef = await context.renderAsync();
      if (initialRef.width > MAX_DIM || initialRef.height > MAX_DIM) {
        const resizeCtx = ImageManipulator.manipulate(rawUri);
        if (initialRef.width >= initialRef.height) {
          resizeCtx.resize({ width: MAX_DIM });
        } else {
          resizeCtx.resize({ height: MAX_DIM });
        }
        imageRef = await resizeCtx.renderAsync();
        (initialRef as any).release?.();
        (resizeCtx as any).release?.();
      } else {
        imageRef = initialRef;
      }
    }

    const saved = await imageRef.saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
    });
    tempSavedUri = saved.uri;

    (imageRef as any).release?.();
    (context as any).release?.();

    // 2. Enforce 2MB size cap AFTER manipulator processing (G58)
    const fileInfo = await FileSystem.getInfoAsync(saved.uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > MAX_BYTES) {
      throw new Error(
        `IMAGE_SIZE_EXCEEDED: Image exceeds 2MB limit after processing (${Math.round(
          fileInfo.size / 1024
        )}KB).`
      );
    }

    // 3. Ensure logos/ subdirectory exists (G58)
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
    const normalizedBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    const logosDir = `${normalizedBase}logos/`;

    await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true });

    // 4. Deterministic path per G58: overwrite cleanly with zero orphan files
    const targetPath = `${logosDir}${prefix}_${firmId}.jpg`;
    await FileSystem.deleteAsync(targetPath, { idempotent: true });
    await FileSystem.copyAsync({ from: saved.uri, to: targetPath });

    return targetPath;
  } catch (error) {
    console.error(`[processAndSaveFirmImage] Failed for ${prefix}:`, error);
    return null;
  } finally {
    // 5. Clean up temporary cache file
    if (tempSavedUri) {
      FileSystem.deleteAsync(tempSavedUri, { idempotent: true }).catch(() => {});
    }
  }
}

// Named alias for backward compatibility
export const processFirmImage = processAndSaveFirmImage;
export default processAndSaveFirmImage;
