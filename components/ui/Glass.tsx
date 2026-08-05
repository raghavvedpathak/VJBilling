import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ViewProps, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
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
  return (
    <View className="rounded-3xl mb-6 bg-white/60 border border-white" style={[{ overflow: 'visible' }, style]} {...props}>
      <BlurView intensity={intensity} tint="light" style={{ padding: 20, borderRadius: 24, overflow: 'visible' }}>
        {children}
      </BlurView>
    </View>
  );
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
  readOnly,
  secureTextEntry,
  onFocus,
  onBlur,
  onSubmitEditing,
}: GlassInputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text
          className={`font-bold text-xs uppercase tracking-wider mb-2 ml-1 ${
            readOnly ? 'text-vj-text/40' : 'text-vj-text/70'
          }`}
        >
          {label}
        </Text>
      )}
      <View
        className={`flex-row items-center rounded-2xl px-4 py-4 border ${
          readOnly ? 'bg-gray-100/50 border-gray-300' : 'bg-white border-vj-text/30'
        }`}
      >
        {icon && <View className="mr-3 opacity-60 text-vj-text">{icon}</View>}
        <TextInput
          className="flex-1 text-vj-text font-semibold text-base"
          style={{ paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }}
          placeholder={placeholder}
          placeholderTextColor="#A0A0A0"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          editable={!readOnly}
          secureTextEntry={secureTextEntry}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
        />
      </View>
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
}
export function GlassButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
}: GlassButtonProps) {
  const baseStyle = 'flex-row justify-center items-center py-4 rounded-2xl';

  const variants = {
    primary: 'bg-vj-text',
    secondary: 'bg-white/60 border border-white',
    danger: 'bg-vj-danger/90',
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      className={`${baseStyle} ${variants[variant]} ${disabled ? 'opacity-50' : ''} relative`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColors[variant]} />
      ) : (
        <>
          {icon && <View className="absolute left-6">{icon}</View>}
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
    <View style={{ zIndex: isFocused ? 50 : 1, position: 'relative' }}>
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