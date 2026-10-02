// constants/theme.ts — Phase 2 v2.34 Canonical Theme Tokens & Color Palettes

import { appSettingsStore } from '@/store/phase1/appSettingsStore';

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

export function getThemeColors(themeKey?: string) {
  const currentStoreTheme = appSettingsStore ? appSettingsStore.getState()?.theme : null;
  const key = themeKey || currentStoreTheme || 'saffron';
  return THEME_PRESETS[key as keyof typeof THEME_PRESETS] || THEME_PRESETS.saffron;
}

export const COLORS = {
  // --- Dynamic Brand Colors (Resolved Live) ---
  get vjHeaderBg() { return getThemeColors().vjHeaderBg || '#731E00'; },
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

  bullionGold: '#D4AF37', // 24K Physical Gold Bar Bullion (consistent across all themes)
  bullionSilver: '#9CA3AF', // Sterling Silver Ingot (consistent across all themes)

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

export const SEMANTIC_BADGES = {
  gold: {
    bg: 'rgba(212, 175, 55, 0.15)',
    border: 'rgba(212, 175, 55, 0.45)',
    text: '#92400E',
    darkBg: 'rgba(212, 175, 55, 0.22)',
    darkText: '#FDE68A',
  },
  silver: {
    bg: 'rgba(148, 163, 184, 0.18)',
    border: 'rgba(148, 163, 184, 0.45)',
    text: '#334155',
    darkBg: 'rgba(148, 163, 184, 0.25)',
    darkText: '#F1F5F9',
  },
  success: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#047857',
    darkBg: 'rgba(16, 185, 129, 0.22)',
    darkText: '#34D399',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.38)',
    text: '#B45309',
    darkBg: 'rgba(245, 158, 11, 0.24)',
    darkText: '#FBBF24',
  },
  danger: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    text: '#B91C1C',
    darkBg: 'rgba(239, 68, 68, 0.22)',
    darkText: '#F87171',
  },
  info: {
    bg: 'rgba(14, 165, 233, 0.12)',
    border: 'rgba(14, 165, 233, 0.35)',
    text: '#0369A1',
    darkBg: 'rgba(14, 165, 233, 0.22)',
    darkText: '#38BDF8',
  },
  purple: {
    bg: 'rgba(124, 58, 237, 0.12)',
    border: 'rgba(124, 58, 237, 0.35)',
    text: '#6D28D9',
    darkBg: 'rgba(124, 58, 237, 0.22)',
    darkText: '#C084FC',
  },
} as const;

export const TYPOGRAPHY = {
  displayHero: { fontSize: 26, fontWeight: '900' as const, letterSpacing: -0.5 },
  screenTitle: { fontSize: 20, fontWeight: '900' as const, letterSpacing: 0.2 },
  sectionHeader: { fontSize: 13, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  statLabel: { fontSize: 11, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  statValue: { fontSize: 20, fontWeight: '900' as const },
  currencyValue: { fontSize: 22, fontWeight: '900' as const, letterSpacing: 0.2 },
  bodyRegular: { fontSize: 14, fontWeight: '600' as const },
  bodyMuted: { fontSize: 12, fontWeight: '500' as const },
  badgeText: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
} as const;

export const SPACING = {
  touchTargetMin: 48,
  touchTargetTablet: 52,
  cardRadius: 24,
  inputRadius: 16,
  pillRadius: 999,
  headerHeight: 56,
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
  semanticBadges: SEMANTIC_BADGES,
  typography: TYPOGRAPHY,
  spacing: SPACING,
} as const;

export type ThemeColors = typeof COLORS;

