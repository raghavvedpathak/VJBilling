// app/inventory/design-items.tsx — Phase 2 v2.24 Canonical Screen (Screen C) with Modern Stock Card & Interactive Sorting

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { designRepository } from '@/repositories/phase2/designRepository';
import { getDisplayPurity, formatKaratBadge, formatSKUDisplay, formatWeightMg as formatWeight } from '@/utils/calculations';
import { MapPin, Package, Printer, Scale, Sparkles, ArrowUpDown, Check, X, ShieldCheck, ShieldAlert } from 'lucide-react-native';
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
  onPress, 
  onPrint 
}: { 
  item: ItemSearchResult; 
  colors: ReturnType<typeof getThemeColors>; 
  onPress: (id: string) => void; 
  onPrint: (id: string) => void; 
}) => {
  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;
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
      activeOpacity={0.8} 
      style={s.itemCard} 
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.itemId);
      }}
    >
      {/* Left Metal Accent Indicator */}
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        {/* TOP ROW: DESIGN NAME + SKU + SIZE PILL & PURITY BADGE */}
        <View style={s.itemHeaderRow}>
          <View style={s.skuContainer}>
            {item.designName ? (
              <Text style={[s.designNameText, { color: colors.vjText }]}>{item.designName}</Text>
            ) : null}
            <Text style={[s.skuText, { color: colors.vjAccent }]}>{formatSKUDisplay(item.sku)}</Text>
            {sizeDisplay && (
              <View style={[s.sizeBadge, { backgroundColor: 'rgba(212, 175, 55, 0.14)', borderColor: 'rgba(212, 175, 55, 0.35)' }]}>
                <Text style={[s.sizeBadgeText, { color: colors.vjText }]}>{sizeDisplay}</Text>
              </View>
            )}
          </View>

          {/* Karat & Purity Pill */}
          <View style={[s.purityBadge, { borderColor: metalColor, backgroundColor: `${metalColor}14` }]}>
            <Sparkles size={11} color={metalColor} style={{ marginRight: 4 }} />
            <Text style={[s.purityBadgeText, { color: metalColor }]}>{purityFull}</Text>
          </View>
        </View>

        {/* HERO METRICS CONTAINER */}
        <View style={[s.heroMetricsContainer, { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(92, 22, 35, 0.08)' }]}>
          {/* Left Metadata: Barcode & HUID */}
          <View style={s.metaCol}>
            <View style={s.barcodeCapsule}>
              <Text style={s.barcodeLabel}>BARCODE</Text>
              <Text style={s.barcodeValue}>{item.barcode}</Text>
            </View>

            {item.huid ? (
              <View style={s.huidVerifiedCapsule}>
                <ShieldCheck size={13} color="#15803d" />
                <Text style={s.huidVerifiedText}>HUID: {item.huid}</Text>
              </View>
            ) : (
              <View style={s.huidPendingCapsule}>
                <ShieldAlert size={12} color="rgba(92, 22, 35, 0.4)" />
                <Text style={s.huidPendingText}>No HUID</Text>
              </View>
            )}
          </View>

          {/* Right Hero: Net Weight */}
          <View style={s.heroWeightCol}>
            <Text style={s.heroNetLabel}>AVAILABLE NET WT</Text>
            <View style={s.weightNumberRow}>
              <Text style={[s.heroNetValue, { color: colors.vjAccent }]}>
                {formatWeight(item.netWeightMg ?? item.grossWeightMg)}
              </Text>
            </View>
            <Text style={s.grossSubText}>
              Gross: {formatWeight(item.grossWeightMg)}
            </Text>
          </View>
        </View>

        {/* BOTTOM ROW: LOCATION & PRINT ACTION */}
        <View style={s.bottomRow}>
          <View style={s.locationRow}>
            <MapPin size={13} color={colors.vjAccent} style={{ opacity: 0.6 }} />
            <Text style={[s.locationText, { color: colors.vjText, opacity: 0.6 }]}>{item.location || '—'}</Text>
          </View>

          <TouchableOpacity 
            testID={`print-btn-${item.itemId}`}
            activeOpacity={0.75} 
            onPress={(e) => {
              e.stopPropagation();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              onPrint(item.itemId);
            }}
            style={[s.printBtn, { borderColor: `${colors.vjAccent}45`, backgroundColor: `${colors.vjAccent}14` }]}
          >
            <Printer size={15} color={colors.vjAccent} />
            <Text style={[s.printBtnText, { color: colors.vjAccent }]}>Print</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function DesignItemsScreen() {
  const router = useRouter();
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

  const purityNum = purityPercent ? parseFloat(purityPercent) : undefined;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId) return;
        setLoading(true);
        try {
          const [results, designRecord] = await Promise.all([
            inventoryDrillDownService.getItemsByDesign(activeFirmId, designId, purityNum),
            designRepository.getById(designId)
          ]);
          if (active) {
            setItems(results);
            if (designRecord?.name) {
              setDbDesignName(designRecord.name);
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
    }, [activeFirmId, designId, purityNum])
  );

  const handleItemPress = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/item-detail', params: { itemId } });
  }, [router]);

  const handlePrint = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/barcode-print', params: { itemId } });
  }, [router]);

  // Distinct sizes present in fetched batch, numerically sorted
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

  // Client-side filtering and multi-criteria sorting
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

  const activeSortLabel = useMemo(() => {
    return SORT_PRESETS.find((p) => p.id === selectedSort)?.label || 'Sort';
  }, [selectedSort]);

  const designHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${processedItems.length} Tagged Items`} />
      {purityPillLabel && (
        <HeaderPill icon={<Sparkles size={12} color="#38BDF8" />} label={purityPillLabel} variant="info" />
      )}
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={dbDesignName || designName || 'Design Stock'} showBack headerContent={designHeaderPills}>
      
      {/* Interactive Toolbar: Size Filter Chips + Quick Sort Button */}
      <View style={s.filterBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {/* Quick Sort Trigger Button */}
          <TouchableOpacity
            testID="sort-modal-trigger"
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setIsSortModalOpen(true);
            }}
            style={[
              s.sortTriggerBtn,
              selectedSort !== 'DEFAULT' && s.sortTriggerBtnActive
            ]}
            activeOpacity={0.75}
          >
            <ArrowUpDown size={13} color={selectedSort !== 'DEFAULT' ? '#FFFFFF' : colors.vjAccent} />
            <Text style={[s.sortTriggerText, { color: selectedSort !== 'DEFAULT' ? '#FFFFFF' : colors.vjText }]}>
              {selectedSort === 'DEFAULT' ? 'Sort' : activeSortLabel.split(':')[0]}
            </Text>
          </TouchableOpacity>

          <View style={s.dividerVertical} />

          {/* All Sizes (Select All / Reset) Chip */}
          <TouchableOpacity
            testID="filter-size-all"
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setSelectedSizeFilter('ALL');
            }}
            style={[
              s.filterChip,
              selectedSizeFilter === 'ALL' && [s.filterChipActive, { backgroundColor: colors.vjAccent, borderColor: colors.vjAccent }]
            ]}
          >
            <Text style={[s.filterChipText, { color: selectedSizeFilter === 'ALL' ? '#FFFFFF' : colors.vjText }]}>
              All Sizes ({items.length})
            </Text>
          </TouchableOpacity>

          {/* Individual Size Filter Chips with Piece Counts */}
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
                  isSelected && [s.filterChipActive, { backgroundColor: colors.vjAccent, borderColor: colors.vjAccent }]
                ]}
              >
                <Text style={[s.filterChipText, { color: isSelected ? '#FFFFFF' : colors.vjText }]}>
                  {size.label}
                </Text>
                <View style={[s.sizeCountBadge, isSelected && s.sizeCountBadgeActive]}>
                  <Text style={[s.sizeCountText, isSelected && s.sizeCountTextActive]}>
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
            <ItemRow item={item} colors={colors} onPress={handleItemPress} onPrint={handlePrint} />
          )}
          // @ts-ignore: estimatedItemSize required by FlashList
          estimatedItemSize={145}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 100, paddingHorizontal: 14 }}
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

      {/* Sort Options Modal with Backdrop Tap-to-Dismiss */}
      <Modal visible={isSortModalOpen} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsSortModalOpen(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[s.sortModalCard, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={s.sortModalHeader}>
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
                      isSelected && { borderColor: colors.vjAccent, backgroundColor: `${colors.vjAccent}12` }
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
  
  filterBarContainer: {
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92,22,35,0.08)',
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
    backgroundColor: 'rgba(92,22,35,0.15)',
    marginHorizontal: 2,
  },
  sortTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  sortTriggerBtnActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  sortTriggerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.15)',
  },
  filterChipActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sizeCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(92,22,35,0.06)',
  },
  sizeCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  sizeCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(92,22,35,0.6)',
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
    backgroundColor: '#FCFBF8',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  designNameText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  skuText: {
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
    opacity: 0.85,
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  sizeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  purityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  purityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // HERO METRICS CONTAINER
  heroMetricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  metaCol: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  barcodeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barcodeLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: 'rgba(92, 22, 35, 0.45)',
    letterSpacing: 0.5,
  },
  barcodeValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: 'rgba(92, 22, 35, 0.75)',
  },
  huidVerifiedCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
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
    backgroundColor: 'rgba(92, 22, 35, 0.04)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  huidPendingText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(92, 22, 35, 0.45)',
    fontStyle: 'italic',
  },

  // HERO WEIGHT
  heroWeightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  heroNetLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: 'rgba(92, 22, 35, 0.5)',
    letterSpacing: 0.8,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  weightNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroNetValue: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  grossSubText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(92, 22, 35, 0.55)',
    marginTop: 1,
  },

  // CARD BOTTOM ROW
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  printBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    borderBottomColor: 'rgba(92,22,35,0.08)',
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
    borderColor: 'rgba(92,22,35,0.08)',
    backgroundColor: '#FFFFFF',
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