// components/ui/GlassDatePickerModal.tsx — Centralized Glassmorphic Date Picker for VJ Billing
// Purpose: High-performance date stepper picker modal with translucent frosted glass styling.
// Visual Architecture: Frosted Glass Sheet, Etched Stepper Tiles, Golden Accents, and Dynamic Theme Tokens.

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
import { COLORS, getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
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

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

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
        <View 
          style={[
            s.modalContainer,
            { borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.35)' }
          ]}
        >
          <BlurView 
            intensity={Platform.OS === 'ios' ? 70 : 0} 
            tint={isDark ? 'dark' : 'light'} 
            {...(Platform.OS === 'android' ? { blurMethod: 'none' as const } : {})}
            style={[
              s.blurContent,
              {
                backgroundColor: isDark ? 'rgba(28, 20, 24, 0.92)' : 'rgba(255, 253, 249, 0.92)',
              }
            ]}
          >
            
            {/* Header */}
            <View style={s.headerRow}>
              <View style={s.headerTitleWrap}>
                <CalendarIcon size={18} color={colors.vjAccent} />
                <Text style={[s.headerTitle, { color: colors.vjText }]}>{title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
                <X size={18} color={colors.vjText} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={s.presetRow}>
              <TouchableOpacity
                style={[
                  s.presetChip,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(212, 175, 55, 0.08)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(212, 175, 55, 0.20)',
                  },
                  selectedIso === maxDateIso && s.presetChipActive,
                ]}
                onPress={() => handleQuickPreset('today')}
              >
                <Text
                  style={[
                    s.presetChipText,
                    { color: colors.vjText },
                    selectedIso === maxDateIso && s.presetChipTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.presetChip,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(212, 175, 55, 0.08)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(212, 175, 55, 0.20)',
                  },
                ]}
                onPress={() => handleQuickPreset('yesterday')}
              >
                <Text style={[s.presetChipText, { color: colors.vjText }]}>
                  Yesterday
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stepper Cards */}
            <View style={s.stepperGrid}>
              {/* Day Col */}
              <View 
                style={[
                  s.stepperCol,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.25)',
                  }
                ]}
              >
                <Text style={[s.stepperColLabel, { color: `${colors.vjText}80` }]}>DAY</Text>
                <TouchableOpacity
                  onPress={() => handleDayStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={colors.vjAccent} />
                </TouchableOpacity>
                <Text style={[s.stepValText, { color: colors.vjText }]}>
                  {String(date.getDate()).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDayStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={colors.vjAccent} />
                </TouchableOpacity>
              </View>

              {/* Month Col */}
              <View 
                style={[
                  s.stepperCol,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.25)',
                  }
                ]}
              >
                <Text style={[s.stepperColLabel, { color: `${colors.vjText}80` }]}>MONTH</Text>
                <TouchableOpacity
                  onPress={() => handleMonthStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={colors.vjAccent} />
                </TouchableOpacity>
                <Text style={[s.stepValText, { color: colors.vjText }]}>
                  {MONTH_NAMES[date.getMonth()]}
                </Text>
                <TouchableOpacity
                  onPress={() => handleMonthStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={colors.vjAccent} />
                </TouchableOpacity>
              </View>

              {/* Year Col */}
              <View 
                style={[
                  s.stepperCol,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.25)',
                  }
                ]}
              >
                <Text style={[s.stepperColLabel, { color: `${colors.vjText}80` }]}>YEAR</Text>
                <TouchableOpacity
                  onPress={() => handleYearStep(1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronUp size={18} color={colors.vjAccent} />
                </TouchableOpacity>
                <Text style={[s.stepValText, { color: colors.vjText }]}>
                  {date.getFullYear()}
                </Text>
                <TouchableOpacity
                  onPress={() => handleYearStep(-1)}
                  style={s.stepBtn}
                  activeOpacity={0.7}
                >
                  <ChevronDown size={18} color={colors.vjAccent} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Live Preview Card */}
            <View 
              style={[
                s.previewCard,
                {
                  backgroundColor: isDark ? 'rgba(212, 175, 55, 0.08)' : 'rgba(212, 175, 55, 0.08)',
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.20)',
                }
              ]}
            >
              <Text style={[s.previewLabel, { color: `${colors.vjText}80` }]}>SELECTED DATE</Text>
              <Text style={[s.previewVal, { color: colors.vjText }]}>{selectedIso}</Text>
              <Text style={[s.previewFormatted, { color: colors.vjAccent }]}>{formatDate(selectedIso)}</Text>
            </View>

            {/* Actions */}
            <View style={s.actionRow}>
              <TouchableOpacity
                onPress={onClose}
                style={[
                  s.cancelBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(212, 175, 55, 0.10)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.25)',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Text style={[s.cancelBtnText, { color: colors.vjText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirm}
                disabled={isFuture}
                style={[
                  s.confirmBtn,
                  { backgroundColor: colors.vjAccent },
                  isFuture && s.confirmBtnDisabled
                ]}
                activeOpacity={0.8}
              >
                <Check size={16} color="#fff" />
                <Text style={s.confirmBtnText}>Confirm Date</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  blurContent: {
    padding: 22,
    borderRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
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
    borderWidth: 1,
  },
  presetChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D4AF37',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1.2,
  },
  stepperColLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  stepBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    marginVertical: 2,
  },
  stepValText: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginVertical: 4,
  },
  previewCard: {
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  previewFormatted: {
    fontSize: 11,
    fontWeight: '600',
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
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
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
