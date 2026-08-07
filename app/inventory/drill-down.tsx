// app/inventory/drill-down.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen A: Category Browse (STEP 16.1)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Weight: (mg / 1000).toFixed(3) + ' g' — RULE-1A-WEIGHT-DISPLAY (v1.54)

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { formatWeightMg as formatWeight } from '../../utils/calculations';
import { HeaderPill } from '../../components/ui/Glass';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { COLORS, getThemeColors } from '../../constants/theme';
import { ChevronRight, Package, Plus, Scale } from 'lucide-react-native';
import { getJewelryCategoryIcon } from '../../utils/jewelryIcons';

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
        {getJewelryCategoryIcon(item.name, undefined, undefined, 20, COLORS.vjAccent)}
      </View>

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={s.categoryName} numberOfLines={1}>{item.name}</Text>
        </View>
        <Text style={s.weightText}>{formatWeight(item.totalNetWeightMg)}</Text>
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
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
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
            // @ts-ignore: estimatedItemSize is required by spec even if missing from local typedefs
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
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    gap: 12,
  },
  metalBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
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
    marginBottom: 4,
  },
  categoryName: {
    color: COLORS.vjText,
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  lowStockBadge: {
    backgroundColor: '#F59E0B', // Amber
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  fab: {
    position: 'absolute',
    bottom: 100, // Increased to avoid OS back button
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
