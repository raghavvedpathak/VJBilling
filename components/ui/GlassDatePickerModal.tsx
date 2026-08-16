import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ChevronUp, ChevronDown, Calendar as CalendarIcon, X, Check } from 'lucide-react-native';
import { COLORS } from '@/constants/theme';
import { formatDate } from '@/utils/formatDate';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTH_FULL_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface GlassDatePickerModalProps {
  visible: boolean;
  title?: string;
  value: string; // ISO string 'YYYY-MM-DD'
  maxDate?: string; // ISO string 'YYYY-MM-DD' (defaults to today)
  onClose: () => void;
  onSelect: (dateIso: string) => void;
}

export function GlassDatePickerModal({
  visible,
  title = 'Select Date',
  value,
  maxDate,
  onClose,
  onSelect,
}: GlassDatePickerModalProps) {
  const today = useMemo(() => new Date(), []);
  const maxDateIso = useMemo(() => {
    if (maxDate) return maxDate;
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [maxDate, today]);

  const [date, setDate] = useState<Date>(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    }
    return new Date();
  });

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      if (value) {
        const parts = value.split('-');
        if (parts.length === 3) {
          setDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
        }
      }
    }
  }, [visible, value]);

  const selectedIso = useMemo(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [date]);

  const isFuture = selectedIso > maxDateIso;

  const handleDayStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta);
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      const d = String(next.getDate()).padStart(2, '0');
      if (`${y}-${m}-${d}` > maxDateIso) return prev;
      return next;
    });
  };

  const handleMonthStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, prev.getDate());
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      const d = String(next.getDate()).padStart(2, '0');
      if (`${y}-${m}-${d}` > maxDateIso) return prev;
      return next;
    });
  };

  const handleYearStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    setDate((prev) => {
      const next = new Date(prev.getFullYear() + delta, prev.getMonth(), prev.getDate());
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      const d = String(next.getDate()).padStart(2, '0');
      if (`${y}-${m}-${d}` > maxDateIso) return prev;
      return next;
    });
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday') => {
    try { Haptics.selectionAsync(); } catch {}
    const now = new Date();
    if (preset === 'today') {
      setDate(now);
    } else if (preset === 'yesterday') {
      setDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    }
  };

  const handleConfirm = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    onSelect(selectedIso);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalOverlay}
      >
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1} 
          onPress={() => { Keyboard.dismiss(); onClose(); }} 
        />
        <View style={s.modalContainer}>
          <BlurView intensity={40} tint="light" style={s.blurContent}>
            
            {/* Header */}
            <View style={s.headerRow}>
              <View style={s.headerTitleWrap}>
                <CalendarIcon size={18} color={COLORS.vjAccent} />
                <Text style={s.headerTitle}>{title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
                <X size={18} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={s.presetRow}>
              <TouchableOpacity
                style={[
                  s.presetChip,
                  selectedIso === maxDateIso && s.presetChipActive,
                ]}
                onPress={() => handleQuickPreset('today')}
              >
                <Text
                  style={[
                    s.presetChipText,
                    selectedIso === maxDateIso && s.presetChipTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.presetChip}
                onPress={() => handleQuickPreset('yesterday')}
              >
                <Text style={s.presetChipText}>
                  Yesterday
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stepper Cards */}
            <View style={s.stepperGrid}>
              {/* Day Col */}
              <View style={s.stepperCol}>
                <Text style={s.stepperColLabel}>DAY</Text>
                <TouchableOpacity
                  onPress={() => handleDayStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
                <Text style={s.stepValText}>{String(date.getDate()).padStart(2, '0')}</Text>
                <TouchableOpacity
                  onPress={() => handleDayStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
              </View>

              {/* Month Col */}
              <View style={s.stepperCol}>
                <Text style={s.stepperColLabel}>MONTH</Text>
                <TouchableOpacity
                  onPress={() => handleMonthStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
                <Text style={s.stepValText}>{MONTH_NAMES[date.getMonth()]}</Text>
                <TouchableOpacity
                  onPress={() => handleMonthStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
              </View>

              {/* Year Col */}
              <View style={s.stepperCol}>
                <Text style={s.stepperColLabel}>YEAR</Text>
                <TouchableOpacity
                  onPress={() => handleYearStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
                <Text style={s.stepValText}>{date.getFullYear()}</Text>
                <TouchableOpacity
                  onPress={() => handleYearStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={COLORS.vjAccent} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Live Preview Card */}
            <View style={s.previewCard}>
              <Text style={s.previewLabel}>Selected Date</Text>
              <Text style={s.previewVal}>
                {date.getDate()} {MONTH_FULL_NAMES[date.getMonth()]} {date.getFullYear()}
              </Text>
              <Text style={s.previewFormatted}>
                Format: {formatDate(selectedIso)}
              </Text>
            </View>

            {/* Actions */}
            <View style={s.actionRow}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.confirmBtn, isFuture && s.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={isFuture}
                activeOpacity={0.8}
              >
                <Check size={16} color="#fff" />
                <Text style={s.confirmBtnText}>Set Date</Text>
              </TouchableOpacity>
            </View>

          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255, 253, 249, 0.98)',
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 10,
  },
  blurContent: {
    padding: 20,
    borderRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92, 22, 35, 0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.vjText,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.1)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderColor: '#D4AF37',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.vjText,
  },
  presetChipTextActive: {
    color: '#92400E',
    fontWeight: '800',
  },
  stepperGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  stepperCol: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  stepperColLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(92, 22, 35, 0.5)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  stepBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    marginVertical: 2,
  },
  stepValText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
    fontFamily: 'monospace',
    marginVertical: 4,
  },
  previewCard: {
    backgroundColor: 'rgba(92, 22, 35, 0.04)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.08)',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(92, 22, 35, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewVal: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.vjText,
  },
  previewFormatted: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.vjAccent,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.15)',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.vjText,
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: COLORS.vjAccent,
    shadowColor: COLORS.vjAccent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
