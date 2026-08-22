// app/inventory/category-items.tsx — Phase 2 v2.15 Canonical Screen (Screen B)

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { designService } from '@/services/phase2/designService';
import type { DesignCategoryStockResult } from '@/types/phase2/phase2.types';
import { formatWeightMg as formatWeight } from '@/utils/calculations';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';
import { ChevronRight, Layers, Bell, X, AlertTriangle, Scale, Package, Tag } from 'lucide-react-native';
import { getJewelryCategoryIcon } from '@/utils/jewelryIcons';

type DesignRowProps = {
  item: DesignCategoryStockResult;
  categoryName?: string;
  isLowStock: boolean;
  currentThreshold: number | null;
  colors: ReturnType<typeof getThemeColors>;
  onPress: (designId: string, designName: string, purityPercent: number) => void;
  onOpenLowStockModal: (designId: string, designName: string, purityPercent: number, currentThreshold: number | null) => void;
};

const DesignRow = memo(({ item, categoryName, isLowStock, currentThreshold, colors, onPress, onOpenLowStockModal }: DesignRowProps) => {
  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;

  const purityFull = item.purityKarat 
    ? `${item.purityKarat}K (${item.purityPercent.toFixed(1)}%)`
    : `${item.purityPercent.toFixed(1)}%`;

  return (
    <TouchableOpacity
      id={`design-row-${item.designId}-${item.purityPercent}`}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.designId, item.designName, item.purityPercent);
      }}
      activeOpacity={0.75}
      style={[
        s.card,
        {
          backgroundColor: '#FFFFFF',
          borderColor: `${colors.vjAccent}25`,
          borderRadius: 20,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
        }
      ]}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={[s.metalBadge, { backgroundColor: `${colors.vjAccent}1A`, borderColor: `${colors.vjAccent}40` }]}>
        {getJewelryCategoryIcon(categoryName, item.designName, item.metal, 22, colors.vjAccent)}
      </View>

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={[s.designName, { color: colors.vjText }]} numberOfLines={1}>{item.designName}</Text>
          <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{purityFull}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={[s.weightBadge, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}>
            <Scale size={11} color={colors.vjAccent} />
            <Text style={[s.weightText, { color: colors.vjText }]}>Net: {formatWeight(item.totalNetWeightMg)}</Text>
          </View>

          {/* Bell Icon & Low Stock Pill Keyed by (designId, purityPercent) variant */}
          <TouchableOpacity
            id={`low-stock-bell-${item.designId}-${item.purityPercent}`}
            onPress={(e) => {
              e.stopPropagation();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              onOpenLowStockModal(item.designId, item.designName, item.purityPercent, currentThreshold);
            }}
            activeOpacity={0.7}
            style={[
              s.lowStockPill,
              { borderColor: colors.border },
              isLowStock && s.lowStockPillActive,
            ]}
          >
            <Bell 
              size={12} 
              color={isLowStock ? '#D97706' : (currentThreshold !== null ? colors.vjAccent : colors.vjText)} 
              fill={isLowStock ? '#F59E0B' : (currentThreshold !== null ? `${colors.vjAccent}33` : 'none')}
              style={{ opacity: isLowStock ? 1 : 0.6 }}
            />
            <Text style={[
              s.lowStockPillText,
              { color: colors.vjText },
              isLowStock && s.lowStockPillTextActive,
            ]}>
              {isLowStock ? 'Low Stock' : (currentThreshold !== null ? `Min: ${currentThreshold}` : 'Limit')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.countBadge, { backgroundColor: '#FFFFFF', borderColor: `${colors.vjAccent}35` }]}>
        <Text style={[s.countText, { color: colors.vjText }]}>{item.availableCount}</Text>
        <Text style={[s.countLabel, { color: colors.vjText, opacity: 0.5 }]}>items</Text>
      </View>

      <ChevronRight size={18} color={colors.vjAccent} style={{ opacity: 0.5 }} />
    </TouchableOpacity>
  );
});

export default function CategoryItemsScreen() {
  const router = useRouter();
  const { categoryId, categoryName } = useLocalSearchParams<{ categoryId: string; categoryName: string }>();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<DesignCategoryStockResult[]>([]);
  const [lowStockVariantKeys, setLowStockVariantKeys] = useState<Set<string>>(new Set());
  const [variantThresholds, setVariantThresholds] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  const [selectedVariant, setSelectedVariant] = useState<{ id: string; name: string; purityPercent: number; threshold: number | null } | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const loadData = useCallback(async () => {
    if (!activeFirmId || !categoryId) return;
    setLoading(true);
    try {
      const [results, lowStockList] = await Promise.all([
        inventoryDrillDownService.getDesignsByCategory(activeFirmId, categoryId),
        inventoryDrillDownService.getLowStockDesignPurityVariants(activeFirmId),
      ]);

      setData(results);

      // Keyed strictly by (designId, purityPercent) variant
      const lowKeys = new Set<string>();
      const threshMap: Record<string, number | null> = {};

      lowStockList.forEach(v => {
        const key = `${v.designId}_${v.purityPercent}`;
        lowKeys.add(key);
        threshMap[key] = v.lowStockThreshold;
      });

      setLowStockVariantKeys(lowKeys);
      setVariantThresholds(threshMap);
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

  const handleOpenLowStockModal = useCallback((designId: string, designName: string, purityPercent: number, currentThreshold: number | null) => {
    setSelectedVariant({ id: designId, name: designName, purityPercent, threshold: currentThreshold });
    setThresholdInput(currentThreshold !== null ? String(currentThreshold) : '');
    setInputError(null);
  }, []);

  const handleSaveThreshold = async () => {
    if (!selectedVariant || !activeFirmId) return;

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
      await designService.updateDesignPurityLowStockThreshold(
        selectedVariant.id, 
        activeFirmId, 
        selectedVariant.purityPercent, 
        finalVal
      );
      setSelectedVariant(null);
      await loadData();
    } catch (e: any) {
      setInputError(e.message || 'Failed to update threshold');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearThreshold = async () => {
    if (!selectedVariant || !activeFirmId) return;

    setIsSubmitting(true);
    setInputError(null);
    try {
      await designService.updateDesignPurityLowStockThreshold(
        selectedVariant.id, 
        activeFirmId, 
        selectedVariant.purityPercent, 
        null
      );
      setSelectedVariant(null);
      await loadData();
    } catch (e: any) {
      setInputError(e.message || 'Failed to clear threshold');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalItems = data.reduce((sum, i) => sum + i.availableCount, 0);
  const totalWeightMg = data.reduce((sum, i) => sum + i.totalNetWeightMg, 0);

  const categoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label="Designs & Variants" />
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={categoryName || 'Category Items'} showBack headerContent={categoryHeaderPills}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading designs...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => `${item.designId}_${item.purityPercent}`}
            renderItem={({ item }) => {
              const variantKey = `${item.designId}_${item.purityPercent}`;
              return (
                <DesignRow 
                  item={item} 
                  categoryName={categoryName}
                  isLowStock={lowStockVariantKeys.has(variantKey)}
                  currentThreshold={variantThresholds[variantKey] ?? null}
                  colors={colors}
                  onPress={handleDesignPress} 
                  onOpenLowStockModal={handleOpenLowStockModal}
                />
              );
            }}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={88}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Layers size={48} color={colors.vjAccent} style={{ opacity: 0.3 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Designs Found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>This category has no available stock</Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={!!selectedVariant} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.vjBg, borderColor: colors.border }]}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <Bell size={20} color={colors.vjAccent} />
                <Text style={[s.modalTitle, { color: colors.vjText }]}>Set Low Stock Alert</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedVariant(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={colors.vjText} style={{ opacity: 0.5 }} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalSubtitle, { color: colors.vjText, opacity: 0.7 }]}>
              Variant: <Text style={{ fontWeight: '700', color: colors.vjText }}>{selectedVariant?.name} ({selectedVariant?.purityPercent}%)</Text>
            </Text>

            <Text style={[s.label, { color: colors.vjText, opacity: 0.7 }]}>Alert Threshold (Available Count)</Text>
            <TextInput
              style={[s.input, { color: colors.vjText, borderColor: colors.border }, !!inputError && s.inputErrorBorder]}
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
              {selectedVariant?.threshold !== null && selectedVariant?.threshold !== undefined && (
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
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    paddingRight: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  metalBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    paddingVertical: 14,
  },
  designName: {
    fontWeight: '800',
    fontSize: 15,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingRight: 6,
  },
  lowStockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(92,22,35,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  lowStockPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  lowStockPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    opacity: 0.7,
  },
  lowStockPillTextActive: {
    color: '#D97706',
    fontWeight: '800',
    textTransform: 'uppercase',
    opacity: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 6,
    marginTop: 2,
  },
  metalPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  metalPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  weightText: {
    fontSize: 11,
    fontWeight: '800',
  },
  countBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  countText: {
    fontSize: 16,
    fontWeight: '900',
  },
  countLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    opacity: 0.7,
  },
  emptySubtitle: {
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
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
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
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
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
