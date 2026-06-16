// app/inventory/design-items.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen C: Individual Items Under Design (STEP 16.3)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Grouped Expandable Layout (FEAT-SCREEN-C-GROUPED-1)

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity } from '../../utils/purity.constants';
import { ChevronRight, ChevronDown, Tag, Gem, MapPin } from 'lucide-react-native';
import type { ItemSearchResult } from '../../types/phase2.types';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
  gold: '#C8860A',
  silver: '#6B7280',
};

// --- View Types ---
type GroupHeaderData = {
  type: 'header';
  purityPercent: number;
  purityKarat: number | null;
  metal: 'GOLD' | 'SILVER';
  designName: string;
  itemCount: number;
  totalNetWeightMg: number;
  isExpanded: boolean;
};

type ItemRowData = {
  type: 'item';
  item: ItemSearchResult;
};

type ListItem = GroupHeaderData | ItemRowData;

// --- Header Component ---
const GroupHeader = memo(({ 
  data, 
  onToggle 
}: { 
  data: GroupHeaderData; 
  onToggle: (purity: number) => void 
}) => {
  const metalColor = data.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(data.purityPercent, data.purityKarat, data.metal);

  return (
    <TouchableOpacity
      id={`group-header-${data.purityPercent}`}
      onPress={() => onToggle(data.purityPercent)}
      activeOpacity={0.7}
      style={s.headerCard}
    >
      <View style={s.headerCardContent}>
        <View style={s.headerTitleRow}>
          <Text style={s.headerDesignName} numberOfLines={1}>{data.designName}</Text>
          <View style={[s.metalPill, { borderColor: metalColor }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
        </View>

        <View style={s.headerMetaRow}>
          <Text style={s.headerCount}>{data.itemCount} items</Text>
          <View style={s.dotDivider} />
          <Text style={s.headerWeight}>{formatWeight(data.totalNetWeightMg)}</Text>
        </View>
      </View>
      
      <View style={s.headerChevron}>
        {data.isExpanded ? (
          <ChevronDown size={20} color="rgba(46,29,0,0.4)" />
        ) : (
          <ChevronRight size={20} color="rgba(46,29,0,0.4)" />
        )}
      </View>
    </TouchableOpacity>
  );
});

// --- Item Component ---
const SkuRow = memo(({ 
  data, 
  onPress 
}: { 
  data: ItemRowData; 
  onPress: (itemId: string) => void 
}) => {
  const { item } = data;
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);

  return (
    <TouchableOpacity
      id={`item-row-${item.itemId}`}
      onPress={() => onPress(item.itemId)}
      activeOpacity={0.7}
      style={s.itemCard}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.itemCardBody}>
        <View style={s.topRow}>
          <Text style={s.skuText} selectable>{item.sku}</Text>
          <View style={s.badgeRow}>
            {item.huid ? (
              <View style={s.huidBadge}>
                <Text style={s.huidText}>{item.huid}</Text>
              </View>
            ) : (
              <View style={s.noHuidBadge}>
                <Text style={s.noHuidText}>No HUID</Text>
              </View>
            )}
          </View>
        </View>

        {item.barcode && item.barcode !== item.sku && (
          <Text style={s.barcodeText}>BC: {item.barcode}</Text>
        )}

        <View style={s.itemMetaRow}>
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Gross</Text>
            <Text style={s.itemMetaValue}>{formatWeight(item.grossWeightMg)}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Net</Text>
            <Text style={s.itemMetaValue}>{formatWeight(item.netWeightMg || 0)}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Purity</Text>
            <Text style={[s.itemMetaValue, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
        </View>

        <View style={s.locationRow}>
          <MapPin size={12} color="rgba(46,29,0,0.3)" />
          <Text style={s.locationText}>{item.location?.replace(/_/g, ' ') || '—'}</Text>
        </View>
      </View>

      <ChevronRight size={18} color="rgba(46,29,0,0.2)" />
    </TouchableOpacity>
  );
});

export default function DesignItemsScreen() {
  const router = useRouter();
  const { designId, designName } = useLocalSearchParams<{ designId: string; designName: string; purityPercent: string }>();
  const { activeFirmId } = useFirmStore();
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getItemsByDesign(activeFirmId, designId);
          if (active) setItems(results);
        } catch (e) {
          console.error('[DesignItems] getItemsByDesign failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, designId])
  );

  const toggleGroup = useCallback((purity: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(purity)) {
        next.delete(purity);
      } else {
        next.add(purity);
      }
      return next;
    });
  }, []);

  const handleItemPress = useCallback((itemId: string) => {
    router.push({
      pathname: '/inventory/item-detail',
      params: { itemId },
    });
  }, [router]);

  // Flatten logic
  const renderData = useMemo(() => {
    if (!items.length) return [];

    // Group by purityPercent
    const groupsMap = new Map<number, ItemSearchResult[]>();
    for (const item of items) {
      if (!groupsMap.has(item.purityPercent)) {
        groupsMap.set(item.purityPercent, []);
      }
      groupsMap.get(item.purityPercent)!.push(item);
    }

    // Sort purities DESC
    const sortedPurities = Array.from(groupsMap.keys()).sort((a, b) => b - a);
    
    const dataList: ListItem[] = [];

    for (const purity of sortedPurities) {
      const groupItems = groupsMap.get(purity)!;
      const firstItem = groupItems[0];
      const isExpanded = expandedGroups.has(purity);

      const totalNetWeightMg = groupItems.reduce((sum, item) => sum + (item.netWeightMg || 0), 0);

      dataList.push({
        type: 'header',
        purityPercent: purity,
        purityKarat: firstItem.purityKarat ?? null,
        metal: firstItem.metal,
        designName: designName || firstItem.designName,
        itemCount: groupItems.length,
        totalNetWeightMg,
        isExpanded,
      });

      if (isExpanded) {
        for (const item of groupItems) {
          dataList.push({ type: 'item', item });
        }
      }
    }

    return dataList;
  }, [items, expandedGroups, designName]);

  const totalItemsCount = items.length;
  const totalGrossWeightMg = items.reduce((sum, i) => sum + i.grossWeightMg, 0);

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Gem size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle} numberOfLines={1}>{designName || 'Design'}</Text>
      <Text style={s.headerSubtitle}>
        {totalItemsCount} Items • {formatWeight(totalGrossWeightMg)} Gross
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading items...</Text>
          </View>
        ) : (
          <FlashList
            data={renderData}
            keyExtractor={(item) => item.type === 'header' ? `header-${item.purityPercent}` : item.item.itemId}
            getItemType={(item) => item.type}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return <GroupHeader data={item} onToggle={toggleGroup} />;
              } else {
                return <SkuRow data={item} onPress={handleItemPress} />;
              }
            }}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Tag size={48} color="rgba(46,29,0,0.2)" />
                <Text style={s.emptyTitle}>No Items Found</Text>
                <Text style={s.emptySubtitle}>No available stock for this design</Text>
              </View>
            }
          />
        )}
      </View>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  // Header Row
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,29,0,0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(46,29,0,0.06)',
  },
  headerCardContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerDesignName: {
    color: COLORS.vjText,
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '70%',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCount: {
    color: 'rgba(46,29,0,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  dotDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(46,29,0,0.2)',
    marginHorizontal: 8,
  },
  headerWeight: {
    color: COLORS.vjText,
    fontSize: 13,
    fontWeight: '700',
  },
  headerChevron: {
    paddingLeft: 12,
  },
  // Item Row
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(46,29,0,0.08)',
    paddingRight: 16,
  },
  metalStripe: {
    width: 5,
    alignSelf: 'stretch',
  },
  itemCardBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  skuText: {
    color: COLORS.vjText,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  huidBadge: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  huidText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  noHuidBadge: {
    backgroundColor: 'rgba(46,29,0,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noHuidText: {
    color: 'rgba(46,29,0,0.4)',
    fontSize: 10,
    fontWeight: '700',
  },
  barcodeText: {
    color: 'rgba(46,29,0,0.4)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemMetaBlock: {
    paddingRight: 12,
  },
  metaDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(46,29,0,0.08)',
    marginRight: 12,
  },
  itemMetaLabel: {
    color: 'rgba(46,29,0,0.4)',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemMetaValue: {
    color: COLORS.vjText,
    fontSize: 13,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(46,29,0,0.02)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  locationText: {
    color: 'rgba(46,29,0,0.5)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
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
  // Base
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(250,243,224,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(46,29,0,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(46,29,0,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(46,29,0,0.35)', fontSize: 13 },
});
