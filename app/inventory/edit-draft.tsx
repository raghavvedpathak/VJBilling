// app/inventory/edit-draft.tsx — Phase 2 v2.15 Canonical Screen

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemService } from '@/services/phase2/itemService';
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
  getCurrencySymbol,
  getPurityPresets,
} from '@/utils/calculations';
import { Edit3, Save, Calculator, CheckCircle, Package } from 'lucide-react-native';
import { GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles, HeaderPill, GlassCard } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { COLORS } from '@/constants/theme';

export default function EditDraftScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sku, setSku] = useState('');
  const [initialHuid, setInitialHuid] = useState<string | null>(null);
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

  useEffect(() => {
    let active = true;
    const loadItem = async () => {
      if (!activeFirmId || !itemId) return;
      try {
        const item = await itemRepository.getById(itemId);
        if (active && item && item.firmId === activeFirmId) {
          if (item.status !== 'DRAFT') {
            setErrorMessage('Only DRAFT items can be edited here.');
            return;
          }
          setSku(formatSKUDisplay(item.sku));
          setInitialHuid(item.huid || null);
          
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

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purity, wastage);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    
    // FIX-EFFPRICE-PURITYROUND-1 (v2.14): pass metal to apply 100% rounding
    const effectivePricePerGram = computeEffectivePricePerGram(rate, purity, wastage, metal);
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);
    const metalCostRupees = netWeightG * effectivePricePerGram;

    const finParts: string[] = [];
    if (rate > 0) finParts.push(`Metal: ${getCurrencySymbol()}${metalCostRupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
    if (making > 0) finParts.push(`Labour: ${getCurrencySymbol()}${making.toLocaleString('en-IN')}`);
    if (stoneC > 0) finParts.push(`Stone: ${getCurrencySymbol()}${stoneC.toLocaleString('en-IN')}`);
    const financialBreakdownText = finParts.length > 0 ? finParts.join(' + ') : 'Base Metal Cost';

    let weightBreakdownText = `Gross: ${gross.toFixed(3)}g`;
    if (stone > 0 || beads > 0) {
      const deductions: string[] = [];
      if (stone > 0) deductions.push(`Stone: ${stone.toFixed(3)}g`);
      if (beads > 0) deductions.push(`Beads: ${beads.toFixed(3)}g`);
      weightBreakdownText = `Gross: ${gross.toFixed(3)}g - ${deductions.join(' - ')}`;
    }

    return {
      isValid: netWeightG > 0 && purity > 0,
      netWeight: netWeightG.toFixed(3) + ' g',
      weightBreakdown: weightBreakdownText,
      purityRaw: purity,
      wastageRaw: wastage,
      totalTouch: (purity + wastage).toFixed(2) + '%',
      vaultTruth: vaultTruth.toFixed(3) + ' g',
      wastageMetal: (costTruth - vaultTruth).toFixed(3) + ' g',
      costTruth: costTruth.toFixed(3) + ' g',
      hasCostData: (rate > 0 || making > 0 || stoneC > 0) && netWeightG > 0,
      financialBreakdown: financialBreakdownText,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
    };
  }, [grossG, stoneG, beadsG, purityPercent, wastagePercent, purchaseRate, makingCharge, stoneCost, metal]);

  const computedKarat = useMemo(() => {
    const p = parseFloat(purityPercent);
    if (isNaN(p) || p <= 0) return '';
    if (metal === 'SILVER') return 'SILVER';
    const k = percentToKarat(p) || 0;
    return k > 0 ? `${k}K` : '';
  }, [purityPercent, metal]);

  const handleSave = async () => {
    if (!activeFirmId || !itemId) return;

    const parsedGross = parseFloat(grossG) || 0;
    const parsedStone = parseFloat(stoneG) || 0;
    const parsedBeads = parseFloat(beadsG) || 0;
    const parsedPurity = parseFloat(purityPercent) || 0;
    const parsedWastage = parseFloat(wastagePercent) || 0;

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

    // GAP-P2-SIZE-EDIT-1: Client-side pairing validation
    const hasSizeVal = sizeValue && sizeValue.trim() !== '';
    const hasSizeUnit = sizeUnit && sizeUnit.trim() !== '';
    if ((hasSizeVal && !hasSizeUnit) || (!hasSizeVal && hasSizeUnit)) {
      setErrorMessage('Size Value and Size Unit must both be specified together, or both left blank.');
      return;
    }

    let huidUpper: string | null = null;
    if (huid.trim()) {
      huidUpper = huid.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
        setErrorMessage('BIS HUID must be exactly 6 alphanumeric characters.');
        return;
      }
    }

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setSaving(true);
    try {
      const newGrossMg = Math.round(parsedGross * 1000);
      const newStoneMg = Math.round(parsedStone * 1000);
      const newBeadsMg = Math.round(parsedBeads * 1000);
      
      const newPurityKarat = percentToKarat(parsedPurity) || 0;
      const newRatePaise = rupeesToPaise(purchaseRate);
      const newMakingPaise = rupeesToPaise(makingCharge);
      const newStoneCostPaise = rupeesToPaise(stoneCost);

      // 1. adjustWeight with wastagePercent (Step 6.7.4)
      await itemService.adjustWeight(
        itemId,
        activeFirmId,
        newGrossMg,
        newStoneMg,
        newBeadsMg,
        reason,
        parsedWastage
      );

      // 2. updateItem for non-weight fields
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
          sizeValue: hasSizeVal ? parseFloat(sizeValue) : null,
          sizeUnit: hasSizeUnit ? (sizeUnit as any) : null,
        },
        reason
      );

      // 3. HUID assignment / correction branch (FEAT-ITEM-CORRECTION-1 v1.88)
      if (huidUpper && huidUpper !== initialHuid) {
        if (!initialHuid) {
          await itemService.addHUID(itemId, activeFirmId, huidUpper);
        } else {
          await itemService.correctHUID(itemId, activeFirmId, huidUpper, reason);
        }
      }

      setSuccessMessage('Draft details updated successfully.');
    } catch (error: any) {
      setErrorMessage(error.message || 'Could not update draft.');
    } finally {
      setSaving(false);
    }
  };

  const draftHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Edit3 size={12} color={COLORS.vjBg} />} label={sku || 'Draft Item'} />
      <HeaderPill icon={<Package size={12} color="#D97706" />} label="DRAFT CORRECTION" variant="warning" />
    </View>
  );

  return (
    <TwoToneWrapper title="Edit Draft" showBack headerContent={draftHeaderPills}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
          </View>
        ) : (
          <KeyboardAwareScrollView 
            showsVerticalScrollIndicator={false} 
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            enableOnAndroid={true}
            enableAutomaticScroll={true}
            extraScrollHeight={120}
            extraHeight={140}
            contentContainerStyle={{ paddingBottom: 220, paddingTop: 6 }}
          >
            
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[s.label, { marginBottom: 0 }]}>Purity % *</Text>
                    {computedKarat && computedKarat !== 'SILVER' ? (
                      <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>{computedKarat}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TextInput style={s.input} value={purityPercent} onChangeText={setPurityPercent} keyboardType="numeric" />
                </View>
                <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                  <Text style={s.label}>Wastage %</Text>
                  <TextInput style={s.input} value={wastagePercent} onChangeText={setWastagePercent} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 12 }}>
                {getPurityPresets(metal || 'GOLD').map(preset => (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      setPurityPercent(preset.val);
                    }}
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
                      color: purityPercent === preset.val || purityPercent === preset.label.split('K')[0] ? '#FFF' : COLORS.vjText
                    }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
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
                  <TextInput style={s.input} value={sizeValue} onChangeText={setSizeValue} keyboardType="numeric" placeholder="Size" />
                </View>
                <View style={[s.inputGroup, { flex: 1, paddingLeft: 6 }]}>
                  <GlassPickerInput
                    label="Size Unit"
                    placeholder="Select Unit..."
                    selectedLabel={
                      sizeUnit
                        ? { INCH: 'Inches (INCH)', MM: 'Millimeters (MM)', CM: 'Centimeters (CM)', RING_SIZE: 'Ring Size' }[sizeUnit] || sizeUnit
                        : null
                    }
                    onPress={() => {
                      setPickerModal({
                        visible: true,
                        title: 'Select Size Unit',
                        placeholder: 'Search unit...',
                        selectedId: sizeUnit || null,
                        options: [
                          { id: 'INCH', label: 'Inches (INCH)' },
                          { id: 'MM', label: 'Millimeters (MM)' },
                          { id: 'CM', label: 'Centimeters (CM)' },
                          { id: 'RING_SIZE', label: 'Ring Size' },
                        ],
                        onSelect: (opt) => {
                          if (!opt) return setSizeUnit('');
                          setSizeUnit(opt.id);
                        },
                      });
                    }}
                  />
                </View>
              </View>
            </View>

            {/* Mandated UI Display — Live Cost Preview (FEAT-EFFECTIVE-PRICE-1 / FIX-EFFPRICE-PURITYROUND-1 v2.14) */}
            {liveWastageSeparation.isValid && (
              <View className="px-1 mb-4 mt-2" style={{ zIndex: 10 }}>
                <GlassCard style={{ backgroundColor: 'rgba(252,251,248, 0.98)', borderColor: '#D4AF37', borderWidth: 1.5, padding: 16 }}>
                  <View className="flex-row items-center justify-between mb-3 pb-2.5 border-b border-black/5">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-lg items-center justify-center bg-amber-500/15 border border-amber-500/30">
                        <Calculator size={16} color="#D4AF37" />
                      </View>
                      <View>
                        <Text className="text-xs font-black uppercase tracking-wider text-vj-accent">Live Cost Breakdown</Text>
                        <Text className="text-[10px] text-vj-text/50 font-semibold">Real-Time Inventory Accounting</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <Text className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">LIVE</Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2.5 mb-3">
                    <View className="flex-1 p-2.5 rounded-xl bg-black/[0.02] border border-black/5">
                      <Text className="text-[10px] font-bold text-vj-text/50 uppercase tracking-wider">Net Weight</Text>
                      <Text className="text-base font-black text-vj-text font-mono mt-0.5">{liveWastageSeparation.netWeight}</Text>
                      <Text className="text-[9px] text-vj-text/55 font-semibold mt-0.5" numberOfLines={1}>
                        {liveWastageSeparation.weightBreakdown}
                      </Text>
                    </View>

                    <View className="flex-1 p-2.5 rounded-xl bg-black/[0.02] border border-black/5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[10px] font-bold text-vj-text/50 uppercase tracking-wider">Total Touch</Text>
                        <Text className="text-xs font-black text-vj-accent font-mono">{liveWastageSeparation.totalTouch}</Text>
                      </View>
                      <View className="mt-1 bg-vj-accent/10 px-1.5 py-0.5 rounded self-start">
                        <Text className="text-[9px] font-black text-vj-accent font-mono">
                          {liveWastageSeparation.purityRaw}% Purity + {liveWastageSeparation.wastageRaw}% Wastage
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="mb-3 p-3 rounded-2xl bg-black/[0.02] border border-black/5">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-vj-text/60 mb-2">
                      Fine Metal Accounting ({metal})
                    </Text>
                    
                    <View className="flex-row items-center justify-between gap-1">
                      <View className="flex-1 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center">
                        <Text className="text-[9px] font-black text-emerald-800 uppercase tracking-tight">Vault Fine</Text>
                        <Text className="text-xs font-black text-emerald-700 font-mono mt-0.5">{liveWastageSeparation.vaultTruth}</Text>
                        <Text className="text-[8px] font-semibold text-emerald-800/70 mt-0.5">Physical</Text>
                      </View>

                      <Text className="text-xs font-black text-vj-text/40">+</Text>

                      <View className="flex-1 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 items-center">
                        <Text className="text-[9px] font-black text-rose-800 uppercase tracking-tight">
                          Wastage
                        </Text>
                        <Text className="text-xs font-black text-rose-700 font-mono mt-0.5">{liveWastageSeparation.wastageMetal}</Text>
                        <Text className="text-[8px] font-semibold text-rose-800/70 mt-0.5">Supplier</Text>
                      </View>

                      <Text className="text-xs font-black text-vj-text/40">=</Text>

                      <View className="flex-1 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center">
                        <Text className="text-[9px] font-black text-amber-900 uppercase tracking-tight">Billed Fine</Text>
                        <Text className="text-xs font-black text-amber-800 font-mono mt-0.5">{liveWastageSeparation.costTruth}</Text>
                        <Text className="text-[8px] font-semibold text-amber-800/70 mt-0.5">Cost Truth</Text>
                      </View>
                    </View>
                  </View>

                  {liveWastageSeparation.hasCostData && (
                    <View className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                      <View className="flex-row justify-between items-center pb-1.5 border-b border-amber-500/15">
                        <Text className="text-[11px] text-vj-text/70 font-bold">Effective Price / g:</Text>
                        <Text className="text-xs font-black text-vj-text font-mono">
                          {getCurrencySymbol()} {liveWastageSeparation.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center pt-2">
                        <View className="flex-1 pr-2">
                          <Text className="text-xs font-black text-vj-text uppercase tracking-wider">EST. Total</Text>
                          <Text className="text-[10px] text-vj-text/60 font-semibold mt-0.5">
                            {liveWastageSeparation.financialBreakdown}
                          </Text>
                        </View>
                        <Text className="text-base font-black font-mono text-amber-950">
                          {getCurrencySymbol()} {liveWastageSeparation.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>
                  )}
                </GlassCard>
              </View>
            )}

          </KeyboardAwareScrollView>
        )}

        {!loading && !errorMessage && (
          <FixedGlassBar>
            <TouchableOpacity 
              style={fixedBarStyles.pillSecondaryBtn} 
              onPress={() => router.back()}
              disabled={saving}
            >
              <Text style={fixedBarStyles.pillSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={fixedBarStyles.pillPrimaryBtn} 
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Save size={18} color="#fff" />
                  <Text style={fixedBarStyles.pillPrimaryText}>Save Correction</Text>
                </>
              )}
            </TouchableOpacity>
          </FixedGlassBar>
        )}
      </View>

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
                  if (errorMessage === 'Only DRAFT items can be edited here.' || errorMessage === 'Failed to load item details.') {
                    router.back();
                  }
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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