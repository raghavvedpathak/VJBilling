// app/masters/create-design.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassSmartSearch, GlassMetalSelector } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Tag, CheckCircle, ShieldCheck } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { designService } from '@/services/phase2/designService';
import type { Category } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function CreateDesignScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [newName, setNewName] = useState('');
  const [newMetal, setNewMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const results = await categoryRepository.findByFirmId(activeFirmId);
      setCategories(results);
    } catch (e) {
      console.error('[CreateDesignScreen] loadCategories failed:', e);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const handleAdd = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!activeFirmId) return;
    if (!newName.trim() || !selectedCategoryId) {
      Alert.alert('Validation Error', 'Name and Category are required');
      return;
    }
    
    const thresholdNum = lowStockThreshold.trim() !== '' ? parseInt(lowStockThreshold, 10) : null;

    setIsSubmitting(true);
    try {
      await designService.createDesign({
        name: newName.trim(),
        metal: newMetal,
        categoryId: selectedCategoryId,
        lowStockThreshold: thresholdNum && !isNaN(thresholdNum) && thresholdNum > 0 ? thresholdNum : null
      }, activeFirmId);
      
      setSuccessMessage('Design added successfully');
    } catch (e: any) {
      if (e.message?.includes('DESIGN_NAME_TAKEN') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A design with this name/metal already exists.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessDone = () => {
    setSuccessMessage(null);
    router.back();
  };

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const createDesignHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label="Design Pattern" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Category Linked" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="New Design" showBack headerContent={createDesignHeaderPills}>
      <View style={{ flex: 1 }}>
        <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 350 }} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <View style={s.formGroup}>
              <Text style={s.label}>Design Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
              />
            </View>

            <GlassMetalSelector
              selectedMetal={newMetal}
              onSelectMetal={(m) => {
                setNewMetal(m);
                setSelectedCategoryId('');
              }}
            />

            <View style={[s.formGroup, { zIndex: 50 }]}>
              <GlassSmartSearch
                label="Link to Category"
                placeholder="Search categories..."
                options={categories.map(c => ({
                  id: c.id,
                  label: c.name,
                  sublabel: c.code ? `Code: ${c.code}` : ''
                }))}
                selectedId={selectedCategoryId}
                onSelect={(option) => {
                  setSelectedCategoryId(option ? option.id : '');
                }}
              />
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Low-Stock Alert Threshold (Count)</Text>
              <TextInput 
                style={s.input}
                value={lowStockThreshold}
                onChangeText={setLowStockThreshold}
                placeholder="e.g. 5 (Optional - alert when stock <= this)"
                keyboardType="numeric"
              />
            </View>

          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 }}>
          <GlassButton 
            title={isSubmitting ? 'Saving...' : 'Save Design'} 
            onPress={handleAdd} 
            disabled={isSubmitting || !selectedCategoryId} 
          />
        </View>
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
                onPress={handleSuccessDone} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  formGroup: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)' },
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
  linkBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  linkBadgeText: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});