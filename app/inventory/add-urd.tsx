// app/inventory/add-urd.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { urdPurchaseService } from '../../services/urdPurchaseService';
import { getCurrencySymbol, computeURDCostBreakdown } from '../../utils/calculations';
import { User, Scale, Banknote, CheckCircle, Trash2, Plus, Layers } from 'lucide-react-native';
import type { URDMetalType } from '../../types/phase2.types';

export interface URDItemRow {
  id: string;
  metalType: URDMetalType;
  grossWeight: string;
  purityPercent: string;
  ratePerGram: string;
  discount: string;
}

const getEmptyRow = (): URDItemRow => ({
  id: String(Date.now() + Math.random()),
  metalType: 'GOLD',
  grossWeight: '',
  purityPercent: '',
  ratePerGram: '',
  discount: '',
});

export default function AddURDScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerAadhaar, setCustomerAadhaar] = useState('');
  const [customerPAN, setCustomerPAN] = useState('');
  
  const [items, setItems] = useState<URDItemRow[]>([getEmptyRow()]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK' | 'UPI'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const updateRow = (index: number, field: keyof URDItemRow, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItemRow = () => {
    if (items.length >= 10) {
      Alert.alert('Limit Reached', 'You can add up to 10 URD items per transaction batch.');
      return;
    }
    setItems([...items, getEmptyRow()]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) {
      Alert.alert('Cannot Delete', 'At least one item is required for URD Purchase.');
      return;
    }
    Alert.alert(
      'Delete Item',
      `Are you sure you want to remove Item #${index + 1}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
          }
        }
      ]
    );
  };

  // Calculations for all items
  const itemCalculations = useMemo(() => {
    return items.map(row => {
      const grossMg = Math.round((parseFloat(row.grossWeight) || 0) * 1000);
      const purity = parseFloat(row.purityPercent) || 0;
      const ratePaise = Math.round((parseFloat(row.ratePerGram) || 0) * 100);
      const discountPaise = Math.round((parseFloat(row.discount) || 0) * 100);

      return {
        ...computeURDCostBreakdown(grossMg, purity, ratePaise, discountPaise),
        metalType: row.metalType,
        grossWeightG: (parseFloat(row.grossWeight) || 0),
        isValid: grossMg > 0 && purity > 0 && ratePaise > 0
      };
    });
  }, [items]);

  // Total summary across all items
  const batchSummary = useMemo(() => {
    let totalGrossG = 0;
    let totalFineG = 0;
    let totalPayoutPaise = 0;

    itemCalculations.forEach(calc => {
      totalGrossG += calc.grossWeightG;
      totalFineG += (calc.fineWeightMg / 1000);
      totalPayoutPaise += calc.totalValuePaise;
    });

    return {
      totalGrossG: totalGrossG.toFixed(3),
      totalFineG: totalFineG.toFixed(3),
      formattedTotalPayout: getCurrencySymbol() + (totalPayoutPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalPayoutPaise
    };
  }, [itemCalculations]);

  const handleSubmit = async () => {
    if (!activeFirmId) return;
    if (!customerName.trim()) { Alert.alert('Error', 'Seller/Customer Name is required'); return; }
    
    // Validate all item rows
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const grossMg = Math.round((parseFloat(row.grossWeight) || 0) * 1000);
      const purity = parseFloat(row.purityPercent) || 0;
      const ratePaise = Math.round((parseFloat(row.ratePerGram) || 0) * 100);

      if (isNaN(grossMg) || grossMg <= 0) { Alert.alert('Validation Error', `Item #${i + 1}: Invalid Gross Weight`); return; }
      if (isNaN(purity) || purity <= 0 || purity > 100) { Alert.alert('Validation Error', `Item #${i + 1}: Purity must be between 1 and 100%`); return; }
      if (isNaN(ratePaise) || ratePaise <= 0) { Alert.alert('Validation Error', `Item #${i + 1}: Invalid Rate Per Gram`); return; }
    }

    setLoading(true);
    try {
      const purchaseDate = new Date().toISOString().split('T')[0];
      const cName = customerName.trim();
      const cAddr = customerAddress.trim() || null;
      const cMob = customerMobile.trim() || null;
      const cAadhaar = customerAadhaar.replace(/[^0-9]/g, '') || null;
      const cPan = customerPAN.trim().toUpperCase() || null;

      // Loop through all items and save as URD Purchases
      for (const row of items) {
        const grossMg = Math.round(parseFloat(row.grossWeight) * 1000);
        const purity = parseFloat(row.purityPercent);
        const ratePaise = Math.round(parseFloat(row.ratePerGram) * 100);

        await urdPurchaseService.createURDPurchase({
          purchaseDate,
          customerName: cName,
          customerAddress: cAddr,
          customerMobile: cMob,
          customerAadhaar: cAadhaar,
          customerPAN: cPan,
          metalType: row.metalType,
          grossWeightMg: grossMg,
          purityPercent: purity,
          ratePerGramPaise: ratePaise,
          paymentMode,
          bankAccountId: paymentMode !== 'CASH' ? bankAccountId || 'UNKNOWN_ACCOUNT' : null,
        }, activeFirmId);
      }

      setSuccessMessage(`Saved ${items.length} URD purchase item${items.length > 1 ? 's' : ''} successfully.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="New URD Purchase" showBack>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 32, paddingBottom: 350, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        
        {/* Seller / Customer Details */}
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

        {/* Item Rows */}
        {items.map((row, index) => {
          const calc = itemCalculations[index];

          return (
            <GlassCard key={row.id} style={{ marginBottom: 16 }}>
              {/* Row Header with Delete option */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(92,22,35,0.08)', paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Scale size={18} color="#D4AF37" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#5C1623' }}>Item #{index + 1}</Text>
                </View>

                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItemRow(index)} style={{ padding: 4 }}>
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Metal Selector */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 6 }}>Metal Type *</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                {(['GOLD', 'SILVER'] as URDMetalType[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' }, row.metalType === m && { backgroundColor: m === 'GOLD' ? '#C8860A' : '#6B7280', borderColor: m === 'GOLD' ? '#C8860A' : '#6B7280' }]}
                    onPress={() => updateRow(index, 'metalType', m)}
                  >
                    <Text style={[{ fontSize: 13, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, row.metalType === m && { color: '#fff' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <GlassInput 
                label="Gross Weight (Grams) *" 
                placeholder="0.000" 
                keyboardType="numeric" 
                value={row.grossWeight} 
                onChangeText={(t) => updateRow(index, 'grossWeight', t)} 
              />

              <GlassInput 
                label="Purity (%) *" 
                placeholder="e.g. 91.6" 
                keyboardType="numeric" 
                value={row.purityPercent} 
                onChangeText={(t) => updateRow(index, 'purityPercent', t)} 
              />

              {/* Quick Purity Preset Chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: -4 }}>
                {row.metalType === 'GOLD' ? (
                  [
                    { label: '22K (91.6%)', val: '91.6' },
                    { label: '18K (75%)', val: '75.0' },
                    { label: '24K (99.9%)', val: '99.9' },
                    { label: '24K (99.5%)', val: '99.50' },
                    { label: '24K (99.99%)', val: '99.99' },
                    { label: '20K (83.3%)', val: '83.3' },
                    { label: '14K (58.3%)', val: '58.3' }
                  ].map(preset => (
                    <TouchableOpacity
                      key={preset.val}
                      onPress={() => updateRow(index, 'purityPercent', preset.val)}
                      style={{
                        backgroundColor: row.purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: row.purityPercent === preset.val ? '#FFF' : '#5C1623' }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  [
                    { label: '92.5% Sterling', val: '92.5' },
                    { label: '99.9% Fine', val: '99.9' },
                    { label: '83.5%', val: '83.5' },
                    { label: '80.0%', val: '80.0' }
                  ].map(preset => (
                    <TouchableOpacity
                      key={preset.val}
                      onPress={() => updateRow(index, 'purityPercent', preset.val)}
                      style={{
                        backgroundColor: row.purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: row.purityPercent === preset.val ? '#FFF' : '#5C1623' }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <GlassInput 
                label={`Rate Per Gram (${getCurrencySymbol()}) *`} 
                placeholder="e.g. 7000" 
                keyboardType="numeric" 
                value={row.ratePerGram} 
                onChangeText={(t) => updateRow(index, 'ratePerGram', t)} 
              />

              <GlassInput 
                label={`Discount / Deduction (${getCurrencySymbol()})`} 
                placeholder="0 (Optional deduction)" 
                keyboardType="numeric" 
                value={row.discount} 
                onChangeText={(t) => updateRow(index, 'discount', t)} 
              />

              {/* Item Live Calculation Preview */}
              {calc.isValid && (
                <View style={{ backgroundColor: 'rgba(92,22,35,0.03)', padding: 12, borderRadius: 10, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(92,22,35,0.6)', fontWeight: '600' }}>Calculated Fine Wt:</Text>
                    <Text style={{ fontSize: 12, color: '#047857', fontWeight: 'bold', fontFamily: 'monospace' }}>{calc.formattedFineGrams}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: 'rgba(92,22,35,0.6)', fontWeight: '600' }}>Item Net Valuation:</Text>
                    <Text style={{ fontSize: 13, color: '#5C1623', fontWeight: '800', fontFamily: 'monospace' }}>{calc.formattedTotalValue}</Text>
                  </View>
                </View>
              )}
            </GlassCard>
          );
        })}

        {/* Add Item Button */}
        <TouchableOpacity
          onPress={addItemRow}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: 'rgba(212,175,55,0.12)',
            borderWidth: 1,
            borderColor: '#D4AF37',
            borderStyle: 'dashed',
            borderRadius: 14,
            padding: 14,
            marginBottom: 20
          }}
        >
          <Plus size={18} color="#D4AF37" />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C1623' }}>Add Another Item (Gold / Silver)</Text>
        </TouchableOpacity>

        {/* Valuation & Payout Summary */}
        <GlassCard style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Banknote size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#5C1623' }}>Payout & Batch Summary</Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8 }}>Payout Mode *</Text>
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

          <View style={{ backgroundColor: '#5C1623', padding: 16, borderRadius: 14, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Total Items</Text>
              <Text style={{ fontSize: 12, color: '#FCFBF8', fontWeight: 'bold' }}>{items.length} Item{items.length > 1 ? 's' : ''}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Total Gross Weight</Text>
              <Text style={{ fontSize: 12, color: '#FCFBF8', fontWeight: 'bold', fontFamily: 'monospace' }}>{batchSummary.totalGrossG} g</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: '#F7D273', fontWeight: '600' }}>Total Fine Weight</Text>
              <Text style={{ fontSize: 12, color: '#F7D273', fontWeight: 'bold', fontFamily: 'monospace' }}>{batchSummary.totalFineG} g</Text>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 8 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 }}>Grand Total Payout Amount</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>{batchSummary.formattedTotalPayout}</Text>
            </View>
          </View>
        </GlassCard>

        <GlassButton title="Save as Draft" onPress={handleSubmit} loading={loading} />

      </ScrollView>

      {/* Success Modal */}
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