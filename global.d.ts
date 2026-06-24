// app.d.ts
// Custom TypeScript declarations for VJ Billing

// Fixes TypeScript Error 2882: Tells TS how to handle CSS imports for NativeWind v4
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

// Fixes TypeScript Error 2307: Fallback declarations for expo-print ambient module
// Required for Phase 2 URD Purchase Bill HTML printing
declare module 'expo-print' {
  export interface PrintOptions {
    html: string;
    printerUrl?: string;
    baseUrl?: string;
    width?: number;
    height?: number;
  }
  export function printAsync(options: PrintOptions): Promise<void>;
  export function printToFileAsync(options: PrintOptions): Promise<{ uri: string; numberOfPages: number; base64?: string }>;
}