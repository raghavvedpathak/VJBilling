// app/inventory/design-items.tsx
import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity } from '../../utils/purity.constants';
import { ChevronRight, Tag, Gem } from 'lucide-react-native';
import type { ItemSearchResult } from '../../types/phase2.types';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

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

const GroupHeader = memo(({
  data,
  onPress
}: {
  data: GroupHeaderData;
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
        <ChevronRight size={20} color="rgba(92,22,35,0.4)" />
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
    router.push({
      pathname: '/inventory/purity-items',
      params: { 
        designId, 
        designName, 
        purityPercent: purityPercent.toString() 
      },
    });
  }, [router, designId, designName]);

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
    const dataList: GroupHeaderData[] = [];

    for (const purity of sortedPurities) {
      const groupItems = groupsMap.get(purity)!;
      const firstItem = groupItems[0];
      const totalNetWeightMg = groupItems.reduce((sum, item) => sum + (item.netWeightMg || 0), 0);

      dataList.push({
        purityPercent: purity,
        purityKarat: firstItem.purityKarat ?? null,
        metal: firstItem.metal,
        designName: designName || firstItem.designName,
        itemCount: groupItems.length,
        totalNetWeightMg,
      });
    }

    return dataList;
  }, [items, designName]);

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
            <Text style={s.loadingText}>Loading groups...</Text>
          </View>
        ) : (
          <FlashList
            data={renderData}
            keyExtractor={(item) => `header-${item.purityPercent}`}
            renderItem={({ item }) => <GroupHeader data={item} onPress={handleGroupPress} />}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={80}
            contentContainerStyle={{paddingBottom: 100, paddingTop: 32}}
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
  headerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)' },
  headerCardContent: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headerDesignName: { color: COLORS.vjText, fontSize: 16, fontWeight: '700', maxWidth: '70%' },
  metalPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center' },
  headerCount: { color: 'rgba(92,22,35,0.6)', fontSize: 13, fontWeight: '600' },
  dotDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(92,22,35,0.2)', marginHorizontal: 8 },
  headerWeight: { color: COLORS.vjText, fontSize: 13, fontWeight: '700' },
  headerChevron: { paddingLeft: 12 },
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