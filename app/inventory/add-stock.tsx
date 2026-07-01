// app/inventory/add-stock.tsx
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
import { designCategoryMapRepository } from '../../repositories/designCategoryMapRepository';
import { itemRepository } from '../../repositories/itemRepository';
import type { Design, Category, HsnCode, Stone } from '../../types/phase2.types';
import { Package, Scale, Percent, MapPin, Calculator, Wallet, CheckCircle, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedHsnCodes } from '../../db/seed';
import { percentToKarat } from '../../utils/purity.constants';
import { formatSKUDisplay } from '../../utils/skuDisplay';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
};

import { GlassSmartSearch } from '../../components/ui/Glass';

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

  const [loading, setLoading] = useState(false);
  const [successSku, setSuccessSku] = useState<string | null>(null); 
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
    const gross = parseFloat(grossWeight) || 0;
    const stone = parseFloat(stoneWeight) || 0;
    const beads = parseFloat(beadsWeight) || 0;
    const purity = parseFloat(purityPercent) || 0;
    const wastage = parseFloat(wastagePercent) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    const making = parseFloat(makingCharge) || 0;
    const stoneC = parseFloat(stoneCost) || 0;

    const netWeightG = Math.max(0, gross - stone - beads);
    const totalTouchPercent = purity + wastage;
    const effectivePricePerGram = rate * (totalTouchPercent / 100);
    const totalGoldCost = netWeightG * effectivePricePerGram;
    const absoluteTotalCost = totalGoldCost + making + stoneC;

    const vaultTruth = netWeightG * (purity / 100);
    const wastageGold = netWeightG * (wastage / 100);
    const costTruth = netWeightG * (totalTouchPercent / 100);

    return {
      netWeight: netWeightG.toFixed(3) + ' g',
      vaultTruth: vaultTruth.toFixed(3) + ' g',
      wastageGold: wastageGold.toFixed(3) + ' g',
      costTruth: costTruth.toFixed(3) + ' g',
      totalTouch: totalTouchPercent.toFixed(2) + '%',
      pricePerGram: effectivePricePerGram,
      totalAmount: absoluteTotalCost,
      hasCostData: rate > 0 || making > 0 || stoneC > 0,
      isValid: netWeightG > 0 && purity > 0
    };
  }, [grossWeight, stoneWeight, beadsWeight, purityPercent, wastagePercent, purchaseRate, makingCharge, stoneCost]);

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

    let huidUpper = undefined;
    if (huid.trim()) {
      huidUpper = huid.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
        Alert.alert('Invalid HUID', 'BIS HUID must be exactly 6 alphanumeric characters (A-Z, 0-9).');
        return;
      }
    }

    const wPercent = parseFloat(wastagePercent) || 0;
    const pRatePaise = purchaseRate ? Math.round(parseFloat(purchaseRate) * 100) : undefined;
    const mChargePaise = makingCharge ? Math.round(parseFloat(makingCharge) * 100) : undefined;
    const sCostPaise = stoneCost ? Math.round(parseFloat(stoneCost) * 100) : undefined;
    const kVal = percentToKarat(purity) || 0; 

    try {
      setLoading(true);
      const item = await itemService.createItem({
        designId: selectedDesign.id,
        categoryId: selectedCategory.id,
        hsnCode: selectedHsn.code,
        primaryStoneId: selectedStone?.id,
        grossWeightMg: Math.round(gross * 1000),
        stoneWeightMg: Math.round(stone * 1000),
        beadsWeightMg: Math.round(beads * 1000),
        purityPercent: purity,
        purityKarat: kVal,
        wastagePercent: wPercent,
        purchaseRatePaise: pRatePaise,
        makingChargePaise: mChargePaise,
        stoneCostPaise: sCostPaise,
        location: location.trim() || undefined,
        huid: huidUpper,
        metalSource: 'SUPPLIER_PURCHASE',
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 32, paddingBottom: 350, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        
        {/* Classification */}
        <GlassCard>
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Package size={20} color="#D4AF37" />
              <Text className="text-lg font-bold text-vj-text">Classification</Text>
            </View>
          </View>
          
          {designs.length === 0 && (
            <View className="mb-4 bg-white/40 p-3 rounded-xl border border-white/20">
              <Text className="text-xs text-vj-text/60 font-bold text-center">No Designs Found. Please add a Design in Master Catalogs first.</Text>
            </View>
          )}

          <View style={{ zIndex: 40 }}>
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
              options={designs.map(d => ({ id: d.id, label: d.name || 'Unnamed Design', sublabel: d.metal || 'Unknown' }))}
              selectedId={selectedDesign?.id || null}
              onFocusFetch={async () => {
                if (activeFirmId) {
                  const d = await designRepository.findByFirmId(activeFirmId);
                  setDesigns(d || []);
                }
              }}
              onSelect={async (opt) => {
                if (!opt) return setSelectedDesign(null);
                const selDesign = designs.find(d => d.id === opt.id)!;
                setSelectedDesign(selDesign);
                
                if (activeFirmId) {
                  try {
                    const mappings = await designCategoryMapRepository.findByDesignId(selDesign.id, activeFirmId);
                    if (mappings.length === 1) {
                      const linkedCat = categories.find(c => c.id === mappings[0].categoryId);
                      if (linkedCat) {
                        setSelectedCategory(linkedCat);
                        return;
                      }
                    }
                  } catch (err) {
                    console.warn("Failed to auto-select category:", err);
                  }
                }
      
                if (selectedCategory && selectedCategory.metal !== selDesign.metal) {
                  setSelectedCategory(null);
                }
              }}
            />
          </View>

          <View style={{ zIndex: 30 }}>
            <GlassSmartSearch 
              label="Category *"
              placeholder="Search categories..."
              options={categories.filter(c => selectedDesign ? c.metal === selectedDesign.metal : true).map(c => ({ id: c.id, label: c.name || 'Unnamed Category', sublabel: c.metal || 'Unknown' }))}
              selectedId={selectedCategory?.id || null}
              onFocusFetch={async () => {
                if (activeFirmId) {
                  const c = await categoryRepository.findByFirmId(activeFirmId);
                  setCategories(c || []);
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
              options={hsnCodes.map(h => ({ id: h.id, label: h.code || 'No Code', sublabel: h.description || '' }))}
              selectedId={selectedHsn?.id || null}
              onSelect={(opt) => {
                if (!opt) return setSelectedHsn(null);
                const selHsn = hsnCodes.find(h => h.id === opt.id)!;
                setSelectedHsn(selHsn);
              }}
            />
          </View>
        </GlassCard>

        {/* Weights */}
        <GlassCard>
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
                {computedKarat ? <Text style={{ fontSize: 12, fontWeight: '800', color: '#D4AF37' }}>{computedKarat}</Text> : null}
              </View>
              <GlassInput placeholder="e.g. 91.6" keyboardType="numeric" value={purityPercent} onChangeText={setPurityPercent} />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput label="Wastage %" placeholder="e.g. 5.0" keyboardType="numeric" value={wastagePercent} onChangeText={setWastagePercent} />
            </View>
          </View>
        </GlassCard>

        {/* Tracking & Stones */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <MapPin size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Tracking & Stones</Text>
          </View>

          <View style={{ zIndex: 10 }}>
            <GlassSmartSearch 
              label="Primary Stone (Optional)"
              placeholder="Select Stone..."
              options={[{ id: 'NONE', label: 'No Stone', sublabel: 'Clear selection' }, ...stones.map(s => ({ id: s.id, label: s.name || 'Unnamed', sublabel: s.type || '' }))]}
              selectedId={selectedStone?.id || 'NONE'}
              onSelect={(opt) => {
                if (!opt || opt.id === 'NONE') return setSelectedStone(null);
                const selStone = stones.find(s => s.id === opt.id)!;
                setSelectedStone(selStone);
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
               <GlassInput label="Location" placeholder="e.g. SHOP / TRAY 1" autoCapitalize="characters" value={location} onChangeText={setLocation} />
            </View>
            <View style={{ flex: 1 }}>
               <GlassInput label="BIS HUID" placeholder="6-digit code" autoCapitalize="characters" value={huid} onChangeText={setHuid} maxLength={6} />
            </View>
          </View>
        </GlassCard>

        {/* Costs */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Wallet size={20} color="#D4AF37" />
            <Text className="text-lg font-bold text-vj-text">Purchase Costs (₹)</Text>
          </View>

          <GlassInput label="Purchase Rate (₹)" placeholder="e.g. 14500" keyboardType="numeric" value={purchaseRate} onChangeText={setPurchaseRate} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><GlassInput label="Making Charge (₹)" placeholder="Cash labour" keyboardType="numeric" value={makingCharge} onChangeText={setMakingCharge} /></View>
            <View style={{ flex: 1 }}><GlassInput label="Stone Cost (₹)" placeholder="Stone cost" keyboardType="numeric" value={stoneCost} onChangeText={setStoneCost} /></View>
          </View>
        </GlassCard>

        {/* Mandated UI Display — Live Cost Preview */}
        {liveWastageSeparation.isValid && (
          <View className="px-1 mb-4 mt-2">
            <GlassCard style={{ backgroundColor: 'rgba(252,251,248, 0.95)', borderColor: '#D4AF37', borderWidth: 1 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Calculator size={18} color="#D4AF37" />
                <Text className="text-xs font-black uppercase tracking-wider text-vj-accent">Live Cost Breakdown</Text>
              </View>
              
              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium">Net Weight:</Text>
                <Text className="text-xs text-vj-text font-bold font-mono">{liveWastageSeparation.netWeight}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">Total Touch:</Text>
                <Text className="text-xs text-vj-text font-bold font-mono">{liveWastageSeparation.totalTouch}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">Vault Truth (Fine):</Text>
                <Text className="text-xs text-emerald-700 font-bold font-mono">{liveWastageSeparation.vaultTruth}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium flex-1 pr-2">Wastage Gold:</Text>
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
                    <Text className="text-xs text-vj-text font-bold font-mono">₹ {liveWastageSeparation.pricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View className="flex-row justify-between pt-2">
                    <Text className="text-sm text-vj-text font-black">Est. Total Cost (₹):</Text>
                    <Text className="text-sm font-black font-mono text-amber-900">₹ {liveWastageSeparation.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                  </View>
                </>
              )}
            </GlassCard>
          </View>
        )}

        <GlassButton title="Create Draft Item" onPress={handleSubmit} loading={loading} />

      </ScrollView>

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
    letterSpacing: 2,
  }
});