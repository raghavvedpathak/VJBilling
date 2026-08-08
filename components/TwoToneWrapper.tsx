import React from 'react';
import { View, Text, StatusBar, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { DynamicBackground } from './ui/DynamicBackground';
import { getThemeColors } from '../constants/theme';
import { useStore } from 'zustand';
import { appSettingsStore } from '../store/appSettingsStore';

interface TwoToneWrapperProps {
  title?: string;
  children: React.ReactNode;
  showBack?: boolean;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  headerContent?: React.ReactNode;
}

export function TwoToneWrapper({ title, children, showBack, actionIcon, onAction, headerContent }: TwoToneWrapperProps) {
  const insets = useSafeAreaInsets();
  // Reactive subscription ensures component re-renders instantly on theme change from Settings
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    // UPPER BRAND HEADER BACKGROUND (Vibrant Royal Maroon/Crimson Theme Color)
    <View style={{ flex: 1, backgroundColor: colors.vjHeaderBg || '#420D19' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        
        {/* === UPPER ZONE (DARK) === */}
        <View className="w-full max-w-[800px] self-center px-4 pt-2 pb-6">
          
          {/* HEADER BAR */}
          {(title || showBack || actionIcon) && (
            <View className="flex-row items-center justify-between mb-6 mt-2">
              <View className="flex-row items-center gap-4 flex-1 mr-4">
                {showBack && (
                  <TouchableOpacity 
                    onPress={handleBack}
                    className="h-10 w-10 rounded-full bg-white/12 justify-center items-center"
                  >
                    <ChevronLeft size={24} color={colors.vjBg} />
                  </TouchableOpacity>
                )}
                {title && (
                  <Text className="text-3xl font-bold tracking-tight flex-shrink" style={{ color: colors.vjBg }} numberOfLines={1}>
                    {title}
                  </Text>
                )}
              </View>
              {actionIcon && (
                <TouchableOpacity onPress={onAction} className="h-10 w-10 rounded-full bg-white/12 justify-center items-center">
                  {actionIcon}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* INJECTED HEADER CONTENT */}
          {headerContent && (
            <View className="mb-2">
              {headerContent}
            </View>
          )}
        </View>

        {/* === LOWER ZONE (LIGHT WITH ROUNDED CORNERS) === */}
        {/* ARCHITECT FIX: Clean rounded top panel without shadow seam strip */}
        <View className="flex-1 rounded-t-[32px] overflow-hidden" style={{ backgroundColor: colors.vjBg }}>
          <DynamicBackground />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 w-full max-w-[800px] self-center px-4 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            {children}
          </KeyboardAvoidingView>
        </View>

      </SafeAreaView>
    </View>
  );
}