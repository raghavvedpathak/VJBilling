// app.d.ts
// Custom TypeScript declarations for VJ Billing

// Fixes TypeScript Error 2882: Tells TS how to handle CSS imports for NativeWind v4
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}