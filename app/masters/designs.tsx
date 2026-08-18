// app/masters/designs.tsx — Phase 2 v2.11 Canonical Screen

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
import { HeaderPill, GlassCard, GlassButton, GlassMetalBadge } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  CheckCircle,
  ShieldCheck,
  Search,
  X,
  Sparkles,
} from 'lucide-react-native';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { designRepository } from '@/repositories/phase2/designRepository';
import { categoryRepository } from '@/repositories/phase2/categoryRepository';
import { designCategoryMapRepository } from '@/repositories/phase2/designCategoryMapRepository';
import { designService } from '@/services/phase2/designService';
import type { Design, Category } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

type DesignWithCategory = Design & { categoryName: string | null };

export default function DesignsScreen() {
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

  const [designs, setDesigns] = useState<DesignWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    Promise.resolve(storageInstance.getItem('designViewMode')).then((mode) => {
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
    storageInstance.setItem('designViewMode', mode);
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Design | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const [rawDesigns, cRes] = await Promise.all([
        designRepository.findByFirmId(activeFirmId),
        categoryRepository.findByFirmId(activeFirmId),
      ]);

      const formattedDesigns: DesignWithCategory[] = await Promise.all(
        rawDesigns.map(async (d: Design) => {
          let categoryName: string | null = null;
          try {
            const maps = await designCategoryMapRepository.findByDesignId(d.id, activeFirmId);
            if (maps.length > 0) {
              const cat = cRes.find((c: Category) => c.id === maps[0].categoryId);
              if (cat) categoryName = cat.name;
            }
          } catch {}
          return { ...d, categoryName };
        })
      );

      setDesigns(formattedDesigns);
      setCategories(cRes);
    } catch (e) {
      console.error('[DesignsScreen] loadData failed:', e);
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setConfirmDelete(d);
  };

  const openEdit = (d: Design) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    router.push({
      pathname: '/masters/edit-design',
      params: {
        id: d.id,
        initialName: d.name,
        initialMetal: d.metal,
        initialThreshold: d.lowStockThreshold?.toString() || '',
      },
    });
  };

  const filteredDesigns = useMemo(() => {
    if (!searchQuery.trim()) return designs;
    const q = searchQuery.toLowerCase().trim();
    return designs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.code && d.code.toLowerCase().includes(q)) ||
        (d.metal && d.metal.toLowerCase().includes(q)) ||
        (d.categoryName && d.categoryName.toLowerCase().includes(q))
    );
  }, [designs, searchQuery]);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const designHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill
        icon={<Tag size={12} color={colors.vjBg} />}
        label={`${designs.length} Product Patterns`}
      />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Multi-Category Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Design Master" showBack headerContent={designHeaderPills}>
      <View style={s.container}>
        {/* TOP CONTROLS ROW */}
        <View style={s.controlsRow}>
          <View style={{ flex: 1 }}>
            <GlassButton
              title="Create Design"
              onPress={() => router.push('/masters/create-design')}
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

        {/* SEARCH BAR (WHEN 3+ DESIGNS) */}
        {designs.length > 2 && (
          <View style={s.searchBarContainer}>
            <Search size={16} color="#D4AF37" style={{ marginRight: 8, opacity: 0.8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search design, code, metal, or category..."
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
              Loading Product Designs...
            </Text>
          </View>
        ) : filteredDesigns.length === 0 ? (
          <View style={s.emptyContainer}>
            <View style={s.emptyIconCircle}>
              <Sparkles size={40} color="#D4AF37" />
            </View>
            <Text style={s.emptyTitle}>
              {searchQuery ? 'No Matching Designs' : 'No Designs Created Yet'}
            </Text>
            <Text style={s.emptySubtitle}>
              {searchQuery
                ? `No design patterns match "${searchQuery}". Clear your search query to see all items.`
                : 'Create your gold and silver jewelry patterns to organize items with low-stock alerts.'}
            </Text>
            {!searchQuery && (
              <View style={{ width: 220, marginTop: 16 }}>
                <GlassButton
                  title="Add First Design"
                  onPress={() => router.push('/masters/create-design')}
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
            {filteredDesigns.map((d) => {
              if (viewMode === 'grid') {
                return (
                  <GlassCard
                    key={d.id}
                    style={{
                      width: gridItemWidth,
                      marginBottom: gap,
                    }}
                  >
                    <View style={s.gridCardInner}>
                      {/* TOP BADGE ROW */}
                      <View style={s.gridHeaderRow}>
                        <GlassMetalBadge metal={d.metal} />
                        <View style={s.codeBadge}>
                          <Text style={s.codeBadgeText} numberOfLines={1}>
                            {d.code}
                          </Text>
                        </View>
                      </View>

                      {/* DESIGN NAME */}
                      <Text style={s.gridTitle} numberOfLines={2}>
                        {d.name}
                      </Text>

                      {/* CATEGORY SCOPE */}
                      <View style={s.categoryScopeBadge}>
                        <Text style={s.categoryScopeText} numberOfLines={1}>
                          {d.categoryName ? `Cat: ${d.categoryName}` : 'Unassigned Category'}
                        </Text>
                      </View>

                      {/* ACTION BUTTONS */}
                      <View style={s.gridActionRow}>
                        <TouchableOpacity
                          onPress={() => openEdit(d)}
                          style={s.actionBtnEdit}
                          activeOpacity={0.7}
                        >
                          <Edit2 size={14} color="#B45309" />
                          <Text style={s.actionBtnEditText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(d)}
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
                <GlassCard key={d.id} style={{ marginBottom: 10, width: '100%' }}>
                  <View style={s.listCardInner}>
                    {/* LEFT BADGE */}
                    <View style={{ marginRight: 12 }}>
                      <GlassMetalBadge metal={d.metal} />
                    </View>

                    {/* CENTER DETAILS */}
                    <View style={s.listTextContainer}>
                      <Text style={s.listTitle} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <View style={s.listSubRow}>
                        <View style={s.codeBadge}>
                          <Text style={s.codeBadgeText}>{d.code}</Text>
                        </View>
                        <Text style={s.listCategoryText} numberOfLines={1}>
                          {d.categoryName || 'Unlinked'}
                        </Text>
                      </View>
                    </View>

                    {/* RIGHT ACTIONS */}
                    <View style={s.listActionRow}>
                      <TouchableOpacity
                        onPress={() => openEdit(d)}
                        style={s.actionBtnEditCircle}
                        activeOpacity={0.7}
                      >
                        <Edit2 size={16} color="#B45309" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(d)}
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
              Are you sure you want to delete design pattern "{confirmDelete?.name}"?
            </Text>
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton title="Cancel" onPress={() => setConfirmDelete(null)} variant="secondary" />
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
                      setErrorMessage(
                        error.message === 'DESIGN_HAS_ACTIVE_ITEMS'
                          ? 'Cannot delete: Design has active inventory items.'
                          : error.message
                      );
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
    marginBottom: 6,
  },
  categoryScopeBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  categoryScopeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
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
    gap: 8,
  },
  listCategoryText: {
    fontSize: 12,
    color: 'rgba(92,22,35,0.6)',
    fontWeight: '600',
    flex: 1,
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