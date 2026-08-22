// components/UnsavedChangesModal.tsx — Modern Glassmorphic Unsaved Changes Guard Modal

import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, X, ShieldAlert, ArrowLeft } from 'lucide-react-native';
import { GlassButton } from '@/components/ui/Glass';
import { COLORS } from '@/constants/theme';

interface UnsavedChangesModalProps {
  visible: boolean;
  onStay: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesModal({
  visible,
  onStay,
  onDiscard,
}: UnsavedChangesModalProps) {
  const handleStay = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    onStay();
  };

  const handleDiscard = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch (e) {}
    onDiscard();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleStay}
    >
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="w-full max-w-sm bg-[#FFFDF9] rounded-3xl p-6 shadow-2xl border-2 border-amber-500/30 items-center">
          {/* Header Icon */}
          <View className="h-16 w-16 rounded-3xl bg-amber-500/15 border-2 border-amber-500/30 items-center justify-center mb-4 shadow-xs">
            <AlertTriangle size={32} color="#D97706" />
          </View>

          {/* Title & Description */}
          <Text className="text-vj-text font-black text-xl text-center mb-2">
            Unsaved Changes
          </Text>
          
          <Text className="text-vj-text/70 text-sm text-center leading-5 mb-6 px-2">
            You have unsaved changes in this form. If you leave now, all modifications will be discarded.
          </Text>

          {/* Action Buttons */}
          <View className="w-full gap-3">
            {/* Primary Action: Keep Editing */}
            <GlassButton
              title="Keep Editing"
              variant="primary"
              onPress={handleStay}
            />

            {/* Destructive Action: Discard & Leave */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDiscard}
              className="w-full py-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 items-center justify-center flex-row gap-2"
            >
              <Text className="text-red-700 font-bold text-base">
                Discard & Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
