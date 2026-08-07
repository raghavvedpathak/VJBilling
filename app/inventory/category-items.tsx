import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { db } from '../../db/client';
import { designs as designsTable } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { HeaderPill, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { designService } from '../../services/designService';
import type { DesignCategoryStockResult } from '../../types/phase2.types';
import { getDisplayPurity, formatWeightMg as formatWeight } from '../../utils/calculations';
import { getJewelryCategoryIcon } from '../../utils/jewelryIcons';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { COLORS, getThemeColors } from '../../constants/theme';
import { ChevronRight, Layers, Bell, X, AlertTriangle, Scale, Package } from 'lucide-react-native';

type DesignRowProps = {
  item: DesignCategoryStockResult;
  isLowStock: boolean;
  currentThreshold: number | null;
  onPress: (designId: string, designName: string, purityPercent: number) => void;
  onOpenLowStockModal: (designId: string, designName: string, currentThreshold: number | null) => void;
};

const DesignRow = memo(({ item, isLowStock, currentThreshold, onPress, onOpenLowStockModal }: DesignRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal);

  return (
    <TouchableOpacity
      id={`design-row-${item.designId}-${item.purityPercent}`}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
        onPress(item.designId, item.designName, item.purityPercent);
      }}
      activeOpacity={0.7}
      style={s.card}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={s.designName} numberOfLines={1}>{item.designName}</Text>
          {isLowStock && (
            <View style={s.lowStockBadge}>
              <Text style={s.lowStockText}>Low Stock</Text>
            </View>
          )}
        </View>

        <View style={s.metaRow}>
          <View style={[s.metalPill, { borderColor: metalColor }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
          <Text style={s.weightText}>{formatWeight(item.totalNetWeightMg)}</Text>

          <TouchableOpacity
            id={`low-stock-bell-${item.designId}`}
            onPress={(e) => {
              e.stopPropagation();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (err) {}
              onOpenLowStockModal(item.designId, item.designName, currentThreshold);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={s.bellButton}
          >
            <Bell 
              size={15} 
              color={currentThreshold !== null ? '#F59E0B' : 'rgba(92,22,35,0.3)'} 
              fill={currentThreshold !== null ? 'rgba(245,158,11,0.2)' : 'none'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.countBadge}>
        <Text style={s.countText}>{item.availableCount}</Text>
        <Text style={s.countLabel}>items</Text>
      </View>

      <ChevronRight size={18} color="rgba(92,22,35,0.25)" />
    </TouchableOpacity>
  );
});

export default function CategoryItemsScreen() {
  const router = useRouter();
  const { categoryId, categoryName } = useLocalSearchParams<{ categoryId: string; categoryName: string }>();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<DesignCategoryStockResult[]>([]);
  const [lowStockDesignIds, setLowStockDesignIds] = useState<Set<string>>(new Set());
  const [designThresholds, setDesignThresholds] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedDesign, setSelectedDesign] = useState<{ id: string; name: string; threshold: number | null } | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeFirmId || !categoryId) return;
    setLoading(true);
    try {
      const [results, lowStockList, thresholdsRows] = await Promise.all([
        inventoryDrillDownService.getDesignsByCategory(activeFirmId, categoryId),
        inventoryDrillDownService.getLowStockDesigns(activeFirmId),
        db.select({ id: designsTable.id, threshold: designsTable.lowStockThreshold })
          .from(designsTable)
          .where(and(eq(designsTable.firmId, activeFirmId), eq(designsTable.isActive, 1)))
      ]);

      setData(results);
      setLowStockDesignIds(new Set(lowStockList.map(d => d.id)));

      const threshMap: Record<string, number | null> = {};
      thresholdsRows.forEach(r => {
        threshMap[r.id] = r.threshold;
      });
      setDesignThresholds(threshMap);
    } catch (e) {
      console.error('[CategoryItems] loadData failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId, categoryId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDesignPress = useCallback((designId: string, designName: string, purityPercent: number) => {
    router.push({
      pathname: '/inventory/design-items',
      params: { designId, designName, purityPercent: String(purityPercent) },
    });
  }, [router]);

  const handleOpenLowStockModal = useCallback((designId: string, designName: string, currentThreshold: number | null) => {
    setSelectedDesign({ id: designId, name: designName, threshold: currentThreshold });
    setThresholdInput(currentThreshold !== null ? String(currentThreshold) : '');
    setInputError(null);
  }, []);

  const handleSaveThreshold = async () => {
    if (!selectedDesign || !activeFirmId) return;

    const trimmed = thresholdInput.trim();
    let finalVal: number | null = null;

    if (trimmed !== '') {
      const num = Number(trimmed);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) {
        setInputError('Threshold must be a non-negative whole number (0 or greater)');
        return;
      }
      finalVal = num;
    }

    setIsSubmitting(true);
    setInputError(null);
    try {
      await designService.updateDesignLowStockThreshold(selectedDesign.id, activeFirmId, finalVal);
      setSelectedDesign(null);
      await loadData();
    } catch (e: any) {
      setInputError(e.message || 'Failed to update threshold');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearThreshold = async () => {
    if (!selectedDesign || !activeFirmId) return;

    setIsSubmitting(true);
    setInputError(null);
    try {
      await designService.updateDesignLowStockThreshold(selectedDesign.id, activeFirmId, null);
      setSelectedDesign(null);
      await loadData();
    } catch (e: any) {
      setInputError(e.message || 'Failed to clear threshold');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalItems = data.reduce((sum, i) => sum + i.availableCount, 0);
  const totalWeightMg = data.reduce((sum, i) => sum + i.totalNetWeightMg, 0);

  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const categoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={categoryName || 'Category Items'} showBack headerContent={categoryHeaderPills}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading designs...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => `${item.designId}_${item.purityPercent}`}
            renderItem={({ item }) => (
              <DesignRow 
                item={item} 
                isLowStock={lowStockDesignIds.has(item.designId)}
                currentThreshold={designThresholds[item.designId] ?? null}
                onPress={handleDesignPress} 
                onOpenLowStockModal={handleOpenLowStockModal}
              />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={88}
            contentContainerStyle={{paddingBottom: 100, paddingTop: 32}}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Layers size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No Designs Found</Text>
                <Text style={s.emptySubtitle}>This category has no available stock</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Set Low Stock Alert Modal */}
      <Modal visible={!!selectedDesign} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <Bell size={20} color={COLORS.vjAccent} />
                <Text style={s.modalTitle}>Set Low Stock Alert</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDesign(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="rgba(92,22,35,0.4)" />
              </TouchableOpacity>
            </View>

            <Text style={s.modalSubtitle}>
              Design: <Text style={{ fontWeight: '700', color: COLORS.vjText }}>{selectedDesign?.name}</Text>
            </Text>

            <Text style={s.label}>Alert Threshold (Available Count)</Text>
            <TextInput
              style={[s.input, !!inputError && s.inputErrorBorder]}
              value={thresholdInput}
              onChangeText={(text) => {
                setThresholdInput(text);
                setInputError(null);
              }}
              placeholder="e.g. 5 (Leave blank for no alert)"
              placeholderTextColor="rgba(92,22,35,0.3)"
              keyboardType="numeric"
              autoFocus
            />

            {inputError && (
              <View style={s.errorRow}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={s.errorText}>{inputError}</Text>
              </View>
            )}

            <View style={s.modalActionRow}>
              {selectedDesign?.threshold !== null && selectedDesign?.threshold !== undefined && (
                <TouchableOpacity 
                  style={s.clearBtn} 
                  onPress={handleClearThreshold}
                  disabled={isSubmitting}
                >
                  <Text style={s.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title={isSubmitting ? 'Saving...' : 'Save'} 
                  onPress={handleSaveThreshold}
                  disabled={isSubmitting}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)', // Pseudo-glass
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)', // Pseudo-glass border
    paddingRight: 16,
    gap: 12,
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    paddingVertical: 16,
  },
  designName: {
    color: COLORS.vjText,
    fontWeight: '700',
    fontSize: 15,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingRight: 8,
  },
  lowStockBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  lowStockText: {
    color: '#D97706',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bellButton: {
    padding: 4,
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metalPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  metalPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weightText: {
    color: 'rgba(92,22,35,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(92,22,35,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  countText: {
    color: COLORS.vjText,
    fontSize: 16,
    fontWeight: '800',
  },
  countLabel: {
    color: 'rgba(92,22,35,0.4)',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerIconRow: {
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(92,22,35,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    color: 'rgba(92,22,35,0.5)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(92,22,35,0.35)',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FCFAF8',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(92,22,35,0.6)',
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(92,22,35,0.7)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vjText,
    marginBottom: 12,
  },
  inputErrorBorder: {
    borderColor: '#EF4444',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  clearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
