// components/DateFormatModal.tsx — Phase 1 & Phase 2 Date Format Picker Modal
// Aligned with Phase 1 v6.2 (G67–G69) & Phase 2 FIX-DATEFORMAT-1 (v1.97 / v1.98 across all 6 options)

import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
import { format as formatDateFns } from 'date-fns';
import { COLORS } from '@/constants/theme';

interface DateFormatModalProps {
  visible: boolean;
  activeFormat: string;
  onSelectFormat: (formatToken: string) => void;
  onClose: () => void;
}

export function DateFormatModal({
  visible,
  activeFormat,
  onSelectFormat,
  onClose,
}: DateFormatModalProps) {
  const today = new Date();

  const getTodayPreview = (token: string) => {
    try {
      return formatDateFns(today, token);
    } catch {
      return formatDateFns(today, 'dd/MM/yyyy');
    }
  };

  // Full 6-option canonical format registry per Phase 1 v6.2 (G67–G69) and Phase 2 v1.97/v1.98
  const formats = [
    { token: 'dd/MM/yyyy', label: 'Compact (Default)' },
    { token: 'dd-MM-yyyy', label: 'Hyphen Variant' },
    { token: 'dd.MM.yyyy', label: 'Dot Variant' },
    { token: 'd MMM yyyy', label: 'Standard (Abbrev)' },
    { token: 'd MMMM yyyy', label: 'Formal (Full Month)' },
    { token: 'yyyy-MM-dd', label: 'ISO 8601 (Export/Ledger)' },
  ];

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="w-full bg-vj-bg rounded-3xl p-6 border border-white/50" style={{ maxWidth: 440 }}>
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-vj-text font-bold text-xl">Date Format</Text>
            <TouchableOpacity onPress={onClose} className="p-1 bg-black/5 rounded-full">
              <X size={20} color={COLORS.vjText} />
            </TouchableOpacity>
          </View>

          {formats.map((fmt) => {
            const isSelected = activeFormat === fmt.token;
            return (
              <TouchableOpacity
                key={fmt.token}
                onPress={() => onSelectFormat(fmt.token)}
                className={`p-3.5 rounded-xl border mb-2.5 flex-row justify-between items-center ${
                  isSelected ? 'bg-vj-text border-vj-text' : 'bg-white/60 border-black/10'
                }`}
              >
                <View>
                  <Text className={`font-bold text-base ${isSelected ? 'text-vj-bg' : 'text-vj-text'}`}>
                    {fmt.label}
                  </Text>
                  <Text className={`text-xs ${isSelected ? 'text-vj-bg/70' : 'text-vj-text/60'}`}>
                    {getTodayPreview(fmt.token)}
                  </Text>
                </View>
                {isSelected && <CheckCircle2 size={22} color="#FCFBF8" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
