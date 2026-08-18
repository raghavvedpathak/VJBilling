import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton, GlassInput, GlassMetalBadge } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Edit2, CheckCircle, ShieldCheck, Tag } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { designService } from '@/services/phase2/designService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function EditDesignScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const { id, initialName, initialMetal, initialThreshold, initialCode } = useLocalSearchParams<{ 
    id: string; 
    initialName?: string; 
    initialMetal?: 'GOLD' | 'SILVER'; 
    initialThreshold?: string;
    initialCode?: string;
  }>();
  
  const [newName, setNewName] = useState(initialName || '');
  const [metal, setMetal] = useState<'GOLD' | 'SILVER'>(initialMetal || 'GOLD');
  const [designCode, setDesignCode] = useState(initialCode || '');
  const [lowStockThreshold, setLowStockThreshold] = useState(initialThreshold || '');
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
          if (d.lowStockThreshold !== undefined) {
            setLowStockThreshold(d.lowStockThreshold != null ? String(d.lowStockThreshold) : '');
          }
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!activeFirmId || !id) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Design name is required');
      return;
    }
    const thresholdNum = lowStockThreshold.trim() !== '' ? parseInt(lowStockThreshold, 10) : null;
    const finalThreshold = thresholdNum && !isNaN(thresholdNum) && thresholdNum > 0 ? thresholdNum : null;

    setIsSubmitting(true);
    try {
      await designService.updateDesign(id, activeFirmId, { name: newName.trim(), lowStockThreshold: finalThreshold });
      setSuccessMessage('Design updated successfully');
    } catch (e: any) {
      if (e.message === 'DESIGN_NAME_INVALID') {
        Alert.alert('Invalid Name', 'Design names cannot contain special characters and must be 1 or 2 words only.');
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

  const editDesignHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {designCode ? (
        <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={designCode} variant="warning" />
      ) : null}
      <HeaderPill icon={<Edit2 size={12} color={colors.vjBg} />} label={newName || 'Design'} />
      <HeaderPill label={metal} variant={metal === 'GOLD' ? 'warning' : 'default'} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Edit Design" showBack headerContent={editDesignHeaderPills}>
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
            {designCode ? (
              <View style={s.formGroup}>
                <Text style={s.label}>Design Code (System ID)</Text>
                <View style={s.codeBox}>
                  <Tag size={14} color="#5C1623" style={{ marginRight: 6 }} />
                  <Text style={s.codeText}>{designCode}</Text>
                </View>
              </View>
            ) : null}

            <View style={s.formGroup}>
              <GlassInput 
                label="Design Name"
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
              />
              <Text style={s.helpText}>No special characters. Max 2 words.</Text>
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Metal Type (Immutable)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <GlassMetalBadge metal={metal} />
              </View>
            </View>

            <View style={s.formGroup}>
              <GlassInput 
                label="Low-Stock Alert Threshold (Count)"
                value={lowStockThreshold}
                onChangeText={setLowStockThreshold}
                placeholder="e.g. 5 (Leave blank to remove alert)"
                keyboardType="numeric"
              />
            </View>
          </View>
        </KeyboardAwareScrollView>
        <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16 }}>
          <GlassButton 
            title={isSubmitting ? 'Saving...' : 'Update Design'} 
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
  helpText: { fontSize: 10, color: 'rgba(92,22,35,0.5)', marginTop: 4, fontStyle: 'italic' },
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
