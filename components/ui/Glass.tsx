import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ViewProps, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

// ============================================================================
// 1. GLASS CARD
// BlurView intensity 30 is the spec default. Note: on Android, expo-blur
// BlurView falls back to a semi-transparent overlay at low intensities — this
// is a known expo-blur limitation, not a bug in this code.
// ============================================================================
interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number | undefined;
}
export function GlassCard({ children, style, intensity = 30, ...props }: GlassCardProps) {
  const flatStyle = React.useMemo(() => {
    if (!style) return {};
    if (Array.isArray(style)) return Object.assign({}, ...style);
    return flatStyleObj(style);
  }, [style]);

  const overflowStyle = flatStyle.overflow !== undefined ? flatStyle.overflow : 'hidden';

  return (
    <View className="rounded-3xl mb-4 bg-white/60 border border-white/40" style={[{ overflow: overflowStyle }, flatStyle]} {...props}>
      <BlurView intensity={intensity} tint="light" style={{ padding: 14, borderRadius: 24, overflow: overflowStyle }}>
        {children}
      </BlurView>
    </View>
  );
}

function flatStyleObj(style: any) {
  if (typeof style === 'object') return style;
  return {};
}

// ============================================================================
// 2. GLASS INPUT
// Added secureTextEntry prop — required for any password/PIN fields.
// readOnly visual styling: slightly dimmed label to communicate non-editable state.
// ============================================================================
interface GlassInputProps {
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

  const handleContainerPress = () => {
    if (!readOnly) {
      inputRef.current?.focus();
    }
  };

  return (
    <View className="mb-4">
      {label && (
        <TouchableOpacity
          activeOpacity={readOnly ? 1 : 0.7}
          onPress={handleContainerPress}
          disabled={readOnly}
        >
          <Text
            className={`font-bold text-xs uppercase tracking-wider mb-2 ml-1 ${
              readOnly ? 'text-vj-text/40' : 'text-vj-text/70'
            }`}
          >
            {label}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleContainerPress}
        disabled={readOnly}
        className={`flex-row items-center rounded-2xl px-4 py-3.5 border ${
          readOnly ? 'bg-gray-100/50 border-gray-300' : 'bg-white border-vj-text/30'
        }`}
      >
        {icon && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleContainerPress}
            disabled={readOnly}
            className="mr-3 opacity-60 text-vj-text"
          >
            {icon}
          </TouchableOpacity>
        )}
        <TextInput
          ref={inputRef}
          className="flex-1 text-vj-text font-semibold text-base py-0"
          style={{ textAlignVertical: 'center', includeFontPadding: false }}
          placeholder={placeholder}
          placeholderTextColor="#A0A0A0"
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
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
        />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// 3. GLASS BUTTON
// ============================================================================
interface GlassButtonProps {
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
  const baseStyle = 'flex-row justify-center items-center py-4 rounded-2xl';

  const variants = {
    primary: 'bg-vj-text border border-amber-500/30',
    secondary: 'bg-white/80 border border-vj-text/25',
    danger: 'bg-vj-danger/90 border border-red-700/40',
  };

  const textColors = {
    primary: 'text-vj-bg',
    secondary: 'text-vj-text',
    danger: 'text-white',
  };

  const spinnerColors = {
    primary: COLORS.vjBg,   // Light on dark button
    secondary: COLORS.vjText, // Dark on light button
    danger: '#ffffff',    // white on red
  };

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      // ignore
    }
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={style}
      className={`${baseStyle} ${variants[variant]} ${disabled ? 'opacity-50' : ''} relative`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColors[variant]} />
      ) : (
        <>
          {Boolean(icon) ? <View className="absolute left-6">{icon}</View> : null}
          <Text className={`${textColors[variant]} font-bold text-lg text-center`} style={{ includeFontPadding: false, textAlignVertical: 'center' }}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// 4. GLASS SMART SEARCH (INLINE COMBOBOX)
// ============================================================================
interface SmartSearchOption {
  id: string;
  label: string;
  sublabel?: string | undefined;
}

interface GlassSmartSearchProps {
  label?: string | undefined;
  placeholder?: string | undefined;
  options: SmartSearchOption[];
  selectedId: string | null;
  onSelect: (option: SmartSearchOption | null) => void;
  onFocusFetch?: (() => void) | undefined; // Triggered when input is focused to load fresh data
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

    return filtered.slice(0, 5); // Max 5 items inline
  }, [shouldShowOptions, query, options, showAllOnFocus, selectedId]);

  return (
    <View style={{ zIndex: isFocused ? 9999 : 1, elevation: isFocused ? 9999 : 1, position: 'relative' }}>
      <GlassInput
        label={label}
        placeholder={placeholder}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (selectedId) onSelect(null); // Clear selection if they start typing a new query
        }}
        onFocus={() => {
          setIsFocused(true);
          if (onFocusFetch) onFocusFetch();
        }}
        onBlur={() => {
          // Add a small delay so tap on list item registers before blur hides it
          setTimeout(() => setIsFocused(false), 200);
        }}
      />
      
      {/* Inline Dropdown List - ONLY SHOWS WHEN TYPING OR IF showAllOnFocus is true */}
      {shouldShowOptions && (
        <ScrollView 
          style={{ 
            position: 'absolute',
            top: 75,
            left: 0,
            right: 0,
            maxHeight: 250,
            backgroundColor: '#FCFBF8', 
            borderRadius: 16, 
            padding: 8,
            borderWidth: 1,
            borderColor: 'rgba(92,22,35,0.1)',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
            zIndex: 1000,
          }}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
        >
          {filteredOptions.length === 0 ? (
            <Text style={{ textAlign: 'center', color: 'rgba(92,22,35,0.5)', padding: 12, fontWeight: '500' }}>
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
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(92,22,35,0.05)',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.vjText }}>{opt.label}</Text>
                {opt.sublabel ? <Text style={{ fontSize: 12, color: 'rgba(92,22,35,0.6)', marginTop: 2 }}>{opt.sublabel}</Text> : null}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================================
// 6. MODERN GLASS HEADER PILL
// Sleek, modern iOS 17 / Material 3 glassmorphic pill badge for screen headers
// ============================================================================
interface HeaderPillProps {
  icon?: React.ReactNode;
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'info';
}

export function HeaderPill({ icon, label, variant = 'default' }: HeaderPillProps) {
  const containerStyles = {
    default: 'bg-white/10 border-white/20',
    success: 'bg-emerald-500/15 border-emerald-400/30',
    warning: 'bg-amber-500/15 border-amber-400/30',
    info: 'bg-sky-500/15 border-sky-400/30',
  };

  const textStyles = {
    default: 'text-vj-bg/90',
    success: 'text-emerald-300',
    warning: 'text-amber-200',
    info: 'text-sky-200',
  };

  return (
    <View className={`px-3 py-1 rounded-full border flex-row items-center gap-1.5 ${containerStyles[variant]}`}>
      {icon}
      <Text className={`text-xs font-bold ${textStyles[variant]}`}>
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// 7. 3D BULLION BAR COMPONENT
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        overflow: 'hidden',
        position: 'relative'
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
// 8. GLASS METAL SELECTOR & BADGE
// High-end glassmorphic UI components for Gold & Silver selection & badges
// ============================================================================
interface GlassMetalSelectorProps {
  selectedMetal: 'GOLD' | 'SILVER';
  onSelectMetal: (metal: 'GOLD' | 'SILVER') => void;
  label?: string;
}

export function GlassMetalSelector({ selectedMetal, onSelectMetal, label = 'Metal Type' }: GlassMetalSelectorProps) {
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
        <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
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
            borderWidth: isGoldSelected ? 2 : 1,
            borderColor: isGoldSelected ? '#D4AF37' : 'rgba(212, 175, 55, 0.25)',
            backgroundColor: isGoldSelected ? '#FEF3C7' : 'rgba(255, 255, 255, 0.5)',
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
              color: isGoldSelected ? '#92400E' : 'rgba(120, 53, 15, 0.5)',
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
            borderWidth: isSilverSelected ? 2 : 1,
            borderColor: isSilverSelected ? '#64748B' : 'rgba(148, 163, 184, 0.25)',
            backgroundColor: isSilverSelected ? '#E2E8F0' : 'rgba(255, 255, 255, 0.5)',
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
              color: isSilverSelected ? '#0F172A' : 'rgba(30, 41, 59, 0.5)',
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
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1.5,
        backgroundColor: isGold ? '#FEF3C7' : '#E2E8F0',
        borderColor: isGold ? '#D4AF37' : '#64748B',
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
          color: isGold ? '#92400E' : '#0F172A',
        }}
      >
        {metal}
      </Text>
      <BullionBar3D isGold={isGold} scale={0.5} />
    </View>
  );
}

// ============================================================================
// 9. GLASS PICKER INPUT (Modal Sheet Trigger)
// ============================================================================
interface GlassPickerInputProps {
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
  const handlePress = () => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onPress();
  };

  return (
    <View className="mb-4">
      {label && (
        <Text className="font-bold text-xs uppercase tracking-wider mb-2 ml-1 text-vj-text/70">
          {label}
        </Text>
      )}
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.75}
        className={`flex-row items-center justify-between rounded-2xl px-4 py-4 border bg-white border-vj-text/30 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {Boolean(icon) ? <View className="mr-3">{icon}</View> : null}
        <View className="flex-1 mr-2">
          {selectedLabel ? (
            <>
              <Text className="text-vj-text font-bold text-base" numberOfLines={1}>
                {selectedLabel}
              </Text>
              {selectedSublabel ? (
                <Text className="text-vj-text/60 text-xs mt-0.5" numberOfLines={1}>
                  {selectedSublabel}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-gray-400 font-semibold text-base" numberOfLines={1}>
              {placeholder}
            </Text>
          )}
        </View>
        <ChevronDown size={20} color={COLORS.vjText} style={{ opacity: 0.6 }} />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// 10. CENTRALIZED MENU TILE (Dashboard & Inventory Hub)
// ============================================================================
export interface MenuTileProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  borderColor?: string;
  badgeText?: string;
  badgeVariant?: 'active' | 'upcoming';
  alertCount?: number;
  disabled?: boolean;
  onPress?: () => void;
}

export function MenuTile({
  title,
  subtitle,
  icon,
  iconBg,
  borderColor,
  badgeText,
  badgeVariant = 'upcoming',
  alertCount,
  disabled,
  onPress,
}: MenuTileProps) {
  const hasAlert = alertCount !== undefined && alertCount > 0;
  return (
    <View style={{ width: '48%' }}>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
          if (onPress) onPress();
        }}
        activeOpacity={0.8}
      >
        <GlassCard
          style={{
            height: 146,
            marginBottom: 0,
            opacity: disabled ? 0.6 : 1,
            borderColor: hasAlert ? '#F59E0B' : borderColor,
            borderWidth: hasAlert ? 1.5 : (borderColor ? 1 : undefined),
            backgroundColor: hasAlert ? 'rgba(254, 243, 199, 0.55)' : undefined,
            padding: 14,
          }}
        >
          <View style={{ height: '100%', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ position: 'relative' }}>
                <View
                  style={{
                    padding: 10,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: hasAlert ? 'rgba(245,158,11,0.4)' : 'rgba(0,0,0,0.05)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: iconBg,
                  }}
                >
                  {icon}
                </View>
                {hasAlert && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      backgroundColor: '#EF4444',
                      borderRadius: 10,
                      minWidth: 18,
                      height: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      borderWidth: 1.5,
                      borderColor: '#FFFFFF',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                      {alertCount > 99 ? '99+' : alertCount}
                    </Text>
                  </View>
                )}
              </View>

              {badgeText ? (
                <View
                  className={`px-2 py-0.5 rounded-full border ${
                    hasAlert
                      ? 'bg-amber-500/20 border-amber-500/40'
                      : badgeVariant === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-black/5 border-black/10'
                  }`}
                >
                  <Text
                    className={`text-[8px] font-black uppercase tracking-wider ${
                      hasAlert
                        ? 'text-amber-700'
                        : badgeVariant === 'active'
                        ? 'text-emerald-700'
                        : 'text-vj-text/50'
                    }`}
                  >
                    {badgeText}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={{ marginTop: 6 }}>
              <Text className="text-vj-text font-black text-base leading-5 mb-0.5" numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text className="text-vj-text/50 text-[10px] font-bold uppercase" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// 12. GLASS SETTINGS TILE
// ============================================================================
export interface GlassSettingsTileProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function GlassSettingsTile({
  title,
  subtitle,
  icon,
  onPress,
  disabled,
}: GlassSettingsTileProps) {
  return (
    <TouchableOpacity
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
        if (onPress) onPress();
      }}
      disabled={disabled}
      activeOpacity={0.7}
      className="mb-2"
    >
      <GlassCard style={{ padding: 16, borderWidth: 1, borderColor: 'rgba(92,22,35,0.2)' }}>
        <View className={`flex-row items-center gap-4 ${disabled ? 'opacity-50' : ''}`}>
          <View className="bg-white/40 p-3 rounded-full border border-white/50">
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-vj-text font-bold text-base">{title}</Text>
            {subtitle ? <Text className="text-vj-text/60 text-xs">{subtitle}</Text> : null}
          </View>
          <View className="opacity-50">
            <ChevronRight size={20} color="#D4AF37" />
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// Re-export FixedGlassBar for unified access
export * from './FixedGlassBar';

