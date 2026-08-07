/* eslint-disable no-restricted-imports */
import { db } from '../../db/client';
import { categories as categoriesTable } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '../../components/ui/Glass';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { Layers, Plus, X, Edit2, Trash2, LayoutGrid, List as ListIcon, CheckCircle, ShieldCheck } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { categoryService } from '../../services/categoryService';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';

import { COLORS, getThemeColors } from '../../constants/theme';

type Category = typeof categoriesTable.$inferSelect;

export default function CategoriesScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // FIXED: Bulletproof AsyncStorage for View Mode
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    AsyncStorage.getItem('categoryViewMode').then((mode) => {
      if (mode === 'grid' || mode === 'list') {
        setViewModeState(mode);
      }
    });
  }, []);

  const setViewMode = (mode: 'list' | 'grid') => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setViewModeState(mode);
    AsyncStorage.setItem('categoryViewMode', mode);
  };
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await db
        .select()
        .from(categoriesTable)
        .where(and(eq(categoriesTable.firmId, activeFirmId), eq(categoriesTable.isActive, 1)));
      setCategories(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );
  
  const handleDelete = (cat: Category) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setConfirmDelete(cat);
  };

  const openEdit = (cat: Category) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    router.push({ 
      pathname: '/masters/edit-category', 
      params: { 
        id: cat.id, 
        initialName: cat.name,
      } 
    });
  };

  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const categoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Layers size={12} color={colors.vjBg} />} label={`${categories.length} Product Categories`} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Gold & Silver Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Category Master" showBack headerContent={categoryHeaderPills}>
      <View style={s.container}>
        <View style={s.controlsRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <GlassButton title="Create Category" onPress={() => router.push('/masters/create-category')} icon={<Plus size={18} color="#fff" />} />
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
            style={{ flex: 1, marginTop: 8 }} 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={[
              { paddingBottom: 150 },
              viewMode === 'grid' && { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }
            ]}
          >
            {categories.map((c) => (
              <GlassCard key={c.id} style={[s.card, viewMode === 'grid' ? s.cardGrid : s.cardList]}>
                <View style={viewMode === 'grid' ? s.cardTopGrid : s.cardTopList}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.rowCode}>{c.code}</Text>
                </View>
                <View style={viewMode === 'grid' ? s.cardBottomGrid : s.cardBottomList}>
                  <View 
                    style={[
                      s.metalPill, 
                      { 
                        backgroundColor: c.metal === 'GOLD' ? 'rgba(212,175,55,0.15)' : 'rgba(148,163,184,0.15)',
                        borderColor: c.metal === 'GOLD' ? 'rgba(212,175,55,0.35)' : 'rgba(148,163,184,0.35)' 
                      }
                    ]}
                  >
                    <Text style={[s.metalPillText, { color: c.metal === 'GOLD' ? '#B45309' : '#475569' }]}>{c.metal}</Text>
                  </View>
                  <View style={s.actionRow}>
                    <TouchableOpacity onPress={() => openEdit(c)} style={s.actionBtn}><Edit2 size={16} color="#D4AF37" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(c)} style={s.actionBtn}><Trash2 size={16} color="#ef4444" /></TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        )}
      </View>


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

      {/* Modern Confirmation Modal */}
      <Modal visible={!!confirmDelete} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>❓</Text>
            </View>
            <Text style={s.successTitle}>Confirm Delete</Text>
            <Text style={s.successSubtitle}>Are you sure you want to delete {confirmDelete?.name}?</Text>
            
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Cancel" 
                  onPress={() => setConfirmDelete(null)} 
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Delete" 
                  onPress={async () => {
                    const cat = confirmDelete;
                    setConfirmDelete(null);
                    if (!cat || !activeFirmId) return;
                    try {
                      setLoading(true);
                      await categoryService.softDeleteCategory(cat.id, activeFirmId);
                      setSuccessMessage('Category deleted');
                      loadCategories();
                    } catch (error: any) {
                      setErrorMessage(error.message === 'CATEGORY_HAS_ACTIVE_ITEMS' ? 'Cannot delete: Category has active inventory items.' : error.message);
                    } finally {
                      setLoading(false);
                    }
                  }} 
                  variant="danger"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modern Error Modal */}
      <Modal visible={!!errorMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </View>
            <Text style={s.successTitle}>Delete Failed</Text>
            <Text style={s.successSubtitle}>{errorMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Dismiss" 
                onPress={() => setErrorMessage(null)} 
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
  headerIconCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg, fontSize: 28, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600',
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
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
  cardBottomGrid: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: COLORS.vjText, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  rowCode: { color: 'rgba(92,22,35,0.5)', fontSize: 12, fontWeight: '600' },
  metalPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8, backgroundColor: 'rgba(92,22,35,0.05)', borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  
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