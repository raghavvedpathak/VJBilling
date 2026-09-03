// app/inventory/add-urd.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useMemo } from 'react';
import { View, Text, Alert, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassDatePickerModal } from '@/components/ui/GlassDatePickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { urdPurchaseService } from '@/services/phase2/urdPurchaseService';
import { 
  getCurrencySymbol, 
  formatRupees, 
  computeURDCostBreakdown, 
  parseCleanFloat, 
  percentToKarat, 
  getPurityPresets,
  rupeesToPaise 
} from '@/utils/calculations';
import { User, Scale, Banknote, CheckCircle, Trash2, Plus, Calendar as CalendarIcon, Building2 } from 'lucide-react-native';
import { formatDate } from '@/utils/formatDate';
import type { URDMetalType, CreateURDPurchaseInput } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export interface URDItemRow {
  id: string;
  metalType: URDMetalType;
  grossWeight: string;
  purityPercent: string;
  ratePerGram: string;
  adjustmentType: '+' | '-';
  discount: string;
}

const getEmptyRow = (): URDItemRow => ({
  id: String(Date.now() + Math.random()),
  metalType: 'GOLD',
  grossWeight: '',
  purityPercent: '',
  ratePerGram: '',
  adjustmentType: '+',
  discount: '',
});

export default function AddURDScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const todayIso = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);

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
    if (field === 'metalType' && newItems[index].metalType !== value) {
      newItems[index] = { ...newItems[index], metalType: value, purityPercent: '' };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const addItemRow = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (items.length >= 10) {
      Alert.alert('Limit Reached', 'You can add up to 10 URD items per transaction batch.');
      return;
    }
    setItems([...items, getEmptyRow()]);
  };

  const removeItemRow = (index: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
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
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
          },
        },
      ]
    );
  };

  // Calculations for all items
  const itemCalculations = useMemo(() => {
    return items.map((row) => {
      const grossG = parseCleanFloat(row.grossWeight);
      const grossMg = Math.round(grossG * 1000);
      const purity = parseCleanFloat(row.purityPercent);
      const rateG = parseCleanFloat(row.ratePerGram);
      const ratePaise = rupeesToPaise(rateG) || 0;
      const rawAdj = parseCleanFloat(row.discount);
      const signedAdj = row.adjustmentType === '-' ? -Math.abs(rawAdj) : Math.abs(rawAdj);
      const adjustmentPaise = rupeesToPaise(signedAdj) || 0;

      return {
        ...computeURDCostBreakdown(grossMg, purity, ratePaise, adjustmentPaise),
        metalType: row.metalType,
        grossWeightG: grossG,
        isValid: grossMg > 0 && purity > 0 && ratePaise > 0,
      };
    });
  }, [items]);

  // Total summary across all items
  const batchSummary = useMemo(() => {
    let totalGrossG = 0;
    let totalFineG = 0;
    let totalPayoutPaise = 0;

    itemCalculations.forEach((calc) => {
      totalGrossG += calc.grossWeightG;
      totalFineG += calc.fineWeightMg / 1000;
      totalPayoutPaise += calc.totalValuePaise;
    });

    return {
      totalGrossG: totalGrossG.toFixed(3),
      totalFineG: totalFineG.toFixed(3),
      formattedTotalPayout: formatRupees(totalPayoutPaise),
      totalPayoutPaise,
    };
  }, [itemCalculations]);

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId) {
      Alert.alert('Error', 'No active firm selected.');
      return;
    }
    if (!customerName.trim()) {
      Alert.alert('Validation Error', 'Seller/Customer Name is required.');
      return;
    }

    if (paymentMode !== 'CASH' && !bankAccountId.trim()) {
      Alert.alert('Validation Error', `Please provide the Bank Account ID or reference for ${paymentMode} payment.`);
      return;
    }

    // Optional KYC validation
    const cleanedAadhaar = customerAadhaar.replace(/[^0-9]/g, '');
    if (cleanedAadhaar && cleanedAadhaar.length !== 12) {
      Alert.alert('Invalid Aadhaar', 'Aadhaar Number must be exactly 12 digits.');
      return;
    }

    const cleanedPan = customerPAN.trim().toUpperCase();
    if (cleanedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanedPan)) {
      Alert.alert('Invalid PAN', 'PAN must follow standard format (e.g. ABCDE1234F).');
      return;
    }

    // Validate item rows
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const grossMg = Math.round(parseCleanFloat(row.grossWeight) * 1000);
      const purity = parseCleanFloat(row.purityPercent);
      const ratePaise = rupeesToPaise(parseCleanFloat(row.ratePerGram));

      if (isNaN(grossMg) || grossMg <= 0) {
        Alert.alert('Validation Error', `Item #${i + 1}: Invalid Gross Weight.`);
        return;
      }
      if (isNaN(purity) || purity <= 0 || purity > 100) {
        Alert.alert('Validation Error', `Item #${i + 1}: Purity must be between 0.01% and 100%.`);
        return;
      }
      if (!ratePaise || ratePaise <= 0) {
        Alert.alert('Validation Error', `Item #${i + 1}: Invalid Rate Per Gram.`);
        return;
      }
    }

    setLoading(true);
    try {
      const cName = customerName.trim();
      const cAddr = customerAddress.trim() || null;
      const cMob = customerMobile.trim() || null;
      const cAadhaar = cleanedAadhaar || null;
      const cPan = cleanedPan || null;
      const resolvedBankId = paymentMode !== 'CASH' ? bankAccountId.trim() : null;

      for (let i = 0; i < items.length; i++) {
        const row = items[i];
        const calc = itemCalculations[i];

        const payload: CreateURDPurchaseInput = {
          purchaseDate,
          customerName: cName,
          customerAddress: cAddr,
          customerMobile: cMob,
          customerAadhaar: cAadhaar,
          customerPAN: cPan,
          metalType: row.metalType,
          grossWeightMg: calc.grossWeightMg,
          purityPercent: calc.purityPercent,
          ratePerGramPaise: calc.ratePerGramPaise,
          adjustmentPaise: calc.adjustmentPaise,
          totalValuePaise: calc.totalValuePaise,
          paymentMode,
          bankAccountId: resolvedBankId,
        };

        await urdPurchaseService.createURDPurchase(payload, activeFirmId);
      }

      setSuccessMessage(`Saved ${items.length} URD purchase item${items.length > 1 ? 's' : ''} successfully.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save URD purchases.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="New URD Purchase" showBack>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 190, paddingHorizontal: 16 }}
        >
          {/* Seller / Customer Details */}
          <GlassCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <User size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Seller Details</Text>
            </View>

            {/* Purchase Date Field */}
            <View style={{ marginBottom: 12 }}>
              <GlassPickerInput
                label="Purchase Date"
                placeholder="Select date..."
                selectedLabel={formatDate(purchaseDate)}
                selectedSublabel={purchaseDate === todayIso ? 'Today' : undefined}
                onPress={() => setShowDatePicker(true)}
                icon={<CalendarIcon size={18} color="#D4AF37" />}
              />
            </View>

            <GlassInput
              label="Full Name *"
              placeholder="Enter customer name"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <GlassInput
              label="Mobile Number"
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              maxLength={10}
              value={customerMobile}
              onChangeText={setCustomerMobile}
            />
            <GlassInput
              label="Address"
              placeholder="City/Area"
              value={customerAddress}
              onChangeText={setCustomerAddress}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label="Aadhaar No (Optional)"
                  placeholder="12-digit number"
                  keyboardType="number-pad"
                  maxLength={12}
                  value={customerAadhaar}
                  onChangeText={setCustomerAadhaar}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label="PAN (Optional)"
                  placeholder="ABCDE1234F"
                  autoCapitalize="characters"
                  maxLength={10}
                  value={customerPAN}
                  onChangeText={setCustomerPAN}
                />
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
                    <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.vjText }}>Item #{index + 1}</Text>
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
                      style={[
                        { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' },
                        row.metalType === m && { backgroundColor: m === 'GOLD' ? '#C8860A' : '#6B7280', borderColor: m === 'GOLD' ? '#C8860A' : '#6B7280' },
                      ]}
                      onPress={() => updateRow(index, 'metalType', m)}
                    >
                      <Text style={[{ fontSize: 13, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, row.metalType === m && { color: '#fff' }]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <GlassInput
                  label="Gross Weight (Grams) *"
                  placeholder="0.000"
                  keyboardType="decimal-pad"
                  value={row.grossWeight}
                  onChangeText={(t) => updateRow(index, 'grossWeight', t)}
                />

                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase' }}>Purity (%) *</Text>
                    {row.metalType === 'GOLD' && parseCleanFloat(row.purityPercent) > 0 && percentToKarat(parseCleanFloat(row.purityPercent)) ? (
                      <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>
                          {percentToKarat(parseCleanFloat(row.purityPercent))}K
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <GlassInput
                    placeholder={row.metalType === 'SILVER' ? '92.5' : '91.6'}
                    keyboardType="decimal-pad"
                    value={row.purityPercent}
                    onChangeText={(t) => updateRow(index, 'purityPercent', t)}
                  />
                </View>

                {/* Quick Purity Preset Chips */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: -4 }}>
                  {getPurityPresets(row.metalType || 'GOLD').map((preset) => (
                    <TouchableOpacity
                      key={preset.id}
                      onPress={() => updateRow(index, 'purityPercent', preset.val)}
                      style={{
                        backgroundColor: row.purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: row.purityPercent === preset.val ? '#FFF' : COLORS.vjText }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <GlassInput
                  label={`Rate Per Gram (${getCurrencySymbol()}) *`}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={row.ratePerGram}
                  onChangeText={(t) => updateRow(index, 'ratePerGram', t)}
                />

                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.vjText, marginBottom: 6 }}>
                    Adjustment Type:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: (row.adjustmentType || '+') === '+' ? COLORS.vjText : 'rgba(255,255,255,0.4)',
                        borderWidth: 1,
                        borderColor: (row.adjustmentType || '+') === '+' ? COLORS.vjText : 'rgba(0,0,0,0.1)',
                      }}
                      onPress={() => updateRow(index, 'adjustmentType', '+')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: (row.adjustmentType || '+') === '+' ? '#fff' : COLORS.vjText }}>
                        + Addition (Round-Up)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: row.adjustmentType === '-' ? COLORS.danger : 'rgba(255,255,255,0.4)',
                        borderWidth: 1,
                        borderColor: row.adjustmentType === '-' ? COLORS.danger : 'rgba(0,0,0,0.1)',
                      }}
                      onPress={() => updateRow(index, 'adjustmentType', '-')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: row.adjustmentType === '-' ? '#fff' : COLORS.vjText }}>
                        - Deduction (Round-Down)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <GlassInput
                  label={`Adjustment Amount (${getCurrencySymbol()})`}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
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
                      <Text style={{ fontSize: 13, color: COLORS.vjText, fontWeight: '800', fontFamily: 'monospace' }}>{formatRupees(calc.totalValuePaise)}</Text>
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
              marginBottom: 20,
            }}
          >
            <Plus size={18} color="#D4AF37" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.vjText }}>Add Another Item (Gold / Silver)</Text>
          </TouchableOpacity>

          {/* Valuation & Payout Summary */}
          <GlassCard style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Banknote size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Payout & Batch Summary</Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8 }}>Payout Mode *</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['CASH', 'UPI', 'BANK'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' },
                    paymentMode === mode && { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
                  ]}
                  onPress={() => setPaymentMode(mode)}
                >
                  <Text style={[{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, paymentMode === mode && { color: '#fff' }]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {paymentMode !== 'CASH' && (
              <View style={{ marginBottom: 12 }}>
                <GlassInput
                  label={`${paymentMode} Account / Reference No *`}
                  placeholder={paymentMode === 'UPI' ? 'UPI ID / Mobile' : 'Bank Account Number'}
                  value={bankAccountId}
                  onChangeText={setBankAccountId}
                  icon={<Building2 size={18} color="#D4AF37" />}
                />
              </View>
            )}

            <View style={{ backgroundColor: COLORS.vjText, padding: 16, borderRadius: 14, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Total Items</Text>
                <Text style={{ fontSize: 12, color: '#FCFBF8', fontWeight: 'bold' }}>
                  {items.length} Item{items.length > 1 ? 's' : ''}
                </Text>
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
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 }}>
                  Grand Total Payout Amount
                </Text>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>
                  {batchSummary.formattedTotalPayout}
                </Text>
              </View>
            </View>
          </GlassCard>
        </KeyboardAwareScrollView>

        {/* Fixed Sticky Action Bar */}
        <FixedGlassBar>
          <View style={s.payoutBadge}>
            <Text style={s.payoutBadgeLabel}>TOTAL PAYOUT</Text>
            <Text style={s.payoutBadgeVal}>{batchSummary.formattedTotalPayout}</Text>
          </View>

          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Banknote size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Save URD Draft</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

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

      <GlassDatePickerModal
        visible={showDatePicker}
        title="Purchase Date"
        value={purchaseDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={(d) => setPurchaseDate(d)}
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
  payoutBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(92,22,35,0.06)',
    borderRadius: 20,
  },
  payoutBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(92,22,35,0.5)',
    letterSpacing: 0.5,
  },
  payoutBadgeVal: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.vjText,
    fontFamily: 'monospace',
  },
});