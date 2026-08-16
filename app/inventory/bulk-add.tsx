// app/inventory/bulk-add.tsx — Phase 2 v2.11 Canonical Screen

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
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import type { Design, Category, HsnCode, Stone } from '@/types/phase2/phase2.types';
import { Package, Plus, Trash2, Calculator, Layers, CheckCircle, Calendar as CalendarIcon } from 'lucide-react-native';
import { formatDate } from '@/utils/formatDate';
import { 
  PURITY_MAP,
  percentToKarat, 
  resolveFineWeightMg, 
  computeFineGoldChargedMg, 
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeAbsoluteTotalCostRupees,
  rupeesToPaise,
  getCurrencySymbol 
} from '@/utils/calculations';

import { COLORS } from '../../constants/theme';

const BULK_ITEM_MAX = 50;

const BulkItemRow = ({ index, row, updateRow, removeRow, stones, metal, openPickerModal }: any) => {
  const computedKarat = useMemo(() => {
    const p = parseFloat(row.purityPercent);
    if (isNaN(p) || p <= 0) return '';
    if (metal === 'SILVER') return 'SILVER';
    if (PURITY_MAP[p] !== undefined) return `${p}K`;
    const k = percentToKarat(p);
    return k && k > 0 ? `${k}K` : '';
  }, [row.purityPercent, metal]);

  const calculations = useMemo(() => {
    const gross = parseFloat(row.grossWeight) || 0;
    const stone = parseFloat(row.stoneWeight) || 0;
    const beads = parseFloat(row.beadsWeight) || 0;
    const purity = parseFloat(row.purityPercent) || 0;
    const wastage = parseFloat(row.wastagePercent) || 0;
    const rate = parseFloat(row.purchaseRate) || 0;
    const making = parseFloat(row.makingCharge) || 0;
    const stoneC = parseFloat(row.stoneCost) || 0;

    const netWeightG = Math.max(0, gross - stone - beads);
    const netWeightMg = Math.round(netWeightG * 1000);
    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, purity, metal || 'GOLD');
    const vaultTruth = computeVaultTruthGrams(fineWeightMg);

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purity, wastage);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);

    const effectivePricePerGram = computeEffectivePricePerGram(rate, purity, wastage);
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);

    const hasCostData = rate > 0 || making > 0 || stoneC > 0;

    return {
      netWeight: netWeightG,
      purityRaw: purity,
      wastageRaw: wastage,
      totalTouch: purity + wastage,
      vaultTruth,
      costTruth,
      hasCostData,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
      isValid: netWeightG > 0 && purity > 0
    };
  }, [row.grossWeight, row.stoneWeight, row.beadsWeight, row.purityPercent, row.wastagePercent, row.purchaseRate, row.makingCharge, row.stoneCost, metal]);

  return (
    <View style={{ zIndex: 1000 - index }}>
      <GlassCard>
      <View style={s.rowHeader}>
        <Text style={s.rowTitle}>Item #{index + 1}</Text>
        {index > 0 && (
          <TouchableOpacity onPress={() => removeRow(index)}>
            <Trash2 size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Gross (g)*" value={row.grossWeight} onChangeText={(t: string) => updateRow(index, 'grossWeight', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Stone (g)" value={row.stoneWeight} onChangeText={(t: string) => updateRow(index, 'stoneWeight', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Beads (g)" value={row.beadsWeight} onChangeText={(t: string) => updateRow(index, 'beadsWeight', t)} keyboardType="numeric" /></View>
      </View>

      <View style={s.inputGrid}>
        <View style={s.inputCol}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginLeft: 4 }}>Purity %*</Text>
            {computedKarat && computedKarat !== 'SILVER' ? (
              <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>{computedKarat}</Text>
              </View>
            ) : null}
          </View>
          <GlassInput 
            placeholder={metal === 'SILVER' ? 'e.g. 92.5, 99.9' : 'e.g. 91.6, 75.0, 99.9'} 
            value={row.purityPercent} 
            onChangeText={(t: string) => updateRow(index, 'purityPercent', t)} 
            keyboardType="numeric" 
          />
        </View>
        <View style={s.inputCol}><GlassInput label="Wastage %" value={row.wastagePercent} onChangeText={(t: string) => updateRow(index, 'wastagePercent', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label={`Rate/g (${getCurrencySymbol()})`} value={row.purchaseRate} onChangeText={(t: string) => updateRow(index, 'purchaseRate', t)} keyboardType="numeric" /></View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 12 }}>
        {metal === 'GOLD' ? (
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
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
                updateRow(index, 'purityPercent', preset.val);
              }}
              style={{
                backgroundColor: row.purityPercent === preset.val || row.purityPercent === preset.label.split('K')[0] ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6
              }}
            >
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: row.purityPercent === preset.val || row.purityPercent === preset.label.split('K')[0] ? '#FFF' : COLORS.vjText
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
                updateRow(index, 'purityPercent', preset.val);
              }}
              style={{
                backgroundColor: row.purityPercent === preset.val ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6
              }}
            >
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: row.purityPercent === preset.val ? '#FFF' : COLORS.vjText
              }}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label={`Making Chg (${getCurrencySymbol()})`} value={row.makingCharge} onChangeText={(t: string) => updateRow(index, 'makingCharge', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label={`Stone Cost (${getCurrencySymbol()})`} value={row.stoneCost} onChangeText={(t: string) => updateRow(index, 'stoneCost', t)} keyboardType="numeric" /></View>
      </View>

      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Location" value={row.location} onChangeText={(t: string) => updateRow(index, 'location', t)} autoCapitalize="characters" /></View>
        <View style={s.inputCol}><GlassInput label="BIS HUID" value={row.huid} onChangeText={(t: string) => updateRow(index, 'huid', t)} autoCapitalize="characters" maxLength={6} /></View>
      </View>

      <View style={s.inputGrid}>
        <View style={s.inputCol}>
          <GlassInput label="Size Value" value={row.sizeValue} onChangeText={(t: string) => updateRow(index, 'sizeValue', t)} keyboardType="numeric" placeholder="e.g. 18" />
        </View>
        <View style={s.inputCol}>
          <GlassPickerInput
            label="Size Unit"
            placeholder="Select Unit..."
            selectedLabel={
              row.sizeUnit
                ? { INCH: 'Inches (INCH)', MM: 'Millimeters (MM)', CM: 'Centimeters (CM)', RING_SIZE: 'Ring Size' }[row.sizeUnit as string] || row.sizeUnit
                : null
            }
            onPress={() => {
              openPickerModal({
                visible: true,
                title: `Item #${index + 1} Size Unit`,
                placeholder: 'Search unit...',
                selectedId: row.sizeUnit || null,
                options: [
                  { id: 'INCH', label: 'Inches (INCH)' },
                  { id: 'MM', label: 'Millimeters (MM)' },
                  { id: 'CM', label: 'Centimeters (CM)' },
                  { id: 'RING_SIZE', label: 'Ring Size' },
                ],
                onSelect: (opt: GlassPickerOption | null) => {
                  if (!opt) return updateRow(index, 'sizeUnit', '');
                  updateRow(index, 'sizeUnit', opt.id);
                },
              });
            }}
          />
        </View>
      </View>

      <View>
        <GlassPickerInput
          label="Primary Stone (Optional)"
          placeholder="Select Stone..."
          selectedLabel={row.stoneName ? row.stoneName : null}
          onPress={() => {
            openPickerModal({
              visible: true,
              title: `Item #${index + 1} Primary Stone`,
              placeholder: 'Search stone...',
              selectedId: row.stoneId || null,
              options: (stones || []).map((s: any) => ({
                id: s.id,
                label: s.name,
                sublabel: s.type || undefined,
              })),
              onSelect: (opt: GlassPickerOption | null) => {
                if (!opt) {
                  updateRow(index, 'stoneId', null);
                  updateRow(index, 'stoneName', '');
                } else {
                  updateRow(index, 'stoneId', opt.id);
                  updateRow(index, 'stoneName', `${opt.label} (${opt.sublabel || ''})`);
                }
              },
            });
          }}
        />
      </View>

      {calculations.isValid && (
        <View style={s.liveMathBox}>
          <View style={s.mathHeader}>
            <Calculator size={14} color="#D4AF37" />
            <Text style={s.mathTitle}>Live Cost Breakdown</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Net Wt:</Text>
            <Text style={s.mathValue}>{calculations.netWeight.toFixed(3)} g</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Total Touch:</Text>
            <Text style={s.mathValue}>{calculations.purityRaw}% + {calculations.wastageRaw}% = {calculations.totalTouch.toFixed(2)}%</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Vault Truth (Fine):</Text>
            <Text style={[s.mathValue, { color: '#047857' }]}>{calculations.vaultTruth.toFixed(3)} g</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Cost Truth (Fine):</Text>
            <Text style={[s.mathValue, { color: '#B45309' }]}>{calculations.costTruth.toFixed(3)} g</Text>
          </View>

          {calculations.hasCostData && (
            <>
              <View style={s.mathRow}>
                <Text style={s.mathLabel}>Effective Price/g:</Text>
                <Text style={s.mathValue}>{getCurrencySymbol()} {calculations.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
              </View>
              <View style={s.mathRow}>
                <Text style={s.mathLabel}>Est. Total ({getCurrencySymbol()}):</Text>
                <Text style={s.mathHighlight}>{getCurrencySymbol()} {calculations.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
              </View>
            </>
          )}
        </View>
      )}
      </GlassCard>
    </View>
  );
};

export default function BulkAddScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hsnCodes, setHsnCodes] = useState<HsnCode[]>([]);
  const [stones, setStones] = useState<Stone[]>([]);

  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedHsn, setSelectedHsn] = useState<HsnCode | null>(null);

  const [loading, setLoading] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [designStock, setDesignStock] = useState<{ totalNetWeightMg: number, count: number } | null>(null);

  const todayIso = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [entryDate, setEntryDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  const getEmptyRow = () => ({
    grossWeight: '', stoneWeight: '', beadsWeight: '',
    purityPercent: '', wastagePercent: '', purchaseRate: '',
    makingCharge: '', stoneCost: '',
    location: '', huid: '',
    sizeValue: '', sizeUnit: '',
    stoneId: null, stoneName: ''
  });

  const [rows, setRows] = useState([getEmptyRow()]);

  useFocusEffect(
    React.useCallback(() => {
      if (!activeFirmId) return;
      const loadData = async () => {
        const d = await designRepository.findByFirmId(activeFirmId);
        const c = await categoryRepository.findByFirmId(activeFirmId);
        const h = await hsnMasterRepository.findByChapter('71');
        const s = await stoneRepository.findByFirmId(activeFirmId);
        setDesigns(d);
        setCategories(c);
        setHsnCodes(h);
        setStones(s);
      };
      loadData();
    }, [activeFirmId])
  );

  const updateRow = (index: number, field: string, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const addRow = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    if (rows.length >= BULK_ITEM_MAX) {
      Alert.alert('Limit Reached', `You can only add up to ${BULK_ITEM_MAX} items per batch.`);
      return;
    }
    const lastRow = rows[rows.length - 1];
    
    setRows([...rows, { 
      ...getEmptyRow(), 
      purityPercent: lastRow.purityPercent, 
      wastagePercent: lastRow.wastagePercent, 
      purchaseRate: lastRow.purchaseRate,
      makingCharge: lastRow.makingCharge,
      stoneCost: lastRow.stoneCost,
      location: lastRow.location,
      sizeValue: lastRow.sizeValue,
      sizeUnit: lastRow.sizeUnit,
      stoneId: lastRow.stoneId,
      stoneName: lastRow.stoneName
    }]);
  };

  const removeRow = (index: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!selectedDesign || !selectedCategory || !selectedHsn) {
      Alert.alert('Missing Classification', 'Please select a Design, Category, and HSN Code for this batch.');
      return;
    }

    const inputs: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const gross = parseFloat(r.grossWeight);
      let purity = parseFloat(r.purityPercent);

      if (isNaN(gross) || gross <= 0) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid gross weight.`);
        return;
      }
      if (isNaN(purity) || purity <= 0 || purity > 100) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid purity percentage.`);
        return;
      }

      const hasSizeVal = r.sizeValue && r.sizeValue.trim() !== '';
      const hasSizeUnit = r.sizeUnit && r.sizeUnit.trim() !== '';
      if ((hasSizeVal && !hasSizeUnit) || (!hasSizeVal && hasSizeUnit)) {
        Alert.alert('Validation Error', `Item #${i + 1}: Size Value and Size Unit must both be specified together, or both left blank.`);
        return;
      }

      let huidUpper = undefined;
      if (r.huid && r.huid.trim()) {
        huidUpper = r.huid.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
          Alert.alert('Invalid HUID', `Item #${i + 1} has an invalid BIS HUID. Must be exactly 6 alphanumeric characters.`);
          return;
        }
      }

      const computedKarat = selectedDesign.metal === 'GOLD' ? (percentToKarat(purity) || 0) : 0;

      inputs.push({
        designId: selectedDesign.id,
        categoryId: selectedCategory.id,
        hsnCode: selectedHsn.code,
        primaryStoneId: r.stoneId || undefined,
        grossWeightMg: Math.round(gross * 1000),
        stoneWeightMg: Math.round((parseFloat(r.stoneWeight) || 0) * 1000),
        beadsWeightMg: Math.round((parseFloat(r.beadsWeight) || 0) * 1000),
        purityPercent: purity,
        purityKarat: computedKarat,
        wastagePercent: parseFloat(r.wastagePercent) || 0,
        purchaseRatePaise: rupeesToPaise(r.purchaseRate) ?? undefined,
        makingChargePaise: rupeesToPaise(r.makingCharge) ?? undefined,
        stoneCostPaise: rupeesToPaise(r.stoneCost) ?? undefined,
        location: r.location?.trim() || undefined,
        sizeValue: r.sizeValue ? parseFloat(r.sizeValue) : undefined,
        sizeUnit: r.sizeUnit || undefined,
        huid: huidUpper,
        metalSource: 'SUPPLIER_PURCHASE',
        entryDate,
      });
    }

    try {
      setLoading(true);
      await itemService.createItemsBulk(inputs, activeFirmId!);
      
      setSuccessCount(inputs.length);
    } catch (e: any) {
      Alert.alert('Bulk Add Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Bulk Add Stock" showBack>
      <View style={{ flex: 1 }}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 110 }}
        >
          <View style={{ zIndex: 2000 }}>
            <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Layers size={20} color="#D4AF37" />
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.vjText }}>Batch Classification</Text>
          </View>
          
          <Text style={{ fontSize: 12, color: 'rgba(92,22,35,0.6)', marginBottom: 16 }}>
            These attributes will be applied to all items in this bulk batch.
          </Text>

          {/* Batch Entry Date Field */}
          <View style={{ marginBottom: 16 }}>
            <GlassPickerInput
              label="Batch Entry Date"
              placeholder="Select date..."
              selectedLabel={formatDate(entryDate)}
              selectedSublabel={entryDate === todayIso ? 'Today' : undefined}
              onPress={() => setShowDatePicker(true)}
              icon={<CalendarIcon size={18} color="#D4AF37" />}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
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
              selectedLabel={selectedDesign?.name}
              selectedSublabel={selectedDesign?.metal ? `Metal: ${selectedDesign.metal}` : undefined}
              onPress={async () => {
                let dList = designs;
                if (activeFirmId) {
                  const fetched = await designRepository.findByFirmId(activeFirmId);
                  dList = fetched || [];
                  setDesigns(dList);
                }
                setPickerModal({
                  visible: true,
                  title: 'Select Batch Design',
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
                        console.warn("Failed to auto-select category in bulk add:", err);
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
            selectedLabel={selectedCategory?.name}
            onPress={async () => {
              let cList = categories;
              if (activeFirmId) {
                const fetched = await categoryRepository.findByFirmId(activeFirmId);
                cList = fetched || [];
                setCategories(cList);
              }
              setPickerModal({
                visible: true,
                title: 'Select Batch Category',
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
            onPress={async () => {
              let hList = hsnCodes;
              if (hList.length === 0) {
                hList = await hsnMasterRepository.findByChapter('71');
                setHsnCodes(hList || []);
              }
              setPickerModal({
                visible: true,
                title: 'Select Batch HSN Code',
                placeholder: 'Search HSN code or description...',
                selectedId: selectedHsn?.id || null,
                options: hList.map(h => ({
                  id: h.id,
                  label: h.code || 'No Code',
                  sublabel: h.description || '',
                })),
                onSelect: (opt) => {
                  if (!opt) {
                    setSelectedHsn(null);
                    return;
                  }
                  const selHsn = hList.find(h => h.id === opt.id)!;
                  setSelectedHsn(selHsn);
                },
              });
            }}
          />
          </GlassCard>
        </View>

        <View style={s.itemsHeader}>
          <Package size={20} color={COLORS.vjText} />
          <Text style={s.itemsTitle}>Items ({rows.length} / {BULK_ITEM_MAX})</Text>
        </View>

        {rows.map((row, index) => (
          <BulkItemRow 
            key={index} 
            index={index} 
            row={row} 
            updateRow={updateRow} 
            removeRow={removeRow} 
            stones={stones} 
            metal={selectedDesign?.metal || 'GOLD'}
            openPickerModal={(config: any) => setPickerModal(config)}
          />
        ))}

        </ScrollView>

        {/* === FIXED STICKY PILL-SHAPED GLASS ACTION BAR === */}
        <View style={styles.fixedPillWrapper}>
          <View style={styles.fixedPillCard}>
            <BlurView intensity={50} tint="light" style={styles.fixedPillBlurContent}>
              <View style={styles.fixedBottomBarRow}>
                <TouchableOpacity
                  style={styles.pillSecondaryBtn}
                  onPress={addRow}
                  activeOpacity={0.7}
                >
                  <Plus size={16} color={COLORS.vjAccent} />
                  <Text style={styles.pillSecondaryText}>+ Row</Text>
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
                      <Layers size={18} color="#fff" />
                      <Text style={styles.pillPrimaryText}>Generate {rows.length} Items</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      </View>

      <Modal visible={!!successCount} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Batch Created!</Text>
            <Text style={styles.successSubtitle}>Successfully generated {successCount} items in drafts.</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={() => { 
                  setSuccessCount(null); 
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
        title="Batch Entry Date"
        value={entryDate}
        onClose={() => setShowDatePicker(false)}
        onSelect={(d) => setEntryDate(d)}
      />

    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8, marginLeft: 4 },
  itemsTitle: { fontSize: 18, fontWeight: '800', color: COLORS.vjText },
  
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 1 },
  
  inputGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inputCol: { flex: 1 },

  liveMathBox: { 
    marginTop: 8, 
    backgroundColor: 'rgba(252,251,248,0.95)', 
    borderRadius: 12, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(184,115,51,0.2)' 
  },
  mathHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  mathTitle: { fontSize: 11, fontWeight: '800', color: '#D4AF37', textTransform: 'uppercase' },
  mathRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  mathLabel: { fontSize: 12, color: 'rgba(92,22,35,0.6)', fontWeight: '600', flex: 1, paddingRight: 8 },
  mathValue: { fontSize: 12, fontWeight: '700', color: COLORS.vjText, fontFamily: 'monospace' },
  mathHighlight: { fontSize: 13, fontWeight: '800', color: '#92400E', fontFamily: 'monospace' },

  addBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: 'rgba(184,115,51,0.1)', 
    paddingVertical: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: 'rgba(184,115,51,0.3)',
    borderStyle: 'dashed'
  },
  addBtnText: {
    textAlign: 'center', fontSize: 14, fontWeight: '800', color: '#D4AF37' }
});

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