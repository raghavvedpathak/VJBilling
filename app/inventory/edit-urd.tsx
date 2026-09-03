// app/inventory/edit-urd.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Alert, TouchableOpacity, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, FixedGlassBar } from '@/components/ui/Glass';
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
import { User, Scale, Banknote, CheckCircle, Save, X, Building2 } from 'lucide-react-native';
import type { URDMetalType, URDPurchase, CreateURDPurchaseInput } from '@/types/phase2/phase2.types';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function EditURDScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const params = useLocalSearchParams<{ urdId: string }>();
  const urdId = Array.isArray(params.urdId) ? params.urdId[0] : params.urdId;

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

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

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

        setPaymentMode(
          urd.paymentMode === 'BANK_TRANSFER' || urd.paymentMode === 'NEFT'
            ? 'BANK'
            : (urd.paymentMode as any) || 'CASH'
        );
        setBankAccountId(urd.bankAccountId || '');
      } catch (e: any) {
        Alert.alert('Error loading draft', e.message || 'Failed to fetch URD draft.');
      } finally {
        if (active) setInitialLoading(false);
      }
    };

    fetchURD();
    return () => { active = false; };
  }, [activeFirmId, urdId, router]);

  // Live Item Calculation
  const calculation = useMemo(() => {
    const grossMg = Math.round((parseCleanFloat(grossWeight) || 0) * 1000);
    const purity = parseCleanFloat(purityPercent) || 0;
    const ratePaise = rupeesToPaise(parseCleanFloat(ratePerGram)) || 0;
    const rawAdj = parseCleanFloat(discount);
    const signedAdj = adjustmentType === '-' ? -Math.abs(rawAdj) : Math.abs(rawAdj);
    const adjustmentPaise = rupeesToPaise(signedAdj) || 0;

    const breakdown = computeURDCostBreakdown(grossMg, purity, ratePaise, adjustmentPaise);
    return {
      ...breakdown,
      isValid: grossMg > 0 && purity > 0 && ratePaise > 0,
      formattedFineGrams: (breakdown.fineWeightMg / 1000).toFixed(3) + ' g',
      formattedTotalPayout: formatRupees(breakdown.totalValuePaise),
    };
  }, [grossWeight, purityPercent, ratePerGram, discount, adjustmentType]);

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId || !urdId) return;
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

    const grossMg = Math.round((parseCleanFloat(grossWeight) || 0) * 1000);
    const purity = parseCleanFloat(purityPercent) || 0;
    const ratePaise = rupeesToPaise(parseCleanFloat(ratePerGram));

    if (isNaN(grossMg) || grossMg <= 0) { 
      Alert.alert('Validation Error', 'Gross weight must be greater than 0.'); 
      return; 
    }
    if (isNaN(purity) || purity <= 0 || purity > 100) { 
      Alert.alert('Validation Error', 'Purity must be between 0.01% and 100%.'); 
      return; 
    }
    if (!ratePaise || ratePaise <= 0) { 
      Alert.alert('Validation Error', 'Please enter a valid Rate Per Gram.'); 
      return; 
    }

    if (calculation.totalValuePaise > 999999999) {
      Alert.alert('Limit Exceeded', `URD Purchase valuation cannot exceed ${getCurrencySymbol()}99,99,999.99`);
      return;
    }

    setLoading(true);
    try {
      const cName = customerName.trim();
      const cAddr = customerAddress.trim() || null;
      const cMob = customerMobile.trim() || null;
      const cAadhaar = cleanedAadhaar || null;
      const cPan = cleanedPan || null;
      const resolvedBankId = paymentMode !== 'CASH' ? bankAccountId.trim() : null;

      await urdPurchaseService.updateURDPurchase(
        urdId,
        {
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
          bankAccountId: resolvedBankId,
        },
        activeFirmId
      );

      setSuccessMessage('URD Purchase Draft updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update URD purchase.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <TwoToneWrapper title="Edit URD Draft" showBack>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 }}>
          <ActivityIndicator size="large" color={colors.vjAccent} />
          <Text style={{ color: colors.vjText, marginTop: 12, fontWeight: '700' }}>Loading URD Draft Details...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  return (
    <TwoToneWrapper title="Edit URD Purchase" showBack>
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
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Seller Details</Text>
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

          {/* Item Specification */}
          <GlassCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Scale size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Item Details</Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 6 }}>Metal Type *</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              {(['GOLD', 'SILVER'] as URDMetalType[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center' },
                    metalType === m && { backgroundColor: m === 'GOLD' ? '#C8860A' : '#6B7280', borderColor: m === 'GOLD' ? '#C8860A' : '#6B7280' },
                  ]}
                  onPress={() => {
                    if (metalType !== m) {
                      setMetalType(m);
                      setPurityPercent('');
                    }
                  }}
                >
                  <Text style={[{ fontSize: 13, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, metalType === m && { color: '#fff' }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <GlassInput
              label="Gross Weight (Grams) *"
              placeholder="0.000"
              keyboardType="decimal-pad"
              value={grossWeight}
              onChangeText={setGrossWeight}
            />

            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase' }}>Purity (%) *</Text>
                {metalType === 'GOLD' && parseCleanFloat(purityPercent) > 0 && percentToKarat(parseCleanFloat(purityPercent)) ? (
                  <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>
                      {percentToKarat(parseCleanFloat(purityPercent))}K
                    </Text>
                  </View>
                ) : null}
              </View>
              <GlassInput
                placeholder={metalType === 'SILVER' ? '92.5' : '91.6'}
                keyboardType="decimal-pad"
                value={purityPercent}
                onChangeText={setPurityPercent}
              />
            </View>

            {/* Quick Purity Preset Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: -4 }}>
              {getPurityPresets(metalType || 'GOLD').map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => setPurityPercent(preset.val)}
                  style={{
                    backgroundColor: purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: purityPercent === preset.val ? '#FFF' : colors.vjText }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <GlassInput
              label={`Rate Per Gram (${getCurrencySymbol()}) *`}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={ratePerGram}
              onChangeText={setRatePerGram}
            />

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.vjText, marginBottom: 6 }}>
                Adjustment Type:
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                    backgroundColor: adjustmentType === '+' ? colors.vjText : 'rgba(255,255,255,0.4)',
                    borderWidth: 1, borderColor: adjustmentType === '+' ? colors.vjText : 'rgba(0,0,0,0.1)'
                  }}
                  onPress={() => setAdjustmentType('+')}
                >
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustmentType === '+' ? '#fff' : colors.vjText }}>
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
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustmentType === '-' ? '#fff' : colors.vjText }}>
                    - Deduction (Round-Down)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <GlassInput
              label={`Adjustment Amount (${getCurrencySymbol()})`}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={discount}
              onChangeText={setDiscount}
            />
          </GlassCard>

          {/* Valuation & Payout Summary */}
          <GlassCard style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Banknote size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Payout & Valuation Summary</Text>
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
                  <Text style={[{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)' }, paymentMode === mode && { color: '#fff' }]}>{mode}</Text>
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

            {calculation.isValid && (
              <View style={{ backgroundColor: colors.vjText, padding: 16, borderRadius: 14, marginTop: 4 }}>
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
        </KeyboardAwareScrollView>

        {/* Fixed Action Bar */}
        <FixedGlassBar>
          <TouchableOpacity
            style={s.pillSecondaryBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.back();
            }}
            disabled={loading}
            activeOpacity={0.7}
          >
            <X size={16} color={colors.vjText} />
            <Text style={[s.pillSecondaryText, { color: colors.vjText }]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="save-urd-changes-btn"
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
        </FixedGlassBar>
      </View>

      {/* Success Modal */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => {
            setSuccessMessage(null);
            router.back();
          }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Draft Updated!</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{successMessage}</Text>

            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton
                title="Done"
                onPress={() => {
                  setSuccessMessage(null);
                  router.back();
                }}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
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
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
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
