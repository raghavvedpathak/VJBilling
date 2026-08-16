/* eslint-disable no-restricted-imports */
/// app/inventory/add-stock.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { GlassDatePickerModal } from '@/components/ui/GlassDatePickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { itemService } from '@/services/phase2/itemService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { hsnMasterRepository } from '@/repositories/phase2/hsnMasterRepository';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import type { Design, Category, HsnCode, Stone } from '@/types/phase2/phase2.types';
import { Package, Scale, Percent, MapPin, Calculator, Wallet, CheckCircle, RotateCcw, Calendar as CalendarIcon } from 'lucide-react-native';
import { seedHsnCodes } from '@/db/seed';
import { formatDate } from '@/utils/formatDate';
import { 
  percentToKarat, 
  resolveFineWeightMg, 
  computeFineGoldChargedMg, 
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeAbsoluteTotalCostRupees,
  rupeesToPaise,
  formatSKUDisplay,
  getCurrencySymbol 
} from '@/utils/calculations';
import { COLORS } from '@/constants/theme';

export default function AddStockScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

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
  const [sizeUnit, setSizeUnit] = useState('');

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
  const [designStock, setDesignStock] = useState<{ totalNetWeightMg: number, count: number } | null>(null);

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

  useFocusEffect(
    React.useCallback(() => {
      if (!activeFirmId) return;
      const loadData = async () => {
        let h = await hsnMasterRepository.findByChapter('71');
        if (h.length === 0) {
          await seedHsnCodes();
          h = await hsnMasterRepository.findByChapter('71');
        }
        const d = await designRepository.findByFirmId(activeFirmId);
        const c = await categoryRepository.findByFirmId(activeFirmId);
        const s = await stoneRepository.findByFirmId(activeFirmId);
        
        setDesigns(d || []);
        setCategories(c || []);
        setHsnCodes(h || []);
        setStones(s || []);
      };
      loadData();
    }, [activeFirmId])
  );

  const computedKarat = useMemo(() => {
    const p = parseFloat(purityPercent);
    if (isNaN(p) || p <= 0) return '';
    const k = percentToKarat(p) || 0; 
    return k > 0 ? `${k}K` : '';
  }, [purityPercent]);

  const liveWastageSeparation = useMemo(() => {
    const g = parseFloat(grossWeight) || 0;
    const s = parseFloat(stoneWeight) || 0;
    const b = parseFloat(beadsWeight) || 0;
    const p = parseFloat(purityPercent) || 0;
    const w = parseFloat(wastagePercent) || 0;
    
    const rate = parseFloat(purchaseRate) || 0;
    const making = parseFloat(makingCharge) || 0;
    const stoneC = parseFloat(stoneCost) || 0;

    const netWeightG = Math.max(0, g - s - b);
    const netWeightMg = Math.round(netWeightG * 1000);
    const metal = selectedDesign?.metal || 'GOLD';
    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, p, metal);
    const vaultTruth = computeVaultTruthGrams(fineWeightMg);

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, p, w);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    
    const effectivePricePerGram = computeEffectivePricePerGram(rate, p, w);
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);

    return {
      isValid: netWeightG > 0 && p > 0,
      netWeight: netWeightG.toFixed(3) + ' g',
      purityRaw: p,
      wastageRaw: w,
      totalTouch: (p + w).toFixed(2) + '%',
      vaultTruth: vaultTruth.toFixed(3) + ' g',
      wastageGold: (costTruth - vaultTruth).toFixed(3) + ' g',
      costTruth: costTruth.toFixed(3) + ' g',
      hasCostData: rate > 0 || making > 0 || stoneC > 0,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
    };
  }, [grossWeight, stoneWeight, beadsWeight, purityPercent, wastagePercent, purchaseRate, makingCharge, stoneCost, selectedDesign]);

  const handleSubmit = async () => {
    if (!selectedDesign || !selectedCategory || !selectedHsn) {
      Alert.alert('Missing Fields', 'Please select Design, Category, and HSN Code.');
      return;
    }
    
    const gross = parseFloat(grossWeight);
    const stone = parseFloat(stoneWeight) || 0;
    const beads = parseFloat(beadsWeight) || 0;
    const purity = parseFloat(purityPercent);

    if (isNaN(gross) || gross <= 0) {
      Alert.alert('Invalid Weight', 'Gross weight must be greater than 0.');
      return;
    }
    if (isNaN(purity) || purity <= 0 || purity > 100) {
      Alert.alert('Invalid Purity', 'Purity must be between 1 and 100.');
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

    const wPercent = parseFloat(wastagePercent) || 0;
    const pRatePaise = rupeesToPaise(purchaseRate);
    const mChargePaise = rupeesToPaise(makingCharge);
    const sCostPaise = rupeesToPaise(stoneCost);
    const kVal = percentToKarat(purity) || 0; 

    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
      setLoading(true);
      const item = await itemService.createItem({
        designId: selectedDesign.id,
        categoryId: selectedCategory.id,
        hsnCode: selectedHsn.code,
        primaryStoneId: selectedStone?.id || null,
        grossWeightMg: Math.round(gross * 1000),
        stoneWeightMg: Math.round(stone * 1000),
        beadsWeightMg: Math.round(beads * 1000),
        purityPercent: purity,
        purityKarat: kVal,
        wastagePercent: wPercent,
        purchaseRatePaise: pRatePaise,
        makingChargePaise: mChargePaise,
        stoneCostPaise: sCostPaise,
        location: location.trim() || null,
        huid: huidUpper,
        sizeValue: sizeValue ? parseFloat(sizeValue) : null,
        sizeUnit: (sizeUnit as any) || null,
        metalSource: 'SUPPLIER_PURCHASE',
        entryDate,
      }, activeFirmId!);
      
      setSuccessSku(item.sku);
      
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Add Stock" showBack>
      <View style={{ flex: 1 }}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 110 }}
        >
          <GlassCard>
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Package size={20} color="#D4AF37" />
              <Text className="text-lg font-bold text-vj-text">Classification</Text>
            </View>
          </View>

          {/* Stock Entry Date Field */}
          <View className="mb-4">
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
            <View className="mb-4 bg-white/40 p-3 rounded-xl border border-white/20">
              <Text className="text-xs text-vj-text/60 font-bold text-center">No Designs Found. Please add a Design in Master Catalogs first.</Text>
            </View>
          )}

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase' }}>Design *</Text>
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
                  dList = fetched || [];
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
                    setSelectedDesign(selDesign);

                    if (activeFirmId) {
                      try {
                        const mappings = await designCategoryMapRepository.findByDesignId(selDesign.id, activeFirmId);
                        let catList = categories;
                        if (catList.length === 0) {
                          catList = await categoryRepository.findByFirmId(activeFirmId);
                          setCategories(catList || []);
                        }

                        if (mappings.length > 0) {
                          mappings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                          const linkedCat = catList.find(c => c.id === mappings[0].categoryId);
                          if (linkedCat) {
                            setSelectedCategory(linkedCat);
                            return;
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

          <GlassPickerInput
            label="Category *"
            placeholder="Search & select category..."
            selectedLabel={selectedCategory ? selectedCategory.name : null}
            onPress={async () => {
              let cList = categories;
              if (activeFirmId) {
                const fetched = await categoryRepository.findByFirmId(activeFirmId);
                cList = fetched || [];
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
                  const selCat = cList.find(c => c.id === opt.id)!;
                  setSelectedCategory(selCat);
                },
              });
            }}
          />

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
                  const selHsn = hsnCodes.find(h => h.id === opt.id)!;
                  setSelectedHsn(selHsn);
                },
              });
            }}
          />
        </GlassCard>

        {/* Weights */}
        <GlassCard style={{ zIndex: 40 }}>
          <View className="flex-row items-center gap-2 mb-4">
            <Scale size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Weights (Grams)</Text>
          </View>

          <GlassInput label="Gross Weight (g) *" placeholder="0.000" keyboardType="numeric" value={grossWeight} onChangeText={setGrossWeight} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><GlassInput label="Stone Weight (g)" placeholder="0.000" keyboardType="numeric" value={stoneWeight} onChangeText={setStoneWeight} /></View>
            <View style={{ flex: 1 }}><GlassInput label="Beads Weight (g)" placeholder="0.000" keyboardType="numeric" value={beadsWeight} onChangeText={setBeadsWeight} /></View>
          </View>
        </GlassCard>

        {/* Purity & Wastage */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Percent size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Purity & Wastage</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <View className="flex-row justify-between items-center mb-1">
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase' }}>Purity % *</Text>
                {computedKarat ? (
                  <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>{computedKarat}</Text>
                  </View>
                ) : null}
              </View>
              <GlassInput placeholder={(selectedDesign?.metal || 'GOLD') === 'SILVER' ? 'e.g. 92.5, 99.9' : 'e.g. 91.6, 75.0, 99.9'} keyboardType="numeric" value={purityPercent} onChangeText={setPurityPercent} />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput label="Wastage %" placeholder="e.g. 5.0" keyboardType="numeric" value={wastagePercent} onChangeText={setWastagePercent} />
            </View>
          </View>

          {/* Quick Purity Preset Chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {(selectedDesign?.metal || 'GOLD') === 'GOLD' ? (
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
                    color: purityPercent === preset.val || purityPercent === preset.label.split('K')[0] ? '#FFF' : COLORS.vjText
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
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
                    setPurityPercent(preset.val);
                  }}
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
                    color: purityPercent === preset.val ? '#FFF' : COLORS.vjText
                  }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </GlassCard>

        {/* Tracking & Stones */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <MapPin size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Tracking & Stones</Text>
          </View>

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
                  const selStone = stones.find(s => s.id === opt.id)!;
                  setSelectedStone(selStone);
                },
              });
            }}
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
               <GlassInput label="Location" placeholder="e.g. SHOP / TRAY 1" autoCapitalize="characters" value={location} onChangeText={setLocation} />
            </View>
            <View style={{ flex: 1 }}>
               <GlassInput label="BIS HUID" placeholder="6-digit code" autoCapitalize="characters" value={huid} onChangeText={setHuid} maxLength={6} />
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <GlassInput label="Size Value" placeholder="e.g. 18" keyboardType="numeric" value={sizeValue} onChangeText={setSizeValue} />
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
                      setSizeUnit(opt.id);
                    },
                  });
                }}
              />
            </View>
          </View>
        </GlassCard>

        {/* Costs */}
        <GlassCard style={{ zIndex: 20 }}>
          <View className="flex-row items-center gap-2 mb-4">
            <Wallet size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Purchase Costs ({getCurrencySymbol()})</Text>
          </View>

          <GlassInput label={`Purchase Rate (${getCurrencySymbol()})`} placeholder="e.g. 14500" keyboardType="numeric" value={purchaseRate} onChangeText={setPurchaseRate} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><GlassInput label={`Making Charge (${getCurrencySymbol()})`} placeholder="Cash labour" keyboardType="numeric" value={makingCharge} onChangeText={setMakingCharge} /></View>
            <View style={{ flex: 1 }}><GlassInput label={`Stone Cost (${getCurrencySymbol()})`} placeholder="Stone cost" keyboardType="numeric" value={stoneCost} onChangeText={setStoneCost} /></View>
          </View>
        </GlassCard>

        {/* Mandated UI Display — Live Cost Preview */}
        {liveWastageSeparation.isValid && (
          <View className="px-1 mb-4 mt-2" style={{ zIndex: 10 }}>
            <GlassCard style={{ backgroundColor: 'rgba(252,251,248, 0.95)', borderColor: '#D4AF37', borderWidth: 1 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Calculator size={18} color="#D4AF37" />
                <Text className="text-xs font-black uppercase tracking-wider text-vj-accent">Live Cost Breakdown</Text>
              </View>
              
              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium">Net Weight:</Text>
                <Text className="text-xs text-vj-text font-bold font-mono">{liveWastageSeparation.netWeight}</Text>
              </View>

              <View className="flex-row justify-between items-center py-2 border-b border-black/5">
                <View className="flex-1 pr-2">
                  <Text className="text-xs text-vj-text/60 font-medium">Total Touch:</Text>
                  <Text className="text-[10px] text-vj-accent font-bold mt-1 bg-vj-accent/10 self-start px-2 py-0.5 rounded-full overflow-hidden">
                    {liveWastageSeparation.purityRaw}% Purity + {liveWastageSeparation.wastageRaw}% Wastage
                  </Text>
                </View>
                <Text className="text-sm text-vj-text font-black font-mono">{liveWastageSeparation.totalTouch}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">Vault Truth (Fine):</Text>
                <Text className="text-xs text-emerald-700 font-bold font-mono">{liveWastageSeparation.vaultTruth}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">
                  {selectedDesign?.metal === 'SILVER' ? 'Wastage Silver:' : 'Wastage Gold:'}
                </Text>
                <Text className="text-xs text-rose-700 font-bold font-mono">{liveWastageSeparation.wastageGold}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">Cost Truth (Fine):</Text>
                <Text className="text-xs text-amber-700 font-bold font-mono">{liveWastageSeparation.costTruth}</Text>
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
            </GlassCard>
          </View>
        )}

        </ScrollView>

        {/* === FIXED STICKY PILL-SHAPED GLASS ACTION BAR === */}
        <View style={styles.fixedPillWrapper}>
          <View style={styles.fixedPillCard}>
            <BlurView intensity={50} tint="light" style={styles.fixedPillBlurContent}>
              <View style={styles.fixedBottomBarRow}>
                <TouchableOpacity
                  style={styles.pillSecondaryBtn}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setSelectedDesign(null);
                    setSelectedCategory(null);
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
                  <RotateCcw size={16} color={COLORS.vjText} />
                  <Text style={styles.pillSecondaryText}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.pillPrimaryBtn}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Package size={18} color="#fff" />
                      <Text style={styles.pillPrimaryText}>Create Draft Item</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
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
    color: COLORS.vjText,
    fontFamily: 'monospace',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
  },
  pillSecondaryText: {
    color: COLORS.vjText,
    fontSize: 14,
    fontWeight: '700',
  },
  pillPrimaryBtn: {
    flex: 1,
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