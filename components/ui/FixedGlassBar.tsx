import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getThemeColors, COLORS } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';

export interface FixedGlassBarProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | undefined;
  cardStyle?: ViewStyle | undefined;
  hideOnKeyboard?: boolean | undefined;
}

export function FixedGlassBar({ children, style, cardStyle, hideOnKeyboard = true }: FixedGlassBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  // Safe clearance above Android 3-button navigation bar (48-56dp), gesture home bar, or iOS home indicator
  const bottomOffset = Platform.select({
    ios: Math.max(insets.bottom, 16),
    android: Math.max(insets.bottom + 16, 64),
    default: 16,
  });
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Subscribe to active theme in store so FixedGlassBar re-renders live on theme switch
  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    if (!hideOnKeyboard) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [hideOnKeyboard]);

  // While typing, hide floating pill bar so inputs and form are 100% visible on both phones and tablets
  if (hideOnKeyboard && keyboardVisible) {
    return null;
  }

  return (
    <View style={[s.fixedPillWrapper, { bottom: bottomOffset }, style]} pointerEvents="box-none">
      <View
        style={[
          s.fixedPillCard,
          {
            maxWidth: isTablet ? 720 : 580,
            borderColor: colors.border ? `${colors.vjAccent}35` : 'rgba(212, 175, 55, 0.35)',
            backgroundColor: 'transparent',
          },
          cardStyle,
        ]}
      >
        <BlurView 
          intensity={Platform.OS === 'ios' ? 70 : 0} 
          tint={activeTheme === 'dark' ? 'dark' : 'light'} 
          {...(Platform.OS === 'android' ? { blurMethod: 'none' as const } : {})}
          style={[
            s.fixedPillBlurContent,
            {
              backgroundColor: activeTheme === 'dark' ? 'rgba(28, 20, 24, 0.88)' : 'rgba(255, 255, 255, 0.88)',
            },
          ]}
        >
          <View style={s.fixedBottomBarRow}>
            {children}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

// Dynamic theme-aware pill styles resolved live on every render
export const fixedBarStyles = {
  get pillPrimaryBtn(): ViewStyle {
    const colors = getThemeColors();
    return {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.vjAccent,
      paddingVertical: 14,
      borderRadius: 28,
    };
  },
  get pillPrimaryText(): TextStyle {
    return {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    };
  },
  get pillSecondaryBtn(): ViewStyle {
    const colors = getThemeColors();
    return {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.vjAccentLight || 'rgba(212, 175, 55, 0.12)',
      borderWidth: 1,
      borderColor: colors.border || 'rgba(212, 175, 55, 0.25)',
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 28,
    };
  },
  get pillSecondaryText(): TextStyle {
    const colors = getThemeColors();
    return {
      color: colors.vjText,
      fontSize: 14,
      fontWeight: '700',
    };
  },
};

const s = StyleSheet.create({
  fixedPillWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 99,
  },
  fixedPillCard: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  fixedPillBlurContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 36,
    backgroundColor: 'transparent',
  },
  fixedBottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
