// constants/theme.ts
// Single Source of Truth (SSOT) for VJBilling Design Tokens, Colors, and Glassmorphism System

export const COLORS = {
  // --- Core Brand Colors ---
  vjText: '#2A1208',       // Deep Burnt Saffron Velvet (Header & Primary Text)
  vjBg: '#FDF9F3',         // Warm Kesar Milk Silk (Anti-Glare Main Background)
  vjAccent: '#E67E22',     // Royal Auspicious Saffron Gold (Accents, Buttons & Highlights)
  vjAccentLight: '#FBE3C5',// Soft Kesar Cream Tint
  vjAccentDark: '#B85B0E', // Deep Burnt Saffron
  saffron: '#E67E22',      // Auspicious Royal Saffron
  saffronLight: '#FBE3C5', // Soft Saffron Tint

  // --- Metals ---
  gold: '#E67E22',         // Royal Gold Badge / Stripe
  goldAccent: '#E67E22',   // Gold Highlight Accent
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
  glassBg: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassBorderDark: 'rgba(230, 126, 34, 0.2)',
  glassGoldBg: 'rgba(230, 126, 34, 0.12)',
  glassGoldBorder: 'rgba(230, 126, 34, 0.35)',

  // --- Neutral Tokens ---
  surface: '#FFFFFF',
  border: 'rgba(230, 126, 34, 0.16)',
  muted: 'rgba(42, 18, 8, 0.5)',
  inputBg: '#F3F4F6',       // Form Input Background
  inputBorder: '#D1D5DB',   // Form Input Border
  subtle: 'rgba(42, 18, 8, 0.25)',
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
