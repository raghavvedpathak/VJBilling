import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle, Keyboard, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';

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
  // Safe clearance above Android 3-button navigation, tablet taskbar, gesture bar, or iOS home indicator
  const bottomOffset = Math.max(insets.bottom, 16);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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
      <View style={[s.fixedPillCard, { maxWidth: isTablet ? 720 : 580 }, cardStyle]}>
        <BlurView intensity={50} tint="light" style={s.fixedPillBlurContent}>
          <View style={s.fixedBottomBarRow}>
            {children}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

export const fixedBarStyles = StyleSheet.create({
  pillPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.vjAccent,
    paddingVertical: 14,
    borderRadius: 28,
  },
  pillPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pillSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(92, 22, 35, 0.08)',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
  },
  pillSecondaryText: {
    color: COLORS.vjText,
    fontSize: 14,
    fontWeight: '700',
  },
});

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
    borderColor: 'rgba(212, 175, 55, 0.35)',
    backgroundColor: 'rgba(255, 253, 249, 0.95)',
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
