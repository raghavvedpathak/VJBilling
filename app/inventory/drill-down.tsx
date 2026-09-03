// app/inventory/drill-down.tsx — Phase 2 v2.24 Canonical Screen

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
import { getThemeColors } from '@/constants/theme';
import { ChevronRight, Package, Plus, Scale, Layers } from 'lucide-react-native';
import { getJewelryCategoryIcon } from '@/utils/jewelryIcons';

type CategoryRowProps = {
  item: { id: string; name: string; availableCount: number; totalNetWeightMg: number };
  colors: ReturnType<typeof getThemeColors>;
  onPress: (categoryId: string, categoryName: string) => void;
};

const CategoryRow = memo(({ item, colors, onPress }: CategoryRowProps) => {
  return (
    <TouchableOpacity
      testID={`category-row-${item.id}`}
      onPress={() => onPress(item.id, item.name)}
      activeOpacity={0.75}
      style={[
        s.card,
        {
          borderColor: `${colors.vjAccent}25`,
        },
      ]}
    >
      <View style={[s.metalBadge, { backgroundColor: `${colors.vjAccent}1A`, borderColor: `${colors.vjAccent}40` }]}>
        {getJewelryCategoryIcon(item.name, undefined, undefined, 24, colors.vjAccent)}
      </View>

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={[s.categoryName, { color: colors.vjText }]} numberOfLines={1}>{item.name}</Text>
        </View>
        
        <View style={[s.weightBadge, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}>
          <Scale size={11} color={colors.vjAccent} />
          <Text style={[s.weightText, { color: colors.vjText }]}>Net: {formatWeight(item.totalNetWeightMg)}</Text>
        </View>
      </View>

      <View style={[s.countBadge, { backgroundColor: '#FFFFFF', borderColor: `${colors.vjAccent}40` }]}>
        <Text style={[s.countText, { color: colors.vjText }]}>{item.availableCount}</Text>
        <Text style={[s.countLabel, { color: colors.vjText, opacity: 0.5 }]}>items</Text>
      </View>

      <ChevronRight size={18} color={colors.vjAccent} style={{ opacity: 0.6 }} />
    </TouchableOpacity>
  );
});

export default function DrillDownScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<{ id: string; name: string; availableCount: number; totalNetWeightMg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Reactive theme subscription ensures live background, accent, and card border updates
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
          if (active) setData(results || []);
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push({
      pathname: '/inventory/category-items',
      params: { categoryId, categoryName },
    });
  }, [router]);

  const totalItems = data.reduce((sum, c) => sum + c.availableCount, 0);
  const totalWeightMg = data.reduce((sum, c) => sum + c.totalNetWeightMg, 0);

  const ledgerHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Layers size={12} color={colors.vjBg} />} label="Category Ledger" />
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Active Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Stock Ledger" showBack headerContent={ledgerHeaderPills}>
      <View style={s.listContainer}>
        {loading && data.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading inventory...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CategoryRow item={item} colors={colors} onPress={handleCategoryPress} />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={88}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 120, 140), paddingTop: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Package size={48} color={colors.vjAccent} style={{ opacity: 0.3 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Stock Found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>Add items to see category breakdown</Text>
              </View>
            }
          />
        )}
      </View>
      <TouchableOpacity 
        testID="drill-down-fab-add-stock"
        style={[s.fab, { backgroundColor: colors.vjAccent, bottom: Math.max(insets.bottom + 24, 40) }]}
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          router.push('/inventory/add-stock');
        }}
        activeOpacity={0.85}
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
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#FCFBF8',
    borderWidth: 1,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  metalBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
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
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
