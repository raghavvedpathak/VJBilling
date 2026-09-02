export const THEME_PRESETS = {
  saffron: { // DEFAULT - Option 1: Imperial Swarna Kesari
    id: 'saffron',
    label: 'Royal Kesari Gold (Default)',
    vjHeaderBg: '#731E00', // Deep Imperial Kesari Silk Header
    vjText: '#260F04',
    vjBg: '#FDF9F2',
    vjAccent: '#E07A1E', // Radiant Kesari Gold Accent
    vjAccentLight: '#FDEBD2',
    vjAccentDark: '#5C1600',
    glassBorderDark: 'rgba(224, 122, 30, 0.25)',
    border: 'rgba(212, 175, 55, 0.22)',
    glassHeaderRim: 'rgba(255, 255, 255, 0.14)',
    glassJunctionRim: 'rgba(255, 255, 255, 0.85)',
  },
  platinum_sapphire: { // Option 2: Himalayan Platinum & Star Sapphire
    id: 'platinum_sapphire',
    label: 'Platinum & Star Sapphire',
    vjHeaderBg: '#111827', // Deep Obsidian Velvet Header
    vjText: '#0F172A',
    vjBg: '#F8FAFC',
    vjAccent: '#D4AF37', // Sun Gold Accent
    vjAccentLight: '#E2E8F0',
    vjAccentDark: '#94761E',
    glassBorderDark: 'rgba(17, 24, 39, 0.25)',
    border: 'rgba(17, 24, 39, 0.18)',
    glassHeaderRim: 'rgba(255, 255, 255, 0.14)',
    glassJunctionRim: 'rgba(255, 255, 255, 0.85)',
  },
  sandstone_ochre: { // Option 3: Reth Sandstone & Polki Gold
    id: 'sandstone_ochre',
    label: 'Reth Sandstone Silk & Ochre',
    vjHeaderBg: '#421700', // Richer Deep Sandstone Teak Header
    vjText: '#301302',
    vjBg: '#FAF5ED',
    vjAccent: '#E09224', // Radiant Sandstone Topaz Gold Accent
    vjAccentLight: '#FDECD8',
    vjAccentDark: '#9C3D06',
    glassBorderDark: 'rgba(224, 146, 36, 0.25)',
    border: 'rgba(212, 175, 55, 0.22)',
    glassHeaderRim: 'rgba(255, 255, 255, 0.14)',
    glassJunctionRim: 'rgba(255, 255, 255, 0.85)',
  },
  tourmaline_rosegold: { // Option 4: Rose Gold & Pink Tourmaline
    id: 'tourmaline_rosegold',
    label: 'Rose Gold & Pink Tourmaline',
    vjHeaderBg: '#420D1C', // Deep Midnight Rose Gold Velvet Header
    vjText: '#2E0812',
    vjBg: '#FCF5F7',
    vjAccent: '#E11D48', // Radiant Pink Tourmaline Accent
    vjAccentLight: '#FFE4E6',
    vjAccentDark: '#881337',
    glassBorderDark: 'rgba(66, 13, 28, 0.25)',
    border: 'rgba(225, 29, 72, 0.18)',
    glassHeaderRim: 'rgba(255, 255, 255, 0.14)',
    glassJunctionRim: 'rgba(255, 255, 255, 0.85)',
  },
} as const;

import { appSettingsStore } from '@/store/phase1/appSettingsStore';

export function getThemeColors(themeKey?: string) {
  const currentStoreTheme = appSettingsStore ? appSettingsStore.getState()?.theme : null;
  const key = themeKey || currentStoreTheme || 'saffron';
  return THEME_PRESETS[key as keyof typeof THEME_PRESETS] || THEME_PRESETS.saffron;
}

export const COLORS = {
  // --- Dynamic Brand Colors (Resolved Live) ---
  get vjHeaderBg() { return getThemeColors().vjHeaderBg || '#5C1623'; },
  get vjText() { return getThemeColors().vjText; },
  get vjBg() { return getThemeColors().vjBg; },
  get vjAccent() { return getThemeColors().vjAccent; },
  get vjAccentLight() { return getThemeColors().vjAccentLight; },
  get vjAccentDark() { return getThemeColors().vjAccentDark; },
  get glassBorderDark() { return getThemeColors().glassBorderDark; },
  get border() { return getThemeColors().border; },
  get glassHeaderRim() { return getThemeColors().glassHeaderRim || 'rgba(255, 255, 255, 0.14)'; },
  get glassJunctionRim() { return getThemeColors().glassJunctionRim || 'rgba(255, 255, 255, 0.85)'; },
  get gold() { return getThemeColors().vjAccent; },
  get goldAccent() { return getThemeColors().vjAccent; },

  saffron: '#E67E22',
  saffronLight: '#FBE3C5',
  silver: '#94A3B8',
  silverAccent: '#CBD5E1',

  // --- System & Status Colors ---
  success: '#15803D',
  successGreen: '#047857',
  danger: '#EF4444',
  error: '#EF4444',
  dangerDark: '#B91C1C',
  warning: '#F59E0B',
  warningOrange: '#B45309',
  info: '#3B82F6',
  phantom: '#7C3AED',

  // --- Glassmorphism Design Tokens ---
  glassBg: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassGoldBg: 'rgba(212, 175, 55, 0.15)',
  glassGoldBorder: 'rgba(212, 175, 55, 0.45)',
  glassSilverBg: 'rgba(226, 232, 240, 0.65)',
  glassSilverBorder: 'rgba(148, 163, 184, 0.6)',
  silverText: '#1E293B',
  goldText: '#92400E',

  // --- Neutral Tokens ---
  surface: '#FFFFFF',
  muted: 'rgba(42, 18, 8, 0.5)',
  inputBg: '#F3F4F6',
  inputBorder: '#D1D5DB',
  subtle: 'rgba(42, 18, 8, 0.25)',
};

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

