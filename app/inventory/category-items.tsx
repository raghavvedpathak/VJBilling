// app/inventory/category-items.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen B: Design List Under Category (STEP 16.2)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Weight: (mg / 1000).toFixed(3) + ' g' — RULE-1A-WEIGHT-DISPLAY (v1.54)
// Purity: getDisplayPurity() — Gold 22K / Silver purityPercent%

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import type { DesignCategoryStockResult } from '../../types/phase2.types';
import { getDisplayPurity } from '../../utils/purity.constants';
import { ChevronRight, Layers, Tag } from 'lucide-react-native';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
};

type DesignRowProps = {
  item: DesignCategoryStockResult;
  onPress: (designId: string, designName: string, purityPercent: number) => void;
};

const DesignRow = memo(({ item, onPress }: DesignRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal);

  return (
    <TouchableOpacity
      id={`design-row-${item.designId}-${item.purityPercent}`}
      onPress={() => onPress(item.designId, item.designName, item.purityPercent)}
      activeOpacity={0.7}
      style={s.card}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <Text style={s.designName} numberOfLines={1}>{item.designName}</Text>

        <View style={s.metaRow}>
          <View style={[s.metalPill, { borderColor: metalColor }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
          <Text style={s.weightText}>{formatWeight(item.totalNetWeightMg)}</Text>
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
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !categoryId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getDesignsByCategory(activeFirmId, categoryId);
          if (active) setData(results);
        } catch (e) {
          console.error('[CategoryItems] getDesignsByCategory failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, categoryId])
  );

  const handleDesignPress = useCallback((designId: string, designName: string, purityPercent: number) => {
    router.push({
      pathname: '/inventory/design-items',
      params: { designId, designName, purityPercent },
    });
  }, [router]);

  const totalItems = data.reduce((sum, i) => sum + i.availableCount, 0);
  const totalWeightMg = data.reduce((sum, i) => sum + i.totalNetWeightMg, 0);

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Tag size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle} numberOfLines={1}>{categoryName || 'Category'}</Text>
      <Text style={s.headerSubtitle}>
        {data.length} Designs • {totalItems} Items • {formatWeight(totalWeightMg)}
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
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
              <DesignRow item={item} onPress={handleDesignPress} />
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
    marginBottom: 6,
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
});
