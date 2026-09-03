// app/inventory/add-loose-stock.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Alert, Modal, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { designRepository } from '@/repositories/phase2/designRepository';
import { looseStockService } from '@/services/phase2/looseStockService';
import { 
  getPurityPresets, 
  formatKaratBadge,
  gramsToMg, 
  parseCleanFloat, 
  type PurityPreset,
  getCurrencySymbol,
  rupeesToPaise,
} from '@/utils/calculations';
import { Layers, Scale, Banknote, CheckCircle, Plus } from 'lucide-react-native';
import type { Design, AddLooseStockInput } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export default function AddLooseStockScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [selectedPurity, setSelectedPurity] = useState<PurityPreset | null>(null);

  const [pieceCount, setPieceCount] = useState('1');
  const [weightGrams, setWeightGrams] = useState('');
  const [ratePerGram, setRatePerGram] = useState('');
  const [wastagePercent, setWastagePercent] = useState('');
  const [hsnCode, setHsnCode] = useState('7113');

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    placeholder?: string;
    options: GlassPickerOption[];
    selectedId: string | null;
    onSelect: (option: GlassPickerOption | null) => void;
  }>({
    visible: false,
    title: '',
    options: [],
    selectedId: null,
    onSelect: () => {},
  });

  // Fetch only active designs configured for LOOSE stock
  useFocusEffect(
    useCallback(() => {
      if (!activeFirmId) return;
      let isMounted = true;

      const fetchDesigns = async () => {
        try {
          const results = await designRepository.findByFirmId(activeFirmId);
          if (isMounted) {
            const looseOnly = results.filter(
              (d) => d.isActive === 1 && d.stockType === 'LOOSE'
            );
            setDesigns(looseOnly);
          }
        } catch (e) {
          console.error('[AddLooseStockScreen] Failed to fetch designs:', e);
        }
      };

      fetchDesigns();
      return () => {
        isMounted = false;
      };
    }, [activeFirmId])
  );

  // Available purity presets based on selected design's metal
  const availablePurityPresets = useMemo(() => {
    return getPurityPresets(selectedDesign ? selectedDesign.metal : 'GOLD');
  }, [selectedDesign]);

  // Real-time calculation helpers (Avg piece weight and estimated lot valuation)
  const previewData = useMemo(() => {
    const w = parseCleanFloat(weightGrams);
    const pcs = parseInt(pieceCount.trim(), 10) || 0;
    const r = parseCleanFloat(ratePerGram);

    const avgWeightGrams = pcs > 0 && w > 0 ? w / pcs : 0;
    const totalRupees = w * r;

    return {
      avgWeightGrams: avgWeightGrams.toFixed(3),
      totalValueRupees: Math.round(totalRupees),
    };
  }, [weightGrams, pieceCount, ratePerGram]);

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId) {
      Alert.alert('Error', 'No active firm selected.');
      return;
    }
    if (!selectedDesign) {
      Alert.alert('Validation Error', 'Please select a Loose Stock Design.');
      return;
    }
    if (!selectedPurity) {
      Alert.alert('Validation Error', 'Please select a Purity Grade.');
      return;
    }

    const pcsVal = parseInt(pieceCount.trim(), 10);
    const wtGramsVal = parseCleanFloat(weightGrams);

    if (isNaN(pcsVal) || pcsVal <= 0) {
      Alert.alert('Validation Error', 'Piece count must be at least 1.');
      return;
    }
    if (isNaN(wtGramsVal) || wtGramsVal <= 0) {
      Alert.alert('Validation Error', 'Total weight must be greater than 0.');
      return;
    }

    const totalWeightMg = gramsToMg(wtGramsVal);
    const purityPct = parseCleanFloat(selectedPurity.val);
    const karatDisplay = formatKaratBadge(purityPct, selectedDesign.metal) ?? `${purityPct}%`;

    // Construct input with exact optional property adherence
    const input: AddLooseStockInput = {
      designId: selectedDesign.id,
      purityPercent: purityPct,
      purityKarat: karatDisplay,
      pieceCount: pcsVal,
      totalWeightMg,
      hsnCode: hsnCode.trim() || '7113',
    };

    if (ratePerGram.trim()) {
      const parsedRate = parseCleanFloat(ratePerGram);
      if (isNaN(parsedRate) || parsedRate < 0) {
        Alert.alert('Validation Error', 'Invalid Rate Per Gram.');
        return;
      }
      const ratePaise = rupeesToPaise(parsedRate);
      if (typeof ratePaise === 'number') {
        input.purchaseRatePaise = ratePaise;
      }
    }

    if (wastagePercent.trim()) {
      const parsedWastage = parseCleanFloat(wastagePercent);
      if (isNaN(parsedWastage) || parsedWastage < 0) {
        Alert.alert('Validation Error', 'Invalid Wastage Percentage.');
        return;
      }
      input.wastagePercent = parsedWastage;
    }

    setLoading(true);
    try {
      await looseStockService.addLooseStock(input, activeFirmId);

      setSuccessMessage('Loose stock successfully added to inventory pool.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add loose stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Add Loose Stock" showBack>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingTop: 32, paddingBottom: 190 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={120}
        extraHeight={140}
      >
        {/* DESIGN & PURITY SPECIFICATION */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Layers size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Design & Fineness</Text>
          </View>

          <GlassPickerInput
            label="Loose Stock Design *"
            placeholder="Select a loose design..."
            selectedLabel={selectedDesign ? selectedDesign.name : null}
            selectedSublabel={selectedDesign ? `${selectedDesign.metal} • Code: ${selectedDesign.code}` : null}
            onPress={() => {
              if (designs.length === 0) {
                Alert.alert(
                  'No Loose Designs',
                  'No designs with Stock Type "LOOSE" were found. Please create or configure a loose stock design first.'
                );
                return;
              }
              setPickerModal({
                visible: true,
                title: 'Select Loose Design',
                placeholder: 'Search design...',
                selectedId: selectedDesign?.id || null,
                options: designs.map((d) => ({
                  id: d.id,
                  label: d.name,
                  sublabel: `${d.metal} • ${d.code}`,
                })),
                onSelect: (opt) => {
                  if (!opt) {
                    setSelectedDesign(null);
                    setSelectedPurity(null);
                    return;
                  }
                  const sel = designs.find((d) => d.id === opt.id);
                  if (sel) {
                    setSelectedDesign(sel);
                    setSelectedPurity(null);
                    if (sel.defaultHsn) setHsnCode(sel.defaultHsn);
                  }
                },
              });
            }}
          />

          <GlassPickerInput
            label="Purity Grade *"
            placeholder={selectedDesign ? 'Select purity grade...' : 'Select a design first'}
            selectedLabel={selectedPurity ? selectedPurity.label : null}
            selectedSublabel={selectedPurity ? `${selectedPurity.val}% Fineness` : null}
            onPress={() => {
              if (!selectedDesign) {
                Alert.alert('Required', 'Please select a Loose Design first.');
                return;
              }
              setPickerModal({
                visible: true,
                title: `Select ${selectedDesign.metal} Purity`,
                placeholder: 'Search purity...',
                selectedId: selectedPurity?.id || null,
                options: availablePurityPresets.map((p) => ({
                  id: p.id,
                  label: p.label,
                  sublabel: `${p.val}%`,
                })),
                onSelect: (opt) => {
                  if (!opt) return setSelectedPurity(null);
                  const sel = availablePurityPresets.find((p) => p.id === opt.id);
                  if (sel) setSelectedPurity(sel);
                },
              });
            }}
          />

          <GlassInput
            label="HSN Code *"
            placeholder="e.g. 7113"
            value={hsnCode}
            onChangeText={setHsnCode}
            keyboardType="number-pad"
          />
        </GlassCard>

        {/* PHYSICAL QUANTITY & TOTAL WEIGHT */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Scale size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Stock Metrics</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <GlassInput
                label="Piece Count *"
                placeholder="e.g. 20"
                keyboardType="number-pad"
                value={pieceCount}
                onChangeText={setPieceCount}
              />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput
                label="Total Weight (g) *"
                placeholder="0.000"
                keyboardType="decimal-pad"
                value={weightGrams}
                onChangeText={setWeightGrams}
              />
            </View>
          </View>

          <View style={{ backgroundColor: 'rgba(212,175,55,0.08)', padding: 14, borderRadius: 12, marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: COLORS.vjText, fontWeight: '600' }}>
              Average Piece Weight: <Text style={{ fontFamily: 'monospace', fontWeight: '800' }}>{previewData.avgWeightGrams} g</Text>
            </Text>
          </View>
        </GlassCard>

        {/* PURCHASE RATE & ESTIMATED VALUE (OPTIONAL) */}
        <GlassCard style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Banknote size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Costing & Valuation (Optional)</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1.2 }}>
              <GlassInput
                label={`Rate / g (${getCurrencySymbol()})`}
                placeholder="e.g. 6800"
                keyboardType="decimal-pad"
                value={ratePerGram}
                onChangeText={setRatePerGram}
              />
            </View>
            <View style={{ flex: 0.8 }}>
              <GlassInput
                label="Wastage %"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={wastagePercent}
                onChangeText={setWastagePercent}
              />
            </View>
          </View>

          <View style={{ backgroundColor: COLORS.vjText, padding: 16, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 }}>
              Estimated Lot Value
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>
              {getCurrencySymbol()}{previewData.totalValueRupees.toLocaleString('en-IN')}
            </Text>
          </View>
        </GlassCard>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>

      {/* FIXED BOTTOM ACTION BAR */}
      <FixedGlassBar>
        <TouchableOpacity
          style={fixedBarStyles.pillSecondaryBtn}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={fixedBarStyles.pillSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={fixedBarStyles.pillPrimaryBtn}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Plus size={18} color="#fff" />
              <Text style={fixedBarStyles.pillPrimaryText}>Add to Pool</Text>
            </>
          )}
        </TouchableOpacity>
      </FixedGlassBar>

      {/* CONFIRMATION / SUCCESS MODAL */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Added to Pool</Text>
            <Text style={s.successSubtitle}>{successMessage}</Text>

            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton
                title="Done"
                onPress={() => {
                  setSuccessMessage(null);
                  router.back();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* GENERIC PICKER MODAL */}
      <GlassPickerModal
        visible={pickerModal.visible}
        title={pickerModal.title}
        placeholder={pickerModal.placeholder}
        options={pickerModal.options}
        selectedId={pickerModal.selectedId}
        onClose={() => setPickerModal((p) => ({ ...p, visible: false }))}
        onSelect={pickerModal.onSelect}
      />
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: '#FCFBF8',
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 16,
    borderRadius: 50,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});