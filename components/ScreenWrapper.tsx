import React from 'react';
import { View, Text, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DynamicBackground } from './ui/DynamicBackground';
import { getThemeColors } from '../constants/theme';
import { useStore } from 'zustand';
import { appSettingsStore } from '../store/appSettingsStore';

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
  // Reactive subscription ensures component re-renders instantly on theme change from Settings
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
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
        <View className="flex-1 w-full max-w-[800px] self-center px-4 pt-2">

          {/* HEADER */}
          {(title || showBack || actionIcon) && (
            <View className="flex-row items-center justify-between mb-6 mt-2">
              <View className="flex-row items-center gap-4">
                {showBack && (
                  <TouchableOpacity
                    onPress={handleBack}
                    className="h-10 w-10 rounded-full bg-vj-glass justify-center items-center border border-white/60 shadow-sm"
                  >
                    <ChevronLeft size={24} color={colors.vjText} />
                  </TouchableOpacity>
                )}
                {title && (
                  <Text className="text-2xl font-bold tracking-tight shadow-sm" style={{ color: colors.vjText }}>
                    {title}
                  </Text>
                )}
              </View>
              {actionIcon && (
                <TouchableOpacity
                  onPress={onAction}
                  className="h-10 w-10 rounded-full bg-vj-glass justify-center items-center border border-white/60"
                >
                  {actionIcon}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Custom Header Content */}
          {headerContent && <View className="mb-4">{headerContent}</View>}

          {/* BODY CONTENT */}
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}