// app/inventory/add-gemstone.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { gemstoneLotService } from '../../services/gemstoneLotService';
import { stoneRepository } from '../../repositories/stoneRepository';
import { getCurrencySymbol } from '../../utils/currency';
import { Gem, Diamond, Banknote, X, CheckCircle } from 'lucide-react-native';
import type { Stone } from '../../types/phase2.types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SelectModal = ({ visible, title, options, onSelect, onClose }: any) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-vj-bg w-full rounded-t-3xl p-6" style={{ paddingBottom: Math.max(insets.bottom, 24), maxHeight: '60%' }}>
          <Text className="text-xl font-bold text-vj-text mb-4">{title}</Text>
          <ScrollView>
            {options.map((opt: any) => (
              <TouchableOpacity 
                key={opt.id} 
                onPress={() => { onSelect(opt); onClose(); }}
                className="py-4 border-b border-gray-200"
              >
                <Text className="text-lg font-semibold text-vj-text">{opt.label}</Text>
                <Text className="text-xs text-vj-text/60 mt-1 font-bold">{opt.sublabel}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="mt-4">
            <GlassButton title="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function AddGemstoneScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [stones, setStones] = useState<Stone[]>([]);
  const [selectedStone, setSelectedStone] = useState<Stone | null>(null);
  const [showStoneModal, setShowStoneModal] = useState(false);

  const [lotName, setLotName] = useState('');
  const [carats, setCarats] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [ratePerCarat, setRatePerCarat] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [certRef, setCertRef] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFirmId) return;
    const fetchStones = async () => {
      try {
        const results = await stoneRepository.findByFirmId(activeFirmId);
        setStones(results);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStones();
  }, [activeFirmId]);

  // Preview totals: carats * rate
  const previewData = useMemo(() => {
    const c = parseFloat(carats) || 0;
    const r = parseFloat(ratePerCarat) || 0;
    // Math logic matching backend: (weightCaratX100 / 100) * ratePaise
    const totalRupees = c * r; 
    return { total: Math.round(totalRupees) };
  }, [carats, ratePerCarat]);

  const handleSubmit = async () => {
    if (!activeFirmId) return;
    if (!selectedStone) { Alert.alert('Error', 'Please select a Stone Type'); return; }
    if (!lotName.trim()) { Alert.alert('Error', 'Lot Name is required'); return; }
    
    const caratVal = parseFloat(carats);
    const qtyVal = parseInt(quantity, 10);

    if (isNaN(caratVal) || caratVal <= 0) { Alert.alert('Error', 'Invalid Carat Weight'); return; }
    if (isNaN(qtyVal) || qtyVal <= 0) { Alert.alert('Error', 'Invalid Quantity'); return; }

    const weightCaratX100 = Math.round(caratVal * 100);
    const ratePaise = ratePerCarat ? Math.round(parseFloat(ratePerCarat) * 100) : null;
    const totalPaise = ratePaise !== null ? Math.round((weightCaratX100 / 100) * ratePaise) : null;

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
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Gem size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Stone Definition</Text>
          </View>
          
          <TouchableOpacity onPress={() => setShowStoneModal(true)} style={{ marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.6)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(92,22,35,0.2)' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>Stone Master Type</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#5C1623' }}>{selectedStone ? `${selectedStone.name} (${selectedStone.type})` : 'Select Stone Type...'}</Text>
          </TouchableOpacity>

          <GlassInput label="Lot Description Name *" placeholder="e.g. Round Brilliant 0.50ct" value={lotName} onChangeText={setLotName} />
          <GlassInput label="Supplier Name" placeholder="Optional vendor name" value={supplierName} onChangeText={setSupplierName} />
          <GlassInput label="Certification Ref" placeholder="GIA / IGI Report Number" autoCapitalize="characters" value={certRef} onChangeText={setCertRef} />
        </GlassCard>

        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Diamond size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Physical Stock</Text>
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
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Purchase Value (Optional)</Text>
          </View>

          <GlassInput label={`Rate Per Carat (${getCurrencySymbol()})`} placeholder="e.g. 50000" keyboardType="numeric" value={ratePerCarat} onChangeText={setRatePerCarat} />
          
          <View style={{ backgroundColor: '#5C1623', padding: 16, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 }}>Total Lot Value</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>{getCurrencySymbol()}{previewData.total.toLocaleString('en-IN')}</Text>
          </View>
        </GlassCard>

        <GlassButton title="Add to Inventory" onPress={handleSubmit} loading={loading} />

      </ScrollView>

      <SelectModal 
        visible={showStoneModal} 
        title="Select Stone Master"
        options={stones.map(s => ({ id: s.id, label: s.name, sublabel: s.type }))}
        onSelect={(opt: any) => setSelectedStone(stones.find(s => s.id === opt.id)!)}
        onClose={() => setShowStoneModal(false)}
      />

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
    </TwoToneWrapper>
  );
}

import { StyleSheet } from 'react-native';
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
    color: '#5C1623',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});