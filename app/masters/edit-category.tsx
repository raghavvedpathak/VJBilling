// app/masters/edit-category.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Edit2, CheckCircle, ShieldCheck, Tag, Save } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { categoryService } from '@/services/phase2/categoryService';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function EditCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  
  const params = useLocalSearchParams<{ 
    id: string; 
    initialName?: string; 
    initialCode?: string;
  }>();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialName = Array.isArray(params.initialName) ? params.initialName[0] : params.initialName;
  const initialCode = Array.isArray(params.initialCode) ? params.initialCode[0] : params.initialCode;
  
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId || !id) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Category name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await categoryService.updateCategory(id, activeFirmId, trimmedName);
      setSuccessMessage(`Category "${trimmedName}" updated successfully.`);
    } catch (e: any) {
      if (e.message?.includes('CATEGORY_NAME_DUPLICATE') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate Category', 'A category with this name already exists in your firm.');
      } else {
        Alert.alert('Error', e.message || 'Failed to update category.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessDone = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
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
          contentContainerStyle={{ 
            paddingTop: 32, 
            paddingBottom: Math.max(insets.bottom + 120, 160) 
          }} 
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
        >
          <View style={[s.card, { borderColor: `${colors.vjAccent}25` }]}>
            {categoryCode ? (
              <View style={s.formGroup}>
                <Text style={[s.label, { color: colors.vjText, opacity: 0.6 }]}>Category Code (System ID)</Text>
                <View style={[s.codeBox, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}30` }]}>
                  <Tag size={14} color={colors.vjAccent} style={{ marginRight: 6 }} />
                  <Text style={[s.codeText, { color: colors.vjText }]}>{categoryCode}</Text>
                </View>
              </View>
            ) : null}

            <View style={s.formGroup}>
              <GlassInput 
                label="Category Name *"
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Gold Rings"
                autoCapitalize="words"
                maxLength={50}
              />
            </View>
          </View>
        </KeyboardAwareScrollView>

        <FixedGlassBar>
          <TouchableOpacity
            testID="cancel-edit-category-btn"
            style={fixedBarStyles.pillSecondaryBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.back();
            }}
            disabled={isSubmitting}
          >
            <Text style={[fixedBarStyles.pillSecondaryText, { color: colors.vjText }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="save-edit-category-btn"
            style={[fixedBarStyles.pillPrimaryBtn, { backgroundColor: colors.vjAccent }]}
            onPress={handleEditSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Save size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Update Category</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

      {/* SUCCESS MODAL */}
      <Modal visible={!!successMessage} transparent animationType="fade" onRequestClose={handleSuccessDone}>
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={handleSuccessDone}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Success!</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{successMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={handleSuccessDone} 
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
  },
  formGroup: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
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
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  codeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
});
