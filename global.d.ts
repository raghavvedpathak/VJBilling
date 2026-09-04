/// <reference types="nativewind/types" />

// Custom TypeScript declarations for VJ Billing

// Tells TS how to handle direct CSS imports for NativeWind v4
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

// Fallback declarations for expo-print ambient module (Phase 2 Printing Engine)
declare module 'expo-print' {
  export interface PrintOptions {
    html: string;
    printerUrl?: string;
    baseUrl?: string;
    width?: number;
    height?: number;
    orientation?: 'portrait' | 'landscape';
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  }
  export const Orientation: {
    portrait: 'portrait';
    landscape: 'landscape';
  };
  export function printAsync(options: PrintOptions): Promise<void>;
  export function printToFileAsync(
    options: PrintOptions
  ): Promise<{ uri: string; numberOfPages: number; base64?: string }>;
}