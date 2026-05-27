import React from 'react';
import { View, Text, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// Platform import removed — it was imported but never used (dead import).

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

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View className="flex-1 bg-vj-bg">
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* BACKGROUND GRADIENT */}
      <LinearGradient
        colors={['#FAF3E0', '#F5E6D3', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      {/* SAFE AREA */}
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-1 px-4 pt-2">

          {/* HEADER */}
          {(title || showBack || actionIcon) && (
            <View className="flex-row items-center justify-between mb-6 mt-2">
              <View className="flex-row items-center gap-4">
                {showBack && (
                  <TouchableOpacity
                    onPress={handleBack}
                    className="h-10 w-10 rounded-full bg-vj-glass justify-center items-center border border-white/60 shadow-sm"
                  >
                    <ChevronLeft size={24} color="#2E1D00" />
                  </TouchableOpacity>
                )}
                {title && (
                  <Text className="text-2xl font-bold text-vj-text tracking-tight shadow-sm">
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