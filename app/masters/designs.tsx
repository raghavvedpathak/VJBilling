// app/masters/designs.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, useEffect, useMemo, useDeferredValue } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storageInstance } from '@/utils/storage';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton, GlassMetalBadge, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
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
  const insets = useSafeAreaInsets();
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
  const [isDeleting, setIsDeleting] = useState(false);
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
    } catch {}
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

      const activeCategories = (cRes || []).filter((c) => c.isActive === 1);
      const activeDesigns = (rawDesigns || []).filter((d) => d.isActive === 1);

      const formattedDesigns: DesignWithCategory[] = await Promise.all(
        activeDesigns.map(async (d: Design) => {
          let categoryName: string | null = null;
          try {
            const maps = await designCategoryMapRepository.findByDesignId(d.id, activeFirmId);
            if (maps.length > 0) {
              const cat = activeCategories.find((c: Category) => c.id === maps[0].categoryId);
              if (cat) categoryName = cat.name;
            }
          } catch {}
          return { ...d, categoryName };
        })
      );

      setDesigns(formattedDesigns);
      setCategories(activeCategories);
    } catch (e) {
      console.error('[DesignsScreen] loadData failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchCurrent = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const [rawDesigns, cRes] = await Promise.all([
            designRepository.findByFirmId(activeFirmId),
            categoryRepository.findByFirmId(activeFirmId),
          ]);

          if (!active) return;

          const activeCategories = (cRes || []).filter((c) => c.isActive === 1);
          const activeDesigns = (rawDesigns || []).filter((d) => d.isActive === 1);

          const formattedDesigns: DesignWithCategory[] = await Promise.all(
            activeDesigns.map(async (d: Design) => {
              let categoryName: string | null = null;
              try {
                const maps = await designCategoryMapRepository.findByDesignId(d.id, activeFirmId);
                if (maps.length > 0) {
                  const cat = activeCategories.find((c: Category) => c.id === maps[0].categoryId);
                  if (cat) categoryName = cat.name;
                }
              } catch {}
              return { ...d, categoryName };
            })
          );

          if (active) {
            setDesigns(formattedDesigns);
            setCategories(activeCategories);
          }
        } catch (e) {
          console.error('[DesignsScreen] fetchCurrent failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      fetchCurrent();
      return () => {
        active = false;
      };
    }, [activeFirmId])
  );

  const handleDelete = (d: Design) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setConfirmDelete(d);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || !activeFirmId) return;
    const designId = confirmDelete.id;

    setIsDeleting(true);
    try {
      await designService.softDeleteDesign(designId, activeFirmId);
      setConfirmDelete(null);
      setSuccessMessage('Design pattern deleted successfully.');
      await loadData();
    } catch (error: any) {
      setConfirmDelete(null);
      setErrorMessage(
        error.message === 'DESIGN_HAS_ACTIVE_ITEMS'
          ? 'Cannot delete: Design pattern has active inventory items linked.'
          : error.message || 'Failed to delete design pattern.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const openEdit = (d: Design) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.push({
      pathname: '/masters/edit-design',
      params: {
        id: d.id,
        initialName: d.name,
        initialCode: d.code || '',
        initialMetal: d.metal,
      },
    });
  };

  const deferredQuery = useDeferredValue(searchQuery);

  const filteredDesigns = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    if (!q) return designs;
    return designs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.code && d.code.toLowerCase().includes(q)) ||
        (d.metal && d.metal.toLowerCase().includes(q)) ||
        (d.categoryName && d.categoryName.toLowerCase().includes(q))
    );
  }, [designs, deferredQuery]);

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
        {/* TOP CONTROLS ROW: SEARCH & VIEW SWITCHER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={[s.searchBarContainer, { flex: 1, borderColor: `${colors.vjAccent}35`, marginBottom: 0 }]}>
            <Search size={16} color={colors.vjAccent} style={{ marginRight: 8, opacity: 0.8 }} />
            <TextInput
              testID="design-search-input"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search design, code, metal, or category..."
              placeholderTextColor="rgba(92, 22, 35, 0.4)"
              style={[s.searchInput, { color: colors.vjText }]}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              returnKeyType="search"
            />
            {Boolean(searchQuery) && (
              <TouchableOpacity 
                testID="design-search-clear-btn"
                onPress={() => setSearchQuery('')} 
                style={{ padding: 4 }}
              >
                <X size={16} color={colors.vjText} style={{ opacity: 0.5 }} />
              </TouchableOpacity>
            )}
          </View>

          {/* VIEW SWITCHER */}
          <View style={[s.toggleContainer, { backgroundColor: `${colors.vjAccent}14` }]}>
            <TouchableOpacity
              testID="view-mode-list-btn"
              onPress={() => setViewMode('list')}
              activeOpacity={0.8}
              style={[s.toggleIconBtn, viewMode === 'list' && s.toggleIconActive]}
            >
              <ListIcon
                size={20}
                color={viewMode === 'list' ? colors.vjAccent : colors.vjText}
                style={{ opacity: viewMode === 'list' ? 1 : 0.6 }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              testID="view-mode-grid-btn"
              onPress={() => setViewMode('grid')}
              activeOpacity={0.8}
              style={[s.toggleIconBtn, viewMode === 'grid' && s.toggleIconActive]}
            >
              <LayoutGrid
                size={20}
                color={viewMode === 'grid' ? colors.vjAccent : colors.vjText}
                style={{ opacity: viewMode === 'grid' ? 1 : 0.6 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        {loading && designs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={{ marginTop: 12, fontSize: 13, color: colors.vjText, opacity: 0.6, fontWeight: '600' }}>
              Loading Product Designs...
            </Text>
          </View>
        ) : filteredDesigns.length === 0 ? (
          <View style={s.emptyContainer}>
            <View style={[s.emptyIconCircle, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}>
              <Sparkles size={40} color={colors.vjAccent} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.vjText }]}>
              {searchQuery ? 'No Matching Designs' : 'No Designs Created Yet'}
            </Text>
            <Text style={[s.emptySubtitle, { color: colors.vjText }]}>
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
              { paddingBottom: Math.max(insets.bottom + 120, 140) },
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
                    testID={`design-card-${d.id}`}
                    key={d.id}
                    style={{
                      width: gridItemWidth,
                      marginBottom: gap,
                      borderColor: `${colors.vjAccent}25`,
                    }}
                  >
                    <View style={s.gridCardInner}>
                      {/* TOP BADGE ROW */}
                      <View style={s.gridHeaderRow}>
                        <GlassMetalBadge metal={d.metal} />
                        <View style={[s.codeBadge, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}20` }]}>
                          <Text style={[s.codeBadgeText, { color: colors.vjText }]} numberOfLines={1}>
                            {d.code}
                          </Text>
                        </View>
                      </View>

                      {/* DESIGN NAME */}
                      <Text style={[s.gridTitle, { color: colors.vjText }]} numberOfLines={2}>
                        {d.name}
                      </Text>

                      {/* CATEGORY SCOPE */}
                      <View style={[s.categoryScopeBadge, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}30` }]}>
                        <Text style={[s.categoryScopeText, { color: colors.vjAccent }]} numberOfLines={1}>
                          {d.categoryName ? `Cat: ${d.categoryName}` : 'Unassigned Category'}
                        </Text>
                      </View>

                      {/* ACTION BUTTONS */}
                      <View style={[s.gridActionRow, { borderTopColor: `${colors.vjAccent}15` }]}>
                        <TouchableOpacity
                          testID={`edit-design-btn-${d.id}`}
                          onPress={() => openEdit(d)}
                          style={[s.actionBtnEdit, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}30` }]}
                          activeOpacity={0.7}
                        >
                          <Edit2 size={14} color={colors.vjAccent} />
                          <Text style={[s.actionBtnEditText, { color: colors.vjAccent }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`delete-design-btn-${d.id}`}
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
                <GlassCard 
                  testID={`design-card-${d.id}`}
                  key={d.id} 
                  style={{ marginBottom: 10, width: '100%', borderColor: `${colors.vjAccent}25` }}
                >
                  <View style={s.listCardInner}>
                    {/* LEFT BADGE */}
                    <View style={{ marginRight: 12 }}>
                      <GlassMetalBadge metal={d.metal} />
                    </View>

                    {/* CENTER DETAILS */}
                    <View style={s.listTextContainer}>
                      <Text style={[s.listTitle, { color: colors.vjText }]} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <View style={s.listSubRow}>
                        <View style={[s.codeBadge, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}20` }]}>
                          <Text style={[s.codeBadgeText, { color: colors.vjText }]}>{d.code}</Text>
                        </View>
                        <Text style={[s.listCategoryText, { color: colors.vjText }]} numberOfLines={1}>
                          {d.categoryName || 'Unlinked'}
                        </Text>
                      </View>
                    </View>

                    {/* RIGHT ACTIONS */}
                    <View style={s.listActionRow}>
                      <TouchableOpacity
                        testID={`edit-design-btn-${d.id}`}
                        onPress={() => openEdit(d)}
                        style={[s.actionBtnEditCircle, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}30` }]}
                        activeOpacity={0.7}
                      >
                        <Edit2 size={16} color={colors.vjAccent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`delete-design-btn-${d.id}`}
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

        <FixedGlassBar>
          <TouchableOpacity
            testID="create-design-bottom-btn"
            style={[fixedBarStyles.pillPrimaryBtn, { backgroundColor: colors.vjAccent }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push('/masters/create-design');
            }}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#fff" />
            <Text style={fixedBarStyles.pillPrimaryText}>Create Design</Text>
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

      {/* SUCCESS MODAL */}
      <Modal visible={!!successMessage} transparent animationType="fade" onRequestClose={() => setSuccessMessage(null)}>
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => setSuccessMessage(null)}
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
              <GlassButton title="Done" onPress={() => setSuccessMessage(null)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => !isDeleting && setConfirmDelete(null)}>
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => !isDeleting && setConfirmDelete(null)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Trash2 size={36} color="#DC2626" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Confirm Delete</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>
              Are you sure you want to delete design pattern "{confirmDelete?.name}"?
            </Text>
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Cancel" 
                  onPress={() => setConfirmDelete(null)} 
                  variant="secondary" 
                  disabled={isDeleting}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton
                  title={isDeleting ? 'Deleting...' : 'Delete'}
                  onPress={handleConfirmDelete}
                  variant="danger"
                  disabled={isDeleting}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ERROR MODAL */}
      <Modal visible={!!errorMessage} transparent animationType="fade" onRequestClose={() => setErrorMessage(null)}>
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => setErrorMessage(null)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Delete Failed</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{errorMessage}</Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Dismiss" onPress={() => setErrorMessage(null)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 6 },
  toggleContainer: {
    flexDirection: 'row',
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
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gridTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    minHeight: 40,
    marginBottom: 6,
  },
  categoryScopeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  categoryScopeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gridActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  actionBtnEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnEditText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '600',
    opacity: 0.65,
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
    borderWidth: 1,
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
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    opacity: 0.65,
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
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
});