// app/inventory/bulk-add.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Alert, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, GlassPickerInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { GlassDatePickerModal } from '@/components/ui/GlassDatePickerModal';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
import { itemService } from '@/services/phase2/itemService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { hsnMasterRepository } from '@/repositories/phase2/hsnMasterRepository';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import type { Design, Category, HsnCode, Stone, Metal, BulkItemInput } from '@/types/phase2/phase2.types';
import { Package, Plus, Trash2, Calculator, Layers, CheckCircle, Calendar as CalendarIcon } from 'lucide-react-native';
import { formatDate } from '@/utils/formatDate';
import { 
  PURITY_MAP,
  percentToKarat, 
  formatKaratBadge,
  resolveFineWeightMg, 
  computeFineGoldChargedMg, 
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeAbsoluteTotalCostRupees,
  rupeesToPaise,
  getCurrencySymbol,
  getPurityPresets,
  isPresetMatchingPurity,
  parseCleanFloat,
} from '@/utils/calculations';
import { COLORS } from '@/constants/theme';

const BULK_ITEM_MAX = 50;

export interface BulkRowState {
  id: string;
  grossWeight: string;
  stoneWeight: string;
  beadsWeight: string;
  purityPercent: string;
  wastagePercent: string;
  purchaseRate: string;
  makingCharge: string;
  stoneCost: string;
  location: string;
  sizeValue: string;
  sizeUnit: 'INCH' | 'MM' | 'CM' | 'RING_SIZE' | '';
  stoneId: string | null;
  stoneName: string;
}

interface BulkItemRowProps {
  index: number;
  row: BulkRowState;
  updateRow: (index: number, field: keyof BulkRowState, value: any) => void;
  removeRow: (index: number) => void;
  stones: Stone[];
  metal: Metal;
  openPickerModal: (config: any) => void;
}

const BulkItemRow = ({ index, row, updateRow, removeRow, stones, metal, openPickerModal }: BulkItemRowProps) => {
  const computedKarat = useMemo(() => {
    if (metal === 'SILVER') return '';
    return formatKaratBadge(row.purityPercent, metal || 'GOLD') || '';
  }, [row.purityPercent, metal]);

  const calculations = useMemo(() => {
    const gross = parseCleanFloat(row.grossWeight);
    const stone = parseCleanFloat(row.stoneWeight);
    const beads = parseCleanFloat(row.beadsWeight);
    const purity = parseCleanFloat(row.purityPercent);
    const wastage = parseCleanFloat(row.wastagePercent);
    const rate = parseCleanFloat(row.purchaseRate);
    const making = parseCleanFloat(row.makingCharge);
    const stoneC = parseCleanFloat(row.stoneCost);

    const netWeightG = Math.max(0, gross - stone - beads);
    const netWeightMg = Math.round(netWeightG * 1000);
    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, purity, metal || 'GOLD');
    const vaultTruth = computeVaultTruthGrams(fineWeightMg);

    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, purity, wastage);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    
    const effectivePricePerGram = computeEffectivePricePerGram(rate, purity, wastage, metal || 'GOLD');
    const absoluteTotalCost = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);
    const metalCostRupees = netWeightG * effectivePricePerGram;

    const hasCostData = (rate > 0 || making > 0 || stoneC > 0) && netWeightG > 0;

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
      netWeight: netWeightG,
      weightBreakdown: weightBreakdownText,
      purityRaw: purity,
      wastageRaw: wastage,
      totalTouch: purity + wastage,
      vaultTruth,
      wastageMetal: costTruth - vaultTruth,
      costTruth,
      hasCostData,
      financialBreakdown: financialBreakdownText,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
      isValid: netWeightG > 0 && purity > 0,
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
          <View style={s.inputCol}>
            <GlassInput 
              label="Gross (g)*" 
              value={row.grossWeight} 
              onChangeText={(t: string) => updateRow(index, 'grossWeight', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label="Stone (g)" 
              value={row.stoneWeight} 
              onChangeText={(t: string) => updateRow(index, 'stoneWeight', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label="Beads (g)" 
              value={row.beadsWeight} 
              onChangeText={(t: string) => updateRow(index, 'beadsWeight', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
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
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label="Wastage %" 
              value={row.wastagePercent} 
              onChangeText={(t: string) => updateRow(index, 'wastagePercent', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {getPurityPresets(metal || 'GOLD').map((preset) => {
            const isSelected = isPresetMatchingPurity(row.purityPercent, preset.val);
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  updateRow(index, 'purityPercent', preset.val);
                }}
                style={{
                  backgroundColor: isSelected ? '#D4AF37' : 'rgba(212,175,55,0.12)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}
              >
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: isSelected ? '#FFF' : COLORS.vjText,
                }}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.inputGrid}>
          <View style={s.inputCol}>
            <GlassInput 
              label={`Rate (${getCurrencySymbol()})`} 
              value={row.purchaseRate} 
              onChangeText={(t: string) => updateRow(index, 'purchaseRate', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label={`Making (${getCurrencySymbol()})`} 
              value={row.makingCharge} 
              onChangeText={(t: string) => updateRow(index, 'makingCharge', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label={`Stn Cost (${getCurrencySymbol()})`} 
              value={row.stoneCost} 
              onChangeText={(t: string) => updateRow(index, 'stoneCost', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
        </View>

        <View style={s.inputGrid}>
          <View style={s.inputCol}>
            <GlassInput 
              label="Location" 
              placeholder="Tray / Location" 
              value={row.location} 
              onChangeText={(t: string) => updateRow(index, 'location', t)} 
              autoCapitalize="characters" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassInput 
              label="Size Value" 
              placeholder="e.g. 18"
              value={row.sizeValue} 
              onChangeText={(t: string) => updateRow(index, 'sizeValue', t)} 
              keyboardType="decimal-pad" 
            />
          </View>
          <View style={s.inputCol}>
            <GlassPickerInput
              label="Size Unit"
              placeholder="Select Unit..."
              selectedLabel={
                row.sizeUnit
                  ? { INCH: 'Inches (INCH)', MM: 'Millimeters (MM)', CM: 'Centimeters (CM)', RING_SIZE: 'Ring Size' }[row.sizeUnit] || row.sizeUnit
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
                options: (stones || []).map((s) => ({
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
          <View className="mb-2 mt-4" style={{ zIndex: 10 }}>
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
                  <Text className="text-base font-black text-vj-text font-mono mt-0.5">{calculations.netWeight.toFixed(3)} g</Text>
                  <Text className="text-[9px] text-vj-text/55 font-semibold mt-0.5" numberOfLines={1}>
                    {calculations.weightBreakdown}
                  </Text>
                </View>

                <View className="flex-1 p-2.5 rounded-xl bg-black/[0.02] border border-black/5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] font-bold text-vj-text/50 uppercase tracking-wider">Total Touch</Text>
                    <Text className="text-xs font-black text-vj-accent font-mono">{calculations.totalTouch.toFixed(2)}%</Text>
                  </View>
                  <View className="mt-1 bg-vj-accent/10 px-1.5 py-0.5 rounded self-start">
                    <Text className="text-[9px] font-black text-vj-accent font-mono">
                      {calculations.purityRaw}% Purity + {calculations.wastageRaw}% Wastage
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-3 p-3 rounded-2xl bg-black/[0.02] border border-black/5">
                <Text className="text-[10px] font-black uppercase tracking-widest text-vj-text/60 mb-2">
                  Fine Metal Accounting ({metal || 'GOLD'})
                </Text>
                
                <View className="flex-row items-center justify-between gap-1">
                  <View className="flex-1 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center">
                    <Text className="text-[9px] font-black text-emerald-800 uppercase tracking-tight">Vault Fine</Text>
                    <Text className="text-xs font-black text-emerald-700 font-mono mt-0.5">{calculations.vaultTruth.toFixed(3)} g</Text>
                    <Text className="text-[8px] font-semibold text-emerald-800/70 mt-0.5">Physical</Text>
                  </View>

                  <Text className="text-xs font-black text-vj-text/40">+</Text>

                  <View className="flex-1 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 items-center">
                    <Text className="text-[9px] font-black text-rose-800 uppercase tracking-tight">Wastage</Text>
                    <Text className="text-xs font-black text-rose-700 font-mono mt-0.5">{calculations.wastageMetal.toFixed(3)} g</Text>
                    <Text className="text-[8px] font-semibold text-rose-800/70 mt-0.5">Supplier</Text>
                  </View>

                  <Text className="text-xs font-black text-vj-text/40">=</Text>

                  <View className="flex-1 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center">
                    <Text className="text-[9px] font-black text-amber-900 uppercase tracking-tight">Billed Fine</Text>
                    <Text className="text-xs font-black text-amber-800 font-mono mt-0.5">{calculations.costTruth.toFixed(3)} g</Text>
                    <Text className="text-[8px] font-semibold text-amber-800/70 mt-0.5">Cost Truth</Text>
                  </View>
                </View>
              </View>

              {calculations.hasCostData && (
                <View className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <View className="flex-row justify-between items-center pb-1.5 border-b border-amber-500/15">
                    <Text className="text-[11px] text-vj-text/70 font-bold">Effective Price / g:</Text>
                    <Text className="text-xs font-black text-vj-text font-mono">
                      {getCurrencySymbol()} {calculations.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center pt-2">
                    <View className="flex-1 pr-2">
                      <Text className="text-xs font-black text-vj-text uppercase tracking-wider">EST. Total</Text>
                      <Text className="text-[10px] text-vj-text/60 font-semibold mt-0.5">
                        {calculations.financialBreakdown}
                      </Text>
                    </View>
                    <Text className="text-base font-black font-mono text-amber-950">
                      {getCurrencySymbol()} {calculations.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              )}
            </GlassCard>
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
  const [designStock, setDesignStock] = useState<{ totalNetWeightMg: number; count: number } | null>(null);

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

  const getEmptyRow = (): BulkRowState => ({
    id: Crypto.randomUUID(),
    grossWeight: '',
    stoneWeight: '',
    beadsWeight: '',
    purityPercent: '',
    wastagePercent: '',
    purchaseRate: '',
    makingCharge: '',
    stoneCost: '',
    location: '',
    sizeValue: '',
    sizeUnit: '',
    stoneId: null,
    stoneName: '',
  });

  const [rows, setRows] = useState<BulkRowState[]>([getEmptyRow()]);

  const categoryVersion = useMastersSyncStore((s) => s.categoryVersion);
  const designVersion = useMastersSyncStore((s) => s.designVersion);
  const stoneVersion = useMastersSyncStore((s) => s.stoneVersion);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const d = await designRepository.findByFirmId(activeFirmId);
      const c = await categoryRepository.findByFirmId(activeFirmId);
      const h = await hsnMasterRepository.findByChapter('71');
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
      console.error('[BulkAddScreen] Failed to load data:', err);
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

  const updateRow = (index: number, field: keyof BulkRowState, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const addRow = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (rows.length >= BULK_ITEM_MAX) {
      Alert.alert('Limit Reached', `You can only add up to ${BULK_ITEM_MAX} items per batch.`);
      return;
    }
    const lastRow = rows[rows.length - 1];
    
    setRows([
      ...rows,
      { 
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
        stoneName: lastRow.stoneName,
      },
    ]);
  };

  const removeRow = (index: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (rows.length <= 1) {
      Alert.alert('Cannot Remove', 'A bulk intake must contain at least one item.');
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId) {
      Alert.alert('Error', 'No active firm selected.');
      return;
    }
    if (!selectedDesign || !selectedCategory || !selectedHsn) {
      Alert.alert('Missing Classification', 'Please select a Design, Category, and HSN Code for this batch.');
      return;
    }

    const inputs: BulkItemInput[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const gross = parseCleanFloat(r.grossWeight);
      const stone = parseCleanFloat(r.stoneWeight);
      const beads = parseCleanFloat(r.beadsWeight);
      const purity = parseCleanFloat(r.purityPercent);

      if (isNaN(gross) || gross <= 0) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid gross weight.`);
        return;
      }
      if (stone + beads >= gross) {
        Alert.alert('Validation Error', `Item #${i + 1}: Stone + Beads weight cannot be greater than or equal to Gross weight.`);
        return;
      }
      if (isNaN(purity) || purity <= 0 || purity > 100) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid purity percentage.`);
        return;
      }

      const hasSizeVal = r.sizeValue.trim() !== '';
      const hasSizeUnit = r.sizeUnit.trim() !== '';
      if ((hasSizeVal && !hasSizeUnit) || (!hasSizeVal && hasSizeUnit)) {
        Alert.alert('Validation Error', `Item #${i + 1}: Size Value and Size Unit must both be specified together, or both left blank.`);
        return;
      }

      const computedKarat = selectedDesign.metal === 'GOLD' ? (percentToKarat(purity) || 0) : 0;
      const parsedSizeVal = hasSizeVal ? parseCleanFloat(r.sizeValue) : null;
      const parsedSizeUnit = hasSizeUnit ? (r.sizeUnit as 'INCH' | 'MM' | 'CM' | 'RING_SIZE') : null;

      inputs.push({
        designId: selectedDesign.id,
        categoryId: selectedCategory.id,
        hsnCode: selectedHsn.code,
        primaryStoneId: r.stoneId || null,
        grossWeightMg: Math.round(gross * 1000),
        stoneWeightMg: Math.round(stone * 1000),
        beadsWeightMg: Math.round(beads * 1000),
        purityPercent: purity,
        purityKarat: computedKarat,
        wastagePercent: parseCleanFloat(r.wastagePercent),
        purchaseRatePaise: r.purchaseRate.trim() ? rupeesToPaise(parseCleanFloat(r.purchaseRate)) : null,
        makingChargePaise: r.makingCharge.trim() ? rupeesToPaise(parseCleanFloat(r.makingCharge)) : null,
        stoneCostPaise: r.stoneCost.trim() ? rupeesToPaise(parseCleanFloat(r.stoneCost)) : null,
        location: r.location.trim() || null,
        sizeValue: parsedSizeVal,
        sizeUnit: parsedSizeUnit,
        metalSource: 'SUPPLIER_PURCHASE',
        entryDate,
      });
    }

    try {
      setLoading(true);
      await itemService.createItemsBulk(inputs, activeFirmId);
      setSuccessCount(inputs.length);
    } catch (e: any) {
      Alert.alert('Bulk Add Failed', e.message || 'Failed to process bulk items.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Bulk Add Stock" showBack>
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
                      dList = (fetched || [])
                        .filter((item) => item.isActive === 1 && item.stockType !== 'LOOSE')
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
                      setDesigns(dList);
                    }
                    setPickerModal({
                      visible: true,
                      title: 'Select Batch Design',
                      placeholder: 'Search design by name or metal...',
                      selectedId: selectedDesign?.id || null,
                      options: dList.map((d) => ({
                        id: d.id,
                        label: d.name || 'Unnamed Design',
                        sublabel: d.metal ? `Metal: ${d.metal}` : undefined,
                      })),
                      onSelect: async (opt) => {
                        if (!opt) {
                          setSelectedDesign(null);
                          return;
                        }
                        const selDesign = dList.find((d) => d.id === opt.id)!;
                        setSelectedDesign(selDesign);

                        // Auto-select Default HSN
                        if (selDesign.defaultHsn) {
                          const matchedHsn = hsnCodes.find((h) => h.code === selDesign.defaultHsn);
                          if (matchedHsn) setSelectedHsn(matchedHsn);
                        }

                        // Auto-select linked category
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
                              const linkedCat = catList.find((c) => c.id === mappings[0].categoryId);
                              if (linkedCat) {
                                setSelectedCategory(linkedCat);
                              }
                            }
                          } catch (err) {
                            console.warn('Failed to auto-select category in bulk add:', err);
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
                    cList = (fetched || [])
                      .filter((item) => item.isActive === 1)
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
                    setCategories(cList);
                  }
                  setPickerModal({
                    visible: true,
                    title: 'Select Batch Category',
                    placeholder: 'Search category...',
                    selectedId: selectedCategory?.id || null,
                    options: cList.map((c) => ({
                      id: c.id,
                      label: c.name || 'Unnamed Category',
                    })),
                    onSelect: (opt) => {
                      if (!opt) {
                        setSelectedCategory(null);
                        return;
                      }
                      const selCat = cList.find((c) => c.id === opt.id);
                      if (selCat) setSelectedCategory(selCat);
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
                    hList = (await hsnMasterRepository.findByChapter('71')) || [];
                    setHsnCodes(hList);
                  }
                  setPickerModal({
                    visible: true,
                    title: 'Select Batch HSN Code',
                    placeholder: 'Search HSN code or description...',
                    selectedId: selectedHsn?.id || null,
                    options: hList.map((h) => ({
                      id: h.id,
                      label: h.code || 'No Code',
                      sublabel: h.description || '',
                    })),
                    onSelect: (opt) => {
                      if (!opt) {
                        setSelectedHsn(null);
                        return;
                      }
                      const selHsn = hList.find((h) => h.id === opt.id);
                      if (selHsn) setSelectedHsn(selHsn);
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
              key={row.id} 
              index={index} 
              row={row} 
              updateRow={updateRow} 
              removeRow={removeRow} 
              stones={stones} 
              metal={selectedDesign?.metal || 'GOLD'}
              openPickerModal={(config: any) => setPickerModal(config)}
            />
          ))}

        </KeyboardAwareScrollView>

        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillSecondaryBtn}
            onPress={addRow}
            activeOpacity={0.7}
          >
            <Plus size={16} color={COLORS.vjAccent} />
            <Text style={fixedBarStyles.pillSecondaryText}>+ Row</Text>
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
                <Layers size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Generate {rows.length} Items</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
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
});