/* eslint-disable no-restricted-imports */
import { db } from '../../db/client';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { itemRepository } from '../../repositories/itemRepository';
import { itemService } from '../../services/itemService';
import { 
  formatSKUDisplay, 
  percentToKarat, 
  resolveFineWeightMg, 
  computeFineGoldChargedMg, 
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeAbsoluteTotalCostRupees,
  rupeesToPaise,
  getCurrencySymbol 
} from '../../utils/calculations';
import { Edit3, Save, Calculator, CheckCircle } from 'lucide-react-native';
import { GlassButton, GlassSmartSearch } from '../../components/ui/Glass';
import { COLORS } from '../../constants/theme';

export default function EditDraftScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sku, setSku] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [grossG, setGrossG] = useState('');
  const [stoneG, setStoneG] = useState('');
  const [beadsG, setBeadsG] = useState('');
  
  const [purityPercent, setPurityPercent] = useState('');
  const [wastagePercent, setWastagePercent] = useState('');

  const [purchaseRate, setPurchaseRate] = useState('');
  const [makingCharge, setMakingCharge] = useState('');
  const [stoneCost, setStoneCost] = useState('');

  const [sizeValue, setSizeValue] = useState('');
  const [sizeUnit, setSizeUnit] = useState('');

  const [location, setLocation] = useState('');
  const [huid, setHuid] = useState('');
  const [metal, setMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [reason, setReason] = useState('Typo correction before activation');

  useEffect(() => {
    let active = true;
    const loadItem = async () => {
      if (!activeFirmId || !itemId) return;
      try {
        const item = await itemRepository.getById(db as any, activeFirmId, itemId);
        if (active && item) {
          if (item.status !== 'DRAFT') {
            setErrorMessage('Only DRAFT items can be edited here.');
            return;
          }
          setSku(formatSKUDisplay(item.sku));
          
          setGrossG((item.grossWeightMg / 1000).toString());
          setStoneG((item.stoneWeightMg / 1000).toString());
          setBeadsG((item.beadsWeightMg / 1000).toString());
          setPurityPercent(item.purityPercent.toString());
          setWastagePercent((item.wastagePercent || 0).toString());
          setPurchaseRate(item.purchaseRatePaise ? (item.purchaseRatePaise / 100).toString() : '');
          setMakingCharge(item.makingChargePaise ? (item.makingChargePaise / 100).toString() : '');
          setStoneCost(item.stoneCostPaise ? (item.stoneCostPaise / 100).toString() : '');
          setSizeValue(item.sizeValue !== null && item.sizeValue !== undefined ? item.sizeValue.toString() : '');
          setSizeUnit(item.sizeUnit || '');
          setLocation(item.location || '');
          setHuid(item.huid || '');
          setMetal(item.metal);
        } else if (active) {
            setErrorMessage('Failed to load item details.');
        }
      } catch (error: any) {
        console.error('Failed to load item:', error);
        setErrorMessage('Failed to load item details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadItem();
    return () => { active = false; };
  }, [itemId, activeFirmId]);

  const liveWastageSeparation = useMemo(() => {
    const gross = parseFloat(grossG) || 0;
    const stone = parseFloat(stoneG) || 0;
    const beads = parseFloat(beadsG) || 0;
    const purity = parseFloat(purityPercent) || 0;
    const wastage = parseFloat(wastagePercent) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    const making = parseFloat(makingCharge) || 0;
    const stoneC = parseFloat(stoneCost) || 0;

    const netWeightG = Math.max(0, gross - stone - beads);
    const netWeightMg = Math.round(netWeightG * 1000);
    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, purity, metal);
    const vaultTruth = computeVaultTruthGrams(fineWeightMg);

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purity, wastage, metal);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    
    const effectivePricePerGram = computeEffectivePricePerGram(rate, purity, wastage, metal);
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);

    return {
      netWeight: netWeightG.toFixed(3) + ' g',
      totalTouch: (purity + wastage).toFixed(2) + '%',
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
      hasCostData: rate > 0 || making > 0 || stoneC > 0,
      isValid: netWeightG > 0 && purity > 0
    };
  }, [grossG, stoneG, beadsG, purityPercent, wastagePercent, purchaseRate, makingCharge, stoneCost, metal]);

  const handleSave = async () => {
    if (!activeFirmId || !itemId) return;

    const parsedGross = parseFloat(grossG) || 0;
    const parsedStone = parseFloat(stoneG) || 0;
    const parsedBeads = parseFloat(beadsG) || 0;
    const parsedPurity = parseFloat(purityPercent) || 0;

    if (parsedGross <= 0) {
      setErrorMessage('Gross weight must be greater than 0.');
      return;
    }
    if (parsedGross - parsedStone - parsedBeads <= 0) {
      setErrorMessage('Net weight (Gross - Stone - Beads) must be greater than 0.');
      return;
    }
    if (parsedPurity <= 0 || parsedPurity > 100) {
      setErrorMessage('Purity must be between 1 and 100.');
      return;
    }

    let huidUpper = undefined;
    if (huid.trim()) {
      huidUpper = huid.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
        setErrorMessage('BIS HUID must be exactly 6 alphanumeric characters.');
        return;
      }
    }

    setSaving(true);
    try {
      const newGrossMg = Math.round(parsedGross * 1000);
      const newStoneMg = Math.round(parsedStone * 1000);
      const newBeadsMg = Math.round(parsedBeads * 1000);
      
      const newPurityKarat = percentToKarat(parsedPurity) || 0;
      const newRatePaise = rupeesToPaise(purchaseRate);
      const newMakingPaise = rupeesToPaise(makingCharge);
      const newStoneCostPaise = rupeesToPaise(stoneCost);

      // 1. Weight adjustment (must happen via adjustWeight)
      await itemService.adjustWeight(
        itemId,
        activeFirmId,
        newGrossMg,
        newStoneMg,
        newBeadsMg,
        reason
      );

      // 2. Non-weight field updates
      await itemService.updateItem(
        itemId, 
        activeFirmId, 
        {
          purityPercent: parsedPurity,
          purityKarat: newPurityKarat,
          purchaseRatePaise: newRatePaise,
          makingChargePaise: newMakingPaise,
          stoneCostPaise: newStoneCostPaise,
          location: location.trim() || null,
          sizeValue: sizeValue ? parseFloat(sizeValue) : null,
          sizeUnit: (sizeUnit as any) || null,
        },
        reason
      );

      // 3. HUID assignment (write-once)
      if (huidUpper) {
         try {
           await itemService.addHUID(itemId, activeFirmId, huidUpper);
         } catch (e: any) {
           // We just let it bubble up if it's an error.
           if (e.message !== 'HUID_ALREADY_SET') {
             throw e;
           }
         }
      }

      setSuccessMessage('Draft details updated successfully.');
    } catch (error: any) {
      setErrorMessage(error.message || 'Could not update draft.');
    } finally {
      setSaving(false);
    }
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Edit3 size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle} numberOfLines={1}>Edit Draft</Text>
      <Text style={s.headerSubtitle}>{sku || 'Loading...'}</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
        </View>
      ) : (
        <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          <View style={[s.card, { zIndex: 50 }]}>
            <Text style={s.sectionTitle}>Weights (Grams)</Text>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1, paddingRight: 6 }]}>
                <Text style={s.label}>Gross Wt *</Text>
                <TextInput style={s.input} value={grossG} onChangeText={setGrossG} keyboardType="numeric" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingHorizontal: 6 }]}>
                <Text style={s.label}>Stone Wt</Text>
                <TextInput style={s.input} value={stoneG} onChangeText={setStoneG} keyboardType="numeric" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                <Text style={s.label}>Beads Wt</Text>
                <TextInput style={s.input} value={beadsG} onChangeText={setBeadsG} keyboardType="numeric" />
              </View>
            </View>
          </View>

          <View style={[s.card, { zIndex: 40 }]}>
            <Text style={s.sectionTitle}>Purity & Financials</Text>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1, paddingRight: 6 }]}>
                <Text style={s.label}>Purity % *</Text>
                <TextInput style={s.input} value={purityPercent} onChangeText={setPurityPercent} keyboardType="numeric" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                <Text style={s.label}>Wastage %</Text>
                <TextInput style={s.input} value={wastagePercent} onChangeText={setWastagePercent} keyboardType="numeric" />
              </View>
            </View>
            {/* Quick Purity Preset Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 12 }}>
              {(metal || 'GOLD') === 'GOLD' ? (
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
                      backgroundColor: purityPercent === preset.val || purityPercent === preset.label.split('K')[0] ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6
                    }}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: purityPercent === preset.val || purityPercent === preset.label.split('K')[0] ? '#FFF' : '#5C1623'
                    }}>
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
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: purityPercent === preset.val ? '#FFF' : '#5C1623'
                    }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1, paddingRight: 6 }]}>
                <Text style={s.label}>Rate ({getCurrencySymbol()})</Text>
                <TextInput style={s.input} value={purchaseRate} onChangeText={setPurchaseRate} keyboardType="numeric" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingHorizontal: 6 }]}>
                <Text style={s.label}>Making ({getCurrencySymbol()})</Text>
                <TextInput style={s.input} value={makingCharge} onChangeText={setMakingCharge} keyboardType="numeric" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                <Text style={s.label}>Stn Cost ({getCurrencySymbol()})</Text>
                <TextInput style={s.input} value={stoneCost} onChangeText={setStoneCost} keyboardType="numeric" />
              </View>
            </View>
          </View>

          <View style={[s.card, { zIndex: 30 }]}>
            <Text style={s.sectionTitle}>Tracking</Text>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1, paddingRight: 6 }]}>
                <Text style={s.label}>Location</Text>
                <TextInput style={s.input} value={location} onChangeText={setLocation} autoCapitalize="characters" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                <Text style={s.label}>BIS HUID</Text>
                <TextInput style={s.input} value={huid} onChangeText={setHuid} autoCapitalize="characters" maxLength={6} />
              </View>
            </View>
            <View style={[s.row, { marginTop: 12, zIndex: 10 }]}>
              <View style={[s.inputGroup, { flex: 1, paddingRight: 6 }]}>
                <Text style={s.label}>Size Value</Text>
                <TextInput style={s.input} value={sizeValue} onChangeText={setSizeValue} keyboardType="numeric" placeholder="e.g. 18" />
              </View>
              <View style={[s.inputGroup, { flex: 1, paddingLeft: 6, zIndex: 10 }]}>
                <Text style={s.label}>Size Unit</Text>
                <View style={{ marginTop: 4 }}>
                  <GlassSmartSearch 
                    placeholder="Select Unit..."
                    showAllOnFocus={true}
                    options={[
                      { id: 'NONE', label: 'No Unit (Clear)' },
                      { id: 'INCH', label: 'Inches (INCH)' },
                      { id: 'MM', label: 'Millimeters (MM)' },
                      { id: 'CM', label: 'Centimeters (CM)' },
                      { id: 'RING_SIZE', label: 'Ring Size' }
                    ]}
                    selectedId={sizeUnit || null}
                    onSelect={(opt) => {
                      if (!opt || opt.id === 'NONE') return setSizeUnit('');
                      setSizeUnit(opt.id);
                    }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Mandated UI Display — Live Cost Preview */}
          {liveWastageSeparation.isValid && (
            <View className="mb-5 mt-2">
              <View style={[s.card, { backgroundColor: 'rgba(92,22,35, 0.04)', borderColor: '#D4AF37', marginBottom: 0 }]}>
                <View className="flex-row items-center gap-2 mb-3">
                  <Calculator size={18} color="#D4AF37" />
                  <Text className="text-xs font-black uppercase tracking-wider text-vj-accent">Live Cost Breakdown</Text>
                </View>
                
                <View className="flex-row justify-between py-1 border-b border-black/5">
                  <Text className="text-xs text-vj-text/60 font-medium">Net Weight:</Text>
                  <Text className="text-xs text-vj-text font-bold font-mono">{liveWastageSeparation.netWeight}</Text>
                </View>

                <View className="flex-row justify-between py-1 border-b border-black/5">
                  <Text className="text-xs text-vj-text/60 font-medium">Total Touch (Purity + Wastage):</Text>
                  <Text className="text-xs text-vj-text font-bold font-mono">{liveWastageSeparation.totalTouch}</Text>
                </View>

                {liveWastageSeparation.hasCostData && (
                  <>
                    <View className="flex-row justify-between py-1 mt-2 border-b border-black/5">
                      <Text className="text-xs text-vj-text/60 font-medium">Effective Price/g:</Text>
                      <Text className="text-xs text-vj-text font-bold font-mono">{getCurrencySymbol()} {liveWastageSeparation.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View className="flex-row justify-between pt-2">
                      <Text className="text-sm text-vj-text font-black">Est. Total Cost ({getCurrencySymbol()}):</Text>
                      <Text className="text-sm font-black font-mono text-amber-900">{getCurrencySymbol()} {liveWastageSeparation.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          <TouchableOpacity 
            style={[s.saveBtn, saving && s.saveBtnDisabled]} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Save size={20} color="#fff" />
                <Text style={s.saveBtnText}>Save Correction</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

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

      <Modal visible={!!errorMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </View>
            <Text style={s.successTitle}>Error</Text>
            <Text style={s.successSubtitle}>{errorMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Dismiss" 
                onPress={() => {
                  setErrorMessage(null);
                  // If it's the "Only DRAFT items" or "Failed to load" error, go back
                  if (errorMessage === 'Only DRAFT items can be edited here.' || errorMessage === 'Failed to load item details.') {
                    router.back();
                  }
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  content: { paddingBottom: 350, paddingTop: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.08)',
    marginBottom: 16,
  },
  sectionTitle: {
    color: COLORS.vjText,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 12 },
  row: { flexDirection: 'row' },
  label: {
    color: 'rgba(92,22,35,0.6)',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.vjText,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: COLORS.vjAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: COLORS.vjAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: COLORS.vjBg,
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