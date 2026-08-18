import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassInput } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Edit2, CheckCircle, ShieldCheck, Tag } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { categoryService } from '@/services/phase2/categoryService';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function EditCategoryScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const { id, initialName, initialCode } = useLocalSearchParams<{ 
    id: string; 
    initialName?: string; 
    initialCode?: string;
  }>();
  
  const [newName, setNewName] = useState(initialName || '');
  const [categoryCode, setCategoryCode] = useState(initialCode || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ID-Driven Database Sync on Mount
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    categoryRepository.getById(id)
      .then((cat) => {
        if (isMounted && cat) {
          if (cat.name) setNewName(cat.name);
          if (cat.code) setCategoryCode(cat.code);
        }
      })
      .catch((err) => {
        console.error('[EditCategoryScreen] Failed to load category by id:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleEditSubmit = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!activeFirmId || !id) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Category name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await categoryService.updateCategory(id, activeFirmId, newName.trim());
      setSuccessMessage('Category updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
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

  const editCategoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {categoryCode ? (
        <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={categoryCode} variant="warning" />
      ) : null}
      <HeaderPill icon={<Edit2 size={12} color={colors.vjBg} />} label={newName || 'Category'} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Edit Category" showBack headerContent={editCategoryHeaderPills}>
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
            {categoryCode ? (
              <View style={s.formGroup}>
                <Text style={s.label}>Category Code (System ID)</Text>
                <View style={s.codeBox}>
                  <Tag size={14} color="#5C1623" style={{ marginRight: 6 }} />
                  <Text style={s.codeText}>{categoryCode}</Text>
                </View>
              </View>
            ) : null}

            <View style={s.formGroup}>
              <GlassInput 
                label="Category Name"
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Gold Rings"
              />
            </View>
          </View>
        </KeyboardAwareScrollView>
        <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16 }}>
          <GlassButton 
            title={isSubmitting ? 'Saving...' : 'Update Category'} 
            onPress={handleEditSubmit} 
            disabled={isSubmitting} 
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
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignSelf: 'flex-start',
  },
  codeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5C1623',
    letterSpacing: 0.5,
  },
});
