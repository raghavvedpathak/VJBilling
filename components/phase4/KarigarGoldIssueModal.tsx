// components/phase4/KarigarGoldIssueModal.tsx
// Implements KARIGAR LOT SELECTION CALL-SITE RULE (v1.5 — DOMAIN-FIX-1 v1.7):
// Only lots where status = 'RECEIVED' AND metal_source = 'MELT_OUTPUT' can be issued to a karigar.

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
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { karigarFlowService } from '@/services/phase4/karigarFlowService';
import { formatWeightMg } from '@/utils/calculations';
import { getThemeColors } from '@/constants/theme';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import type { Karigar } from '@/types/phase3/phase3.types';
import type { OldMetalLot } from '@/types/phase2/phase2.types';
import { Hammer, X, Sparkles, Scale, CheckSquare, Square } from 'lucide-react-native';

interface KarigarGoldIssueModalProps {
  visible: boolean;
  onClose: () => void;
  karigar: Karigar | null;
  firmId: string;
  onSuccess: () => void;
}

export function KarigarGoldIssueModal({
  visible,
  onClose,
  karigar,
  firmId,
  onSuccess,
}: KarigarGoldIssueModalProps) {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [lots, setLots] = useState<OldMetalLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedLot, setSelectedLot] = useState<OldMetalLot | null>(null);

  const [issueWeightGrams, setIssueWeightGrams] = useState('');
  const [issuePurityPct, setIssuePurityPct] = useState('99.50');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && firmId) {
      loadLots();
    } else {
      setSelectedLot(null);
      setIssueWeightGrams('');
      setNotes('');
    }
  }, [visible, firmId]);

  const loadLots = async () => {
    setLoadingLots(true);
    try {
      // DOMAIN-FIX-1 (v1.7): returns ONLY lots with status='RECEIVED' and metalSource='MELT_OUTPUT'
      const data = await oldMetalLotRepository.findAvailableForIssuance(firmId);
      setLots(data || []);
      if (data && data.length > 0) {
        setSelectedLot(data[0]);
        setIssueWeightGrams((data[0].grossWeightMg / 1000).toFixed(3));
        setIssuePurityPct((data[0].purityPercent || 99.5).toString());
      }
    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Could not load assayed gold lots.');
    } finally {
      setLoadingLots(false);
    }
  };

  const handleSelectLot = (lot: OldMetalLot) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedLot(lot);
    setIssueWeightGrams((lot.grossWeightMg / 1000).toFixed(3));
    setIssuePurityPct((lot.purityPercent || 99.5).toString());
  };

  const handleSubmit = async () => {
    if (!karigar || !selectedLot) {
      Alert.alert('Selection Error', 'Please select an assayed MELT_OUTPUT gold lot.');
      return;
    }

    const parsedGrams = parseFloat(issueWeightGrams);
    const parsedPurity = parseFloat(issuePurityPct);

    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid weight in grams.');
      return;
    }

    const issuedGrossWeightMg = Math.round(parsedGrams * 1000);
    if (issuedGrossWeightMg > selectedLot.grossWeightMg) {
      Alert.alert('Weight Exceeds Lot', `Issued weight cannot exceed available lot weight of ${(selectedLot.grossWeightMg / 1000).toFixed(3)}g.`);
      return;
    }

    setIsSubmitting(true);
    try {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      await karigarFlowService.issueGoldToKarigar(
        {
          karigarId: karigar.id,
          sourceLotId: selectedLot.id,
          issuedGrossWeightMg,
          issuedPurityPct: parsedPurity,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        firmId
      );

      Alert.alert(
        'Gold Issued',
        `${parsedGrams.toFixed(3)}g gold issued to ${karigar.name}. Added to Karigar Ledger.`
      );
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Issue Failed', e.message || 'Could not issue gold to karigar.');
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
              <Hammer size={20} color="#10B981" />
              <Text style={[s.title, { color: colors.vjText }]}>
                Issue Gold to {karigar?.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={colors.vjText} />
            </TouchableOpacity>
          </View>

          <Text style={[s.hint, { color: colors.vjText }]}>
            DOMAIN-FIX-1: Only assayed MELT_OUTPUT bullion bars can be issued to artisans.
          </Text>

          {loadingLots ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.vjAccent} />
              <Text style={{ color: colors.vjText, marginTop: 8, fontSize: 12 }}>Loading assayed lots...</Text>
            </View>
          ) : lots.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#EF4444', fontWeight: '700', textAlign: 'center' }}>
                No MELT_OUTPUT lots available in vault!
              </Text>
              <Text style={{ color: colors.vjText, opacity: 0.65, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                Please run a Melt Batch first to convert customer scrap into assayed bars.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[s.label, { color: colors.vjText, marginTop: 12 }]}>Select Assayed Lot</Text>
              <ScrollView style={{ maxHeight: 150, marginVertical: 6 }}>
                {lots.map((lot) => {
                  const isSelected = selectedLot?.id === lot.id;
                  return (
                    <TouchableOpacity
                      key={lot.id}
                      onPress={() => handleSelectLot(lot)}
                      style={[
                        s.lotRow,
                        {
                          backgroundColor: isSelected
                            ? isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(16, 185, 129, 0.08)'
                            : 'transparent',
                          borderColor: isSelected ? '#10B981' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} color={colors.vjText} style={{ opacity: 0.4 }} />}
                        <View>
                          <Text style={[s.lotName, { color: colors.vjText }]}>Bar #{lot.id.slice(0, 8).toUpperCase()}</Text>
                          <Text style={[s.lotSub, { color: colors.vjText }]}>
                            {lot.purityPercent}% · Gross: {formatWeightMg(lot.grossWeightMg)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.lotFine, { color: '#10B981' }]}>
                        Fine: {formatWeightMg(lot.fineWeightMg)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ gap: 10, marginVertical: 10 }}>
                <View>
                  <Text style={[s.label, { color: colors.vjText }]}>Issued Gross Weight (Grams)</Text>
                  <TextInput
                    value={issueWeightGrams}
                    onChangeText={setIssueWeightGrams}
                    placeholder="e.g. 25.500"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    keyboardType="decimal-pad"
                    style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>

                <View>
                  <Text style={[s.label, { color: colors.vjText }]}>Issued Purity (%)</Text>
                  <TextInput
                    value={issuePurityPct}
                    onChangeText={setIssuePurityPct}
                    placeholder="e.g. 99.50"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    keyboardType="decimal-pad"
                    style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>

                <View>
                  <Text style={[s.label, { color: colors.vjText }]}>Notes / Job Work Instruction</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Making 2 Bangles 916"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    style={[s.input, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting || !selectedLot}
                style={[
                  s.submitBtn,
                  {
                    backgroundColor: '#10B981',
                    opacity: isSubmitting || !selectedLot ? 0.6 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.submitBtnText}>Confirm Gold Issuance</Text>
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
    borderColor: 'rgba(212, 175, 55, 0.35)',
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
    marginBottom: 4,
  },
  lotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 5,
  },
  lotName: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  lotSub: {
    fontSize: 10.5,
    fontWeight: '600',
    opacity: 0.6,
  },
  lotFine: {
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
