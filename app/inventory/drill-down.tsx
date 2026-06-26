// app/inventory/drill-down.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen A: Category Browse (STEP 16.1)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Weight: (mg / 1000).toFixed(3) + ' g' — RULE-1A-WEIGHT-DISPLAY (v1.54)

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { ChevronRight, Package, Layers, Plus } from 'lucide-react-native';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
};

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
        <Layers size={20} color={COLORS.vjAccent} />
      </View>

      <View style={s.cardBody}>
        <Text style={s.categoryName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.weightText}>{formatWeight(item.totalNetWeightMg)}</Text>
      </View>

      <View style={s.countBadge}>
        <Text style={s.countText}>{item.availableCount}</Text>
        <Text style={s.countLabel}>items</Text>
      </View>

      <ChevronRight size={18} color="rgba(46,29,0,0.25)" />
    </TouchableOpacity>
  );
});

export default function DrillDownScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<{ id: string; name: string; availableCount: number; totalNetWeightMg: number }[]>([]);
  const [loading, setLoading] = useState(true);

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
    router.push({
      pathname: '/inventory/category-items',
      params: { categoryId, categoryName },
    });
  }, [router]);

  const totalItems = data.reduce((sum, c) => sum + c.availableCount, 0);
  const totalWeightMg = data.reduce((sum, c) => sum + c.totalNetWeightMg, 0);

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Package size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>Inventory</Text>
      <Text style={s.headerSubtitle}>
        {data.length} Categories • {totalItems} Items • {formatWeight(totalWeightMg)}
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
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
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Package size={48} color="rgba(46,29,0,0.2)" />
                <Text style={s.emptyTitle}>No Stock Found</Text>
                <Text style={s.emptySubtitle}>Add items to see category breakdown</Text>
              </View>
            }
          />
        )}
      </View>
      <TouchableOpacity 
        style={s.fab}
        onPress={() => router.push('/inventory/add-stock')}
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
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
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
    borderRadius: 12,
    backgroundColor: 'rgba(184,115,51,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
  },
  categoryName: {
    color: COLORS.vjText,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  weightText: {
    color: 'rgba(46,29,0,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(46,29,0,0.04)',
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
    color: 'rgba(46,29,0,0.4)',
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
    color: 'rgba(250,243,224,0.55)',
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
    color: 'rgba(46,29,0,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    color: 'rgba(46,29,0,0.5)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(46,29,0,0.35)',
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
