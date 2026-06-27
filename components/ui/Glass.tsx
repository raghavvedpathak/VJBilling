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
      <BlurView intensity={intensity} tint="light" className="p-5">
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
          placeholder={placeholder}
          placeholderTextColor="#A0A0A0"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          editable={!readOnly}
          secureTextEntry={secureTextEntry}
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
          <Text className={`${textColors[variant]} font-bold text-lg text-center`}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}