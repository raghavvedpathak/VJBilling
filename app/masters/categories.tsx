// app/masters/categories.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { storageInstance } from '@/utils/storage';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  CheckCircle,
  ShieldCheck,
  Search,
  X,
  FolderOpen,
} from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { categoryService } from '@/services/phase2/categoryService';
import type { Category } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Responsive Grid System for Phone vs Tablet
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;
  const numColumns = isLargeTablet ? 4 : isTablet ? 3 : 2;
  const gap = 12;
  const availableWidth = width - 32; // TwoToneWrapper horizontal padding = 16 each side
  const gridItemWidth = Math.floor((availableWidth - gap * (numColumns - 1)) / numColumns);

  const { activeFirmId } = useFirmStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    Promise.resolve(storageInstance.getItem('categoryViewMode')).then((mode) => {
      if (mode === 'grid' || mode === 'list') {
        setViewModeState(mode);
      }
    });
  }, []);

  const setViewMode = (mode: 'list' | 'grid') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setViewModeState(mode);
    storageInstance.setItem('categoryViewMode', mode);
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await categoryRepository.findByFirmId(activeFirmId);
      setCategories(results);
    } catch (e) {
      console.error('[CategoriesScreen] loadCategories failed:', e);
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setConfirmDelete(cat);
  };

  const openEdit = (cat: Category) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    router.push({
      pathname: '/masters/edit-category',
      params: { 
        id: cat.id,
        initialName: cat.name,
        initialCode: cat.code || '',
      },
    });
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const categoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill
        icon={<Layers size={12} color={colors.vjBg} />}
        label={`${categories.length} Categories`}
      />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Master Hierarchy" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Category Master" showBack headerContent={categoryHeaderPills}>
      <View style={s.container}>
        {/* TOP CONTROLS ROW */}
        <View style={s.controlsRow}>
          <View style={{ flex: 1 }}>
            <GlassButton
              title="Create Category"
              onPress={() => router.push('/masters/create-category')}
              icon={<Plus size={18} color="#fff" />}
            />
          </View>

          {/* VIEW SWITCHER */}
          <View style={s.toggleContainer}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              activeOpacity={0.8}
              style={[s.toggleIconBtn, viewMode === 'list' && s.toggleIconActive]}
            >
              <ListIcon
                size={20}
                color={viewMode === 'list' ? '#D4AF37' : COLORS.vjText}
                style={{ opacity: viewMode === 'list' ? 1 : 0.6 }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('grid')}
              activeOpacity={0.8}
              style={[s.toggleIconBtn, viewMode === 'grid' && s.toggleIconActive]}
            >
              <LayoutGrid
                size={20}
                color={viewMode === 'grid' ? '#D4AF37' : COLORS.vjText}
                style={{ opacity: viewMode === 'grid' ? 1 : 0.6 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* SEARCH BAR (WHEN 3+ CATEGORIES) */}
        {categories.length > 2 && (
          <View style={s.searchBarContainer}>
            <Search size={16} color="#D4AF37" style={{ marginRight: 8, opacity: 0.8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search category name or code..."
              placeholderTextColor="#9CA3AF"
              style={s.searchInput}
            />
            {Boolean(searchQuery) && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={{ marginTop: 12, fontSize: 13, color: 'rgba(92,22,35,0.6)', fontWeight: '600' }}>
              Loading Categories...
            </Text>
          </View>
        ) : filteredCategories.length === 0 ? (
          <View style={s.emptyContainer}>
            <View style={s.emptyIconCircle}>
              <FolderOpen size={40} color="#D4AF37" />
            </View>
            <Text style={s.emptyTitle}>
              {searchQuery ? 'No Matching Categories' : 'No Categories Created Yet'}
            </Text>
            <Text style={s.emptySubtitle}>
              {searchQuery
                ? `No categories match "${searchQuery}". Clear your search query to see all items.`
                : 'Organize your precious jewelry inventory by creating your first product category.'}
            </Text>
            {!searchQuery && (
              <View style={{ width: 220, marginTop: 16 }}>
                <GlassButton
                  title="Add First Category"
                  onPress={() => router.push('/masters/create-category')}
                  icon={<Plus size={18} color="#fff" />}
                />
              </View>
            )}
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1, marginTop: 8 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              { paddingBottom: 150 },
              viewMode === 'grid' && {
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap,
              },
            ]}
          >
            {filteredCategories.map((c) => {
              if (viewMode === 'grid') {
                return (
                  <GlassCard
                    key={c.id}
                    style={{
                      width: gridItemWidth,
                      marginBottom: gap,
                    }}
                  >
                    <View style={s.gridCardInner}>
                      {/* TOP BADGE & CODE */}
                      <View style={s.gridHeaderRow}>
                        <View style={s.catIconBadge}>
                          <Layers size={16} color="#D4AF37" />
                        </View>
                        <View style={s.codeBadge}>
                          <Text style={s.codeBadgeText} numberOfLines={1}>
                            {c.code}
                          </Text>
                        </View>
                      </View>

                      {/* CATEGORY NAME */}
                      <Text style={s.gridTitle} numberOfLines={2}>
                        {c.name}
                      </Text>

                      {/* ACTION BUTTONS */}
                      <View style={s.gridActionRow}>
                        <TouchableOpacity
                          onPress={() => openEdit(c)}
                          style={s.actionBtnEdit}
                          activeOpacity={0.7}
                        >
                          <Edit2 size={14} color="#B45309" />
                          <Text style={s.actionBtnEditText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(c)}
                          style={s.actionBtnDelete}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={14} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </GlassCard>
                );
              }

              // LIST VIEW ITEM
              return (
                <GlassCard key={c.id} style={{ marginBottom: 10, width: '100%' }}>
                  <View style={s.listCardInner}>
                    {/* LEFT ICON */}
                    <View style={s.catIconBadgeList}>
                      <Layers size={18} color="#D4AF37" />
                    </View>

                    {/* CENTER DETAILS */}
                    <View style={s.listTextContainer}>
                      <Text style={s.listTitle} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <View style={s.listSubRow}>
                        <View style={s.codeBadge}>
                          <Text style={s.codeBadgeText}>{c.code}</Text>
                        </View>
                      </View>
                    </View>

                    {/* RIGHT ACTIONS */}
                    <View style={s.listActionRow}>
                      <TouchableOpacity
                        onPress={() => openEdit(c)}
                        style={s.actionBtnEditCircle}
                        activeOpacity={0.7}
                      >
                        <Edit2 size={16} color="#B45309" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(c)}
                        style={s.actionBtnDeleteCircle}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* SUCCESS MODAL */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Success!</Text>
            <Text style={s.successSubtitle}>{successMessage}</Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Done" onPress={() => setSuccessMessage(null)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <Modal visible={!!confirmDelete} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>❓</Text>
            </View>
            <Text style={s.successTitle}>Confirm Delete</Text>
            <Text style={s.successSubtitle}>
              Are you sure you want to delete category "{confirmDelete?.name}"?
            </Text>
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton title="Cancel" onPress={() => setConfirmDelete(null)} variant="secondary" />
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
                      setErrorMessage(error.message);
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

      {/* ERROR MODAL */}
      <Modal visible={!!errorMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </View>
            <Text style={s.successTitle}>Delete Failed</Text>
            <Text style={s.successSubtitle}>{errorMessage}</Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Dismiss" onPress={() => setErrorMessage(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 6 },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    gap: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(92,22,35,0.08)',
    borderRadius: 14,
    padding: 3,
  },
  toggleIconBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  toggleIconActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.15)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.vjText,
    fontWeight: '600',
    paddingVertical: 0,
  },
  gridCardInner: {
    width: '100%',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  catIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catIconBadgeList: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  codeBadge: {
    backgroundColor: 'rgba(92,22,35,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.1)',
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.vjText,
    letterSpacing: 0.5,
  },
  gridTitle: {
    color: COLORS.vjText,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    minHeight: 40,
    marginBottom: 10,
  },
  gridActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(92,22,35,0.08)',
    gap: 8,
  },
  actionBtnEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnEditText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  actionBtnDelete: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  listTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  listTitle: {
    color: COLORS.vjText,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  listSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnEditCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnDeleteCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
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
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
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