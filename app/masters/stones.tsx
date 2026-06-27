// app/masters/stones.tsx
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { Gem, Plus, X, Trash2, LayoutGrid, List as ListIcon, CheckCircle } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { stoneService } from '../../services/stoneService';
import { stoneRepository } from '../../repositories/stoneRepository';
import { db } from '../../db/client';
import type { Stone } from '../../types/phase2.types';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
};

type StoneType = 'DIAMOND' | 'RUBY' | 'EMERALD' | 'SAPPHIRE';
const STONE_TYPES: StoneType[] = ['DIAMOND', 'RUBY', 'EMERALD', 'SAPPHIRE'];

export default function StonesScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [stones, setStones] = useState<Stone[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StoneType>('DIAMOND');
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

  const handleDelete = (s: Stone) => {
    if (!activeFirmId) return;
    Alert.alert('Confirm Delete', `Are you sure you want to remove ${s.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await db.transaction(async (tx) => {
              await stoneRepository.softDelete(tx, s.id, activeFirmId);
            });
            setSuccessMessage('Stone removed');
            loadStones();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      }
    ]);
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Gem size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>Stone Master</Text>
      <Text style={s.headerSubtitle}>{stones.length} Active Materials</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.container}>
        <View style={s.controlsRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <GlassButton title="Add Stone Type" onPress={() => setShowAddModal(true)} icon={<Plus size={18} color="#fff" />} />
          </View>
          <View style={s.toggleContainer}>
            <TouchableOpacity onPress={() => setViewMode('list')} style={[s.toggleIconBtn, viewMode === 'list' && s.toggleIconActive]}>
              <ListIcon size={20} color={viewMode === 'list' ? '#D4AF37' : 'rgba(92,22,35,0.4)'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('grid')} style={[s.toggleIconBtn, viewMode === 'grid' && s.toggleIconActive]}>
              <LayoutGrid size={20} color={viewMode === 'grid' ? '#D4AF37' : 'rgba(92,22,35,0.4)'} />
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
            {stones.map((stone) => (
              <GlassCard key={stone.id} style={[s.card, viewMode === 'grid' ? s.cardGrid : s.cardList]}>
                <View style={viewMode === 'grid' ? s.cardTopGrid : s.cardTopList}>
                  <Text style={s.rowTitle} numberOfLines={1}>{stone.name}</Text>
                  <View style={s.stoneTypeBadge}>
                    <Text style={s.stoneTypeText}>{stone.type}</Text>
                  </View>
                </View>
                <View style={viewMode === 'grid' ? s.cardBottomGrid : s.cardBottomList}>
                  <View style={s.actionRow}>
                    <TouchableOpacity onPress={() => handleDelete(stone)} style={s.actionBtn}>
                      <Trash2 size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={showAddModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-vj-bg w-full max-w-[500px] rounded-3xl p-6 shadow-2xl border border-white/50" style={{ maxHeight: '80%' }}>
            <View className="flex-row justify-between items-center mb-6 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">New Stone Type</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#5C1623" />
              </TouchableOpacity>
            </View>
            
            <View style={s.formGroup}>
              <Text style={s.label}>Stone Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. VS1 Round Diamond"
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

            <View style={{ marginTop: 24 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Save Stone'} 
                onPress={handleAdd} 
                disabled={isSubmitting} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modern Success Modal */}
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
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
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
  actionBtn: { padding: 8, backgroundColor: 'rgba(92,22,35,0.05)', borderRadius: 8 },
  
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { width: '48%', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center', backgroundColor: '#fff' },
  typeBtnActive: { backgroundColor: COLORS.vjAccent, borderColor: COLORS.vjAccent },
  typeText: { fontSize: 13, fontWeight: '700', color: 'rgba(92,22,35,0.6)' },
  typeTextActive: { color: '#fff' },

  // Success Modal Styles
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