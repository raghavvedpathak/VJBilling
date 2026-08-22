// app/masters/create-design.tsx — Phase 2 v2.15 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassInput, GlassPickerInput, GlassMetalSelector, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { GlassPickerModal, GlassPickerOption } from '@/components/ui/GlassPickerModal';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Tag, CheckCircle, ShieldCheck, Plus } from 'lucide-react-native';
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
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId) return;
    if (!newName.trim() || !selectedCategoryId) {
      Alert.alert('Validation Error', 'Name and Category are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await designService.createDesign({
        name: newName.trim(),
        metal: newMetal,
        categoryId: selectedCategoryId,
      }, activeFirmId);
      
      setSuccessMessage('Design added successfully');
    } catch (e: any) {
      if (e.message?.includes('DESIGN_NAME_TAKEN') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A design with this name and metal already exists.');
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
        <KeyboardAwareScrollView 
          style={s.container} 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingTop: 32, paddingBottom: 190 }} 
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
        >
          <View style={s.card}>
            <View style={s.formGroup}>
              <GlassInput 
                label="Design Name * (1 or 2 words only)"
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

            <GlassPickerInput
              label="Link to Category *"
              placeholder="Search categories..."
              selectedLabel={categories.find(c => c.id === selectedCategoryId)?.name || null}
              selectedSublabel={
                categories.find(c => c.id === selectedCategoryId)?.code
                  ? `Code: ${categories.find(c => c.id === selectedCategoryId)?.code}`
                  : null
              }
              onPress={() => {
                setPickerModal({
                  visible: true,
                  title: 'Select Category',
                  placeholder: 'Search category...',
                  selectedId: selectedCategoryId || null,
                  options: categories.map(c => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.code ? `Code: ${c.code}` : undefined,
                  })),
                  onSelect: (opt) => {
                    setSelectedCategoryId(opt ? opt.id : '');
                  },
                });
              }}
            />
          </View>
        </KeyboardAwareScrollView>

        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillSecondaryBtn}
            onPress={() => router.back()}
            disabled={isSubmitting}
          >
            <Text style={fixedBarStyles.pillSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[fixedBarStyles.pillPrimaryBtn, (!selectedCategoryId || isSubmitting) && { opacity: 0.5 }]}
            onPress={handleAdd}
            disabled={isSubmitting || !selectedCategoryId}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Plus size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Save Design</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
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
  container: { flex: 1, paddingTop: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  formGroup: { marginBottom: 20 },
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