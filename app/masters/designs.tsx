import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { Tag, Plus, X, Edit2, Trash2, LayoutGrid, List as ListIcon, CheckCircle } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { designService } from '../../services/designService';
import { db } from '../../db/client';
import { designs as designsTable, categories as categoriesTable, designCategoryMap as designCategoryMapTable } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  highlight: '#FDE047',
};

type Design = typeof designsTable.$inferSelect;
type Category = typeof categoriesTable.$inferSelect;
type DesignWithCategory = Design & { categoryName: string | null };

// --- Custom Component: Smart Text Highlighter ---
const HighlightText = ({ text, query, baseStyle }: { text: string, query: string, baseStyle: any }) => {
  if (!query) return <Text style={baseStyle}>{text}</Text>;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <Text style={baseStyle}>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <Text key={index} style={[baseStyle, { backgroundColor: COLORS.highlight, color: '#000' }]}>
            {part}
          </Text>
        ) : (
          <Text key={index} style={baseStyle}>{part}</Text>
        )
      )}
    </Text>
  );
};

export default function DesignsScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [designs, setDesigns] = useState<DesignWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // FIXED: Bulletproof AsyncStorage for View Mode
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    AsyncStorage.getItem('designViewMode').then((mode) => {
      if (mode === 'grid' || mode === 'list') {
        setViewModeState(mode);
      }
    });
  }, []);

  const setViewMode = (mode: 'list' | 'grid') => {
    setViewModeState(mode);
    AsyncStorage.setItem('designViewMode', mode);
  };
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Design | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const [rawDesigns, cRes] = await Promise.all([
        db.select({
          design: designsTable,
          categoryName: categoriesTable.name
        }).from(designsTable)
          .leftJoin(designCategoryMapTable, eq(designsTable.id, designCategoryMapTable.designId))
          .leftJoin(categoriesTable, eq(designCategoryMapTable.categoryId, categoriesTable.id))
          .where(and(eq(designsTable.firmId, activeFirmId), eq(designsTable.isActive, 1))),
        db.select().from(categoriesTable).where(and(eq(categoriesTable.firmId, activeFirmId), eq(categoriesTable.isActive, 1))),
      ]);
      
      const formattedDesigns: DesignWithCategory[] = rawDesigns.map(r => ({
        ...r.design,
        categoryName: r.categoryName
      }));
      
      setDesigns(formattedDesigns);
      setCategories(cRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = (d: Design) => {
    if (!activeFirmId) return;
    setConfirmDelete(d);
  };

  const openEdit = (d: Design) => {
    router.push({ pathname: '/masters/edit-design', params: { id: d.id, initialName: d.name } });
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Tag size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>Designs</Text>
      <Text style={s.headerSubtitle}>{designs.length} Total active designs</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.container}>
        <View style={s.controlsRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <GlassButton title="Create Design" onPress={() => router.push('/masters/create-design')} icon={<Plus size={18} color="#fff" />} />
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
            {designs.map((d) => (
              <GlassCard key={d.id} style={[s.card, viewMode === 'grid' ? s.cardGrid : s.cardList]}>
                <View style={viewMode === 'grid' ? s.cardTopGrid : s.cardTopList}>
                  <Text style={s.rowTitle} numberOfLines={1}>{d.name}</Text>
                  <Text style={s.rowCode} numberOfLines={1}>{d.code} • {d.categoryName || 'Unlinked'}</Text>
                </View>
                <View style={viewMode === 'grid' ? s.cardBottomGrid : s.cardBottomList}>
                  <View style={[s.metalPill, { borderColor: d.metal === 'GOLD' ? '#C8860A' : '#6B7280' }]}>
                    <Text style={[s.metalPillText, { color: d.metal === 'GOLD' ? '#C8860A' : '#6B7280' }]}>{d.metal}</Text>
                  </View>
                  <View style={s.actionRow}>
                    <TouchableOpacity onPress={() => openEdit(d)} style={s.actionBtn}><Edit2 size={16} color="#D4AF37" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(d)} style={s.actionBtn}><Trash2 size={16} color="#ef4444" /></TouchableOpacity>
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
                    const d = confirmDelete;
                    setConfirmDelete(null);
                    if (!d || !activeFirmId) return;
                    try {
                      setLoading(true);
                      await designService.softDeleteDesign(d.id, activeFirmId);
                      setSuccessMessage('Design deleted');
                      loadData();
                    } catch (error: any) {
                      setErrorMessage(error.message === 'DESIGN_HAS_ACTIVE_ITEMS' ? 'Cannot delete: Design has active inventory items.' : error.message);
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