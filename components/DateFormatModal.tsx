// components/DateFormatModal.tsx — Phase 1 & Phase 2 Date Format Picker Modal

import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
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
  const getTodayPreview = (format: string) => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[today.getMonth()];

    switch (format) {
      case 'dd/MM/yyyy':
        return `${d}/${m}/${y}`;
      case 'd MMMM yyyy':
        return `${Number(d)} ${monthName} ${y}`;
      case 'dd-MM-yyyy':
        return `${d}-${m}-${y}`;
      case 'yyyy-MM-dd':
        return `${y}-${m}-${d}`;
      default:
        return `${d}/${m}/${y}`;
    }
  };

  const formats = [
    { token: 'dd/MM/yyyy', label: 'Compact (Default)' },
    { token: 'd MMMM yyyy', label: 'Professional' },
    { token: 'dd-MM-yyyy', label: 'Hyphen Variant' },
    { token: 'yyyy-MM-dd', label: 'ISO 8601 (Export)' },
  ];

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="w-full bg-vj-bg rounded-3xl p-6 shadow-xl border border-white/50">
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
                className={`p-4 rounded-xl border mb-3 flex-row justify-between items-center ${
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
                {isSelected && <CheckCircle2 size={24} color="#FCFBF8" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
