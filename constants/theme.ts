export const THEME_PRESETS = {
  saffron: { // DEFAULT
    id: 'saffron',
    label: 'Royal Kesari Gold (Default)',
    vjHeaderBg: '#420D19', // Richer Deep Royal Kesari Burgundy Header
    vjText: '#2A1208',
    vjBg: '#FDF9F3',
    vjAccent: '#E67E22',
    vjAccentLight: '#FBE3C5',
    vjAccentDark: '#B85B0E',
    glassBorderDark: 'rgba(230, 126, 34, 0.2)',
    border: 'rgba(230, 126, 34, 0.16)',
  },
  lotus_silk: { // Kashmir Lotus Silk & Soft Rose Gold
    id: 'lotus_silk',
    label: 'Kashmir Lotus Silk & Soft Rose Gold',
    vjHeaderBg: '#4E121E', // Richer Deep Kashmir Crimson Header
    vjText: '#36141D',
    vjBg: '#FAF0F2',
    vjAccent: '#C97A63',
    vjAccentLight: '#FBECE9',
    vjAccentDark: '#A1523E',
    glassBorderDark: 'rgba(201, 122, 99, 0.2)',
    border: 'rgba(201, 122, 99, 0.16)',
  },
  sandstone_ochre: { // Reth Sandstone Silk & Warm Ochre
    id: 'sandstone_ochre',
    label: 'Reth Sandstone Silk & Warm Ochre',
    vjHeaderBg: '#481B00', // Richer Deep Sandstone Ochre Header
    vjText: '#381A08',
    vjBg: '#FAF4EC',
    vjAccent: '#D98338',
    vjAccentLight: '#FCECDD',
    vjAccentDark: '#AC5A16',
    glassBorderDark: 'rgba(217, 131, 56, 0.2)',
    border: 'rgba(217, 131, 56, 0.16)',
  },
} as const;

import { appSettingsStore } from '../store/appSettingsStore';

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
  get gold() { return getThemeColors().vjAccent; },
  get goldAccent() { return getThemeColors().vjAccent; },

  saffron: '#E67E22',
  saffronLight: '#FBE3C5',
  silver: '#6B7280',
  silverAccent: '#9CA3AF',

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

