// app/masters/create-stone.tsx — Phase 2 v2.34 Canonical Screen
// Aligned with Step 4.5, Step 16, and MastersSyncStore

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import {
  HeaderPill,
  GlassCard,
  GlassButton,
  GlassInput,
  FixedGlassBar,
  fixedBarStyles,
} from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Gem, CheckCircle, ShieldCheck, Plus, Check } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { stoneService } from '@/services/phase2/stoneService';
import type { StoneType } from '@/types/phase2/phase2.types';
import { getThemeColors } from '@/constants/theme';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';

const STONE_TYPES: {
  type: StoneType;
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    type: 'DIAMOND',
    label: 'Diamond',
    icon: '💎',
    color: '#0284C7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.35)',
  },
  {
    type: 'RUBY',
    label: 'Ruby',
    icon: '🔴',
    color: '#DC2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.35)',
  },
  {
    type: 'EMERALD',
    label: 'Emerald',
    icon: '🟢',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.35)',
  },
  {
    type: 'SAPPHIRE',
    label: 'Sapphire',
    icon: '🔵',
    color: '#2563EB',
    bg: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.35)',
  },
];

export default function CreateStoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { activeFirmId } = useFirmStore();

  const [newName, setNewName] = useState('');
  const [selectedType, setSelectedType] = useState<StoneType>('DIAMOND');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const handleAdd = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    if (!activeFirmId) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Stone name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await stoneService.createStone(
        {
          name: trimmedName,
          type: selectedType,
        },
        activeFirmId
      );

      setSuccessMessage(`Stone "${trimmedName}" created successfully.`);
    } catch (e: any) {
      if (e.message?.includes('STONE_NAME_DUPLICATE') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate Stone', `A stone named "${trimmedName}" already exists.`);
      } else {
        Alert.alert('Error', e.message || 'Failed to create stone.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessDone = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSuccessMessage(null);
    router.back();
  };

  const createStoneHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Gem size={12} color={colors.vjBg} />} label="Stone Definition" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="New Stone Type" showBack headerContent={createStoneHeaderPills}>
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
                <JewelryMonogramEmblem designName={newName.trim() || 'New Stone'} categoryName="Stone" size={56} />
                <Text style={[s.previewText, { color: colors.vjText }]}>
                  {newName.trim() ? `Preview: ${newName.trim()}` : 'Live Stone Badge Preview'}
                </Text>
              </View>

              {/* Stone Name Input */}
              <View style={s.formGroup}>
                <GlassInput
                  label="Stone Name *"
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Solitaire Diamond, Burmese Ruby, Blue Sapphire"
                  autoCapitalize="words"
                  maxLength={50}
                />
              </View>

              {/* Stone Category Selector */}
              <View style={s.typeSection}>
                <Text style={[s.typeSectionLabel, { color: colors.vjText }]}>Stone Category *</Text>
                <View style={s.typeGrid}>
                  {STONE_TYPES.map((st) => {
                    const isSelected = selectedType === st.type;
                    return (
                      <TouchableOpacity
                        key={st.type}
                        onPress={() => {
                          try {
                            Haptics.selectionAsync();
                          } catch {}
                          setSelectedType(st.type);
                        }}
                        activeOpacity={0.75}
                        style={[
                          s.typeCard,
                          {
                            backgroundColor: isSelected ? st.bg : 'rgba(255, 255, 255, 0.65)',
                            borderColor: isSelected ? st.color : `${colors.vjAccent}25`,
                          },
                        ]}
                      >
                        <View style={s.typeCardHeader}>
                          <Text style={{ fontSize: 20 }}>{st.icon}</Text>
                          {isSelected && (
                            <View style={[s.typeCheckmark, { backgroundColor: st.color }]}>
                              <Check size={11} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            s.typeLabel,
                            {
                              color: isSelected ? st.color : colors.vjText,
                              fontWeight: isSelected ? '800' : '700',
                            },
                          ]}
                        >
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </GlassCard>
          </View>
        </KeyboardAwareScrollView>

        {/* Bottom Symmetrical Action Bar */}
        <FixedGlassBar>
          <View style={[{ width: '100%', flexDirection: 'row', gap: 12 }, isTablet && { maxWidth: 600, alignSelf: 'center' }]}>
            <TouchableOpacity
              testID="cancel-stone-btn"
              style={[fixedBarStyles.pillSecondaryBtn, { flex: 1, flexBasis: 0 }]}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {}
                router.back();
              }}
              disabled={isSubmitting}
            >
              <Text style={[fixedBarStyles.pillSecondaryText, { color: colors.vjText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="save-stone-btn"
              style={[
                fixedBarStyles.pillPrimaryBtn,
                { flex: 1, flexBasis: 0, backgroundColor: colors.vjAccent },
                (!newName.trim() || isSubmitting) && { opacity: 0.5 },
              ]}
              onPress={handleAdd}
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Plus size={18} color="#fff" />
                  <Text style={fixedBarStyles.pillPrimaryText}>Save Stone Type</Text>
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
                borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : colors.border,
              },
            ]}
          >
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Success!</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{successMessage}</Text>

            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Done" onPress={handleSuccessDone} />
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
  formGroup: { marginBottom: 16 },
  typeSection: { marginTop: 4, marginBottom: 8 },
  typeSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    opacity: 0.7,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: '48%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  typeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeCheckmark: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
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
