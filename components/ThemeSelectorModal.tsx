// components/ThemeSelectorModal.tsx — Phase 1 & Phase 2 Theme Selector Modal

import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
import { COLORS, THEME_PRESETS } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';

interface ThemeSelectorModalProps {
  visible: boolean;
  activeTheme: string;
  onSelectTheme: (themeId: string) => void;
  onClose: () => void;
}

export function ThemeSelectorModal({
  visible,
  activeTheme,
  onSelectTheme,
  onClose,
}: ThemeSelectorModalProps) {
  const activeStoreTheme = appSettingsStore((s) => s.theme);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="w-full bg-vj-bg rounded-3xl p-6 border border-white/50">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-vj-text font-bold text-xl">App Theme</Text>
            <TouchableOpacity onPress={onClose} className="p-1 bg-black/5 rounded-full">
              <X size={20} color={COLORS.vjText} />
            </TouchableOpacity>
          </View>

          <View className="mb-2">
            {[
              { id: 'saffron', label: 'Royal Kesari Gold (Default)' },
              { id: 'platinum_sapphire', label: 'Platinum & Star Sapphire' },
              { id: 'sandstone_ochre', label: 'Reth Sandstone Silk & Ochre' },
              { id: 'tourmaline_rosegold', label: 'Rose Gold & Pink Tourmaline' },
            ].map((t) => {
              const preset = THEME_PRESETS[t.id as keyof typeof THEME_PRESETS] || THEME_PRESETS.saffron;
              const isApplied = activeTheme === t.id || activeStoreTheme === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => onSelectTheme(t.id)}
                  className={`p-3.5 rounded-2xl border mb-3 flex-row justify-between items-center ${
                    isApplied ? 'bg-vj-text border-vj-text' : 'bg-white/70 border-black/10'
                  }`}
                >
                  <View className="flex-row items-center gap-3 flex-1 mr-2">
                    <View className="flex-row items-center p-1 rounded-full bg-black/10 border border-black/10 gap-1">
                      <View
                        className="w-4 h-4 rounded-full border border-white/40"
                        style={{ backgroundColor: preset.vjHeaderBg }}
                      />
                      <View
                        className="w-4 h-4 rounded-full border border-black/20"
                        style={{ backgroundColor: preset.vjBg }}
                      />
                      <View
                        className="w-4 h-4 rounded-full border border-white/40"
                        style={{ backgroundColor: preset.vjAccent }}
                      />
                    </View>

                    <Text
                      className={`font-bold text-sm flex-1 ${isApplied ? 'text-vj-bg' : 'text-vj-text'}`}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>

                    {isApplied && (
                      <View className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 mr-1">
                        <Text className="text-[8px] font-black text-emerald-800 uppercase tracking-wider">
                          APPLIED
                        </Text>
                      </View>
                    )}
                  </View>

                  {isApplied && <CheckCircle2 size={22} color={COLORS.vjBg} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
