// app/inventory/bulk-add.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, Modal, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { storage } from '../../utils/storage';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { itemService } from '../../services/itemService';
import { designRepository } from '../../repositories/designRepository';
import { categoryRepository } from '../../repositories/categoryRepository';
import { hsnMasterRepository } from '../../repositories/hsnMasterRepository';
import { stoneRepository } from '../../repositories/stoneRepository';
import { itemRepository } from '../../repositories/itemRepository';
import type { Design, Category, HsnCode, Stone } from '../../types/phase2.types';
import { Package, Plus, Trash2, Calculator, Layers, MapPin, Wallet, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { percentToKarat } from '../../utils/purity.constants';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
};

const BULK_ITEM_MAX = 50;

import { GlassSmartSearch } from '../../components/ui/Glass';

const BulkItemRow = ({ index, row, updateRow, removeRow, stones }: any) => {
  // Pure Wholesale "Touch" Costing Engine
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
    const totalTouchPercent = purity + wastage;
    const effectivePricePerGram = rate * (totalTouchPercent / 100);
    const totalGoldCost = netWeightG * effectivePricePerGram;
    const absoluteTotalCost = totalGoldCost + making + stoneC;

    const vaultTruth = (netWeightG * purity) / 100;
    const wastageGold = (netWeightG * wastage) / 100;
    const costTruth = (netWeightG * totalTouchPercent) / 100;

    return {
      netWeight: netWeightG,
      totalTouch: totalTouchPercent,
      vaultTruth,
      wastageGold,
      costTruth,
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
      isValid: netWeightG > 0 && purity > 0
    };
  }, [row.grossWeight, row.stoneWeight, row.beadsWeight, row.purityPercent, row.wastagePercent, row.purchaseRate, row.makingCharge, row.stoneCost]);

  return (
    <GlassCard>
      <View style={s.rowHeader}>
        <Text style={s.rowTitle}>Item #{index + 1}</Text>
        {index > 0 && (
          <TouchableOpacity onPress={() => removeRow(index)}>
            <Trash2 size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Weights */}
      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Gross (g)*" value={row.grossWeight} onChangeText={(t: string) => updateRow(index, 'grossWeight', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Stone (g)" value={row.stoneWeight} onChangeText={(t: string) => updateRow(index, 'stoneWeight', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Beads (g)" value={row.beadsWeight} onChangeText={(t: string) => updateRow(index, 'beadsWeight', t)} keyboardType="numeric" /></View>
      </View>

      {/* Purity & Rate */}
      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Purity %*" value={row.purityPercent} onChangeText={(t: string) => updateRow(index, 'purityPercent', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Wastage %" value={row.wastagePercent} onChangeText={(t: string) => updateRow(index, 'wastagePercent', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Rate/g (₹)" value={row.purchaseRate} onChangeText={(t: string) => updateRow(index, 'purchaseRate', t)} keyboardType="numeric" /></View>
      </View>

      {/* Costs */}
      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Making Chg (₹)" value={row.makingCharge} onChangeText={(t: string) => updateRow(index, 'makingCharge', t)} keyboardType="numeric" /></View>
        <View style={s.inputCol}><GlassInput label="Stone Cost (₹)" value={row.stoneCost} onChangeText={(t: string) => updateRow(index, 'stoneCost', t)} keyboardType="numeric" /></View>
      </View>

      {/* Tracking */}
      <View style={s.inputGrid}>
        <View style={s.inputCol}><GlassInput label="Location" value={row.location} onChangeText={(t: string) => updateRow(index, 'location', t)} autoCapitalize="characters" /></View>
        <View style={s.inputCol}><GlassInput label="BIS HUID" value={row.huid} onChangeText={(t: string) => updateRow(index, 'huid', t)} autoCapitalize="characters" maxLength={6} /></View>
      </View>

      {/* Primary Stone Inline Search */}
      <View style={{ zIndex: 10 }}>
        <GlassSmartSearch 
          label="Primary Stone (Optional)"
          placeholder="Select Stone..."
          options={[{ id: 'NONE', label: 'No Stone', sublabel: 'Clear selection' }, ...(stones || []).map((s: any) => ({ id: s.id, label: s.name, sublabel: s.type }))]}
          selectedId={row.stoneId || 'NONE'}
          onSelect={(opt) => {
            if (!opt || opt.id === 'NONE') {
              updateRow(index, 'stoneId', null);
              updateRow(index, 'stoneName', '');
            } else {
              updateRow(index, 'stoneId', opt.id);
              updateRow(index, 'stoneName', `${opt.label} (${opt.sublabel})`);
            }
          }}
        />
      </View>

      {/* Live Cost Breakdown */}
      {calculations.isValid && row.purchaseRate !== '' && (
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
            <Text style={s.mathValue}>{calculations.totalTouch.toFixed(2)}%</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Vault Truth (Fine):</Text>
            <Text style={[s.mathValue, { color: '#047857' }]}>{calculations.vaultTruth.toFixed(3)} g</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Wastage Gold:</Text>
            <Text style={[s.mathValue, { color: '#BE123C' }]}>{calculations.wastageGold.toFixed(3)} g</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Cost Truth (Fine):</Text>
            <Text style={[s.mathValue, { color: '#B45309' }]}>{calculations.costTruth.toFixed(3)} g</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Effective Price/g:</Text>
            <Text style={s.mathValue}>₹ {calculations.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={s.mathRow}>
            <Text style={s.mathLabel}>Est. Total (₹):</Text>
            <Text style={s.mathHighlight}>₹ {calculations.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
        </View>
      )}
    </GlassCard>
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
    if (rows.length >= BULK_ITEM_MAX) {
      Alert.alert('Limit Reached', `You can only add up to ${BULK_ITEM_MAX} items per batch.`);
      return;
    }
    const lastRow = rows[rows.length - 1];
    
    // Smart Copy: Copies everything EXCEPT weights and HUID to save typing
    setRows([...rows, { 
      ...getEmptyRow(), 
      purityPercent: lastRow.purityPercent, 
      wastagePercent: lastRow.wastagePercent, 
      purchaseRate: lastRow.purchaseRate,
      makingCharge: lastRow.makingCharge,
      stoneCost: lastRow.stoneCost,
      location: lastRow.location,
      stoneId: lastRow.stoneId,
      stoneName: lastRow.stoneName
    }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedDesign || !selectedCategory || !selectedHsn) {
      Alert.alert('Missing Classification', 'Please select a Design, Category, and HSN Code for this batch.');
      return;
    }

    const inputs: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const gross = parseFloat(r.grossWeight);
      const purity = parseFloat(r.purityPercent);

      if (isNaN(gross) || gross <= 0) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid gross weight.`);
        return;
      }
      if (isNaN(purity) || purity <= 0 || purity > 100) {
        Alert.alert('Validation Error', `Item #${i + 1} has an invalid purity percentage.`);
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

      const computedKarat = percentToKarat(purity) || 0;

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
        purchaseRatePaise: r.purchaseRate ? Math.round(parseFloat(r.purchaseRate) * 100) : undefined,
        makingChargePaise: r.makingCharge ? Math.round(parseFloat(r.makingCharge) * 100) : undefined,
        stoneCostPaise: r.stoneCost ? Math.round(parseFloat(r.stoneCost) * 100) : undefined,
        location: r.location?.trim() || undefined,
        huid: huidUpper,
        metalSource: 'SUPPLIER_PURCHASE',
      });
    }

    try {
      setLoading(true);
      await itemService.createItemsBulk(inputs, activeFirmId!);
      
      // TRIGGER MODERN SUCCESS MODAL
      setSuccessCount(inputs.length);
    } catch (e: any) {
      Alert.alert('Bulk Add Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Bulk Add Stock" showBack>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 32, paddingBottom: 350, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        
        <GlassCard style={{ marginBottom: 16 }}>
          <View className="flex-row items-center gap-2 mb-4">
            <Layers size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Batch Classification</Text>
          </View>
          
          <Text style={{ fontSize: 12, color: 'rgba(92,22,35,0.6)', marginBottom: 16 }}>
            These attributes will be applied to all items in this bulk batch.
          </Text>

          <View style={{ zIndex: 40, marginBottom: 16 }}>
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
            <GlassSmartSearch 
              placeholder="Search designs..."
              options={designs.map(d => ({ id: d.id, label: d.name, sublabel: d.metal }))}
              selectedId={selectedDesign?.id || null}
              onFocusFetch={async () => {
                if (activeFirmId) {
                  const d = await designRepository.findByFirmId(activeFirmId);
                  setDesigns(d);
                }
              }}
              onSelect={(opt) => {
                if (!opt) return setSelectedDesign(null);
                const selDesign = designs.find(d => d.id === opt.id)!;
                setSelectedDesign(selDesign);
                if (selectedCategory && selectedCategory.metal !== selDesign.metal) {
                  setSelectedCategory(null);
                }
              }}
            />
          </View>

          <View style={{ zIndex: 30, marginBottom: 16 }}>
            <GlassSmartSearch 
              label="Category *"
              placeholder="Search categories..."
              options={categories.filter(c => selectedDesign ? c.metal === selectedDesign.metal : true).map(c => ({ id: c.id, label: c.name, sublabel: c.metal }))}
              selectedId={selectedCategory?.id || null}
              onFocusFetch={async () => {
                if (activeFirmId) {
                  const c = await categoryRepository.findByFirmId(activeFirmId);
                  setCategories(c);
                }
              }}
              onSelect={(opt) => {
                if (!opt) return setSelectedCategory(null);
                const selCat = categories.find(c => c.id === opt.id)!;
                setSelectedCategory(selCat);
              }}
            />
          </View>

          <View style={{ zIndex: 20 }}>
            <GlassSmartSearch 
              label="HSN Code *"
              placeholder="Search HSN codes..."
              options={hsnCodes.map(h => ({ id: h.id, label: h.code, sublabel: h.description }))}
              selectedId={selectedHsn?.id || null}
              onSelect={(opt) => {
                if (!opt) return setSelectedHsn(null);
                const selHsn = hsnCodes.find(h => h.id === opt.id)!;
                setSelectedHsn(selHsn);
              }}
            />
          </View>
        </GlassCard>

        <View style={s.itemsHeader}>
          <Package size={20} color="#5C1623" />
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
          />
        ))}

        <TouchableOpacity style={s.addBtn} onPress={addRow} activeOpacity={0.7}>
          <Plus size={20} color="#D4AF37" />
          <Text style={s.addBtnText}>Add Another Item</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 24 }}>
          <GlassButton title={`Generate ${rows.length} Items`} onPress={handleSubmit} loading={loading} />
        </View>

      </ScrollView>

      {/* Modern Bulk Success Modal */}
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

    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8, marginLeft: 4 },
  itemsTitle: { fontSize: 18, fontWeight: '800', color: '#5C1623' },
  

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
  mathValue: { fontSize: 12, fontWeight: '700', color: '#5C1623', fontFamily: 'monospace' },
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
});