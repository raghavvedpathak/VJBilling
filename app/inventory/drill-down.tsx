// app/inventory/drill-down.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { formatWeightMg as formatWeight } from '@/utils/calculations';
import { HeaderPill } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';
import { ChevronRight, Package, Plus, Scale } from 'lucide-react-native';
import { getJewelryCategoryIcon } from '@/utils/jewelryIcons';

type CategoryRowProps = {
  item: { id: string; name: string; availableCount: number; totalNetWeightMg: number };
  onPress: (categoryId: string, categoryName: string) => void;
};

const CategoryRow = memo(({ item, onPress }: CategoryRowProps) => {
  return (
    <TouchableOpacity
      id={`category-row-${item.id}`}
      onPress={() => onPress(item.id, item.name)}
      activeOpacity={0.7}
      style={s.card}
    >
      <View style={s.metalBadge}>
        {getJewelryCategoryIcon(item.name, undefined, undefined, 24, COLORS.vjAccent)}
      </View>

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={s.categoryName} numberOfLines={1}>{item.name}</Text>
        </View>
        
        <View style={s.weightBadge}>
          <Scale size={11} color={COLORS.vjAccent} />
          <Text style={s.weightText}>Net: {formatWeight(item.totalNetWeightMg)}</Text>
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

export default function DrillDownScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<{ id: string; name: string; availableCount: number; totalNetWeightMg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getCategoriesWithStock(activeFirmId);
          if (active) setData(results);
        } catch (e) {
          console.error('[DrillDown] getCategoriesWithStock failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId])
  );

  const handleCategoryPress = useCallback((categoryId: string, categoryName: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    router.push({
      pathname: '/inventory/category-items',
      params: { categoryId, categoryName },
    });
  }, [router]);

  const totalItems = data.reduce((sum, c) => sum + c.availableCount, 0);
  const totalWeightMg = data.reduce((sum, c) => sum + c.totalNetWeightMg, 0);

  const ledgerHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Active Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Stock Ledger" showBack headerContent={ledgerHeaderPills}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading inventory...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CategoryRow item={item} onPress={handleCategoryPress} />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={88}
            contentContainerStyle={{paddingBottom: 100, paddingTop: 32}}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Package size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No Stock Found</Text>
                <Text style={s.emptySubtitle}>Add items to see category breakdown</Text>
              </View>
            }
          />
        )}
      </View>
      <TouchableOpacity 
        style={[s.fab, { bottom: Math.max(insets.bottom + 24, 64) }]}
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
          router.push('/inventory/add-stock');
        }}
        activeOpacity={0.8}
      >
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.08)',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metalBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(212,175,55,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  categoryName: {
    color: COLORS.vjText,
    fontWeight: '800',
    fontSize: 15,
    flexShrink: 1,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  weightText: {
    color: COLORS.vjText,
    fontSize: 11,
    fontWeight: '800',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  countText: {
    color: COLORS.vjText,
    fontSize: 16,
    fontWeight: '900',
  },
  countLabel: {
    color: 'rgba(92,22,35,0.45)',
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
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.vjAccent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
