import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { Layers, Plus, X, Edit2, Trash2, LayoutGrid, List as ListIcon } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { categoryService } from '../../services/categoryService';
import { db } from '../../db/client';
import { categories as categoriesTable } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
};

type Category = typeof categoriesTable.$inferSelect;

export default function CategoriesScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const [newName, setNewName] = useState('');
  const [newMetal, setNewMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleAdd = async () => {
    if (!activeFirmId) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Category name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Generate CAT code
      const countRes = await db.select({ count: sql<number>`count(*)` }).from(categoriesTable).where(eq(categoriesTable.firmId, activeFirmId));
      const codeStr = `CAT${String(Number(countRes[0]?.count || 0) + 1).padStart(4, '0')}`;

      await db.insert(categoriesTable).values({
        id: Crypto.randomUUID(),
        firmId: activeFirmId,
        name: newName.trim(),
        metal: newMetal,
        code: codeStr,
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });
      
      Alert.alert('Success', 'Category added successfully');
      setShowAddModal(false);
      setNewName('');
      setNewMetal('GOLD');
      loadCategories();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A category with this name already exists.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!activeFirmId || !editingCategory) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Category name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      await categoryService.updateCategory(editingCategory.id, activeFirmId, newName.trim());
      Alert.alert('Success', 'Category updated successfully');
      setShowEditModal(false);
      setEditingCategory(null);
      setNewName('');
      loadCategories();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (cat: Category) => {
    if (!activeFirmId) return;
    Alert.alert('Confirm Delete', `Are you sure you want to delete ${cat.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await categoryService.softDeleteCategory(cat.id, activeFirmId);
            Alert.alert('Success', 'Category deleted');
            loadCategories();
          } catch (e: any) {
            Alert.alert('Error', e.message === 'CATEGORY_HAS_ACTIVE_ITEMS' ? 'Cannot delete: Category has active inventory items.' : e.message);
          }
        }
      }
    ]);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setNewName(cat.name);
    setShowEditModal(true);
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Layers size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>Categories</Text>
      <Text style={s.headerSubtitle}>{categories.length} Total active categories</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.container}>
        <View style={s.controlsRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <GlassButton title="Create Category" onPress={() => setShowAddModal(true)} icon={<Plus size={18} color="#fff" />} />
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
            {categories.map((c) => (
              <GlassCard key={c.id} style={[s.card, viewMode === 'grid' ? s.cardGrid : s.cardList]}>
                <View style={viewMode === 'grid' ? s.cardTopGrid : s.cardTopList}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.rowCode}>{c.code}</Text>
                </View>
                <View style={viewMode === 'grid' ? s.cardBottomGrid : s.cardBottomList}>
                  <View style={[s.metalPill, { borderColor: c.metal === 'GOLD' ? '#C8860A' : '#6B7280' }]}>
                    <Text style={[s.metalPillText, { color: c.metal === 'GOLD' ? '#C8860A' : '#6B7280' }]}>{c.metal}</Text>
                  </View>
                  <View style={s.actionRow}>
                    <TouchableOpacity onPress={() => openEdit(c)} style={s.actionBtn}><Edit2 size={16} color="#B87333" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(c)} style={s.actionBtn}><Trash2 size={16} color="#ef4444" /></TouchableOpacity>
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
              <Text className="text-xl font-bold text-vj-text">New Category</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
              </TouchableOpacity>
            </View>
            
            <View style={s.formGroup}>
              <Text style={s.label}>Category Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Gold Rings"
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

            <View style={{ marginTop: 24 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Save Category'} 
                onPress={handleAdd} 
                disabled={isSubmitting} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg w-full rounded-t-3xl p-6 shadow-xl border border-white/50" style={{ paddingBottom: 40, maxHeight: '80%' }}>
            <View className="flex-row justify-between items-center mb-6 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">Edit Category</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
              </TouchableOpacity>
            </View>
            
            <View style={s.formGroup}>
              <Text style={s.label}>Category Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Gold Rings"
              />
            </View>

            <View style={{ marginTop: 24 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Update Category'} 
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
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(46,29,0,0.6)', textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)' },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(46,29,0,0.1)', alignItems: 'center', backgroundColor: '#fff' },
  toggleActiveGold: { backgroundColor: '#C8860A', borderColor: '#C8860A' },
  toggleActiveSilver: { backgroundColor: '#6B7280', borderColor: '#6B7280' },
  toggleText: { fontSize: 14, fontWeight: '700', color: 'rgba(46,29,0,0.6)' },
  toggleTextActive: { color: '#fff' },
});
