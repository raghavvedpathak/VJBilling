// components/ui/Glass.tsx — Centralized Glassmorphic Design System for VJ Billing
// Purpose: Unified luxury glassmorphism components (Inputs, Buttons, Pickers, Badges, 3D Bullion, Flags)
// Visual Architecture: Translucent Frosted Glass, Crisp Jewel Gold Rim Borders, and Dynamic Theme Reactivity.

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ViewProps,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { COLORS, getThemeColors } from '../../constants/theme';
import { appSettingsStore } from '../../store/phase1/appSettingsStore';
import { getCurrencySymbol } from '../../utils/currency';

// ============================================================================
// 1. RE-EXPORT CENTRALIZED CARD CONTAINER SYSTEM
// Single source of truth for all card containers across the application.
// ============================================================================
export * from './CardContainer';

// ============================================================================
// 2. GLASS INPUT (Frosted Translucent Etched Slot)
// Added secureTextEntry prop — required for any password/PIN fields.
// readOnly visual styling: slightly dimmed label to communicate non-editable state.
// ============================================================================
export interface GlassInputProps {
  label?: string | undefined;
  icon?: React.ReactNode | undefined;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string | undefined;
  keyboardType?: any;
  maxLength?: number | undefined;
  autoCapitalize?: any;
  autoCorrect?: boolean | undefined;
  spellCheck?: boolean | undefined;
  autoComplete?: any;
  readOnly?: boolean | undefined;
  secureTextEntry?: boolean | undefined;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  onSubmitEditing?: (() => void) | undefined;
}

export function GlassInput({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  maxLength,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  autoComplete,
  readOnly = false,
  secureTextEntry = false,
  onFocus,
  onBlur,
  onSubmitEditing,
}: GlassInputProps) {
  const inputRef = React.useRef<TextInput>(null);
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [isFocused, setIsFocused] = React.useState(false);

  const handleContainerPress = () => {
    if (!readOnly) {
      inputRef.current?.focus();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (onBlur) onBlur();
  };

  // Frosted translucent input styling
  const containerBg = readOnly
    ? (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(200, 200, 200, 0.22)')
    : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.82)');

  const containerBorder = readOnly
    ? (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(200, 200, 200, 0.40)')
    : isFocused
    ? colors.vjAccent
    : (isDark ? 'rgba(212, 175, 55, 0.30)' : 'rgba(212, 175, 55, 0.35)');

  return (
    <View style={glassStyles.inputWrapper}>
      {label && (
        <TouchableOpacity
          activeOpacity={readOnly ? 1 : 0.7}
          onPress={handleContainerPress}
          disabled={readOnly}
        >
          <Text
            style={[
              glassStyles.inputLabel,
              {
                color: colors.vjText,
                opacity: readOnly ? 0.4 : 0.75,
              },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleContainerPress}
        disabled={readOnly}
        style={[
          glassStyles.inputContainer,
          {
            backgroundColor: containerBg,
            borderColor: containerBorder,
            borderWidth: isFocused ? 1.5 : 1.2,
          },
        ]}
      >
        {icon && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleContainerPress}
            disabled={readOnly}
            style={glassStyles.inputIconBox}
          >
            {icon}
          </TouchableOpacity>
        )}
        <TextInput
          ref={inputRef}
          style={[
            glassStyles.inputText,
            {
              color: colors.vjText,
              opacity: readOnly ? 0.6 : 1,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(92, 22, 35, 0.38)'}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          spellCheck={spellCheck}
          autoComplete={autoComplete}
          editable={!readOnly}
          secureTextEntry={secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={onSubmitEditing}
        />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// 3. GLASS BUTTON (Jeweled Primary, Frosted Secondary, & Alert Danger)
// ============================================================================
export interface GlassButtonProps {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode | undefined;
  variant?: 'primary' | 'secondary' | 'danger' | undefined;
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  style?: any | undefined;
}

export function GlassButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
}: GlassButtonProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    onPress();
  };

  // Button background styles
  const btnBackgrounds = {
    primary: colors.vjText,
    secondary: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(212, 175, 55, 0.12)',
    danger: 'rgba(220, 38, 38, 0.90)',
  };

  const btnBorders = {
    primary: 'rgba(212, 175, 55, 0.45)',
    secondary: isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.35)',
    danger: 'rgba(185, 28, 28, 0.50)',
  };

  const textColors = {
    primary: colors.vjBg,
    secondary: colors.vjText,
    danger: '#ffffff',
  };

  const spinnerColors = {
    primary: colors.vjBg,
    secondary: colors.vjText,
    danger: '#ffffff',
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        glassStyles.btnBase,
        {
          backgroundColor: btnBackgrounds[variant],
          borderColor: btnBorders[variant],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColors[variant]} size="small" />
      ) : (
        <View style={glassStyles.btnContentRow}>
          {icon ? <View style={glassStyles.btnIconBox}>{icon}</View> : null}
          <Text
            style={[
              glassStyles.btnText,
              {
                color: textColors[variant],
              },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// 4. GLASS SMART SEARCH (INLINE COMBOBOX)
// ============================================================================
export interface SmartSearchOption {
  id: string;
  label: string;
  sublabel?: string | undefined;
}

export interface GlassSmartSearchProps {
  label?: string | undefined;
  placeholder?: string | undefined;
  options: SmartSearchOption[];
  selectedId: string | null;
  onSelect: (option: SmartSearchOption | null) => void;
  onFocusFetch?: (() => void) | undefined;
  showAllOnFocus?: boolean | undefined;
}

export function GlassSmartSearch({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
  onFocusFetch,
  showAllOnFocus,
}: GlassSmartSearchProps) {
  const [query, setQuery] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(false);
  const lastSyncedId = React.useRef<string | null>(null);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  // Sync input display text with selected item when selectedId or options change
  React.useEffect(() => {
    if (selectedId) {
      const selectedOpt = options.find((o) => o.id === selectedId);
      if (selectedOpt) {
        if (lastSyncedId.current !== selectedId || query !== selectedOpt.label) {
          setQuery(selectedOpt.label);
          lastSyncedId.current = selectedId;
        }
      }
    } else {
      if (lastSyncedId.current !== null && !isFocused) {
        setQuery('');
        lastSyncedId.current = null;
      }
    }
  }, [selectedId, options, isFocused, query]);

  const shouldShowOptions = React.useMemo(() => {
    if (!isFocused) return false;
    if (showAllOnFocus && (!query || query === '')) return true;

    const searchStr = query.toLowerCase();
    if (!searchStr) return false;

    if (selectedId) {
      const selectedOpt = options.find((o) => o.id === selectedId);
      if (selectedOpt && searchStr === selectedOpt.label.toLowerCase()) {
        return showAllOnFocus ? true : false;
      }
    }
    return true;
  }, [isFocused, query, options, selectedId, showAllOnFocus]);

  // Compute filtered options up to 5 items to keep it inline-friendly
  const filteredOptions = React.useMemo(() => {
    if (!shouldShowOptions) return [];
    const searchStr = query.toLowerCase();
    
    if (showAllOnFocus && (!searchStr || (selectedId && options.find(o => o.id === selectedId)?.label.toLowerCase() === searchStr))) {
      return options;
    }

    const filtered = (options || []).filter((opt) => {
      const labelMatch = opt.label ? String(opt.label).toLowerCase().includes(searchStr) : false;
      const sublabelMatch = opt.sublabel ? String(opt.sublabel).toLowerCase().includes(searchStr) : false;
      return labelMatch || sublabelMatch;
    });

    return filtered.slice(0, 5);
  }, [shouldShowOptions, query, options, showAllOnFocus, selectedId]);

  return (
    <View style={{ zIndex: isFocused ? 9999 : 1, elevation: isFocused ? 9999 : 1, position: 'relative' }}>
      <GlassInput
        label={label}
        placeholder={placeholder}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (selectedId) onSelect(null);
        }}
        onFocus={() => {
          setIsFocused(true);
          if (onFocusFetch) onFocusFetch();
        }}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 200);
        }}
      />
      
      {/* Inline Dropdown List with Translucent Frosted Glass */}
      {shouldShowOptions && (
        <ScrollView 
          style={[
            glassStyles.dropdownScroll,
            {
              backgroundColor: isDark ? 'rgba(28, 20, 24, 0.96)' : 'rgba(252, 251, 248, 0.96)',
              borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.30)',
            },
          ]}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
        >
          {filteredOptions.length === 0 ? (
            <Text style={[glassStyles.dropdownEmptyText, { color: colors.vjText }]}>
              No results found
            </Text>
          ) : (
            filteredOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  onSelect(opt);
                  setQuery(opt.label);
                  setIsFocused(false);
                }}
                style={[
                  glassStyles.dropdownItemRow,
                  {
                    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(92, 22, 35, 0.08)',
                  },
                ]}
              >
                <Text style={[glassStyles.dropdownItemLabel, { color: colors.vjText }]}>{opt.label}</Text>
                {opt.sublabel ? (
                  <Text style={[glassStyles.dropdownItemSublabel, { color: `${colors.vjText}99` }]}>
                    {opt.sublabel}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================================
// 5. MODERN GLASS HEADER PILL
// Sleek, modern iOS 17 / Material 3 glassmorphic pill badge for screen headers
// ============================================================================
export interface HeaderPillProps {
  icon?: React.ReactNode;
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'info';
}

export function HeaderPill({ icon, label, variant = 'default' }: HeaderPillProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const containerStyles = {
    default: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.25)' },
    success: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(52, 211, 153, 0.35)' },
    warning: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(251, 191, 36, 0.35)' },
    info: { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderColor: 'rgba(56, 189, 248, 0.35)' },
  };

  const textColors = {
    default: colors.vjBg,
    success: '#34D399',
    warning: '#FBBF24',
    info: '#38BDF8',
  };

  return (
    <View
      style={[
        glassStyles.headerPillContainer,
        containerStyles[variant],
      ]}
    >
      {icon}
      <Text style={[glassStyles.headerPillText, { color: textColors[variant] }]}>
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// 6. 3D BULLION BAR COMPONENT
// Premium 3D metallic Gold & Silver Bar element with bevels & reflective highlights
// ============================================================================
export function BullionBar3D({ isGold, scale = 1 }: { isGold: boolean; scale?: number }) {
  const width = 44 * scale;
  const height = 26 * scale;
  return (
    <View 
      style={{
        width,
        height,
        borderRadius: 5 * scale,
        backgroundColor: isGold ? '#D4AF37' : '#9CA3AF',
        borderWidth: 1.5 * scale,
        borderColor: isGold ? '#FFE87C' : '#F3F4F6',
        borderBottomWidth: 3 * scale,
        borderBottomColor: isGold ? '#8B6508' : '#374151',
        borderRightWidth: 2.5 * scale,
        borderRightColor: isGold ? '#B8860B' : '#4B5563',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glossy Metallic Light Reflective Highlight */}
      <View 
        style={{
          position: 'absolute',
          top: -2,
          left: -4,
          right: 0,
          height: 10 * scale,
          backgroundColor: 'rgba(255, 255, 255, 0.45)',
          transform: [{ skewY: '-15deg' }],
        }}
      />
      {/* Inner Bevel Border */}
      <View 
        style={{
          width: 36 * scale,
          height: 18 * scale,
          borderRadius: 3 * scale,
          borderWidth: 1 * scale,
          borderColor: isGold ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isGold ? 'rgba(184, 134, 11, 0.25)' : 'rgba(75, 85, 99, 0.25)',
        }}
      >
        <Text 
          style={{
            fontSize: 8 * scale,
            fontWeight: '900',
            color: isGold ? '#4A2E00' : '#111827',
            letterSpacing: 0.6,
          }}
        >
          999
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// 7. 3D GOLD RUPEE COIN COMPONENT
// Premium 3D metallic Gold Coin element with bevels, reflection & Rupee symbol
// ============================================================================
export function RupeeCoin3D({ size = 38 }: { size?: number }) {
  const innerSize = size * 0.72;
  const currencySymbol = getCurrencySymbol();
  return (
    <View 
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#D4AF37',
        borderWidth: 1.5,
        borderColor: '#FFE87C',
        borderBottomWidth: 3,
        borderBottomColor: '#8B6508',
        borderRightWidth: 2.5,
        borderRightColor: '#B8860B',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glossy Metallic Light Reflective Highlight */}
      <View 
        style={{
          position: 'absolute',
          top: -2,
          left: -4,
          right: 0,
          height: size * 0.45,
          backgroundColor: 'rgba(255, 255, 255, 0.45)',
          transform: [{ skewY: '-15deg' }],
        }}
      />
      {/* Inner Coin Bevel Ring */}
      <View 
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(184, 134, 11, 0.25)',
        }}
      >
        <Text 
          style={{
            fontSize: size * 0.46,
            fontWeight: '900',
            color: '#4A2E00',
            textAlign: 'center',
            includeFontPadding: false,
          }}
        >
          {currencySymbol}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// 8. MODERN BHARTIYA TRICOLOR FLAG EMBLEM
// Crisp, modern vector flag emblem with Saffron, White, Green bands & Chakra
// ============================================================================
export function BhartiyaFlagEmblem({ width = 20, height = 14 }: { width?: number; height?: number }) {
  const chakraSize = height * 0.3;
  return (
    <View 
      style={{
        width,
        height,
        borderRadius: 3,
        overflow: 'hidden',
        borderWidth: 0.8,
        borderColor: 'rgba(0, 0, 0, 0.18)',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Saffron / Kesari Top Band */}
      <View style={{ flex: 1, backgroundColor: '#FF9933' }} />

      {/* White Middle Band with Ashoka Chakra */}
      <View 
        style={{ 
          flex: 1, 
          backgroundColor: '#FFFFFF', 
          justifyContent: 'center', 
          alignItems: 'center', 
        }}
      >
        <View 
          style={{
            width: chakraSize,
            height: chakraSize,
            borderRadius: chakraSize / 2,
            borderWidth: 0.8,
            borderColor: '#000080',
            backgroundColor: 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View 
            style={{
              width: chakraSize * 0.35,
              height: chakraSize * 0.35,
              borderRadius: (chakraSize * 0.35) / 2,
              backgroundColor: '#000080',
            }}
          />
        </View>
      </View>

      {/* India Green Bottom Band */}
      <View style={{ flex: 1, backgroundColor: '#138808' }} />
    </View>
  );
}

// ============================================================================
// 9. GLASS METAL SELECTOR & BADGE
// High-end glassmorphic UI components for Gold & Silver selection & badges
// ============================================================================
export interface GlassMetalSelectorProps {
  selectedMetal: 'GOLD' | 'SILVER';
  onSelectMetal: (metal: 'GOLD' | 'SILVER') => void;
  label?: string;
}

export function GlassMetalSelector({ selectedMetal, onSelectMetal, label = 'Metal Type' }: GlassMetalSelectorProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const handlePress = (metal: 'GOLD' | 'SILVER') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onSelectMetal(metal);
  };

  const isGoldSelected = selectedMetal === 'GOLD';
  const isSilverSelected = selectedMetal === 'SILVER';

  return (
    <View style={{ marginBottom: 20 }}>
      {label ? (
        <Text style={[glassStyles.inputLabel, { color: colors.vjText, marginBottom: 10 }]}>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {/* 🌟 24K GOLD GLASS BUTTON */}
        <TouchableOpacity
          onPress={() => handlePress('GOLD')}
          activeOpacity={0.85}
          style={{
            flex: 1,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 18,
            borderWidth: isGoldSelected ? 2 : 1.2,
            borderColor: isGoldSelected ? '#D4AF37' : 'rgba(212, 175, 55, 0.30)',
            backgroundColor: isGoldSelected
              ? (isDark ? 'rgba(212, 175, 55, 0.25)' : '#FEF3C7')
              : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.70)'),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '900',
              letterSpacing: 1,
              color: isGoldSelected ? (isDark ? '#FDE68A' : '#92400E') : `${colors.vjText}99`,
              backgroundColor: 'transparent',
            }}
          >
            GOLD
          </Text>
          <BullionBar3D isGold={true} scale={0.7} />
        </TouchableOpacity>

        {/* 🪙 STERLING SILVER GLASS BUTTON */}
        <TouchableOpacity
          onPress={() => handlePress('SILVER')}
          activeOpacity={0.85}
          style={{
            flex: 1,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 18,
            borderWidth: isSilverSelected ? 2 : 1.2,
            borderColor: isSilverSelected ? '#94A3B8' : 'rgba(148, 163, 184, 0.30)',
            backgroundColor: isSilverSelected
              ? (isDark ? 'rgba(148, 163, 184, 0.25)' : '#E2E8F0')
              : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.70)'),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '900',
              letterSpacing: 1,
              color: isSilverSelected ? (isDark ? '#F1F5F9' : '#0F172A') : `${colors.vjText}99`,
              backgroundColor: 'transparent',
            }}
          >
            SILVER
          </Text>
          <BullionBar3D isGold={false} scale={0.7} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function GlassMetalBadge({ metal }: { metal: 'GOLD' | 'SILVER' }) {
  const isGold = metal === 'GOLD';
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1.5,
        backgroundColor: isGold
          ? (isDark ? 'rgba(212, 175, 55, 0.20)' : '#FEF3C7')
          : (isDark ? 'rgba(148, 163, 184, 0.20)' : '#E2E8F0'),
        borderColor: isGold ? '#D4AF37' : '#94A3B8',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '900',
          letterSpacing: 0.8,
          color: isGold ? (isDark ? '#FDE68A' : '#92400E') : (isDark ? '#F1F5F9' : '#0F172A'),
        }}
      >
        {metal}
      </Text>
      <BullionBar3D isGold={isGold} scale={0.5} />
    </View>
  );
}

// ============================================================================
// 10. GLASS PICKER INPUT (Translucent Modal Sheet Trigger)
// ============================================================================
export interface GlassPickerInputProps {
  label?: string | undefined;
  placeholder?: string | undefined;
  selectedLabel?: string | null | undefined;
  selectedSublabel?: string | null | undefined;
  icon?: React.ReactNode | undefined;
  onPress: () => void;
  disabled?: boolean | undefined;
}

export function GlassPickerInput({
  label,
  placeholder = 'Select option...',
  selectedLabel,
  selectedSublabel,
  icon,
  onPress,
  disabled = false,
}: GlassPickerInputProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const handlePress = () => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onPress();
  };

  const containerBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.82)';
  const containerBorder = isDark ? 'rgba(212, 175, 55, 0.30)' : 'rgba(212, 175, 55, 0.35)';

  return (
    <View style={glassStyles.inputWrapper}>
      {label && (
        <Text
          style={[
            glassStyles.inputLabel,
            {
              color: colors.vjText,
              opacity: disabled ? 0.4 : 0.75,
            },
          ]}
        >
          {label}
        </Text>
      )}
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.75}
        style={[
          glassStyles.pickerContainer,
          {
            backgroundColor: containerBg,
            borderColor: containerBorder,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {icon ? <View style={{ marginRight: 12 }}>{icon}</View> : null}
        <View style={{ flex: 1, marginRight: 8 }}>
          {selectedLabel ? (
            <>
              <Text style={[glassStyles.pickerSelectedText, { color: colors.vjText }]} numberOfLines={1}>
                {selectedLabel}
              </Text>
              {selectedSublabel ? (
                <Text style={[glassStyles.pickerSublabel, { color: `${colors.vjText}99` }]} numberOfLines={1}>
                  {selectedSublabel}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              style={[
                glassStyles.pickerPlaceholder,
                { color: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(92, 22, 35, 0.38)' },
              ]}
              numberOfLines={1}
            >
              {placeholder}
            </Text>
          )}
        </View>
        <ChevronDown size={20} color={colors.vjText} style={{ opacity: 0.6 }} />
      </TouchableOpacity>
    </View>
  );
}

// Re-export FixedGlassBar for unified access
export * from './FixedGlassBar';

const glassStyles = StyleSheet.create({
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontWeight: '800',
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputIconBox: {
    marginRight: 12,
    opacity: 0.65,
  },
  inputText: {
    flex: 1,
    fontWeight: '700',
    fontSize: 15.5,
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  btnBase: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnIconBox: {
    marginRight: 4,
  },
  btnText: {
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  dropdownScroll: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    maxHeight: 240,
    borderRadius: 16,
    padding: 6,
    borderWidth: 1.2,
    zIndex: 1000,
    elevation: 8,
  },
  dropdownEmptyText: {
    textAlign: 'center',
    padding: 14,
    fontWeight: '600',
    opacity: 0.5,
    fontSize: 13,
  },
  dropdownItemRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  dropdownItemLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  dropdownItemSublabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  headerPillContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.2,
  },
  pickerSelectedText: {
    fontWeight: '800',
    fontSize: 15.5,
  },
  pickerSublabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  pickerPlaceholder: {
    fontWeight: '600',
    fontSize: 15,
  },
});