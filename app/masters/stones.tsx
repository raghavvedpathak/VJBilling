// app/masters/stones.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { Gem, Plus, X, Trash2, Edit3, LayoutGrid, List as ListIcon, CheckCircle, ShieldCheck } from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { stoneRepository } from '@/repositories/phase2/stoneRepository';
import { stoneService } from '@/services/phase2/stoneService';
import type { Stone } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

type StoneType = 'DIAMOND' | 'RUBY' | 'EMERALD' | 'SAPPHIRE';
const STONE_TYPES: StoneType[] = ['DIAMOND', 'RUBY', 'EMERALD', 'SAPPHIRE'];

export default function StonesScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const { activeFirmId } = useFirmStore();
  
  const [stones, setStones] = useState<Stone[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StoneType>('DIAMOND');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStone, setEditingStone] = useState<Stone | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<StoneType>('DIAMOND');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadStones = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await stoneRepository.findByFirmId(activeFirmId);
      setStones(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadStones();
    }, [loadStones])
  );

  const handleAdd = async () => {
    if (!activeFirmId) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Stone name is required');
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    
    setIsSubmitting(true);
    try {
      await stoneService.createStone({
        name: newName.trim(),
        type: newType,
      }, activeFirmId);
      
      setShowAddModal(false);
      setNewName('');
      setNewType('DIAMOND');
      loadStones();
      setSuccessMessage('Stone added to Master successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (s: Stone) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setEditingStone(s);
    setEditName(s.name);
    setEditType(s.type as StoneType);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!activeFirmId || !editingStone) return;
    if (!editName.trim()) {
      Alert.alert('Validation Error', 'Stone name is required');
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    
    setIsSubmitting(true);
    try {
      await stoneService.updateStone(editingStone.id, {
        name: editName.trim(),
        type: editType,
      }, activeFirmId);
      
      setShowEditModal(false);
      setEditingStone(null);
      loadStones();
      setSuccessMessage('Stone updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (s: Stone) => {
    if (!activeFirmId) return;
    Alert.alert('Confirm Delete', `Are you sure you want to remove ${s.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await stoneService.softDeleteStone(s.id, activeFirmId);
            setSuccessMessage('Stone removed');
            loadStones();
          } catch (e: any) {
            Alert.alert('Cannot Delete Stone', e.message);
          }
        }
      }
    ]);
  };

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const stoneHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Gem size={12} color={colors.vjBg} />} label={`${stones.length} Active Materials`} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Precious Stones Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Stone Master" showBack headerContent={stoneHeaderPills}>
      <View style={s.container}>
        <View style={s.controlsRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <GlassButton title="Add Stone Type" onPress={() => setShowAddModal(true)} icon={<Plus size={18} color="#fff" />} />
          </View>
          <View style={s.toggleContainer}>
            <TouchableOpacity onPress={() => setViewMode('list')} style={[s.toggleIconBtn, viewMode === 'list' && s.toggleIconActive]}>
              <ListIcon size={20} color={viewMode === 'list' ? '#D4AF37' : COLORS.vjText} style={{ opacity: viewMode === 'list' ? 1 : 0.6 }} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('grid')} style={[s.toggleIconBtn, viewMode === 'grid' && s.toggleIconActive]}>
              <LayoutGrid size={20} color={viewMode === 'grid' ? '#D4AF37' : COLORS.vjText} style={{ opacity: viewMode === 'grid' ? 1 : 0.6 }} />
            </TouchableOpacity>
          </View>
        </View>
        
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView 
            style={{ marginTop: 8 }} 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={[
              { paddingBottom: 100 },
              viewMode === 'grid' && { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }
            ]}
          >
            {stones.map((stone) => {
              const stoneColors = {
                DIAMOND: { bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.35)', text: '#0891B2' },
                RUBY: { bg: 'rgba(225,29,72,0.15)', border: 'rgba(225,29,72,0.35)', text: '#E11D48' },
                EMERALD: { bg: 'rgba(5,150,105,0.15)', border: 'rgba(5,150,105,0.35)', text: '#059669' },
                SAPPHIRE: { bg: 'rgba(37,99,235,0.15)', border: 'rgba(37,99,235,0.35)', text: '#2563EB' },
              }[stone.type as StoneType] || { bg: 'rgba(92,22,35,0.1)', border: 'rgba(92,22,35,0.2)', text: COLORS.vjText };

              return (
                <GlassCard key={stone.id} style={[s.card, viewMode === 'grid' ? s.cardGrid : s.cardList]}>
                  <View style={viewMode === 'grid' ? s.cardTopGrid : s.cardTopList}>
                    <Text style={s.rowTitle} numberOfLines={1}>{stone.name}</Text>
                    <View style={[s.stoneTypeBadge, { backgroundColor: stoneColors.bg, borderColor: stoneColors.border }]}>
                      <Text style={[s.stoneTypeText, { color: stoneColors.text }]}>{stone.type}</Text>
                    </View>
                  </View>
                  <View style={viewMode === 'grid' ? s.cardBottomGrid : s.cardBottomList}>
                    <View style={s.actionRow}>
                      <TouchableOpacity onPress={() => handleOpenEdit(stone)} style={[s.actionBtn, { marginRight: 8 }]}>
                        <Edit3 size={16} color={colors.vjAccent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(stone)} style={s.actionBtn}>
                        <Trash2 size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ADD STONE MODAL */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
          <View 
            style={{ 
              backgroundColor: COLORS.vjBg, 
              width: '100%', 
              maxWidth: isTablet ? 540 : 420, 
              borderRadius: 24, 
              padding: 20, 
              maxHeight: height * 0.85, 
              borderWidth: 1.5, 
              borderColor: 'rgba(255,255,255,0.6)', 
              elevation: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25,
              shadowRadius: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.vjText }}>New Stone Type</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={{ padding: 6, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999 }}>
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>
            
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.formGroup}>
                <Text style={s.label}>Stone Name</Text>
                <TextInput 
                  style={s.input}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. VS1 Round Diamond"
                  placeholderTextColor="rgba(92,22,35,0.4)"
                />
              </View>

              <View style={s.formGroup}>
                <Text style={s.label}>Base Type</Text>
                <View style={s.typeGrid}>
                  {STONE_TYPES.map((type) => (
                    <TouchableOpacity 
                      key={type}
                      style={[s.typeBtn, newType === type && s.typeBtnActive]}
                      onPress={() => setNewType(type)}
                    >
                      <Text style={[s.typeText, newType === type && s.typeTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 24, marginBottom: 8 }}>
                <GlassButton 
                  title={isSubmitting ? 'Saving...' : 'Save Stone'} 
                  onPress={handleAdd} 
                  disabled={isSubmitting} 
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT STONE MODAL */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
          <View 
            style={{ 
              backgroundColor: COLORS.vjBg, 
              width: '100%', 
              maxWidth: isTablet ? 540 : 420, 
              borderRadius: 24, 
              padding: 20, 
              maxHeight: height * 0.85, 
              borderWidth: 1.5, 
              borderColor: 'rgba(255,255,255,0.6)', 
              elevation: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25,
              shadowRadius: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.vjText }}>Edit Stone Master</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 6, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999 }}>
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>
            
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.formGroup}>
                <Text style={s.label}>Stone Name</Text>
                <TextInput 
                  style={s.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. VS1 Round Diamond"
                  placeholderTextColor="rgba(92,22,35,0.4)"
                />
              </View>

              <View style={s.formGroup}>
                <Text style={s.label}>Base Type</Text>
                <View style={s.typeGrid}>
                  {STONE_TYPES.map((type) => (
                    <TouchableOpacity 
                      key={type}
                      style={[s.typeBtn, editType === type && s.typeBtnActive]}
                      onPress={() => setEditType(type)}
                    >
                      <Text style={[s.typeText, editType === type && s.typeTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 24, marginBottom: 8 }}>
                <GlassButton 
                  title={isSubmitting ? 'Updating...' : 'Update Stone'} 
                  onPress={handleSaveEdit} 
                  disabled={isSubmitting} 
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                onPress={() => setSuccessMessage(null)} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 },
  toggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(92,22,35,0.05)', borderRadius: 12, padding: 4 },
  toggleIconBtn: { padding: 8, borderRadius: 8 },
  toggleIconActive: { backgroundColor: '#fff' },
  
  card: { paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 },
  cardList: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  cardGrid: { flexDirection: 'column', alignItems: 'flex-start', width: '48%' },
  cardTopList: { flex: 1, paddingRight: 8 },
  cardTopGrid: { marginBottom: 12, width: '100%' },
  cardBottomList: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardBottomGrid: { flexDirection: 'row', width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  
  rowTitle: { color: COLORS.vjText, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  stoneTypeBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(184,115,51,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(184,115,51,0.2)' },
  stoneTypeText: { color: COLORS.vjAccent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 8 },
  
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.vjText, opacity: 0.7, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: COLORS.border },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { width: '48%', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#fff' },
  typeBtnActive: { backgroundColor: COLORS.vjAccent, borderColor: COLORS.vjAccent },
  typeText: { fontSize: 13, fontWeight: '700', color: COLORS.vjText, opacity: 0.7 },
  typeTextActive: { color: '#fff' },

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
    color: COLORS.vjText,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
  },
});