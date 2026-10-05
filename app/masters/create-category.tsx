// app/masters/create-category.tsx — Phase 2 v2.34 Canonical Screen
// Aligned with Step 3.5, Step 16, and MastersSyncStore

import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton, GlassInput, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Layers, CheckCircle, ShieldCheck, Plus } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { categoryService } from '@/services/phase2/categoryService';
import { getThemeColors } from '@/constants/theme';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';

export default function CreateCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { activeFirmId } = useFirmStore();
  
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const handleAdd = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!activeFirmId) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Category name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await categoryService.createCategory({
        name: trimmedName,
      }, activeFirmId);
      
      setSuccessMessage(`Category "${trimmedName}" created successfully.`);
    } catch (e: any) {
      if (e.message?.includes('CATEGORY_NAME_DUPLICATE') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate Category', 'A category with this name already exists in your firm.');
      } else {
        Alert.alert('Error', e.message || 'Failed to create category.');
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

  const createCategoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Layers size={12} color={colors.vjBg} />} label="Category Definition" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="New Category" showBack headerContent={createCategoryHeaderPills}>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView 
          style={s.container} 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ 
            paddingTop: 24, 
            paddingBottom: Math.max(insets.bottom + 120, 160),
            alignItems: isTablet ? 'center' : undefined,
          }} 
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
        >
          <View style={[{ width: '100%' }, isTablet && { maxWidth: 680 }]}>
            <GlassCard style={{ padding: 24, marginBottom: 16, borderColor: `${colors.vjAccent}25` }}>
              {/* Real-time Monogram Preview */}
              <View style={s.previewContainer}>
                <JewelryMonogramEmblem categoryName={newName.trim() || 'New Category'} size={56} />
                <Text style={[s.previewText, { color: colors.vjText }]}>
                  {newName.trim() ? `Preview: ${newName.trim()}` : 'Live Monogram Badge Preview'}
                </Text>
              </View>

              <View style={s.formGroup}>
                <GlassInput 
                  label="Category Name *"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Rings, Chains, Necklaces"
                  autoCapitalize="words"
                  maxLength={50}
                />
              </View>
            </GlassCard>
          </View>
        </KeyboardAwareScrollView>

        <FixedGlassBar>
          <View style={[{ width: '100%', flexDirection: 'row', gap: 12 }, isTablet && { maxWidth: 600, alignSelf: 'center' }]}>
            <TouchableOpacity
              testID="cancel-category-btn"
              style={[fixedBarStyles.pillSecondaryBtn, { flex: 1 }]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.back();
              }}
              disabled={isSubmitting}
            >
              <Text style={[fixedBarStyles.pillSecondaryText, { color: colors.vjText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="save-category-btn"
              style={[
                fixedBarStyles.pillPrimaryBtn, 
                { flex: 1, backgroundColor: colors.vjAccent },
                (!newName.trim() || isSubmitting) && { opacity: 0.5 }
              ]}
              onPress={handleAdd}
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Plus size={18} color="#fff" />
                  <Text style={fixedBarStyles.pillPrimaryText}>Save Category</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </FixedGlassBar>
      </View>

      {/* Success Modal */}
      <Modal visible={!!successMessage} transparent animationType="fade" onRequestClose={handleSuccessDone}>
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={handleSuccessDone}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[
              s.successModalContent, 
              { 
                backgroundColor: isDark ? '#1C1418' : colors.vjBg, 
                borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : colors.border 
              }
            ]}
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
  container: { flex: 1 },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewText: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 8,
    opacity: 0.65,
  },
  formGroup: { marginBottom: 4 },
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
});
