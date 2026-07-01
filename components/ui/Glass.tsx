import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

// ============================================================================
// 1. GLASS CARD
// BlurView intensity 30 is the spec default. Note: on Android, expo-blur
// BlurView falls back to a semi-transparent overlay at low intensities — this
// is a known expo-blur limitation, not a bug in this code.
// ============================================================================
interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
}
export function GlassCard({ children, style, intensity = 30, ...props }: GlassCardProps) {
  return (
    <View className="rounded-3xl overflow-hidden mb-6 bg-white/60 border border-white" style={style} {...props}>
      <BlurView intensity={intensity} tint="light" style={{ padding: 20 }}>
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
  label?: string;
  icon?: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: any;
  maxLength?: number;
  autoCapitalize?: any;
  readOnly?: boolean;
  secureTextEntry?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
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
        className={`flex-row items-center rounded-2xl px-4 py-3 border ${
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
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
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
    primary: '#FCFBF8',   // Light on dark button
    secondary: '#5C1623', // Dark on light button
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
  sublabel?: string;
}

interface GlassSmartSearchProps {
  label?: string;
  placeholder?: string;
  options: SmartSearchOption[];
  selectedId: string | null;
  onSelect: (option: SmartSearchOption | null) => void;
  onFocusFetch?: () => void; // Triggered when input is focused to load fresh data
}

export function GlassSmartSearch({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
  onFocusFetch,
}: GlassSmartSearchProps) {
  const [query, setQuery] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(false);

  // Sync input display text with selected item when not typing
  React.useEffect(() => {
    if (!isFocused) {
      if (selectedId) {
        const selectedOpt = options.find((o) => o.id === selectedId);
        setQuery(selectedOpt ? selectedOpt.label : '');
      } else {
        setQuery('');
      }
    }
  }, [isFocused, selectedId, options]);

  const isTypingNewQuery = React.useMemo(() => {
    if (!isFocused) return false;
    const searchStr = query.toLowerCase();
    if (!searchStr) return false; // Empty input means not searching yet

    if (selectedId) {
      const selectedOpt = options.find((o) => o.id === selectedId);
      if (selectedOpt && searchStr === selectedOpt.label.toLowerCase()) {
        return false; // Still displaying the selected item's label, haven't typed anything new
      }
    }
    return true;
  }, [isFocused, query, options, selectedId]);

  // Compute filtered options up to 5 items to keep it inline-friendly
  const filteredOptions = React.useMemo(() => {
    if (!isTypingNewQuery) return [];
    
    const searchStr = query.toLowerCase();
    const filtered = (options || []).filter((opt) => {
      const labelMatch = opt.label ? String(opt.label).toLowerCase().includes(searchStr) : false;
      const sublabelMatch = opt.sublabel ? String(opt.sublabel).toLowerCase().includes(searchStr) : false;
      return labelMatch || sublabelMatch;
    });

    return filtered.slice(0, 5); // Max 5 items inline
  }, [isTypingNewQuery, query, options]);

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
      
      {/* Inline Dropdown List - ONLY SHOWS WHEN TYPING */}
      {isTypingNewQuery && (
        <View style={{ 
          marginTop: -10, 
          marginBottom: 16, 
          backgroundColor: '#FCFBF8', 
          borderRadius: 16, 
          padding: 8,
          borderWidth: 1,
          borderColor: 'rgba(92,22,35,0.1)',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4
        }}>
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
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#5C1623' }}>{opt.label}</Text>
                {opt.sublabel ? <Text style={{ fontSize: 12, color: 'rgba(92,22,35,0.6)', marginTop: 2 }}>{opt.sublabel}</Text> : null}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}