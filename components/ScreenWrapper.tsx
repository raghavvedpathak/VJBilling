// components/ScreenWrapper.tsx — Phase 2 v2.11 Canonical Component

import React from 'react';
import { View, Text, StatusBar, TouchableOpacity, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { DynamicBackground } from '@/components/ui/DynamicBackground';
import { getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';

interface ScreenWrapperProps {
  title?: string;
  children: React.ReactNode;
  showBack?: boolean;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  headerContent?: React.ReactNode;
}

export function ScreenWrapper({
  title,
  children,
  showBack,
  actionIcon,
  onAction,
  headerContent,
}: ScreenWrapperProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // Reactive subscription ensures component re-renders instantly on theme change from Settings
  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.vjBg }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <DynamicBackground />

      {/* SAFE AREA */}
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View 
          className="flex-1 w-full self-center px-4 pt-2"
          style={{ maxWidth: isTablet ? 920 : undefined, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {/* HEADER */}
          {(title || showBack || actionIcon) && (
            <View className="flex-row items-center justify-between mb-6 mt-2">
              <View className="flex-row items-center gap-4">
                {showBack && (
                  <TouchableOpacity
                    onPress={handleBack}
                    className="h-10 w-10 rounded-full bg-vj-glass justify-center items-center border border-white/30"
                  >
                    <ChevronLeft size={24} color={colors.vjText} />
                  </TouchableOpacity>
                )}
                {title && (
                  <Text className="text-2xl font-bold tracking-tight" style={{ color: colors.vjText }}>
                    {title}
                  </Text>
                )}
              </View>
              {actionIcon && (
                <TouchableOpacity
                  onPress={onAction}
                  className="h-10 w-10 rounded-full bg-vj-glass justify-center items-center border border-white/30"
                >
                  {actionIcon}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Custom Header Content */}
          {headerContent && <View className="mb-4">{headerContent}</View>}

          {/* BODY CONTENT */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View className="flex-1 w-full">
              {children}
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </View>
  );
}