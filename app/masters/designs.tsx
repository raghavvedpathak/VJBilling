import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { Tag, Plus, X, Edit2, Trash2, LayoutGrid, List as ListIcon } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { designService } from '../../services/designService';
import { db } from '../../db/client';
import { designs as designsTable, categories as categoriesTable, designCategoryMap as designCategoryMapTable } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
};

type Design = typeof designsTable.$inferSelect;
type Category = typeof categoriesTable.$inferSelect;
type DesignWithCategory = Design & { categoryName: string | null };

export default function DesignsScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [designs, setDesigns] = useState<DesignWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDesign, setEditingDesign] = useState<Design | null>(null);
  
  const [newName, setNewName] = useState('');
  const [newMetal, setNewMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleAdd = async () => {
    if (!activeFirmId) return;
    if (!newName.trim() || !selectedCategoryId) {
      Alert.alert('Validation Error', 'Name and Category are required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const countRes = await db.select({ count: sql<number>`count(*)` }).from(designsTable).where(eq(designsTable.firmId, activeFirmId));
      const codeStr = `DES${String(Number(countRes[0]?.count || 0) + 1).padStart(4, '0')}`;

      const designId = Crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(designsTable).values({
          id: designId,
          firmId: activeFirmId,
          name: newName.trim(),
          metal: newMetal,
          code: codeStr,
          isActive: 1,
          createdAt: now(),
          updatedAt: now(),
        });

        await tx.insert(designCategoryMapTable).values({
          id: Crypto.randomUUID(),
          designId,
          categoryId: selectedCategoryId,
          firmId: activeFirmId,
          createdAt: now(),
        });
      });
      
      Alert.alert('Success', 'Design added successfully');
      setShowAddModal(false);
      setNewName('');
      setNewMetal('GOLD');
      setSelectedCategoryId('');
      setCategorySearchQuery('');
      loadData();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A design with this name/metal already exists.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!activeFirmId || !editingDesign) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Design name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      await designService.updateDesign(editingDesign.id, activeFirmId, { name: newName.trim() });
      Alert.alert('Success', 'Design updated successfully');
      setShowEditModal(false);
      setEditingDesign(null);
      setNewName('');
      loadData();
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

  const handleDelete = (d: Design) => {
    if (!activeFirmId) return;
    Alert.alert('Confirm Delete', `Are you sure you want to delete ${d.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await designService.softDeleteDesign(d.id, activeFirmId);
            Alert.alert('Success', 'Design deleted');
            loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message === 'DESIGN_HAS_ACTIVE_ITEMS' ? 'Cannot delete: Design has active inventory items.' : e.message);
          }
        }
      }
    ]);
  };

  const openEdit = (d: Design) => {
    setEditingDesign(d);
    setNewName(d.name);
    setShowEditModal(true);
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
            <GlassButton title="Create Design" onPress={() => setShowAddModal(true)} icon={<Plus size={18} color="#fff" />} />
          </View>
          <View style={s.toggleContainer}>
            <TouchableOpacity onPress={() => setViewMode('list')} style={[s.toggleIconBtn, viewMode === 'list' && s.toggleIconActive]}>
              <ListIcon size={20} color={viewMode === 'list' ? '#B87333' : 'rgba(46,29,0,0.4)'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('grid')} style={[s.toggleIconBtn, viewMode === 'grid' && s.toggleIconActive]}>
              <LayoutGrid size={20} color={viewMode === 'grid' ? '#B87333' : 'rgba(46,29,0,0.4)'} />
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
                    <TouchableOpacity onPress={() => openEdit(d)} style={s.actionBtn}><Edit2 size={16} color="#B87333" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(d)} style={s.actionBtn}><Trash2 size={16} color="#ef4444" /></TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg w-full rounded-t-3xl p-6 shadow-xl border border-white/50" style={{ paddingBottom: 40, maxHeight: '80%' }}>
            <View className="flex-row justify-between items-center mb-6 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">New Design</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
              </TouchableOpacity>
            </View>
            
            <View style={s.formGroup}>
              <Text style={s.label}>Design Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
              />
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Metal Type</Text>
              <View style={s.toggleRow}>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'GOLD' && s.toggleActiveGold]}
                  onPress={() => setNewMetal('GOLD')}
                >
                  <Text style={[s.toggleText, newMetal === 'GOLD' && s.toggleTextActive]}>GOLD</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'SILVER' && s.toggleActiveSilver]}
                  onPress={() => setNewMetal('SILVER')}
                >
                  <Text style={[s.toggleText, newMetal === 'SILVER' && s.toggleTextActive]}>SILVER</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Link to Category</Text>
              <TextInput 
                style={[s.input, { marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14 }]}
                placeholder="Search categories..."
                value={categorySearchQuery}
                onChangeText={setCategorySearchQuery}
              />
              <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <View style={s.categoryList}>
                  {categories.length === 0 && <Text style={s.emptyMsg}>No categories exist. Create one first.</Text>}
                  {categories
                    .filter(c => c.metal === newMetal && c.name.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                    .map(c => (
                      <TouchableOpacity 
                        key={c.id} 
                        style={[s.catPill, selectedCategoryId === c.id && s.catPillActive]}
                        onPress={() => setSelectedCategoryId(c.id)}
                      >
                        <Text style={[s.catPillText, selectedCategoryId === c.id && s.catPillTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                  ))}
                  {categories.filter(c => c.metal === newMetal).length > 0 && 
                   categories.filter(c => c.metal === newMetal && c.name.toLowerCase().includes(categorySearchQuery.toLowerCase())).length === 0 && 
                   <Text style={s.emptyMsg}>No matching categories found.</Text>}
                </View>
              </ScrollView>
            </View>

            <View style={{ marginTop: 24 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Save Design'} 
                onPress={handleAdd} 
                disabled={isSubmitting || !selectedCategoryId} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg w-full rounded-t-3xl p-6 shadow-xl border border-white/50" style={{ paddingBottom: 40, maxHeight: '80%' }}>
            <View className="flex-row justify-between items-center mb-6 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">Edit Design</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
              </TouchableOpacity>
            </View>
            
            <View style={s.formGroup}>
              <Text style={s.label}>Design Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
              />
              <Text style={s.helpText}>No special characters. Max 2 words.</Text>
            </View>

            <View style={{ marginTop: 24 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Update Design'} 
                onPress={handleEditSubmit} 
                disabled={isSubmitting} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
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
    color: 'rgba(250,243,224,0.55)', fontSize: 12, fontWeight: '600',
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  controlsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 },
  toggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(46,29,0,0.05)', borderRadius: 12, padding: 4 },
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
  rowCode: { color: 'rgba(46,29,0,0.5)', fontSize: 12, fontWeight: '600' },
  metalPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8, backgroundColor: 'rgba(46,29,0,0.05)', borderRadius: 8 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.vjBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.vjText },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(46,29,0,0.6)', textTransform: 'uppercase', marginBottom: 8 },
  helpText: { fontSize: 10, color: 'rgba(46,29,0,0.5)', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)' },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)', alignItems: 'center', backgroundColor: '#fff' },
  toggleActiveGold: { backgroundColor: '#C8860A', borderColor: '#C8860A' },
  toggleActiveSilver: { backgroundColor: '#6B7280', borderColor: '#6B7280' },
  toggleText: { fontSize: 14, fontWeight: '700', color: 'rgba(46,29,0,0.6)' },
  toggleTextActive: { color: '#fff' },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyMsg: { fontSize: 14, color: 'rgba(46,29,0,0.5)', fontStyle: 'italic' },
  catPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)' },
  catPillActive: { backgroundColor: COLORS.vjText, borderColor: COLORS.vjText },
  catPillText: { fontSize: 13, fontWeight: '600', color: COLORS.vjText },
  catPillTextActive: { color: '#fff' },
});
