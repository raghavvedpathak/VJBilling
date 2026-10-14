// components/phase4/KarigarGoldReturnModal.tsx
// Records Karigar returns with wastage tracking and dual ledger update

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { karigarFlowRepository } from '@/repositories/phase4/karigarFlowRepository';
import { karigarFlowService } from '@/services/phase4/karigarFlowService';
import { formatWeightMg } from '@/utils/calculations';
import { formatDate } from '@/utils/formatDate';
import { getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import type { Karigar } from '@/types/phase3/phase3.types';
import type { KarigarIssue } from '@/types/phase4/phase4.types';
import { RotateCcw, X, AlertTriangle, CheckSquare, Square, Scale } from 'lucide-react-native';

interface KarigarGoldReturnModalProps {
  visible: boolean;
  onClose: () => void;
  karigar: Karigar | null;
  firmId: string;
  onSuccess: () => void;
}

export function KarigarGoldReturnModal({
  visible,
  onClose,
  karigar,
  firmId,
  onSuccess,
}: KarigarGoldReturnModalProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [issues, setIssues] = useState<KarigarIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<KarigarIssue | null>(null);

  const [returnWeightGrams, setReturnWeightGrams] = useState('');
  const [returnPurityPct, setReturnPurityPct] = useState('91.60');
  const [actualWastageMg, setActualWastageMg] = useState('0');
  const [allowedWastageMg, setAllowedWastageMg] = useState('0');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && firmId && karigar) {
      loadIssues();
    } else {
      setSelectedIssue(null);
      setReturnWeightGrams('');
      setNotes('');
      setActualWastageMg('0');
      setAllowedWastageMg('0');
    }
  }, [visible, firmId, karigar]);

  const loadIssues = async () => {
    if (!karigar) return;
    setLoadingIssues(true);
    try {
      const allIssues = await karigarFlowRepository.listIssuesByKarigar(firmId, karigar.id);
      // Filter only open issues (ISSUED or PARTIAL_RETURN)
      const openIssues = (allIssues || []).filter(
        (i: KarigarIssue) => i.status === 'ISSUED' || i.status === 'PARTIAL_RETURN'
      );
      setIssues(openIssues);
      if (openIssues.length > 0) {
        setSelectedIssue(openIssues[0]);
        setReturnPurityPct((openIssues[0].issuedPurityPct || 91.6).toString());
      }
    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Could not load open karigar issues.');
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleSelectIssue = (issue: KarigarIssue) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedIssue(issue);
    setReturnPurityPct((issue.issuedPurityPct || 91.6).toString());
  };

  const handleSubmit = async () => {
    if (!karigar || !selectedIssue) {
      Alert.alert('Selection Error', 'Please select an open issue to record return against.');
      return;
    }

    const parsedGrams = parseFloat(returnWeightGrams);
    const parsedPurity = parseFloat(returnPurityPct);
    const parsedActualWastage = parseInt(actualWastageMg || '0', 10);
    const parsedAllowedWastage = parseInt(allowedWastageMg || '0', 10);

    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid returned weight in grams.');
      return;
    }

    const returnGrossWeightMg = Math.round(parsedGrams * 1000);

    setIsSubmitting(true);
    try {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const result = await karigarFlowService.recordKarigarReturn(
        selectedIssue.id,
        {
          grossWeightMg: returnGrossWeightMg,
          purityPct: parsedPurity,
          actualWastageMg: isNaN(parsedActualWastage) ? 0 : parsedActualWastage,
          allowedWastageMg: isNaN(parsedAllowedWastage) ? 0 : parsedAllowedWastage,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        firmId
      );

      if (result.wasteExceeded) {
        Alert.alert(
          'Return Recorded (Wastage Exceeded)',
          `Ornament return recorded! Warning: Actual wastage exceeded allowed threshold by ${result.excessMg} mg.`
        );
      } else {
        Alert.alert(
          'Return Recorded',
          `Successfully recorded ${parsedGrams.toFixed(3)}g return from ${karigar.name}.`
        );
      }

      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Return Failed', e.message || 'Could not record karigar return.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.box, { backgroundColor: isDark ? '#1C1418' : '#FFFFFF' }]}>
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <RotateCcw size={20} color="#3B82F6" />
              <Text style={[s.title, { color: colors.vjText }]}>
                Record Return from {karigar?.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={colors.vjText} />
            </TouchableOpacity>
          </View>

          <Text style={[s.hint, { color: colors.vjText }]}>
            Record finished jewelry or unworked metal returned by the artisan against an open issue.
          </Text>

          {loadingIssues ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.vjAccent} />
              <Text style={{ color: colors.vjText, marginTop: 8, fontSize: 12 }}>Loading open issues...</Text>
            </View>
          ) : issues.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.vjText, opacity: 0.65, fontWeight: '700', textAlign: 'center' }}>
                No active open issues for this karigar.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[s.label, { color: colors.vjText, marginTop: 10 }]}>Select Open Issue</Text>
              <ScrollView style={{ maxHeight: 130, marginVertical: 4 }}>
                {issues.map((iss) => {
                  const isSelected = selectedIssue?.id === iss.id;
                  return (
                    <TouchableOpacity
                      key={iss.id}
                      onPress={() => handleSelectIssue(iss)}
                      style={[
                        s.issueRow,
                        {
                          backgroundColor: isSelected
                            ? isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)'
                            : 'transparent',
                          borderColor: isSelected ? '#3B82F6' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isSelected ? <CheckSquare size={16} color="#3B82F6" /> : <Square size={16} color={colors.vjText} style={{ opacity: 0.4 }} />}
                        <View>
                          <Text style={[s.issueName, { color: colors.vjText }]}>
                            Issue #{iss.id.slice(0, 8).toUpperCase()} ({iss.status})
                          </Text>
                          <Text style={[s.issueSub, { color: colors.vjText }]}>
                            {formatDate(iss.createdAt)} · Issued: {formatWeightMg(iss.issuedGrossWeightMg)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.issueFine, { color: '#3B82F6' }]}>
                        {formatWeightMg(iss.issuedFineWeightMg)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ gap: 9, marginVertical: 8 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.vjText }]}>Returned Gross (g)</Text>
                    <TextInput
                      value={returnWeightGrams}
                      onChangeText={setReturnWeightGrams}
                      placeholder="e.g. 24.800"
                      placeholderTextColor="rgba(150, 150, 150, 0.6)"
                      keyboardType="decimal-pad"
                      style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.vjText }]}>Return Purity (%)</Text>
                    <TextInput
                      value={returnPurityPct}
                      onChangeText={setReturnPurityPct}
                      placeholder="e.g. 91.60"
                      placeholderTextColor="rgba(150, 150, 150, 0.6)"
                      keyboardType="decimal-pad"
                      style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.vjText }]}>Actual Wastage (mg)</Text>
                    <TextInput
                      value={actualWastageMg}
                      onChangeText={setActualWastageMg}
                      placeholder="0"
                      placeholderTextColor="rgba(150, 150, 150, 0.6)"
                      keyboardType="number-pad"
                      style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.vjText }]}>Allowed Wastage (mg)</Text>
                    <TextInput
                      value={allowedWastageMg}
                      onChangeText={setAllowedWastageMg}
                      placeholder="0"
                      placeholderTextColor="rgba(150, 150, 150, 0.6)"
                      keyboardType="number-pad"
                      style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                    />
                  </View>
                </View>

                <View>
                  <Text style={[s.label, { color: colors.vjText }]}>Notes / Remarks</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Completed bangles returned"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting || !selectedIssue}
                style={[
                  s.submitBtn,
                  {
                    backgroundColor: '#3B82F6',
                    opacity: isSubmitting || !selectedIssue ? 0.6 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.submitBtnText}>Record Return & Settle</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
    lineHeight: 15,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    opacity: 0.8,
    marginBottom: 3,
  },
  issueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  issueName: {
    fontSize: 12,
    fontWeight: '800',
  },
  issueSub: {
    fontSize: 10.5,
    fontWeight: '600',
    opacity: 0.6,
  },
  issueFine: {
    fontSize: 12,
    fontWeight: '900',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
