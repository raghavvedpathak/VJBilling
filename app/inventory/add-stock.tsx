// app/inventory/add-stock.tsx — Phase 2 v2.34 Canonical Screen
// Aligned with PURITY-INTAKE-1 (v1.21), FIX-24KS-DISPLAY-1 (v2.25), FIX-SILVER-PURITY-1 (v1.46),
// FEAT-EFFECTIVE-PRICE-1 (v2.00), FIX-EFFPRICE-GATE-1 (v2.01), FIX-EFFPRICE-PURITYROUND-1 (v2.14),
// FEAT-HUID-CREATE-1 (v1.87), FEAT-BACKDATED-STOCK-1 (v1.76), and GAP-P2-SIZE-EDIT-1 (v1.78)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Alert, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { GlassDatePickerModal } from '@/components/ui/GlassDatePickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { itemService } from '@/services/phase2/itemService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { hsnMasterRepository } from '@/repositories/phase2/hsnMasterRepository';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import type { Design, Category, HsnCode, Stone, CreateItemInput } from '@/types/phase2/phase2.types';
import { Package, Scale, Percent, MapPin, Calculator, Wallet, CheckCircle, RotateCcw, Calendar as CalendarIcon } from 'lucide-react-native';
import { seedHsnCodes } from '@/db/seed';
import { formatDate } from '@/utils/formatDate';
import { 
  percentToKarat, 
  formatKaratBadge,
  resolveFineWeightMg, 
  computeFineGoldChargedMg, 
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeWastageGoldGrams,
  computeAbsoluteTotalCostRupees,
  rupeesToPaise,
  formatSKUDisplay,
  getCurrencySymbol,
  getPurityPresets,
  isPresetMatchingPurity,
  parseCleanFloat,
} from '@/utils/calculations';
import { getThemeColors } from '@/constants/theme';

export default function AddStockScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [designs, setDesigns] = useState<Design[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([]);
  const [stones, setStones] = useState<Stone[]>([]);

  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedHsn, setSelectedHsn] = useState<HsnCode | null>(null);
  const [selectedStone, setSelectedStone] = useState<Stone | null>(null);

  const [grossWeight, setGrossWeight] = useState('');
  const [stoneWeight, setStoneWeight] = useState('');
  const [beadsWeight, setBeadsWeight] = useState('');
  
  const [purityPercent, setPurityPercent] = useState('');
  const [wastagePercent, setWastagePercent] = useState('');

  const [purchaseRate, setPurchaseRate] = useState('');
  const [makingCharge, setMakingCharge] = useState('');
  const [stoneCost, setStoneCost] = useState('');

  const [location, setLocation] = useState('');
  const [huid, setHuid] = useState('');
  const [sizeValue, setSizeValue] = useState('');
  const [sizeUnit, setSizeUnit] = useState<'INCH' | 'MM' | 'CM' | 'RING_SIZE' | ''>('');

  const todayIso = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [entryDate, setEntryDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successSku, setSuccessSku] = useState<string | null>(null); 
  const [designStock, setDesignStock] = useState<{ totalNetWeightMg: number; count: number } | null>(null);

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
    if (!activeFirmId || !selectedDesign) {
      setDesignStock(null);
      return;
    }
    const fetchStock = async () => {
      try {
        const stock = await itemRepository.getAvailableStockForDesign(selectedDesign.id, activeFirmId);
        setDesignStock(stock);
      } catch (err) {
        console.warn('Failed to fetch stock for design:', err);
      }
    };
    fetchStock();
  }, [selectedDesign, activeFirmId]);

  const categoryVersion = useMastersSyncStore((s) => s.categoryVersion);
  const designVersion = useMastersSyncStore((s) => s.designVersion);
  const stoneVersion = useMastersSyncStore((s) => s.stoneVersion);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      let h = await hsnMasterRepository.findByChapter('71');
      if (h.length === 0) {
        await seedHsnCodes();
        h = await hsnMasterRepository.findByChapter('71');
      }
      const d = await designRepository.findByFirmId(activeFirmId);
      const c = await categoryRepository.findByFirmId(activeFirmId);
      const s = await stoneRepository.findByFirmId(activeFirmId);

      const serializedDesigns = (d || [])
        .filter((item) => item.isActive === 1 && item.stockType !== 'LOOSE')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

      const activeCategories = (c || [])
        .filter((item) => item.isActive === 1)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

      const activeStones = (s || [])
        .filter((item) => item.isActive === 1)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

      setDesigns(serializedDesigns);
      setCategories(activeCategories);
      setHsnCodes((h || []).filter((item) => item.isActive === 1));
      setStones(activeStones);
    } catch (err) {
      console.error('[AddStockScreen] Failed to load initial data:', err);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadData();
  }, [loadData, designVersion, categoryVersion, stoneVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const computedKarat = useMemo(() => {
    return formatKaratBadge(purityPercent, selectedDesign?.metal || 'GOLD') || '';
  }, [purityPercent, selectedDesign?.metal]);

  const liveWastageSeparation = useMemo(() => {
    const g = parseCleanFloat(grossWeight);
    const s = parseCleanFloat(stoneWeight);
    const b = parseCleanFloat(beadsWeight);
    const p = parseCleanFloat(purityPercent);
    const w = parseCleanFloat(wastagePercent);
    
    const rate = parseCleanFloat(purchaseRate);
    const making = parseCleanFloat(makingCharge);
    const stoneC = parseCleanFloat(stoneCost);

    const netWeightG = Math.max(0, g - s - b);
    const netWeightMg = Math.round(netWeightG * 1000);
    const metal = selectedDesign?.metal || 'GOLD';
    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, p, metal);
    const vaultTruth = computeVaultTruthGrams(fineWeightMg);

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, p, w);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    const wastageGold = computeWastageGoldGrams(costTruth, vaultTruth);
    
    const effectivePricePerGram = computeEffectivePricePerGram(rate, p, w, metal);
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);
    const metalCostRupees = netWeightG * effectivePricePerGram;

    const finParts: string[] = [];
    if (rate > 0) finParts.push(`Metal: ${getCurrencySymbol()}${metalCostRupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
    if (making > 0) finParts.push(`Labour: ${getCurrencySymbol()}${making.toLocaleString('en-IN')}`);
    if (stoneC > 0) finParts.push(`Stone: ${getCurrencySymbol()}${stoneC.toLocaleString('en-IN')}`);
    const financialBreakdownText = finParts.length > 0 ? finParts.join(' + ') : 'Base Metal Cost';

    let weightBreakdownText = `Gross: ${g.toFixed(3)}g`;
    if (s > 0 || b > 0) {
      const deductions: string[] = [];
      if (s > 0) deductions.push(`Stone: ${s.toFixed(3)}g`);
      if (b > 0) deductions.push(`Beads: ${b.toFixed(3)}g`);
      weightBreakdownText = `Gross: ${g.toFixed(3)}g - ${deductions.join(' - ')}`;
    }

    return {
      isValid: netWeightG > 0 && p > 0,
      netWeight: netWeightG.toFixed(3) + ' g',
      weightBreakdown: weightBreakdownText,
      purityRaw: p,
      wastageRaw: w,
      totalTouch: (p + w).toFixed(2) + '%',
      vaultTruth: vaultTruth.toFixed(3) + ' g',
      wastageGold: wastageGold.toFixed(3) + ' g',
      costTruth: costTruth.toFixed(3) + ' g',
      hasRateData: rate > 0 && netWeightG > 0,
      hasCostData: (rate > 0 || making > 0 || stoneC > 0) && netWeightG > 0,
      financialBreakdown: financialBreakdownText,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
    };
  }, [grossWeight, stoneWeight, beadsWeight, purityPercent, wastagePercent, purchaseRate, makingCharge, stoneCost, selectedDesign]);

  const handleSubmit = async () => {
    if (!activeFirmId) {
      Alert.alert('Error', 'No active firm selected.');
      return;
    }
    if (!selectedDesign || !selectedCategory || !selectedHsn) {
      Alert.alert('Missing Fields', 'Please select Design, Category, and HSN Code.');
      return;
    }

    if (entryDate > todayIso) {
      Alert.alert('Invalid Date', 'Stock entry date cannot be in the future.');
      return;
    }
    
    const gross = parseCleanFloat(grossWeight);
    const stone = parseCleanFloat(stoneWeight);
    const beads = parseCleanFloat(beadsWeight);
    const purity = parseCleanFloat(purityPercent);

    if (isNaN(gross) || gross <= 0) {
      Alert.alert('Invalid Weight', 'Gross weight must be greater than 0.');
      return;
    }
    if (stone + beads >= gross) {
      Alert.alert('Invalid Weight', 'Stone + Beads weight cannot be greater than or equal to Gross weight.');
      return;
    }
    if (isNaN(purity) || purity <= 0 || purity > 100) {
      Alert.alert('Invalid Purity', 'Purity must be between 0.01% and 100%.');
      return;
    }

    // Strict Size Pairing & Bounds Check (GAP-P2-SIZE-EDIT-1 / SQLite CHECK constraint)
    const parsedSizeValue = sizeValue.trim() ? parseCleanFloat(sizeValue) : null;
    const parsedSizeUnit = sizeUnit ? sizeUnit : null;
    if ((parsedSizeValue !== null && !parsedSizeUnit) || (parsedSizeValue === null && parsedSizeUnit)) {
      Alert.alert('Invalid Size', 'Both Size Value and Size Unit must be provided together, or both left blank.');
      return;
    }
    if (parsedSizeValue !== null && parsedSizeValue <= 0) {
      Alert.alert('Invalid Size', 'Size value must be greater than 0.');
      return;
    }

    let huidUpper: string | null = null;
    if (huid.trim()) {
      huidUpper = huid.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
        Alert.alert('Invalid HUID', 'BIS HUID must be exactly 6 alphanumeric characters (A-Z, 0-9).');
        return;
      }
    }

    const wPercent = parseCleanFloat(wastagePercent);
    const pRatePaise = purchaseRate.trim() ? rupeesToPaise(parseCleanFloat(purchaseRate)) : null;
    const mChargePaise = makingCharge.trim() ? rupeesToPaise(parseCleanFloat(makingCharge)) : null;
    const sCostPaise = stoneCost.trim() ? rupeesToPaise(parseCleanFloat(stoneCost)) : null;
    
    // FIX-SILVER-PURITY-1 (v1.46 / Step 6.1): Silver items ALWAYS stored with purityKarat = 0
    const kVal = selectedDesign.metal === 'GOLD' ? (percentToKarat(purity) || 0) : 0;

    const itemPayload: CreateItemInput = {
      designId: selectedDesign.id,
      categoryId: selectedCategory.id,
      hsnCode: selectedHsn.code,
      grossWeightMg: Math.round(gross * 1000),
      stoneWeightMg: Math.round(stone * 1000),
      beadsWeightMg: Math.round(beads * 1000),
      purityPercent: purity,
      purityKarat: kVal,
      wastagePercent: wPercent,
      purchaseRatePaise: pRatePaise,
      makingChargePaise: mChargePaise,
      stoneCostPaise: sCostPaise,
      primaryStoneId: selectedStone?.id || null,
      location: location.trim() || null,
      huid: huidUpper,
      sizeValue: parsedSizeValue,
      sizeUnit: parsedSizeUnit,
      metalSource: 'SUPPLIER_PURCHASE',
      entryDate,
    };

    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      setLoading(true);
      const item = await itemService.createItem(itemPayload, activeFirmId);
      setSuccessSku(item.sku);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Add Stock" showBack>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
          contentContainerStyle={{ paddingBottom: 190 }}
        >
          <GlassCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Package size={20} color="#D4AF37" />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Classification</Text>
              </View>
            </View>

            {/* Stock Entry Date Field */}
            <View style={{ marginBottom: 16 }}>
              <GlassPickerInput
                label="Stock Entry Date"
                placeholder="Select date..."
                selectedLabel={formatDate(entryDate)}
                selectedSublabel={entryDate === todayIso ? 'Today' : undefined}
                onPress={() => setShowDatePicker(true)}
                icon={<CalendarIcon size={18} color="#D4AF37" />}
              />
            </View>
            
            {designs.length === 0 && (
              <View style={{ marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.4)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={{ fontSize: 12, color: `${colors.vjText}99`, fontWeight: '700', textAlign: 'center' }}>
                  No Serialized Designs Found. Please add a serialized design first.
                </Text>
              </View>
            )}

            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: `${colors.vjText}99`, textTransform: 'uppercase' }}>Design *</Text>
                {designStock && designStock.count > 0 && (
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#047857' }}>
                      STOCK: {designStock.count} ({ (designStock.totalNetWeightMg / 1000).toFixed(3) } g)
                    </Text>
                  </View>
                )}
              </View>
              <GlassPickerInput
                placeholder="Search & select design..."
                selectedLabel={selectedDesign ? selectedDesign.name : null}
                selectedSublabel={selectedDesign && selectedDesign.metal ? `Metal: ${selectedDesign.metal}` : null}
                onPress={async () => {
                  let dList = designs;
                  if (activeFirmId) {
                    const fetched = await designRepository.findByFirmId(activeFirmId);
                    dList = (fetched || [])
                      .filter((item) => item.isActive === 1 && item.stockType !== 'LOOSE')
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
                    setDesigns(dList);
                  }
                  setPickerModal({
                    visible: true,
                    title: 'Select Design',
                    placeholder: 'Search design by name or metal...',
                    selectedId: selectedDesign?.id || null,
                    options: dList.map(d => ({
                      id: d.id,
                      label: d.name || 'Unnamed Design',
                      sublabel: d.metal ? `Metal: ${d.metal}` : undefined,
                    })),
                    onSelect: async (opt) => {
                      if (!opt) {
                        setSelectedDesign(null);
                        return;
                      }
                      const selDesign = dList.find(d => d.id === opt.id)!;
                      if (selectedDesign && selectedDesign.metal !== selDesign.metal) {
                        setPurityPercent('');
                      }
                      setSelectedDesign(selDesign);

                      if (selDesign.defaultHsn) {
                        const matchedHsn = hsnCodes.find((h) => h.code === selDesign.defaultHsn);
                        if (matchedHsn) setSelectedHsn(matchedHsn);
                      }

                      if (activeFirmId) {
                        try {
                          const mappings = await designCategoryMapRepository.findByDesignId(selDesign.id, activeFirmId);
                          let catList = categories;
                          if (catList.length === 0) {
                            catList = (await categoryRepository.findByFirmId(activeFirmId)) || [];
                            setCategories(catList);
                          }

                          if (mappings.length > 0) {
                            mappings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                            const linkedCat = catList.find(c => c.id === mappings[0].categoryId);
                            if (linkedCat) {
                              setSelectedCategory(linkedCat);
                            }
                          }
                        } catch (err) {
                          console.warn("Failed to auto-select category:", err);
                        }
                      }
                    },
                  });
                }}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <GlassPickerInput
                label="Category *"
                placeholder="Search & select category..."
                selectedLabel={selectedCategory ? selectedCategory.name : null}
                onPress={async () => {
                  let cList = categories;
                  if (activeFirmId) {
                    const fetched = await categoryRepository.findByFirmId(activeFirmId);
                    cList = (fetched || [])
                      .filter((item) => item.isActive === 1)
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
                    setCategories(cList);
                  }
                  setPickerModal({
                    visible: true,
                    title: 'Select Category',
                    placeholder: 'Search category...',
                    selectedId: selectedCategory?.id || null,
                    options: cList.map(c => ({
                      id: c.id,
                      label: c.name || 'Unnamed Category',
                    })),
                    onSelect: (opt) => {
                      if (!opt) {
                        setSelectedCategory(null);
                        return;
                      }
                      const selCat = cList.find(c => c.id === opt.id);
                      if (selCat) setSelectedCategory(selCat);
                    },
                  });
                }}
              />
            </View>

            <GlassPickerInput
              label="HSN Code *"
              placeholder="Search HSN code..."
              selectedLabel={selectedHsn ? `${selectedHsn.code} - ${selectedHsn.description || ''}` : null}
              onPress={() => {
                setPickerModal({
                  visible: true,
                  title: 'Select HSN Code',
                  placeholder: 'Search HSN code or description...',
                  selectedId: selectedHsn?.id || null,
                  options: hsnCodes.map(h => ({
                    id: h.id,
                    label: h.code || 'No Code',
                    sublabel: h.description || '',
                  })),
                  onSelect: (opt) => {
                    if (!opt) {
                      setSelectedHsn(null);
                      return;
                    }
                    const selHsn = hsnCodes.find(h => h.id === opt.id);
                    if (selHsn) setSelectedHsn(selHsn);
                  },
                });
              }}
            />
          </GlassCard>

          {/* Weights */}
          <GlassCard style={{ zIndex: 40, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Scale size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Weights (Grams)</Text>
            </View>

            <GlassInput 
              label="Gross Weight (g) *" 
              placeholder="0.000" 
              keyboardType="decimal-pad" 
              value={grossWeight} 
              onChangeText={setGrossWeight} 
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label="Stone Weight (g)" 
                  placeholder="0.000" 
                  keyboardType="decimal-pad" 
                  value={stoneWeight} 
                  onChangeText={setStoneWeight} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label="Beads Weight (g)" 
                  placeholder="0.000" 
                  keyboardType="decimal-pad" 
                  value={beadsWeight} 
                  onChangeText={setBeadsWeight} 
                />
              </View>
            </View>
          </GlassCard>

          {/* Purity & Wastage */}
          <GlassCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Percent size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Purity & Wastage</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: `${colors.vjText}99`, textTransform: 'uppercase' }}>Purity % *</Text>
                  {computedKarat ? (
                    <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>{computedKarat}</Text>
                    </View>
                  ) : null}
                </View>
                <GlassInput 
                  placeholder={(selectedDesign?.metal || 'GOLD') === 'SILVER' ? '92.5' : '91.6'} 
                  keyboardType="decimal-pad" 
                  value={purityPercent} 
                  onChangeText={setPurityPercent} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label="Wastage %" 
                  placeholder="0.00" 
                  keyboardType="decimal-pad" 
                  value={wastagePercent} 
                  onChangeText={setWastagePercent} 
                />
              </View>
            </View>

            {/* Quick Purity Preset Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {getPurityPresets(selectedDesign?.metal || 'GOLD').map(preset => {
                const isSelected = isPresetMatchingPurity(purityPercent, preset.val);
                return (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      setPurityPercent(preset.val);
                    }}
                    style={{
                      backgroundColor: isSelected ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6
                    }}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isSelected ? '#FFF' : colors.vjText
                    }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>

          {/* Tracking & Stones */}
          <GlassCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <MapPin size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Tracking & Stones</Text>
            </View>

            <View style={{ marginBottom: 16 }}>
              <GlassPickerInput
                label="Primary Stone (Optional)"
                placeholder="Select Stone..."
                selectedLabel={selectedStone ? selectedStone.name : null}
                selectedSublabel={selectedStone ? selectedStone.type : null}
                onPress={() => {
                  setPickerModal({
                    visible: true,
                    title: 'Select Primary Stone',
                    placeholder: 'Search stone...',
                    selectedId: selectedStone?.id || null,
                    options: stones.map(s => ({
                      id: s.id,
                      label: s.name || 'Unnamed Stone',
                      sublabel: s.type || '',
                    })),
                    onSelect: (opt) => {
                      if (!opt) return setSelectedStone(null);
                      const selStone = stones.find(s => s.id === opt.id);
                      if (selStone) setSelectedStone(selStone);
                    },
                  });
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassInput label="Location" placeholder="Tray / Location" autoCapitalize="characters" value={location} onChangeText={setLocation} />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput label="BIS HUID" placeholder="6-char HUID" autoCapitalize="characters" value={huid} onChangeText={(t) => setHuid(t.toUpperCase())} maxLength={6} />
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label="Size Value" 
                  placeholder="Size" 
                  keyboardType="decimal-pad" 
                  value={sizeValue} 
                  onChangeText={setSizeValue} 
                />
              </View>
              <View style={{ flex: 1 }}>
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
                        setSizeUnit(opt.id as 'INCH' | 'MM' | 'CM' | 'RING_SIZE');
                      },
                    });
                  }}
                />
              </View>
            </View>
          </GlassCard>

          {/* Costs */}
          <GlassCard style={{ zIndex: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Wallet size={20} color="#D4AF37" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.vjText }}>Purchase Costs ({getCurrencySymbol()})</Text>
            </View>

            <GlassInput 
              label={`Purchase Rate (${getCurrencySymbol()}/g)`} 
              placeholder="0.00" 
              keyboardType="decimal-pad" 
              value={purchaseRate} 
              onChangeText={setPurchaseRate} 
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label={`Making Charge (${getCurrencySymbol()})`} 
                  placeholder="0.00" 
                  keyboardType="decimal-pad" 
                  value={makingCharge} 
                  onChangeText={setMakingCharge} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput 
                  label={`Stone Cost (${getCurrencySymbol()})`} 
                  placeholder="0.00" 
                  keyboardType="decimal-pad" 
                  value={stoneCost} 
                  onChangeText={setStoneCost} 
                />
              </View>
            </View>
          </GlassCard>

          {/* Live Cost Preview (FEAT-EFFECTIVE-PRICE-1 v2.00 / FIX-EFFPRICE-GATE-1 v2.01) */}
          {liveWastageSeparation.isValid && (
            <View style={{ paddingHorizontal: 4, marginBottom: 16, marginTop: 8, zIndex: 10 }}>
              <GlassCard style={{ backgroundColor: 'rgba(252,251,248, 0.98)', borderColor: '#D4AF37', borderWidth: 1.5, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                      <Calculator size={16} color="#D4AF37" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: colors.vjAccent }}>Live Cost Breakdown</Text>
                      <Text style={{ fontSize: 10, color: `${colors.vjText}80`, fontWeight: '600' }}>Real-Time Inventory Accounting</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#047857', letterSpacing: 0.8 }}>LIVE</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: `${colors.vjText}80`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Weight</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: colors.vjText, fontFamily: 'monospace', marginTop: 2 }}>{liveWastageSeparation.netWeight}</Text>
                    <Text style={{ fontSize: 9, color: `${colors.vjText}90`, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
                      {liveWastageSeparation.weightBreakdown}
                    </Text>
                  </View>

                  <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: `${colors.vjText}80`, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Touch</Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: colors.vjAccent, fontFamily: 'monospace' }}>{liveWastageSeparation.totalTouch}</Text>
                    </View>
                    <View style={{ marginTop: 4, backgroundColor: `${colors.vjAccent}15`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: colors.vjAccent, fontFamily: 'monospace' }}>
                        {liveWastageSeparation.purityRaw}% Purity + {liveWastageSeparation.wastageRaw}% Wastage
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, color: `${colors.vjText}99`, marginBottom: 8 }}>
                    Fine Metal Accounting ({selectedDesign?.metal || 'GOLD'})
                  </Text>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <View style={{ flex: 1, padding: 8, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)', alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#047857', textTransform: 'uppercase' }}>Vault Fine</Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#047857', fontFamily: 'monospace', marginTop: 2 }}>{liveWastageSeparation.vaultTruth}</Text>
                      <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(4, 120, 87, 0.7)', marginTop: 2 }}>Physical</Text>
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '900', color: `${colors.vjText}60` }}>+</Text>

                    <View style={{ flex: 1, padding: 8, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)', alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#B91C1C', textTransform: 'uppercase' }}>Wastage</Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#B91C1C', fontFamily: 'monospace', marginTop: 2 }}>{liveWastageSeparation.wastageGold}</Text>
                      <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(185, 28, 28, 0.7)', marginTop: 2 }}>Supplier</Text>
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '900', color: `${colors.vjText}60` }}>=</Text>

                    <View style={{ flex: 1, padding: 8, borderRadius: 12, backgroundColor: 'rgba(212, 175, 55, 0.15)', borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)', alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#92400E', textTransform: 'uppercase' }}>Billed Fine</Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#92400E', fontFamily: 'monospace', marginTop: 2 }}>{liveWastageSeparation.costTruth}</Text>
                      <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(146, 64, 14, 0.7)', marginTop: 2 }}>Cost Truth</Text>
                    </View>
                  </View>
                </View>

                {liveWastageSeparation.hasCostData && (
                  <View style={{ padding: 12, borderRadius: 16, backgroundColor: 'rgba(212, 175, 55, 0.1)', borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)' }}>
                    {liveWastageSeparation.hasRateData && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(212, 175, 55, 0.15)' }}>
                        <Text style={{ fontSize: 11, color: `${colors.vjText}B0`, fontWeight: '700' }}>Effective Price / g:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: colors.vjText, fontFamily: 'monospace' }}>
                          {getCurrencySymbol()} {liveWastageSeparation.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: colors.vjText, textTransform: 'uppercase', letterSpacing: 0.5 }}>EST. Total Cost</Text>
                        <Text style={{ fontSize: 10, color: `${colors.vjText}99`, fontWeight: '600', marginTop: 2 }}>
                          {liveWastageSeparation.financialBreakdown}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '900', fontFamily: 'monospace', color: '#92400E' }}>
                        {getCurrencySymbol()} {liveWastageSeparation.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>
                )}
              </GlassCard>
            </View>
          )}

        </KeyboardAwareScrollView>

        {/* Fixed Action Bar */}
        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillSecondaryBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setSelectedDesign(null);
              setSelectedCategory(null);
              setSelectedHsn(null);
              setSelectedStone(null);
              setGrossWeight('');
              setStoneWeight('');
              setBeadsWeight('');
              setPurityPercent('');
              setWastagePercent('');
              setLocation('');
              setHuid('');
              setPurchaseRate('');
              setMakingCharge('');
              setStoneCost('');
              setSizeValue('');
              setSizeUnit('');
              setEntryDate(todayIso);
            }}
            activeOpacity={0.7}
          >
            <RotateCcw size={16} color={colors.vjText} />
            <Text style={fixedBarStyles.pillSecondaryText}>Clear</Text>
          </TouchableOpacity>

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
                <Package size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Create Draft Item</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

      <Modal visible={!!successSku} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Item Created!</Text>
            <Text style={styles.successSubtitle}>Stock item securely saved to drafts.</Text>
            
            <View style={styles.skuBadge}>
              <Text style={styles.skuBadgeLabel}>GENERATED SKU</Text>
              <Text style={styles.skuBadgeText} selectable>{successSku ? formatSKUDisplay(successSku) : ''}</Text>
            </View>

            <View style={{ width: '100%', marginTop: 8 }}>
              <GlassButton 
                title="Done" 
                onPress={() => { 
                  setSuccessSku(null); 
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

      <GlassDatePickerModal
        visible={showDatePicker}
        title="Stock Entry Date"
        value={entryDate}
        maxDate={todayIso}
        onClose={() => setShowDatePicker(false)}
        onSelect={(d) => setEntryDate(d)}
      />

    </TwoToneWrapper>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
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
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
  skuBadge: {
    backgroundColor: 'rgba(184,115,51,0.08)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(184,115,51,0.2)',
  },
  skuBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 1,
    marginBottom: 4,
  },
  skuBadgeText: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
});