// components/TwoToneWrapper.tsx — Phase 2 v2.11 Canonical Component

import React from 'react';
import { View, Text, StatusBar, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';

interface TwoToneWrapperProps {
  title?: string;
  children: React.ReactNode;
  showBack?: boolean;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  headerContent?: React.ReactNode;
}

export function TwoToneWrapper({ title, children, showBack, actionIcon, onAction, headerContent }: TwoToneWrapperProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;

  // Reactive subscription ensures component re-renders instantly on theme change from Settings
  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.vjBg }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* UPPER ZONE: Header */}
      <View 
        style={{ 
          backgroundColor: colors.vjHeaderBg || '#7A2200', 
          paddingTop: insets.top,
          borderBottomWidth: 1,
          borderBottomColor: colors.glassHeaderRim || 'rgba(255, 255, 255, 0.14)',
        }}
      >
        <View 
          className="w-full self-center px-4 pt-2 pb-6"
          style={{ maxWidth: isTablet ? 920 : undefined }}
        >
          {(title || showBack || actionIcon) && (
            <View className="flex-row items-center justify-between mb-4 mt-2">
              <View className="flex-row items-center gap-4 flex-1 mr-4">
                {showBack && (
                  <TouchableOpacity 
                    onPress={handleBack}
                    className="h-10 w-10 rounded-full bg-white/15 border border-white/25 justify-center items-center"
                    activeOpacity={0.7}
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
                <TouchableOpacity 
                  onPress={onAction} 
                  className="h-10 w-10 rounded-full bg-white/15 border border-white/25 justify-center items-center"
                  activeOpacity={0.7}
                >
                  {actionIcon}
                </TouchableOpacity>
              )}
            </View>
          )}

          {headerContent && <View className="mb-2">{headerContent}</View>}
        </View>
      </View>

      {/* LOWER ZONE */}
      <View 
        className="flex-1 -mt-4 rounded-t-[32px] overflow-hidden" 
        style={{ 
          backgroundColor: colors.vjBg,
          borderTopWidth: 1.5,
          borderTopColor: colors.glassJunctionRim || 'rgba(255, 255, 255, 0.85)',
        }}
      >
        <View
          className="flex-1 w-full self-center px-4 pt-4"
          style={{ 
            maxWidth: isTablet ? 920 : undefined,
            paddingBottom: Math.max(insets.bottom, 16) 
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}