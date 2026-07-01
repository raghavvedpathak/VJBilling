import React from 'react';
import { View, Text, StatusBar, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { DynamicBackground } from './ui/DynamicBackground';

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

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    // DARK UPPER BACKGROUND
    <View className="flex-1 bg-vj-text">
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
                    className="h-10 w-10 rounded-full bg-white/10 justify-center items-center border border-white/20"
                  >
                    <ChevronLeft size={24} color="#FAF3E0" />
                  </TouchableOpacity>
                )}
                {title && (
                  <Text className="text-3xl font-bold text-vj-bg tracking-tight flex-shrink" numberOfLines={1}>
                    {title}
                  </Text>
                )}
              </View>
              {actionIcon && (
                <TouchableOpacity onPress={onAction} className="h-10 w-10 rounded-full bg-white/10 justify-center items-center border border-white/20">
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
        {/* ARCHITECT FIX: Added overflow-hidden to stop ScrollView height snapping */}
        <View className="flex-1 bg-vj-bg rounded-t-[32px] shadow-2xl overflow-hidden">
          <DynamicBackground />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 w-full max-w-[800px] self-center px-4 pt-4"
          >
            {children}
          </KeyboardAvoidingView>
        </View>

      </SafeAreaView>
    </View>
  );
}