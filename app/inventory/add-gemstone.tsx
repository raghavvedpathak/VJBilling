// app/inventory/add-gemstone.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Alert, Modal, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { gemstoneLotService } from '@/services/phase2/gemstoneLotService';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { 
  caratsToCaratX100, 
  computeGemstoneTotalPaise 
} from '@/utils/purity.constants';
import { getCurrencySymbol, rupeesToPaise } from '@/utils/currency';
import { Gem, Diamond, Banknote, CheckCircle, Plus } from 'lucide-react-native';
import type { Stone } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export default function AddGemstoneScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [stones, setStones] = useState<Stone[]>([]);
  const [selectedStone, setSelectedStone] = useState<Stone | null>(null);

  const [lotName, setLotName] = useState('');
  const [carats, setCarats] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [ratePerCarat, setRatePerCarat] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [certRef, setCertRef] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    placeholder?: string | undefined;
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

  useFocusEffect(
    React.useCallback(() => {
      if (!activeFirmId) return;
      const fetchStones = async () => {
        try {
          const results = await stoneRepository.findByFirmId(activeFirmId);
          setStones(results);
        } catch (e) {
          console.error('[AddGemstoneScreen] Failed to fetch stones:', e);
        }
      };
      fetchStones();
    }, [activeFirmId])
  );

  const previewData = useMemo(() => {
    const c = parseFloat(carats) || 0;
    const r = parseFloat(ratePerCarat) || 0;
    const totalRupees = c * r; 
    return { total: Math.round(totalRupees) };
  }, [carats, ratePerCarat]);

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!activeFirmId) return;
    if (!selectedStone) { Alert.alert('Error', 'Please select a Stone Type'); return; }
    if (!lotName.trim()) { Alert.alert('Error', 'Lot Name is required'); return; }
    
    const caratVal = parseFloat(carats);
    const qtyVal = parseInt(quantity, 10);

    if (isNaN(caratVal) || caratVal <= 0) { Alert.alert('Error', 'Invalid Carat Weight'); return; }
    if (isNaN(qtyVal) || qtyVal <= 0) { Alert.alert('Error', 'Invalid Quantity'); return; }

    const weightCaratX100 = caratsToCaratX100(caratVal);
    const ratePaise = rupeesToPaise(ratePerCarat);
    const totalPaise = computeGemstoneTotalPaise(weightCaratX100, ratePaise);

    setLoading(true);
    try {
      await gemstoneLotService.createGemstoneLot({
        stoneId: selectedStone.id,
        name: lotName.trim(),
        weightCaratX100,
        quantity: qtyVal,
        purchaseRatePaisePerCarat: ratePaise,
        totalPurchaseAmountPaise: totalPaise,
        supplierName: supplierName.trim() || null,
        certificationRef: certRef.trim() || null,
      }, activeFirmId);

      setSuccessMessage('Gemstone lot added to inventory.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="New Gemstone Lot" showBack>
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
        
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Gem size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Stone Definition</Text>
          </View>
          
          <GlassPickerInput
            label="Stone Master Type *"
            placeholder="Search stone type..."
            selectedLabel={selectedStone ? selectedStone.name : null}
            selectedSublabel={selectedStone ? selectedStone.type : null}
            onPress={() => {
              setPickerModal({
                visible: true,
                title: 'Select Stone Master Type',
                placeholder: 'Search stone type...',
                selectedId: selectedStone?.id || null,
                options: stones.map(s => ({
                  id: s.id,
                  label: s.name || 'Unnamed',
                  sublabel: s.type || '',
                })),
                onSelect: (opt) => {
                  if (!opt) return setSelectedStone(null);
                  const sel = stones.find(s => s.id === opt.id)!;
                  setSelectedStone(sel);
                },
              });
            }}
          />

          <GlassInput label="Lot Description Name *" placeholder="e.g. Round Brilliant 0.50ct" value={lotName} onChangeText={setLotName} />
          <GlassInput label="Supplier Name" placeholder="Optional vendor name" value={supplierName} onChangeText={setSupplierName} />
          <GlassInput label="Certification Ref" placeholder="GIA / IGI Report Number" autoCapitalize="characters" value={certRef} onChangeText={setCertRef} />
        </GlassCard>

        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Diamond size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Physical Stock</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <GlassInput label="Total Carats *" placeholder="0.00" keyboardType="numeric" value={carats} onChangeText={setCarats} />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput label="Quantity / Pcs *" placeholder="1" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
            </View>
          </View>
        </GlassCard>

        <GlassCard style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Banknote size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Purchase Value (Optional)</Text>
          </View>

          <GlassInput label={`Rate Per Carat (${getCurrencySymbol()})`} placeholder="e.g. 50000" keyboardType="numeric" value={ratePerCarat} onChangeText={setRatePerCarat} />
          
          <View style={{ backgroundColor: COLORS.vjText, padding: 16, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 }}>Total Lot Value</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>
              {getCurrencySymbol()}{previewData.total.toLocaleString('en-IN')}
            </Text>
          </View>
        </GlassCard>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>

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
              <Text style={fixedBarStyles.pillPrimaryText}>Add to Inventory</Text>
            </>
          )}
        </TouchableOpacity>
      </FixedGlassBar>

      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Success!</Text>
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