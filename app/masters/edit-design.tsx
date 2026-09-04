// app/masters/edit-design.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassInput, GlassMetalBadge, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Edit2, CheckCircle, ShieldCheck, Tag, Save, Barcode, Layers } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { designService } from '@/services/phase2/designService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function EditDesignScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  
  const params = useLocalSearchParams<{ 
    id: string; 
    initialName?: string; 
    initialMetal?: 'GOLD' | 'SILVER'; 
    initialCode?: string; 
    initialDefaultHsn?: string;
    initialStockType?: 'SERIALIZED' | 'LOOSE';
  }>();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialName = Array.isArray(params.initialName) ? params.initialName[0] : params.initialName;
  const initialMetal = Array.isArray(params.initialMetal) ? params.initialMetal[0] : params.initialMetal;
  const initialCode = Array.isArray(params.initialCode) ? params.initialCode[0] : params.initialCode;
  const initialDefaultHsn = Array.isArray(params.initialDefaultHsn) ? params.initialDefaultHsn[0] : params.initialDefaultHsn;
  const initialStockType = Array.isArray(params.initialStockType) ? params.initialStockType[0] : params.initialStockType;
  
  const [newName, setNewName] = useState(initialName || '');
  const [metal, setMetal] = useState<'GOLD' | 'SILVER'>(initialMetal || 'GOLD');
  const [designCode, setDesignCode] = useState(initialCode || '');
  const [defaultHsn, setDefaultHsn] = useState(initialDefaultHsn || '');
  const [stockType, setStockType] = useState<'SERIALIZED' | 'LOOSE'>(initialStockType || 'SERIALIZED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ID-Driven Database Sync on Mount
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    designRepository.getById(id)
      .then((d) => {
        if (isMounted && d) {
          if (d.name) setNewName(d.name);
          if (d.code) setDesignCode(d.code);
          if (d.metal) setMetal(d.metal);
          if (d.defaultHsn) setDefaultHsn(d.defaultHsn);
          if (d.stockType) setStockType(d.stockType as 'SERIALIZED' | 'LOOSE');
        }
      })
      .catch((err) => {
        console.error('[EditDesignScreen] Failed to load design by id:', err);
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
      Alert.alert('Validation Error', 'Design name is required.');
      return;
    }

    const words = trimmedName.split(/\s+/);
    if (words.length > 2) {
      Alert.alert('Validation Error', 'Design name should be 1 or 2 words only (e.g. "Classic Band", "Solitaire").');
      return;
    }

    setIsSubmitting(true);
    try {
      await designService.updateDesign(id, activeFirmId, { 
        name: trimmedName,
        defaultHsn: defaultHsn.trim() || null,
      });
      setSuccessMessage(`Design "${trimmedName}" updated successfully.`);
    } catch (e: any) {
      if (e.message?.includes('DESIGN_NAME_TAKEN') || e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate Design', `A design named "${trimmedName}" in ${metal} already exists.`);
      } else if (e.message === 'DESIGN_NAME_INVALID') {
        Alert.alert('Invalid Name', 'Design names cannot contain special characters and must be 1 or 2 words only.');
      } else {
        Alert.alert('Error', e.message || 'Failed to update design.');
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

  const editDesignHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {designCode ? (
        <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={designCode} variant="warning" />
      ) : null}
      <HeaderPill icon={<Edit2 size={12} color={colors.vjBg} />} label={newName || 'Design'} />
      <HeaderPill label={metal} variant={metal === 'GOLD' ? 'warning' : 'default'} />
      <HeaderPill 
        icon={stockType === 'LOOSE' ? <Layers size={12} color={colors.vjBg} /> : <Barcode size={12} color={colors.vjBg} />}
        label={stockType === 'LOOSE' ? 'Loose Stock' : 'Serialized'} 
      />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Edit Design" showBack headerContent={editDesignHeaderPills}>
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
            {designCode ? (
              <View style={s.formGroup}>
                <Text style={[s.label, { color: colors.vjText, opacity: 0.6 }]}>Design Code (System ID)</Text>
                <View style={[s.codeBox, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}30` }]}>
                  <Tag size={14} color={colors.vjAccent} style={{ marginRight: 6 }} />
                  <Text style={[s.codeText, { color: colors.vjText }]}>{designCode}</Text>
                </View>
              </View>
            ) : null}

            <View style={s.formGroup}>
              <GlassInput 
                label="Design Name *"
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
                autoCapitalize="words"
                maxLength={50}
              />
              <Text style={[s.helpText, { color: colors.vjText, opacity: 0.5 }]}>
                No special characters. Max 2 words.
              </Text>
            </View>

            {/* Metal Type (Immutable) */}
            <View style={s.formGroup}>
              <Text style={[s.label, { color: colors.vjText, opacity: 0.6 }]}>Metal Type (Immutable)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <GlassMetalBadge metal={metal} />
              </View>
            </View>

            {/* Stock Tracking Model (Immutable) */}
            <View style={s.formGroup}>
              <Text style={[s.label, { color: colors.vjText, opacity: 0.6 }]}>
                Stock Tracking Model (Immutable)
              </Text>
              <View 
                style={[
                  s.immutableStockBadge, 
                  { 
                    backgroundColor: `${colors.vjAccent}12`, 
                    borderColor: `${colors.vjAccent}30` 
                  }
                ]}
              >
                {stockType === 'LOOSE' ? (
                  <Layers size={16} color={colors.vjAccent} style={{ marginRight: 8 }} />
                ) : (
                  <Barcode size={16} color={colors.vjAccent} style={{ marginRight: 8 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.immutableStockTitle, { color: colors.vjText }]}>
                    {stockType === 'LOOSE' ? 'Loose Stock' : 'Serialized Inventory'}
                  </Text>
                  <Text style={[s.immutableStockSubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                    {stockType === 'LOOSE' 
                      ? 'Aggregated bulk lot weights without individual barcode tags' 
                      : 'Individual items tracked with SKUs, barcodes, and HUID'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.formGroup}>
              <GlassInput 
                label="Default HSN Code (Optional)"
                value={defaultHsn}
                onChangeText={setDefaultHsn}
                placeholder="e.g. 7113"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
          </View>
        </KeyboardAwareScrollView>

        <FixedGlassBar>
          <TouchableOpacity
            testID="cancel-edit-design-btn"
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
            testID="save-edit-design-btn"
            style={[fixedBarStyles.pillPrimaryBtn, { backgroundColor: colors.vjAccent }]}
            onPress={handleEditSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Save size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Update Design</Text>
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
  formGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  helpText: { fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  immutableStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  immutableStockTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  immutableStockSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
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
