export const THEME_PRESETS = {
  saffron: { // DEFAULT
    id: 'saffron',
    label: 'Royal Kesari Gold (Default)',
    vjText: '#2A1208',
    vjBg: '#FDF9F3',
    vjAccent: '#E67E22',
    vjAccentLight: '#FBE3C5',
    vjAccentDark: '#B85B0E',
    glassBorderDark: 'rgba(230, 126, 34, 0.2)',
    border: 'rgba(230, 126, 34, 0.16)',
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
  glassGoldBg: 'rgba(230, 126, 34, 0.12)',
  glassGoldBorder: 'rgba(230, 126, 34, 0.35)',

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

