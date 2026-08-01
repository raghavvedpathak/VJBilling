// app/inventory/design-items.tsx
// FEAT-SCREEN-C-GROUPED-1 (v1.66) — Screen C: Individual Items Under Design (STEP 16.3)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Grouped by purity, highest first. Expandable rows tracking local UI state.

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity, formatSKUDisplay, formatWeightMg as formatWeight } from '../../utils/calculations';
import { ChevronRight, ChevronDown, Gem, Tag, MapPin } from 'lucide-react-native';
import type { ItemSearchResult } from '../../types/phase2.types';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
};

type GroupHeaderData = {
  purityPercent: number;
  purityKarat: number | null;
  metal: 'GOLD' | 'SILVER';
  designName: string;
  itemCount: number;
  totalNetWeightMg: number;
};

type RenderListItem = 
  | { type: 'HEADER'; data: GroupHeaderData }
  | { type: 'ITEM'; data: ItemSearchResult };

const GroupHeader = memo(({
  data,
  isExpanded,
  onPress
}: {
  data: GroupHeaderData;
  isExpanded: boolean;
  onPress: (purity: number) => void
}) => {
  const metalColor = data.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(data.purityPercent, data.purityKarat, data.metal);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={s.headerCard}
      onPress={() => onPress(data.purityPercent)}
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
        {isExpanded ? (
          <ChevronDown size={20} color="rgba(92,22,35,0.4)" />
        ) : (
          <ChevronRight size={20} color="rgba(92,22,35,0.4)" />
        )}
      </View>
    </TouchableOpacity>
  );
});

const IndividualSKURow = memo(({ item, onPress }: { item: ItemSearchResult, onPress: (id: string) => void }) => {
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal as any);
  
  return (
    <TouchableOpacity 
      activeOpacity={0.7} 
      style={s.itemCard} 
      onPress={() => onPress(item.itemId)}
    >
      <View style={s.itemMainRow}>
        <View>
          <Text style={s.skuText}>{formatSKUDisplay(item.sku)}</Text>
          <Text style={s.barcodeText}>Barcode: {item.barcode}</Text>
        </View>
        <View style={s.purityBadge}>
          <Text style={s.purityBadgeText}>{purityDisplay}</Text>
        </View>
      </View>

      <View style={s.itemDetailsRow}>
        <View style={s.weightCol}>
          <Text style={s.detailLabel}>Net</Text>
          <Text style={s.weightValue}>{formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
        </View>
        <View style={s.weightCol}>
          <Text style={s.detailLabel}>Gross</Text>
          <Text style={s.weightValue}>{formatWeight(item.grossWeightMg)}</Text>
        </View>
        <View style={s.weightCol}>
          <Text style={s.detailLabel}>HUID</Text>
          <Text style={[s.huidValue, !item.huid && s.noHuidValue]}>{item.huid || 'No HUID'}</Text>
        </View>
      </View>

      <View style={s.locationRow}>
        <MapPin size={12} color="rgba(92,22,35,0.4)" />
        <Text style={s.locationText}>{item.location || '—'}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function DesignItemsScreen() {
  const router = useRouter();
  const { designId, designName } = useLocalSearchParams<{ designId: string; designName: string }>();
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

  const handleGroupPress = useCallback((purityPercent: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(purityPercent)) {
        next.delete(purityPercent);
      } else {
        next.add(purityPercent);
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

  const renderData = useMemo(() => {
    if (!items.length) return [];

    const groupsMap = new Map<number, ItemSearchResult[]>();
    for (const item of items) {
      if (!groupsMap.has(item.purityPercent)) {
        groupsMap.set(item.purityPercent, []);
      }
      groupsMap.get(item.purityPercent)!.push(item);
    }

    const sortedPurities = Array.from(groupsMap.keys()).sort((a, b) => b - a);
    const dataList: RenderListItem[] = [];

    for (const purity of sortedPurities) {
      const groupItems = groupsMap.get(purity)!;
      const firstItem = groupItems[0];
      const totalNetWeightMg = groupItems.reduce((sum, item) => sum + (item.netWeightMg || item.grossWeightMg), 0);

      dataList.push({
        type: 'HEADER',
        data: {
          purityPercent: purity,
          purityKarat: firstItem.purityKarat ?? null,
          metal: firstItem.metal as any,
          designName: designName || firstItem.designName,
          itemCount: groupItems.length,
          totalNetWeightMg,
        }
      });

      if (expandedGroups.has(purity)) {
        for (const item of groupItems) {
          dataList.push({ type: 'ITEM', data: item });
        }
      }
    }

    return dataList;
  }, [items, designName, expandedGroups]);

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
            keyExtractor={(item) => item.type === 'HEADER' ? `header-${item.data.purityPercent}` : `item-${item.data.itemId}`}
            renderItem={({ item }) => {
              if (item.type === 'HEADER') {
                return (
                  <GroupHeader 
                    data={item.data} 
                    isExpanded={expandedGroups.has(item.data.purityPercent)}
                    onPress={handleGroupPress} 
                  />
                );
              } else {
                return (
                  <IndividualSKURow 
                    item={item.data} 
                    onPress={handleItemPress} 
                  />
                );
              }
            }}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={100}
            contentContainerStyle={{paddingBottom: 100, paddingTop: 16}}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Tag size={48} color="rgba(92,22,35,0.2)" />
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
  headerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: 'rgba(92, 22, 35, 0.08)' },
  headerCardContent: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headerDesignName: { color: COLORS.vjText, fontSize: 15, fontWeight: '700', maxWidth: '70%' },
  metalPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  metalPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center' },
  headerCount: { color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '600' },
  dotDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(92,22,35,0.2)', marginHorizontal: 8 },
  headerWeight: { color: COLORS.vjText, fontSize: 12, fontWeight: '700' },
  headerChevron: { paddingLeft: 12 },
  itemCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 4, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  itemMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  skuText: { fontSize: 15, fontFamily: 'monospace', fontWeight: '700', color: COLORS.vjText, marginBottom: 2 },
  barcodeText: { fontSize: 10, color: 'rgba(92,22,35,0.5)', fontWeight: '500' },
  purityBadge: { backgroundColor: 'rgba(212,175,55,0.1)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  purityBadgeText: { color: COLORS.vjAccent, fontSize: 10, fontWeight: '800' },
  itemDetailsRow: { flexDirection: 'row', gap: 24, marginBottom: 10 },
  weightCol: {},
  detailLabel: { fontSize: 10, color: 'rgba(92,22,35,0.5)', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  weightValue: { fontSize: 12, color: COLORS.vjText, fontWeight: '600' },
  huidValue: { fontSize: 12, color: COLORS.vjText, fontWeight: '600', fontFamily: 'monospace' },
  noHuidValue: { color: 'rgba(92,22,35,0.4)', fontStyle: 'italic' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(92,22,35,0.03)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  locationText: { fontSize: 10, color: 'rgba(92,22,35,0.6)', fontWeight: '600' },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
});