// constants/theme.ts
// Single Source of Truth (SSOT) for VJBilling Design Tokens, Colors, and Glassmorphism System

export const COLORS = {
  // --- Core Brand Colors ---
  vjText: '#5C1623',       // Royal Ruby / Deep Wine (Header & Primary Text)
  vjBg: '#FCFBF8',         // Pearl Ivory / Warm White (App Main Background)
  vjAccent: '#D4AF37',     // Rich Imperial Gold (Accents, Buttons & Highlights)
  vjAccentLight: '#F3E5AB',// Champagne Gold Tint
  vjAccentDark: '#B8860B', // Antique Gold

  // --- Metals ---
  gold: '#C8860A',         // Royal Gold Badge / Stripe
  goldAccent: '#D97706',   // Gold Highlight Accent
  silver: '#6B7280',       // Sterling Silver Badge / Stripe
  silverAccent: '#9CA3AF', // Silver Highlight Accent

  // --- System & Status Colors ---
  success: '#15803D',      // Active Green
  successGreen: '#047857', // Vault Green
  danger: '#EF4444',       // Error / Delete Red
  error: '#EF4444',        // Alias for error
  dangerDark: '#B91C1C',   // Deep Red Highlight
  warning: '#F59E0B',      // Alert / Low Stock Amber
  warningOrange: '#B45309',// Orange Truth Highlight
  info: '#3B82F6',         // Information Blue
  phantom: '#7C3AED',      // Phantom Violet

  // --- Glassmorphism Design Tokens ---
  glassBg: 'rgba(255, 255, 255, 0.65)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  glassBorderDark: 'rgba(92, 22, 35, 0.1)',
  glassGoldBg: 'rgba(212, 175, 55, 0.12)',
  glassGoldBorder: 'rgba(212, 175, 55, 0.3)',

  // --- Neutral Tokens ---
  surface: '#FFFFFF',
  border: 'rgba(92, 22, 35, 0.08)',
  muted: 'rgba(92, 22, 35, 0.5)',
  inputBg: '#F3F4F6',       // Form Input Background
  inputBorder: '#D1D5DB',   // Form Input Border
  subtle: 'rgba(92, 22, 35, 0.25)',
} as const;

export const SHADOWS = {
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

export const THEME = {
  colors: COLORS,
  shadows: SHADOWS,
} as const;

export type ThemeColors = typeof COLORS;
