// app/inventory/edit-urd.tsx — Phase 2 Canonical Edit Screen for Draft URD Purchases

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { urdPurchaseService } from '@/services/phase2/urdPurchaseService';
import { getCurrencySymbol, formatRupees, computeURDCostBreakdown, parseCleanFloat } from '@/utils/calculations';
import { User, Scale, Banknote, CheckCircle, Save, Edit3, X } from 'lucide-react-native';
import type { URDMetalType, URDPurchase } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export default function EditURDScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const { urdId } = useLocalSearchParams<{ urdId: string }>();

  const [initialLoading, setInitialLoading] = useState(true);
  const [urdRecord, setUrdRecord] = useState<URDPurchase | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerAadhaar, setCustomerAadhaar] = useState('');
  const [customerPAN, setCustomerPAN] = useState('');

  const [metalType, setMetalType] = useState<URDMetalType>('GOLD');
  const [grossWeight, setGrossWeight] = useState('');
  const [purityPercent, setPurityPercent] = useState('');
  const [ratePerGram, setRatePerGram] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'+' | '-'>('+');
  const [discount, setDiscount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK' | 'UPI'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load existing URD Purchase data
  useEffect(() => {
    let active = true;
    const fetchURD = async () => {
      if (!activeFirmId || !urdId) return;
      try {
        const urd = await urdPurchaseService.getById(urdId, activeFirmId);
        if (!active) return;
        if (!urd) {
          Alert.alert('Error', 'URD Purchase draft not found.');
          router.back();
          return;
        }

        setUrdRecord(urd);
        setCustomerName(urd.customerName || '');
        setCustomerMobile(urd.customerMobile || '');
        setCustomerAddress(urd.customerAddress || '');
        setCustomerAadhaar(urd.customerAadhaar || '');
        setCustomerPAN(urd.customerPAN || '');

        setMetalType((urd.metalType as URDMetalType) || 'GOLD');
        setGrossWeight((urd.grossWeightMg / 1000).toString());
        setPurityPercent(urd.purityPercent.toString());
        setRatePerGram((urd.ratePerGramPaise / 100).toString());

        const grossValPaise = Math.round((urd.fineWeightMg / 1000) * urd.ratePerGramPaise);
        const adjPaise = urd.totalValuePaise - grossValPaise;
        if (adjPaise < 0) {
          setAdjustmentType('-');
          setDiscount((Math.abs(adjPaise) / 100).toString());
        } else if (adjPaise > 0) {
          setAdjustmentType('+');
          setDiscount((adjPaise / 100).toString());
        } else {
          setAdjustmentType('+');
          setDiscount('');
        }

        setPaymentMode(urd.paymentMode === 'BANK_TRANSFER' || urd.paymentMode === 'NEFT' ? 'BANK' : (urd.paymentMode as any) || 'CASH');
        setBankAccountId(urd.bankAccountId || '');
      } catch (e: any) {
        Alert.alert('Error loading draft', e.message);
      } finally {
        if (active) setInitialLoading(false);
      }
    };

    fetchURD();
    return () => { active = false; };
  }, [activeFirmId, urdId]);

  // Live Item Calculation
  const calculation = useMemo(() => {
    const grossMg = Math.round((parseCleanFloat(grossWeight) || 0) * 1000);
    const purity = parseCleanFloat(purityPercent) || 0;
    const ratePaise = Math.round((parseCleanFloat(ratePerGram) || 0) * 100);
    const rawAdj = parseCleanFloat(discount);
    const signedAdj = adjustmentType === '-' ? -Math.abs(rawAdj) : Math.abs(rawAdj);
    const adjustmentPaise = Math.round(signedAdj * 100);

    const breakdown = computeURDCostBreakdown(grossMg, purity, ratePaise, adjustmentPaise);
    return {
      ...breakdown,
      isValid: grossMg > 0 && purity > 0 && ratePaise > 0,
      formattedFineGrams: (breakdown.fineWeightMg / 1000).toFixed(3) + ' g',
      formattedTotalPayout: getCurrencySymbol() + (breakdown.totalValuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  }, [grossWeight, purityPercent, ratePerGram, discount, adjustmentType]);

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!activeFirmId || !urdId) return;
    if (!customerName.trim()) { Alert.alert('Error', 'Seller/Customer Name is required'); return; }

    const grossMg = Math.round((parseCleanFloat(grossWeight) || 0) * 1000);
    const purity = parseCleanFloat(purityPercent) || 0;
    const ratePaise = Math.round((parseCleanFloat(ratePerGram) || 0) * 100);

    if (isNaN(grossMg) || grossMg <= 0) { Alert.alert('Validation Error', 'Invalid Gross Weight'); return; }
    if (isNaN(purity) || purity <= 0 || purity > 100) { Alert.alert('Validation Error', 'Purity must be between 1 and 100%'); return; }
    if (isNaN(ratePaise) || ratePaise <= 0) { Alert.alert('Validation Error', 'Invalid Rate Per Gram'); return; }

    setLoading(true);
    try {
      const cName = customerName.trim();
      const cAddr = customerAddress.trim() || null;
      const cMob = customerMobile.trim() || null;
      const cAadhaar = customerAadhaar.replace(/[^0-9]/g, '') || null;
      const cPan = customerPAN.trim().toUpperCase() || null;

      await urdPurchaseService.updateURDPurchase(urdId, {
        customerName: cName,
        customerAddress: cAddr,
        customerMobile: cMob,
        customerAadhaar: cAadhaar,
        customerPAN: cPan,
        metalType,
        grossWeightMg: calculation.grossWeightMg,
        purityPercent: calculation.purityPercent,
        ratePerGramPaise: calculation.ratePerGramPaise,
        adjustmentPaise: calculation.adjustmentPaise,
        totalValuePaise: calculation.totalValuePaise,
        paymentMode,
        bankAccountId: paymentMode !== 'CASH' ? bankAccountId || 'UNKNOWN_ACCOUNT' : null,
      }, activeFirmId);

      setSuccessMessage('URD Purchase Draft updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <TwoToneWrapper title="Edit URD Draft" showBack>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 }}>
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
          <Text style={{ color: COLORS.vjText, marginTop: 12, fontWeight: '700' }}>Loading URD Draft Details...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  return (
    <TwoToneWrapper title="Edit URD Purchase" showBack>
      <View style={{ flex: 1 }}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" 
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 110, paddingHorizontal: 16 }}
        >
          {/* Seller / Customer Details */}
          <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <User size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Seller Details</Text>
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

        {/* Item Specification */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Scale size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Item Details</Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 6 }}>Metal Type *</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {(['GOLD', 'SILVER'] as URDMetalType[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' }, metalType === m && { backgroundColor: m === 'GOLD' ? '#C8860A' : '#6B7280', borderColor: m === 'GOLD' ? '#C8860A' : '#6B7280' }]}
                onPress={() => setMetalType(m)}
              >
                <Text style={[{ fontSize: 13, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, metalType === m && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <GlassInput
            label="Gross Weight (Grams) *"
            placeholder="0.000"
            keyboardType="numeric"
            value={grossWeight}
            onChangeText={setGrossWeight}
          />

          <GlassInput
            label="Purity (%) *"
            placeholder="e.g. 91.6"
            keyboardType="numeric"
            value={purityPercent}
            onChangeText={setPurityPercent}
          />

          {/* Quick Purity Preset Chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: -4 }}>
            {metalType === 'GOLD' ? (
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
                  onPress={() => setPurityPercent(preset.val)}
                  style={{
                    backgroundColor: purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: purityPercent === preset.val ? '#FFF' : COLORS.vjText }}>
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
                  onPress={() => setPurityPercent(preset.val)}
                  style={{
                    backgroundColor: purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: purityPercent === preset.val ? '#FFF' : COLORS.vjText }}>
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
            value={ratePerGram}
            onChangeText={setRatePerGram}
          />

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.vjText, marginBottom: 6 }}>
              Adjustment Type:
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                  backgroundColor: adjustmentType === '+' ? COLORS.vjText : 'rgba(255,255,255,0.4)',
                  borderWidth: 1, borderColor: adjustmentType === '+' ? COLORS.vjText : 'rgba(0,0,0,0.1)'
                }}
                onPress={() => setAdjustmentType('+')}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustmentType === '+' ? '#fff' : COLORS.vjText }}>
                  + Addition (Round-Up)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                  backgroundColor: adjustmentType === '-' ? COLORS.danger : 'rgba(255,255,255,0.4)',
                  borderWidth: 1, borderColor: adjustmentType === '-' ? COLORS.danger : 'rgba(0,0,0,0.1)'
                }}
                onPress={() => setAdjustmentType('-')}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustmentType === '-' ? '#fff' : COLORS.vjText }}>
                  - Deduction (Round-Down)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <GlassInput
            label={`Adjustment Amount (${getCurrencySymbol()})`}
            placeholder="0 (Optional amount)"
            keyboardType="numeric"
            value={discount}
            onChangeText={setDiscount}
          />
        </GlassCard>

        {/* Valuation & Payout Summary */}
        <GlassCard style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Banknote size={20} color="#D4AF37" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.vjText }}>Payout & Valuation Summary</Text>
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

          {calculation.isValid && (
            <View style={{ backgroundColor: COLORS.vjText, padding: 16, borderRadius: 14, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Calculated Fine Weight</Text>
                <Text style={{ fontSize: 12, color: '#F7D273', fontWeight: 'bold', fontFamily: 'monospace' }}>{calculation.formattedFineGrams}</Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 }}>Updated Total Payout Amount</Text>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FCFBF8', fontFamily: 'monospace' }}>{calculation.formattedTotalPayout}</Text>
              </View>
            </View>
          )}
        </GlassCard>

        </ScrollView>

        {/* === FIXED STICKY PILL-SHAPED GLASS ACTION BAR === */}
        <View style={s.fixedPillWrapper}>
          <View style={s.fixedPillCard}>
            <BlurView intensity={50} tint="light" style={s.fixedPillBlurContent}>
              <View style={s.fixedBottomBarRow}>
                <TouchableOpacity
                  style={s.pillSecondaryBtn}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    router.back();
                  }}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <X size={16} color={COLORS.vjText} />
                  <Text style={s.pillSecondaryText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.pillPrimaryBtn}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Save size={18} color="#fff" />
                      <Text style={s.pillPrimaryText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      </View>

      {/* Success Modal */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Draft Updated!</Text>
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
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },

  // --- Fixed Sticky Pill-Shaped Glass Action Bar ---
  fixedPillWrapper: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 99,
  },
  fixedPillCard: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    backgroundColor: '#FFFDF9',
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  fixedPillBlurContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 36,
    backgroundColor: '#FFFDF9',
  },
  fixedBottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pillSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.15)',
    paddingVertical: 14,
    borderRadius: 28,
  },
  pillSecondaryText: {
    color: COLORS.vjText,
    fontSize: 14,
    fontWeight: '700',
  },
  pillPrimaryBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.vjAccent,
    paddingVertical: 14,
    borderRadius: 28,
  },
  pillPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
