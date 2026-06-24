// app/inventory/add-stock.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, Modal, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { storage } from '../../utils/storage';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { itemService } from '../../services/itemService';
import { designRepository } from '../../repositories/designRepository';
import { categoryRepository } from '../../repositories/categoryRepository';
import { hsnMasterRepository } from '../../repositories/hsnMasterRepository';
import { stoneRepository } from '../../repositories/stoneRepository';
import type { Design, Category, HsnCode, Stone } from '../../types/phase2.types';
import { Package, Scale, Percent, MapPin, Calculator, Wallet, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedHsnCodes } from '../../db/seed';
import { percentToKarat } from '../../utils/purity.constants';
import { formatSKUDisplay } from '../../utils/skuDisplay'; // <-- IMPORTED SKU FORMATTER

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
};

const SelectModal = ({ visible, title, options, onSelect, onClose, searchPlaceholder }: any) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = options.filter((opt: any) => 
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (opt.sublabel && opt.sublabel.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center items-center p-4">
        <View className="bg-vj-bg w-full max-w-[500px] rounded-3xl p-6 shadow-2xl" style={{ maxHeight: '85%' }}>
          <Text className="text-xl font-bold text-vj-text mb-4">{title}</Text>
          {searchPlaceholder && (
            <TextInput
              style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)' }}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          )}
          <ScrollView>
            {filteredOptions.length === 0 && <Text className="text-center text-vj-text/50 mt-4 font-medium">No matching results found.</Text>}
            {filteredOptions.map((opt: any) => (
              <TouchableOpacity 
                key={opt.id} 
                onPress={() => { onSelect(opt); setSearchQuery(''); onClose(); }}
                className="py-4 border-b border-gray-200"
              >
                <Text className="text-lg font-semibold text-vj-text">{opt.label}</Text>
                {opt.sublabel && <Text className="text-sm text-vj-text/60">{opt.sublabel}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="mt-4">
            <GlassButton title="Cancel" variant="secondary" onPress={() => { setSearchQuery(''); onClose(); }} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

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

  const [showDesignModal, setShowDesignModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showHsnModal, setShowHsnModal] = useState(false);
  const [showStoneModal, setShowStoneModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successSku, setSuccessSku] = useState<string | null>(null); // <-- NEW: State for Modern Success Modal

  useEffect(() => {
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
      
      setDesigns(d);
      setCategories(c);
      setHsnCodes(h);
      setStones(s);

      // High-Speed MMKV Restore: Pre-fill last used classification
      const lastDesign = await storage.getItem(`@add_lastDesign_${activeFirmId}`);
      const lastCategory = await storage.getItem(`@add_lastCat_${activeFirmId}`);
      const lastHsn = await storage.getItem(`@add_lastHsn_${activeFirmId}`);

      if (lastDesign) {
        const found = d.find(x => x.id === lastDesign);
        if (found) setSelectedDesign(found);
      }
      if (lastCategory) {
        const found = c.find(x => x.id === lastCategory);
        if (found) setSelectedCategory(found);
      }
      if (lastHsn) {
        const found = h.find(x => x.id === lastHsn);
        if (found) setSelectedHsn(found);
      }
    };
    loadData();
  }, [activeFirmId]);

  const computedKarat = useMemo(() => {
    const p = parseFloat(purityPercent);
    if (isNaN(p) || p <= 0) return '';
    const k = percentToKarat(p) || 0; 
    return k > 0 ? `${k}K` : '';
  }, [purityPercent]);

  // FIX: Pure Wholesale "Touch" Costing Engine
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
      
      // TRIGGER MODERN SUCCESS MODAL INSTEAD OF SYSTEM ALERT
      setSuccessSku(item.sku);
      
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Add Stock" showBack>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* Classification */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Package size={20} color="#B87333" />
            <Text className="text-lg font-bold text-vj-text">Classification</Text>
          </View>
          
          {designs.length === 0 && (
            <View className="mb-4 bg-white/40 p-3 rounded-xl border border-white/20">
              <Text className="text-xs text-vj-text/60 font-bold text-center">No Designs Found. Please add a Design in Master Catalogs first.</Text>
            </View>
          )}

          <TouchableOpacity onPress={() => setShowDesignModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">Design *</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedDesign ? selectedDesign.name : 'Select Design...'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowCategoryModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">Category *</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedCategory ? selectedCategory.name : 'Select Category...'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowHsnModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">HSN Code *</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedHsn ? `${selectedHsn.code} - ${selectedHsn.description}` : 'Select HSN...'}</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Weights */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Scale size={20} color="#B87333" />
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
            <Percent size={20} color="#B87333" />
            <Text className="text-lg font-bold text-vj-text">Purity & Wastage</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <View className="flex-row justify-between items-center mb-1">
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(46,29,0,0.6)', textTransform: 'uppercase' }}>Purity % *</Text>
                {computedKarat ? <Text style={{ fontSize: 12, fontWeight: '800', color: '#B87333' }}>{computedKarat}</Text> : null}
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
            <MapPin size={20} color="#B87333" />
            <Text className="text-lg font-bold text-vj-text">Tracking & Stones</Text>
          </View>

          <TouchableOpacity onPress={() => setShowStoneModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">Primary Stone (Optional)</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedStone ? `${selectedStone.name} (${selectedStone.type})` : 'Select Stone...'}</Text>
          </TouchableOpacity>

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
            <Wallet size={20} color="#B87333" />
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
            <GlassCard style={{ backgroundColor: 'rgba(46, 29, 0, 0.04)', borderColor: '#B87333', borderWidth: 1 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Calculator size={18} color="#B87333" />
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

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium">Physical Fine Gold (Vault Truth):</Text>
                <Text className="text-xs text-emerald-700 font-bold font-mono">{liveWastageSeparation.vaultTruth}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium">Wastage Gold Paid:</Text>
                <Text className="text-xs text-rose-700 font-bold font-mono">{liveWastageSeparation.wastageGold}</Text>
              </View>

              <View className="flex-row justify-between py-1 border-b border-black/5">
                <Text className="text-xs text-vj-text/60 font-medium">Fine Gold Billed (Cost Truth):</Text>
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

      {/* Select Modals connected to AsyncStorage */}
      <SelectModal 
        visible={showDesignModal} title="Select Design" searchPlaceholder="Search designs..."
        options={designs.map(d => ({ id: d.id, label: d.name, sublabel: d.metal }))}
        onSelect={(opt: any) => {
          const selDesign = designs.find(d => d.id === opt.id)!;
          setSelectedDesign(selDesign);
          storage.setItem(`@add_lastDesign_${activeFirmId}`, selDesign.id);
          if (selectedCategory && selectedCategory.metal !== selDesign.metal) {
            setSelectedCategory(null);
            storage.removeItem(`@add_lastCat_${activeFirmId}`);
          }
        }}
        onClose={() => setShowDesignModal(false)}
      />
      <SelectModal 
        visible={showCategoryModal} title="Select Category" searchPlaceholder="Search categories..."
        options={categories.filter(c => selectedDesign ? c.metal === selectedDesign.metal : true).map(c => ({ id: c.id, label: c.name, sublabel: c.metal }))}
        onSelect={(opt: any) => {
          const selCat = categories.find(c => c.id === opt.id)!;
          setSelectedCategory(selCat);
          storage.setItem(`@add_lastCat_${activeFirmId}`, selCat.id);
        }}
        onClose={() => setShowCategoryModal(false)}
      />
      <SelectModal 
        visible={showHsnModal} title="Select HSN Code" searchPlaceholder="Search HSN codes..."
        options={hsnCodes.map(h => ({ id: h.id, label: h.code, sublabel: h.description }))}
        onSelect={(opt: any) => {
          const selHsn = hsnCodes.find(h => h.id === opt.id)!;
          setSelectedHsn(selHsn);
          storage.setItem(`@add_lastHsn_${activeFirmId}`, selHsn.id);
        }}
        onClose={() => setShowHsnModal(false)}
      />
      <SelectModal 
        visible={showStoneModal} title="Select Primary Stone"
        options={[{ id: 'NONE', label: 'No Stone', sublabel: 'Clear selection' }, ...stones.map(s => ({ id: s.id, label: s.name, sublabel: s.type }))]}
        onSelect={(opt: any) => {
          if (opt.id === 'NONE') setSelectedStone(null);
          else setSelectedStone(stones.find(s => s.id === opt.id)!);
        }}
        onClose={() => setShowStoneModal(false)}
      />

      {/* NEW: Modern Success Modal */}
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
              {/* Uses your imported short-format logic */}
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
    color: 'rgba(46,29,0,0.6)',
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
    color: '#B87333',
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