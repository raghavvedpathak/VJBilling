// components/SettleMetalModal.tsx — Step 3 / v4.7 Metal-to-Money Settlement Modal
// Settle outstanding fine metal balance as money at a shop-owner-entered bhav rate.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Karigar } from '@/types/phase3/phase3.types';
import { karigarMasterService } from '@/services/phase3/karigarMasterService';
import { getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { getCurrencySymbol } from '@/utils/currency';
import { X, Scale, Coins, CheckCircle2 } from 'lucide-react-native';

interface SettleMetalModalProps {
  visible: boolean;
  onClose: () => void;
  karigar: Karigar | null;
  currentMetalBalanceMg: number;
  onSuccess: () => void;
}

export function SettleMetalModal({
  visible,
  onClose,
  karigar,
  currentMetalBalanceMg,
  onSuccess,
}: SettleMetalModalProps) {
  const currencySymbol = getCurrencySymbol();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const themeColors = {
    surface: '#FFFFFF',
    text: colors.vjText,
    textSecondary: '#64748B',
    background: colors.vjBg,
    primary: colors.vjAccent,
    border: colors.border,
  };

  const [settleGramsText, setSettleGramsText] = useState('');
  const [ratePerGramRupees, setRatePerGramRupees] = useState('');
  const [cashRupeesText, setCashRupeesText] = useState('');
  const [refId, setRefId] = useState('');
  const [metalOutEntries, setMetalOutEntries] = useState<any[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && karigar) {
      // Default to settling entire outstanding fine metal balance
      const defaultGrams = Math.max(0, currentMetalBalanceMg / 1000);
      setSettleGramsText(defaultGrams > 0 ? defaultGrams.toFixed(3) : '');
      setRatePerGramRupees('');
      setCashRupeesText('');
      setNotes('');
      setIsLoadingEntries(true);

      karigarMasterService
        .getKarigarLedgerEntries(karigar.firmId, karigar.id)
        .then((entries) => {
          const issues = entries.filter((e) => e.type === 'METAL_OUT');
          setMetalOutEntries(issues);
          if (issues.length > 0) {
            setRefId(issues[issues.length - 1].id);
          } else {
            setRefId('');
          }
        })
        .catch((err) => {
          console.warn('[SettleMetalModal] Error loading METAL_OUT entries:', err);
        })
        .finally(() => {
          setIsLoadingEntries(false);
        });
    }
  }, [visible, karigar, currentMetalBalanceMg]);

  if (!karigar) return null;

  const currentFineGrams = (currentMetalBalanceMg / 1000).toFixed(3);
  const settleGrams = parseFloat(settleGramsText) || 0;
  const settleMg = Math.round(settleGrams * 1000);
  const rateRupees = parseFloat(ratePerGramRupees) || 0;
  const ratePaise = Math.round(rateRupees * 100);
  const totalAmountPaise = Math.round((settleMg / 1000) * ratePaise);
  const totalRupees = (totalAmountPaise / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

  const cashRupees = parseFloat(cashRupeesText) || 0;
  const cashPaise = Math.round(cashRupees * 100);

  const hasMetal = settleMg > 0;
  const hasCash = cashPaise > 0;
  const isExceeding = settleMg > currentMetalBalanceMg;
  const isValidMetal = !hasMetal || (ratePaise > 0 && !isExceeding && refId.trim().length > 0);
  const isValid = (hasMetal || hasCash) && isValidMetal;

  const handleSettle = async () => {
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const isMixed = hasMetal && hasCash;
      await karigarMasterService.recordKarigarMixedPayment({
        firmId: karigar.firmId,
        karigarId: karigar.id,
        paymentDate: new Date().toISOString(),
        fineWeightMg: settleMg,
        ratePaisePerGram: hasMetal ? ratePaise : 0,
        moneyAmountPaise: cashPaise,
        linkedMetalEntryId: hasMetal ? refId.trim() : undefined,
        linkedJobWorkId: refId.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isMixed) {
        Alert.alert(
          'Mixed Payment Recorded',
          `Successfully settled ${(settleMg / 1000).toFixed(3)}g fine metal (${currencySymbol}${totalRupees}) and recorded ${currencySymbol}${cashRupees.toLocaleString('en-IN')} cash labour payment.`
        );
      } else if (hasMetal) {
        Alert.alert(
          'Settlement Complete',
          `Successfully settled ${(settleMg / 1000).toFixed(3)}g fine metal into ${currencySymbol}${totalRupees} payable cash.`
        );
      } else {
        Alert.alert(
          'Labour Payment Complete',
          `Successfully recorded ${currencySymbol}${cashRupees.toLocaleString('en-IN')} cash labour payment.`
        );
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Payment Failed', getUserFriendlyErrorMessage(err?.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Settle Metal as Money</Text>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                {karigar.name} {karigar.speciality ? `• ${karigar.speciality}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: themeColors.border }]}>
              <X size={20} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Outstanding Summary Banner */}
            <View style={[styles.balanceBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
              <Scale size={20} color="#F59E0B" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.bannerLabel}>Outstanding Fine Metal</Text>
                <Text style={styles.bannerValue}>{currentFineGrams} g Fine Gold</Text>
              </View>
            </View>

            {/* Settle Weight Input */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                  Fine Weight to Settle (Grams)
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const maxG = Math.max(0, currentMetalBalanceMg / 1000);
                    setSettleGramsText(maxG.toFixed(3));
                  }}
                >
                  <Text style={[styles.maxLink, { color: themeColors.primary }]}>Max ({currentFineGrams}g)</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: isExceeding ? '#EF4444' : themeColors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text }]}
                  placeholder="0.000"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={settleGramsText}
                  onChangeText={setSettleGramsText}
                />
                <Text style={[styles.unitText, { color: themeColors.textSecondary }]}>grams</Text>
              </View>
              {isExceeding && (
                <Text style={styles.errorText}>
                  Exceeds outstanding fine balance of {currentFineGrams}g
                </Text>
              )}
            </View>

            {/* Bhav Rate Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Agreed Bhav Rate ({currencySymbol} per Gram)
              </Text>
              <View style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Text style={[styles.currencyPrefix, { color: themeColors.textSecondary }]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text }]}
                  placeholder="e.g. 7200"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={ratePerGramRupees}
                  onChangeText={setRatePerGramRupees}
                />
                <Text style={[styles.unitText, { color: themeColors.textSecondary }]}>/g</Text>
              </View>
            </View>

            {/* Calculated Payable Box */}
            <View style={[styles.calculatedCard, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}>
              <Coins size={22} color="#10B981" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.calculatedLabel}>Converted Money Payable</Text>
                <Text style={styles.calculatedAmount}>{currencySymbol} {totalRupees}</Text>
                <Text style={styles.calculatedSub}>
                  ({(settleMg / 1000).toFixed(3)}g × {currencySymbol}{rateRupees.toLocaleString('en-IN')}/g)
                </Text>
              </View>
            </View>

            {/* Linked METAL_OUT Entry Reference */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Linked Metal Issue (METAL_OUT Voucher ID) *
              </Text>
              {metalOutEntries.length > 0 ? (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 4 }}>
                    Available Metal Issues:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    {metalOutEntries.map((m) => {
                      const isSelected = refId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          onPress={() => setRefId(m.id)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            marginRight: 8,
                            borderWidth: 1,
                            borderColor: isSelected ? themeColors.primary : themeColors.border,
                            backgroundColor: isSelected ? `${themeColors.primary}20` : themeColors.background,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: isSelected ? '700' : '400', color: isSelected ? themeColors.primary : themeColors.text }}>
                            {(m.weightMg / 1000).toFixed(2)}g ({m.purityPct}%) — {m.id.slice(0, 8)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: '#EF4444', marginBottom: 4 }}>
                  No METAL_OUT issue entries found for this karigar.
                </Text>
              )}
              <View style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text }]}
                  placeholder="ID of METAL_OUT issue entry"
                  placeholderTextColor={themeColors.textSecondary}
                  value={refId}
                  onChangeText={setRefId}
                />
              </View>
            </View>

            {/* Additional Cash / Labour Payment (Step 3C) */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Additional Cash / Labour Payment (Optional)
              </Text>
              <View style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Text style={[styles.currencyPrefix, { color: themeColors.textSecondary }]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text }]}
                  placeholder="e.g. 2000 (for mixed or cash-only payment)"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={cashRupeesText}
                  onChangeText={setCashRupeesText}
                />
              </View>
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Notes (Optional)
              </Text>
              <View style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border, height: 72 }]}>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text, height: 60, textAlignVertical: 'top' }]}
                  placeholder="Payment / settlement notes..."
                  placeholderTextColor={themeColors.textSecondary}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: themeColors.border }]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSettle}
              style={[
                styles.confirmBtn,
                { backgroundColor: isValid ? themeColors.primary : themeColors.border },
              ]}
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>
                    {hasMetal && hasCash
                      ? 'Confirm Mixed Payment'
                      : hasMetal
                      ? 'Confirm Settlement'
                      : 'Confirm Labour Payment'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerLabel: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
  },
  bannerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  maxLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '600',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
    fontWeight: '500',
  },
  calculatedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  calculatedLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  calculatedAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#047857',
    marginTop: 2,
  },
  calculatedSub: {
    fontSize: 11,
    color: '#065F46',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
