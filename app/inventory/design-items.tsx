// app/inventory/design-items.tsx — Phase 2 v2.34 Canonical Screen (Screen C) with Modern Stock Card & Interactive Sorting
// Aligned with FEAT-SCREEN-C-SIZE-1 (v2.13), FIX-SCREENC-PHANTOM-DOC-1 (v1.70), and MastersSyncStore

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Modal, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { getDisplayPurity, formatKaratBadge, formatSKUDisplay, formatWeightMg as formatWeight } from '@/utils/calculations';
import { MapPin, Package, Printer, Scale, Sparkles, ArrowUpDown, Check, X, ShieldCheck, ShieldAlert, ChevronRight, Tag } from 'lucide-react-native';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

type SortOption = 
  | 'DEFAULT'
  | 'SIZE_ASC'
  | 'SIZE_DESC'
  | 'WEIGHT_DESC'
  | 'WEIGHT_ASC'
  | 'PURITY_DESC'
  | 'SKU_ASC'
  | 'SKU_DESC';

interface SortPreset {
  id: SortOption;
  label: string;
  sublabel: string;
}

const SORT_PRESETS: SortPreset[] = [
  { id: 'DEFAULT', label: 'Default Pattern', sublabel: 'Purity High → Size Low → Inward sequence' },
  { id: 'SIZE_ASC', label: 'Size: Low to High', sublabel: 'Smallest sizes first (14 → 22)' },
  { id: 'SIZE_DESC', label: 'Size: High to Low', sublabel: 'Largest sizes first (22 → 14)' },
  { id: 'WEIGHT_DESC', label: 'Net Weight: Heaviest First', sublabel: 'Highest physical weight first' },
  { id: 'WEIGHT_ASC', label: 'Net Weight: Lightest First', sublabel: 'Lowest physical weight first' },
  { id: 'PURITY_DESC', label: 'Purity: Highest First', sublabel: '24K → 22K → 18K purity' },
  { id: 'SKU_ASC', label: 'SKU: Sequential (A → Z)', sublabel: 'Ascending SKU code' },
  { id: 'SKU_DESC', label: 'SKU: Reverse (Z → A)', sublabel: 'Descending SKU code' },
];

const ItemRow = memo(({ 
  item, 
  colors, 
  isDark,
  onPress, 
  onPrint 
}: { 
  item: ItemSearchResult; 
  colors: ReturnType<typeof getThemeColors>; 
  isDark: boolean;
  onPress: (id: string) => void; 
  onPrint: (id: string) => void; 
}) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.bullionGold : COLORS.bullionSilver;
  const isGold = item.metal === 'GOLD';

  const karatBadge = formatKaratBadge(item.purityPercent, item.metal);
  const purityFull = (isGold && karatBadge)
    ? `${karatBadge} · ${item.purityPercent.toFixed(1)}%`
    : `${item.purityPercent.toFixed(1)}%`;

  const hasSize = item.sizeValue !== null && item.sizeValue !== undefined;
  const sizeDisplay = hasSize ? `Size ${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}` : null;

  return (
    <TouchableOpacity 
      testID={`design-item-row-${item.itemId}`}
      activeOpacity={0.85} 
      style={[
        s.itemCard,
        {
          backgroundColor: isDark ? 'rgba(28, 20, 24, 0.88)' : '#FFFFFF',
          borderColor: isDark ? 'rgba(212, 175, 55, 0.28)' : 'rgba(212, 175, 55, 0.22)',
        }
      ]} 
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.itemId);
      }}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        {/* Top Row: Monogram + Name + Size, SKU below name, Purity Badge */}
        <View style={s.itemHeaderRow}>
          <View style={s.titleAndSkuBlock}>
            <View style={s.nameAndSizeRow}>
              <JewelryMonogramEmblem
                designName={item.designName}
                metal={item.metal}
                size={34}
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {item.designName ? (
                    <Text style={[s.designNameText, { color: colors.vjText }]} numberOfLines={2}>
                      {item.designName}
                    </Text>
                  ) : null}
                  {sizeDisplay && (
                    <View style={[s.sizeBadge, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.16)' : `${colors.vjAccent}18`, borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : `${colors.vjAccent}40` }]}>
                      <Text style={[s.sizeBadgeText, { color: isDark ? '#FDE68A' : colors.vjText }]}>{sizeDisplay}</Text>
                    </View>
                  )}
                </View>

                <View style={s.skuRowBelow}>
                  <View style={[s.skuCapsule, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : `${colors.vjHeaderBg}10`, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : `${colors.vjHeaderBg}28` }]}>
                    <Tag size={10} color={isDark ? '#FDE68A' : colors.vjHeaderBg} style={{ opacity: 0.85 }} />
                    <Text style={[s.skuText, { color: isDark ? '#E5E7EB' : colors.vjHeaderBg }]}>{formatSKUDisplay(item.sku)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={s.headerCornerCluster}>
            <View style={[s.purityBadge, { borderColor: isGold ? (isDark ? 'rgba(212, 175, 55, 0.40)' : `${colors.vjHeaderBg}35`) : (isDark ? 'rgba(148, 163, 184, 0.40)' : '#CBD5E1'), backgroundColor: isGold ? (isDark ? 'rgba(212, 175, 55, 0.16)' : `${colors.vjHeaderBg}14`) : (isDark ? 'rgba(148, 163, 184, 0.16)' : '#F1F5F9') }]}>
              <Sparkles size={11} color={isGold ? (isDark ? '#FDE68A' : colors.vjHeaderBg) : (isDark ? '#E2E8F0' : '#475569')} style={{ marginRight: 4 }} />
              <Text style={[s.purityBadgeText, { color: isGold ? (isDark ? '#FDE68A' : colors.vjHeaderBg) : (isDark ? '#E2E8F0' : '#475569') }]}>{purityFull}</Text>
            </View>
            <ChevronRight size={17} color={colors.vjAccent} style={{ opacity: 0.38, marginLeft: 2 }} />
          </View>
        </View>

        {/* Digital Swiss Scale Metrics Box */}
        <View style={[s.heroMetricsContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.85)', borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : `${colors.vjText}18` }]}>
          <View style={s.weightSingleLine}>
            <Text style={[s.weightLabel, { color: isDark ? 'rgba(255, 255, 255, 0.55)' : `${colors.vjText}99` }]}>NET: </Text>
            <Text style={[s.weightValueNet, { color: isDark ? '#FDE68A' : colors.vjHeaderBg }]}>
              {formatWeight(item.netWeightMg ?? item.grossWeightMg)}
            </Text>
            <Text style={[s.weightBullet, { color: isDark ? 'rgba(255, 255, 255, 0.30)' : `${colors.vjText}4D` }]}>  •  </Text>
            <Text style={[s.weightLabel, { color: isDark ? 'rgba(255, 255, 255, 0.55)' : `${colors.vjText}99` }]}>GROSS: </Text>
            <Text style={[s.weightValueGross, { color: colors.vjText }]}>
              {formatWeight(item.grossWeightMg)}
            </Text>
          </View>

          {item.huid?.trim() ? (
            <View style={[s.huidVerifiedCapsule, { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.16)' : 'rgba(22, 163, 74, 0.08)' }]}>
              <ShieldCheck size={11} color="#16A34A" />
              <Text style={s.huidVerifiedText}>HUID: {item.huid.trim()}</Text>
            </View>
          ) : (
            <View style={[s.huidPendingCapsule, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(92, 22, 35, 0.04)' }]}>
              <ShieldAlert size={11} color={isDark ? '#9CA3AF' : `${colors.vjText}66`} />
              <Text style={[s.huidPendingText, { color: isDark ? '#9CA3AF' : `${colors.vjText}80` }]}>No HUID</Text>
            </View>
          )}
        </View>

        {/* Location & Print Tag Action */}
        <View style={s.bottomRow}>
          <View style={s.locationRow}>
            <MapPin size={12} color={item.location?.trim() ? colors.vjAccent : `${colors.vjText}66`} style={{ opacity: 0.65 }} />
            <Text 
              style={[
                s.locationText, 
                item.location?.trim() 
                  ? { color: colors.vjText, opacity: 0.75 } 
                  : { color: `${colors.vjText}66`, fontStyle: 'italic' }
              ]}
            >
              {item.location?.trim() ? item.location.trim() : 'No Location'}
            </Text>
          </View>

          <TouchableOpacity 
            testID={`print-btn-${item.itemId}`}
            activeOpacity={0.75} 
            onPress={(e) => {
              e?.stopPropagation?.();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              onPrint(item.itemId);
            }}
            style={[
              s.printBtn, 
              { 
                borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : `${colors.vjAccent}45`, 
                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.14)' : `${colors.vjAccent}12` 
              }
            ]}
          >
            <Printer size={13} color={isDark ? '#FDE68A' : colors.vjAccent} />
            <Text style={[s.printBtnText, { color: isDark ? '#FDE68A' : colors.vjAccent }]}>Print Tag</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function DesignItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;

  const params = useLocalSearchParams<{ designId: string; designName: string; purityPercent?: string }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId;
  const designName = Array.isArray(params.designName) ? params.designName[0] : params.designName;
  const purityPercent = Array.isArray(params.purityPercent) ? params.purityPercent[0] : params.purityPercent;

  const { activeFirmId } = useFirmStore();
  
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [dbDesignName, setDbDesignName] = useState<string>(designName || '');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string>('ALL');
  const [selectedSort, setSelectedSort] = useState<SortOption>('DEFAULT');
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';
  const designVersion = useMastersSyncStore((s) => s.designVersion);

  const purityNum = purityPercent ? parseFloat(purityPercent) : undefined;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getItemsByDesign(activeFirmId, designId, purityNum);
          if (active) {
            setItems(results);
            if (results.length > 0 && results[0]?.designName) {
              setDbDesignName(results[0].designName);
            } else if (designName) {
              setDbDesignName(designName);
            }
          }
        } catch (e) {
          console.error('[DesignItems] getItemsByDesign failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, designId, purityNum, designName, designVersion])
  );

  const handleItemPress = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/item-detail', params: { itemId } });
  }, [router]);

  const handlePrint = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/barcode-print', params: { itemId } });
  }, [router]);

  const distinctSizes = useMemo(() => {
    const sizeMap = new Map<string, { label: string; count: number; numericVal: number }>();
    items.forEach((i) => {
      if (i.sizeValue !== null && i.sizeValue !== undefined) {
        const key = `${i.sizeValue}`;
        const existing = sizeMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const label = `Size ${i.sizeValue}${i.sizeUnit ? ' ' + i.sizeUnit : ''}`;
          sizeMap.set(key, { label, count: 1, numericVal: Number(i.sizeValue) || 0 });
        }
      }
    });

    return Array.from(sizeMap.entries())
      .sort(([, a], [, b]) => a.numericVal - b.numericVal)
      .map(([key, info]) => ({
        key,
        label: info.label,
        count: info.count,
      }));
  }, [items]);

  const processedItems = useMemo(() => {
    let result = selectedSizeFilter === 'ALL'
      ? [...items]
      : items.filter((i) => String(i.sizeValue) === selectedSizeFilter);

    switch (selectedSort) {
      case 'SIZE_ASC':
        result.sort((a, b) => {
          const valA = a.sizeValue ?? 999999;
          const valB = b.sizeValue ?? 999999;
          return valA - valB || a.sku.localeCompare(b.sku);
        });
        break;
      case 'SIZE_DESC':
        result.sort((a, b) => {
          const valA = a.sizeValue ?? -1;
          const valB = b.sizeValue ?? -1;
          return valB - valA || a.sku.localeCompare(b.sku);
        });
        break;
      case 'WEIGHT_DESC':
        result.sort((a, b) => 
          (b.netWeightMg ?? b.grossWeightMg) - (a.netWeightMg ?? a.grossWeightMg) || a.sku.localeCompare(b.sku)
        );
        break;
      case 'WEIGHT_ASC':
        result.sort((a, b) => 
          (a.netWeightMg ?? a.grossWeightMg) - (b.netWeightMg ?? b.grossWeightMg) || a.sku.localeCompare(b.sku)
        );
        break;
      case 'PURITY_DESC':
        result.sort((a, b) => b.purityPercent - a.purityPercent || a.sku.localeCompare(b.sku));
        break;
      case 'SKU_ASC':
        result.sort((a, b) => a.sku.localeCompare(b.sku));
        break;
      case 'SKU_DESC':
        result.sort((a, b) => b.sku.localeCompare(a.sku));
        break;
      case 'DEFAULT':
      default:
        break;
    }

    return result;
  }, [items, selectedSizeFilter, selectedSort]);

  const totalNetWeightMg = useMemo(() => {
    return processedItems.reduce((sum, i) => sum + (i.netWeightMg ?? i.grossWeightMg), 0);
  }, [processedItems]);

  const purityPillLabel = useMemo(() => {
    if (!purityNum || items.length === 0) return null;
    return getDisplayPurity(purityNum, items[0]?.purityKarat || null, items[0]?.metal || 'GOLD');
  }, [purityNum, items]);

  const isSilver = items[0]?.metal === 'SILVER';
  const bullionColor = isSilver ? COLORS.bullionSilver : COLORS.bullionGold;

  const activeSortLabel = useMemo(() => {
    return SORT_PRESETS.find((p) => p.id === selectedSort)?.label || 'Sort';
  }, [selectedSort]);

  const headerDesignCard = !loading && items.length > 0 ? (
    <View style={[{ width: '100%' }, isTablet && { maxWidth: 780, alignSelf: 'center' }]}>
      <View style={s.headerDesignCard}>
        <View style={s.heroTopRow}>
          <View style={[s.headerPurityBadge, { backgroundColor: `${bullionColor}18`, borderColor: `${bullionColor}40` }]}>
            <Sparkles size={13} color={bullionColor} />
            <Text style={[s.headerPurityBadgeText, { color: bullionColor }]}>{purityPillLabel || 'BULLION PURITY'}</Text>
          </View>
          <View style={s.heroPillsRow}>
            <View style={s.headerMetaPill}>
              <Package size={11} color="rgba(255, 255, 255, 0.85)" />
              <Text style={s.headerMetaText}>{processedItems.length} Tagged</Text>
            </View>
            {distinctSizes.length > 0 && (
              <View style={s.headerMetaPill}>
                <Text style={s.headerMetaText}>{distinctSizes.length} Sizes</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.headerDivider} />

        <View style={s.heroScaleContainer}>
          <Text style={s.headerScaleLabel}>TOTAL PHYSICAL NET WEIGHT</Text>
          <View style={s.heroScaleValueRow}>
            <Scale size={20} color={bullionColor} style={{ marginRight: 6 }} />
            <Text style={s.headerScaleDigits}>
              {formatWeight(totalNetWeightMg)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <TwoToneWrapper title={dbDesignName || designName || 'Design Stock'} showBack headerContent={headerDesignCard}>
      <View style={[{ flex: 1, width: '100%' }, isTablet && { maxWidth: 780, alignSelf: 'center' }]}>
      
      {/* Interactive Toolbar: Size Filter Chips + Quick Sort Button */}
      <View 
        style={[
          s.filterBarContainer,
          {
            backgroundColor: isDark ? 'rgba(28, 20, 24, 0.88)' : 'rgba(255, 255, 255, 0.85)',
            borderBottomColor: isDark ? 'rgba(212, 175, 55, 0.20)' : 'rgba(92, 22, 35, 0.08)',
          }
        ]}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          <TouchableOpacity
            testID="sort-modal-trigger"
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setIsSortModalOpen(true);
            }}
            style={[
              s.sortTriggerBtn,
              selectedSort !== 'DEFAULT' && [s.sortTriggerBtnActive, { backgroundColor: colors.vjAccent, borderColor: colors.vjAccent }]
            ]}
            activeOpacity={0.75}
          >
            <ArrowUpDown size={13} color={selectedSort !== 'DEFAULT' ? '#FFFFFF' : colors.vjAccent} />
            <Text style={[s.sortTriggerText, { color: selectedSort !== 'DEFAULT' ? '#FFFFFF' : colors.vjText }]}>
              {selectedSort === 'DEFAULT' ? 'Sort' : activeSortLabel.split(':')[0]}
            </Text>
          </TouchableOpacity>

          <View style={[s.dividerVertical, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(92, 22, 35, 0.15)' }]} />

          <TouchableOpacity
            testID="filter-size-all"
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setSelectedSizeFilter('ALL');
            }}
            style={[
              s.filterChip,
              {
                backgroundColor: selectedSizeFilter === 'ALL' ? colors.vjAccent : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF'),
                borderColor: selectedSizeFilter === 'ALL' ? colors.vjAccent : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(92, 22, 35, 0.14)'),
              }
            ]}
          >
            <Text style={[s.filterChipText, { color: selectedSizeFilter === 'ALL' ? '#FFFFFF' : colors.vjText }]}>
              All Sizes ({items.length})
            </Text>
          </TouchableOpacity>

          {distinctSizes.map((size) => {
            const isSelected = selectedSizeFilter === size.key;
            return (
              <TouchableOpacity
                testID={`filter-size-${size.key}`}
                key={size.key}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setSelectedSizeFilter(isSelected ? 'ALL' : size.key);
                }}
                style={[
                  s.filterChip,
                  {
                    backgroundColor: isSelected ? colors.vjAccent : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF'),
                    borderColor: isSelected ? colors.vjAccent : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(92, 22, 35, 0.14)'),
                  }
                ]}
              >
                <Text style={[s.filterChipText, { color: isSelected ? '#FFFFFF' : colors.vjText }]}>
                  {size.label}
                </Text>
                <View style={[s.sizeCountBadge, isSelected ? s.sizeCountBadgeActive : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(92, 22, 35, 0.06)' }]}>
                  <Text style={[s.sizeCountText, isSelected ? s.sizeCountTextActive : { color: isDark ? '#E5E7EB' : 'rgba(92, 22, 35, 0.65)' }]}>
                    {size.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.vjAccent} />
          <Text style={[s.loadingText, { color: colors.vjText }]}>Loading design items...</Text>
        </View>
      ) : (
        <FlashList
          data={processedItems}
          keyExtractor={(item: ItemSearchResult) => item.itemId}
          renderItem={({ item }: { item: ItemSearchResult }) => (
            <ItemRow item={item} colors={colors} isDark={isDark} onPress={handleItemPress} onPrint={handlePrint} />
          )}
          // @ts-ignore: estimatedItemSize required by FlashList
          estimatedItemSize={175}
          contentContainerStyle={{ 
            paddingTop: 14, 
            paddingBottom: Math.max(insets.bottom + 60, 90), 
            paddingHorizontal: isTablet ? 24 : 14 
          }}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Package size={48} color={colors.vjAccent} style={{ opacity: 0.3 }} />
              <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Stock Items Found</Text>
              <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                {selectedSizeFilter !== 'ALL' 
                  ? 'No tagged items matching the selected size.' 
                  : 'There are currently no items matching this criteria.'}
              </Text>
            </View>
          }
        />
      )}
      </View>

      {/* Sort Options Modal */}
      <Modal visible={isSortModalOpen} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsSortModalOpen(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[
              s.sortModalCard, 
              { 
                backgroundColor: isDark ? '#1C1418' : colors.vjBg, 
                borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : colors.border 
              }
            ]}
          >
            <View style={[s.sortModalHeader, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(92, 22, 35, 0.08)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ArrowUpDown size={18} color={colors.vjAccent} />
                <Text style={[s.sortModalTitle, { color: colors.vjText }]}>Sort Items</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSortModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={colors.vjText} style={{ opacity: 0.5 }} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {SORT_PRESETS.map((preset) => {
                const isSelected = selectedSort === preset.id;
                return (
                  <TouchableOpacity
                    testID={`sort-option-${preset.id}`}
                    key={preset.id}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setSelectedSort(preset.id);
                      setIsSortModalOpen(false);
                    }}
                    style={[
                      s.sortOptionCard,
                      {
                        backgroundColor: isSelected 
                          ? `${colors.vjAccent}18` 
                          : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF'),
                        borderColor: isSelected 
                          ? colors.vjAccent 
                          : (isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(92, 22, 35, 0.08)')
                      }
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sortOptionLabel, { color: colors.vjText }, isSelected && { color: colors.vjAccent, fontWeight: '800' }]}>
                        {preset.label}
                      </Text>
                      <Text style={[s.sortOptionSublabel, { color: colors.vjText, opacity: 0.6 }]}>
                        {preset.sublabel}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={[s.checkCircle, { backgroundColor: colors.vjAccent }]}>
                        <Check size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
  
  // HEADER DESIGN CARD STYLES (DARK GLASS STYLE)
  headerDesignCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  headerPurityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  headerPurityBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  headerMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 10,
  },
  headerScaleLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: 'rgba(255, 255, 255, 0.80)',
  },
  headerScaleDigits: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroScaleContainer: {
    alignItems: 'flex-start',
    gap: 2,
  },
  heroScaleValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  filterBarContainer: {
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dividerVertical: {
    width: 1,
    height: 24,
    marginHorizontal: 2,
  },
  sortTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1.2,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  sortTriggerBtnActive: {},
  sortTriggerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  filterChipActive: {
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sizeCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  sizeCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  sizeCountText: {
    fontSize: 10,
    fontWeight: '800',
  },
  sizeCountTextActive: {
    color: '#FFFFFF',
  },

  // MODERN STOCK CARD STYLES
  itemCard: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.2,
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  metalStripe: {
    width: 5,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleAndSkuBlock: {
    flex: 1,
    paddingRight: 8,
    gap: 3,
  },
  nameAndSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skuRowBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  designNameText: {
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  skuCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  skuText: {
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 11.5,
    letterSpacing: 0.5,
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  sizeBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  headerCornerCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
  },
  purityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1.2,
  },
  purityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // HERO METRICS CONTAINER (Swiss Digital Scale View)
  heroMetricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  weightSingleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  weightLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weightValueNet: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  weightBullet: {
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 3,
  },
  weightValueGross: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  huidVerifiedCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  huidVerifiedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.3,
  },
  huidPendingCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  huidPendingText: {
    fontSize: 9.5,
    fontWeight: '600',
    fontStyle: 'italic',
  },

  // CARD BOTTOM ROW
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '700',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  printBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', opacity: 0.7 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sortModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  sortModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  sortModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sortOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  sortOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  sortOptionSublabel: {
    fontSize: 11,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});