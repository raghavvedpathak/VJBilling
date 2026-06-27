// app/inventory/add-urd.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { urdPurchaseService } from '../../services/urdPurchaseService';
import { getCurrencySymbol } from '../../utils/currency';
import { User, Scale, Banknote, CheckCircle } from 'lucide-react-native';
import type { URDMetalType } from '../../types/phase2.types';

export default function AddURDScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerAadhaar, setCustomerAadhaar] = useState('');
  const [customerPAN, setCustomerPAN] = useState('');
  
  const [metalType, setMetalType] = useState<URDMetalType>('GOLD');
  const [grossWeight, setGrossWeight] = useState('');
  const [purityPercent, setPurityPercent] = useState('');
  const [ratePerGram, setRatePerGram] = useState('');
  
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK' | 'UPI'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-calculate expected totals for the UI preview
  const previewData = useMemo(() => {
    const w = parseFloat(grossWeight) || 0;
    const p = parseFloat(purityPercent) || 0;
    const r = parseFloat(ratePerGram) || 0;

    const fineMg = Math.round((w * 1000) * (p / 100));
    const totalRupees = (fineMg / 1000) * r;
    return { 
      fineGrams: (fineMg / 1000).toFixed(3), 
      total: Math.round(totalRupees) 
    };
  }, [grossWeight, purityPercent, ratePerGram]);

  const handleSubmit = async () => {
    if (!activeFirmId) return;
    if (!customerName.trim()) { Alert.alert('Error', 'Customer Name is required'); return; }
    
    const grossMg = Math.round(parseFloat(grossWeight) * 1000);
    const purity = parseFloat(purityPercent);
    const ratePaise = Math.round(parseFloat(ratePerGram) * 100);

    if (isNaN(grossMg) || grossMg <= 0) { Alert.alert('Error', 'Invalid Gross Weight'); return; }
    if (isNaN(purity) || purity <= 0 || purity > 100) { Alert.alert('Error', 'Purity must be between 1 and 100'); return; }
    if (isNaN(ratePaise) || ratePaise <= 0) { Alert.alert('Error', 'Invalid Rate'); return; }

    setLoading(true);
    try {
      await urdPurchaseService.createURDPurchase({
        purchaseDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        customerAadhaar: customerAadhaar.replace(/[^0-9]/g, '') || undefined,
        customerPAN: customerPAN.trim().toUpperCase() || undefined,
        metalType,
        grossWeightMg: grossMg,
        purityPercent: purity,
        ratePerGramPaise: ratePaise,
        paymentMode,
        bankAccountId: paymentMode !== 'CASH' ? bankAccountId || 'UNKNOWN_ACCOUNT' : undefined,
      }, activeFirmId);

      setSuccessMessage('Draft Purchase Saved.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="New URD Purchase" showBack>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* Customer Details */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <User size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Seller Details</Text>
          </View>
          
          <GlassInput label="Full Name *" placeholder="Enter customer name" value={customerName} onChangeText={setCustomerName} />
          <GlassInput label="Mobile Number" placeholder="10-digit mobile" keyboardType="phone-pad" value={customerMobile} onChangeText={setCustomerMobile} />
          <GlassInput label="Address" placeholder="City/Area" value={customerAddress} onChangeText={setCustomerAddress} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <GlassInput label="Aadhaar No" placeholder="12-digit number" keyboardType="number-pad" value={customerAadhaar} onChangeText={setCustomerAadhaar} />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput label="PAN" placeholder="ABCDE1234F" autoCapitalize="characters" value={customerPAN} onChangeText={setCustomerPAN} />
            </View>
          </View>
        </GlassCard>

        {/* Metal Details */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Scale size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Item Details</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {(['GOLD', 'SILVER'] as URDMetalType[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' }, metalType === m && { backgroundColor: m === 'GOLD' ? '#C8860A' : '#6B7280', borderColor: m === 'GOLD' ? '#C8860A' : '#6B7280' }]}
                onPress={() => setMetalType(m)}
              >
                <Text style={[{ fontSize: 14, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, metalType === m && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <GlassInput label="Gross Weight (Grams) *" placeholder="0.000" keyboardType="numeric" value={grossWeight} onChangeText={setGrossWeight} />
          <GlassInput label="Purity (%) *" placeholder="e.g. 91.6" keyboardType="numeric" value={purityPercent} onChangeText={setPurityPercent} />
          
          <View style={{ backgroundColor: 'rgba(92,22,35,0.03)', padding: 12, borderRadius: 10, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 }}>Auto-Calculated Fine Weight</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623', fontFamily: 'monospace' }}>{previewData.fineGrams} g</Text>
          </View>
        </GlassCard>

        {/* Valuation & Payment */}
        <GlassCard style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Banknote size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Valuation & Payout</Text>
          </View>

          <GlassInput label={`Rate Per Gram (${getCurrencySymbol()}) *`} placeholder="e.g. 7000" keyboardType="numeric" value={ratePerGram} onChangeText={setRatePerGram} />
          
          <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>Payout Mode</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {(['CASH', 'UPI', 'BANK'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' }, paymentMode === mode && { backgroundColor: '#D4AF37', borderColor: '#D4AF37' }]}
                onPress={() => setPaymentMode(mode)}
              >
                <Text style={[{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, paymentMode === mode && { color: '#fff' }]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ backgroundColor: '#5C1623', padding: 16, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 }}>Final Payout Amount</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>{getCurrencySymbol()}{previewData.total.toLocaleString('en-IN')}</Text>
          </View>
        </GlassCard>

        <GlassButton title="Save as Draft" onPress={handleSubmit} loading={loading} />

      </ScrollView>

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