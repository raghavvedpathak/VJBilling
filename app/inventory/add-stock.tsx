import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, Modal, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { itemService } from '../../services/itemService';
import { designRepository } from '../../repositories/designRepository';
import { categoryRepository } from '../../repositories/categoryRepository';
import { hsnMasterRepository } from '../../repositories/hsnMasterRepository';
import type { Design, Category, HsnCode } from '../../types/phase2.types';
import { Package, Scale, Percent } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../db/client';
import { 
  categories as categoriesTable, 
  designs as designsTable, 
  designCategoryMap as designCategoryMapTable 
} from '../../db/schema';
import * as Crypto from 'expo-crypto';
import { now } from '../../utils/now';
import { seedHsnCodes } from '../../db/seed';

const SelectModal = ({ visible, title, options, onSelect, onClose, searchPlaceholder }: any) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = options.filter((opt: any) => 
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (opt.sublabel && opt.sublabel.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-vj-bg w-full rounded-t-3xl p-6" style={{ paddingBottom: Math.max(insets.bottom, 24), maxHeight: '85%' }}>
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

  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedHsn, setSelectedHsn] = useState<HsnCode | null>(null);

  const [grossWeight, setGrossWeight] = useState('');
  const [stoneWeight, setStoneWeight] = useState('');
  const [beadsWeight, setBeadsWeight] = useState('');
  const [purityPercent, setPurityPercent] = useState('');

  const [showDesignModal, setShowDesignModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showHsnModal, setShowHsnModal] = useState(false);

  const [loading, setLoading] = useState(false);

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
      setDesigns(d);
      setCategories(c);
      setHsnCodes(h);
    };
    loadData();
  }, [activeFirmId]);

  const computedKarat = useMemo(() => {
    const p = parseFloat(purityPercent);
    if (isNaN(p) || p <= 0) return '';
    const k = (p / 100) * 24;
    return `${k.toFixed(1).replace(/\.0$/, '')}K`;
  }, [purityPercent]);

  const seedDemoData = async () => {
    if (!activeFirmId) return;
    try {
      setLoading(true);
      await seedHsnCodes();
      
      const catId = Crypto.randomUUID();
      await db.insert(categoriesTable).values({
        id: catId,
        firmId: activeFirmId,
        name: 'Gold Rings',
        metal: 'GOLD',
        code: 'CAT0001',
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });
      
      const designId = Crypto.randomUUID();
      await db.insert(designsTable).values({
        id: designId,
        firmId: activeFirmId,
        name: 'Classic Band',
        metal: 'GOLD',
        code: 'DES0001',
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });

      await db.insert(designCategoryMapTable).values({
        id: Crypto.randomUUID(),
        designId: designId,
        categoryId: catId,
        firmId: activeFirmId,
        createdAt: now(),
      });

      const d = await designRepository.findByFirmId(activeFirmId);
      const c = await categoryRepository.findByFirmId(activeFirmId);
      const h = await hsnMasterRepository.findByChapter('71');
      setDesigns(d);
      setCategories(c);
      setHsnCodes(h);
      Alert.alert('Success', 'Demo classification data added!');
    } catch (e: any) {
      Alert.alert('Seed Error', e.message);
    } finally {
      setLoading(false);
    }
  };

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

    try {
      setLoading(true);
      const item = await itemService.createItem({
        designId: selectedDesign.id,
        categoryId: selectedCategory.id,
        hsnCode: selectedHsn.code,
        grossWeightMg: Math.round(gross * 1000),
        stoneWeightMg: Math.round(stone * 1000),
        beadsWeightMg: Math.round(beads * 1000),
        purityPercent: purity,
        purityKarat: computedKarat ? parseFloat(computedKarat) : 0,
        metalSource: 'SUPPLIER_PURCHASE',
      }, activeFirmId!);
      
      Alert.alert('Success', `Item added to drafts successfully.\n\nGenerated SKU: ${item.sku}`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoToneWrapper title="Add Stock" showBack>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Package size={20} color="#B87333" />
            <Text className="text-lg font-bold text-vj-text">Classification</Text>
          </View>
          
          {designs.length === 0 && (
            <View className="mb-4">
              <GlassButton title="Seed Demo Data" onPress={seedDemoData} variant="secondary" />
              <Text className="text-xs text-vj-text/60 mt-2 text-center">Click here to generate a demo Design, Category and HSN code so you can test the form.</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => setShowDesignModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">Design</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedDesign ? selectedDesign.name : 'Select Design...'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowCategoryModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">Category</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedCategory ? selectedCategory.name : 'Select Category...'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowHsnModal(true)} className="mb-4 bg-white/40 p-4 rounded-xl border border-white/20">
            <Text className="text-xs font-bold text-vj-text/60 uppercase mb-1">HSN Code</Text>
            <Text className="text-base font-semibold text-vj-text">{selectedHsn ? `${selectedHsn.code} - ${selectedHsn.description}` : 'Select HSN...'}</Text>
          </TouchableOpacity>
        </GlassCard>

        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4">
            <Scale size={20} color="#B87333" />
            <Text className="text-lg font-bold text-vj-text">Weights (Grams)</Text>
          </View>

          <GlassInput 
            label="Gross Weight (g)" 
            placeholder="0.000" 
            keyboardType="numeric" 
            value={grossWeight} 
            onChangeText={setGrossWeight} 
          />
          <GlassInput 
            label="Stone Weight (g)" 
            placeholder="0.000" 
            keyboardType="numeric" 
            value={stoneWeight} 
            onChangeText={setStoneWeight} 
          />
          <GlassInput 
            label="Beads Weight (g)" 
            placeholder="0.000" 
            keyboardType="numeric" 
            value={beadsWeight} 
            onChangeText={setBeadsWeight} 
          />
        </GlassCard>

        <GlassCard>
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center gap-2">
              <Percent size={20} color="#B87333" />
              <Text className="text-lg font-bold text-vj-text">Purity</Text>
            </View>
            {computedKarat ? (
              <View className="bg-vj-accent/10 px-3 py-1 rounded-full border border-vj-accent/20">
                <Text className="font-bold text-vj-accent text-sm">{computedKarat}</Text>
              </View>
            ) : null}
          </View>

          <GlassInput 
            label="Purity (%)" 
            placeholder="e.g. 91.6 for 22K" 
            keyboardType="numeric" 
            value={purityPercent} 
            onChangeText={setPurityPercent} 
          />
        </GlassCard>

        <GlassButton title="Create Item" onPress={handleSubmit} loading={loading} />

      </ScrollView>

      <SelectModal 
        visible={showDesignModal} 
        title="Select Design"
        searchPlaceholder="Search designs..."
        options={designs.map(d => ({ id: d.id, label: d.name, sublabel: d.metal }))}
        onSelect={(opt: any) => setSelectedDesign(designs.find(d => d.id === opt.id)!)}
        onClose={() => setShowDesignModal(false)}
      />
      <SelectModal 
        visible={showCategoryModal} 
        title="Select Category"
        searchPlaceholder="Search categories..."
        options={categories.map(c => ({ id: c.id, label: c.name, sublabel: c.metal }))}
        onSelect={(opt: any) => setSelectedCategory(categories.find(c => c.id === opt.id)!)}
        onClose={() => setShowCategoryModal(false)}
      />
      <SelectModal 
        visible={showHsnModal} 
        title="Select HSN Code"
        searchPlaceholder="Search HSN codes..."
        options={hsnCodes.map(h => ({ id: h.id, label: h.code, sublabel: h.description }))}
        onSelect={(opt: any) => setSelectedHsn(hsnCodes.find(h => h.id === opt.id)!)}
        onClose={() => setShowHsnModal(false)}
      />

    </TwoToneWrapper>
  );
}
