// app/inventory/drill-down.tsx — Phase 2 v2.24 Canonical Screen (Screen A)

import React, { useState, useCallback, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { formatWeightMg as formatWeight } from '@/utils/calculations';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';
import { ChevronRight, Package, Plus, Scale, Layers, Sparkles } from 'lucide-react-native';
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
      activeOpacity={0.8}
      style={[
        s.card,
        {
          borderColor: `${colors.vjAccent}22`,
        },
      ]}
    >
      {/* Bullion Gold Left Accent Stripe */}
      <View style={[s.metalStripe, { backgroundColor: COLORS.bullionGold }]} />

      <View style={[s.metalBadge, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}35` }]}>
        {getJewelryCategoryIcon(item.name, undefined, undefined, 24, colors.vjAccent)}
      </View>

      <View style={s.cardBody}>
        <View style={s.titleRow}>
          <Text style={[s.categoryName, { color: colors.vjText }]} numberOfLines={1}>{item.name}</Text>
        </View>
        
        <View style={[s.weightBadge, { backgroundColor: 'rgba(212, 175, 55, 0.10)', borderColor: 'rgba(212, 175, 55, 0.35)' }]}>
          <Scale size={11} color={COLORS.bullionGold} />
          <Text style={[s.weightText, { color: colors.vjText }]}>Net: {formatWeight(item.totalNetWeightMg)}</Text>
        </View>
      </View>

      <View style={[s.countBadge, { backgroundColor: '#FFFFFF', borderColor: `${colors.vjAccent}30` }]}>
        <Text style={[s.countText, { color: colors.vjText }]}>{item.availableCount}</Text>
        <Text style={[s.countLabel, { color: colors.vjText, opacity: 0.55 }]}>items</Text>
      </View>

      <ChevronRight size={18} color={colors.vjAccent} style={{ opacity: 0.5 }} />
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

  const categoryVersion = useMastersSyncStore((s) => s.categoryVersion);
  const designVersion = useMastersSyncStore((s) => s.designVersion);

  const load = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const results = await inventoryDrillDownService.getCategoriesWithStock(activeFirmId);
      const sorted = (results || []).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
      );
      setData(sorted);
    } catch (e) {
      console.error('[DrillDown] getCategoriesWithStock failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useEffect(() => {
    load();
  }, [load, categoryVersion, designVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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

  const headerVaultCard = (
    <View style={s.headerVaultCard}>
      <View style={s.heroTopRow}>
        <View style={s.headerVaultBadge}>
          <Layers size={13} color={COLORS.bullionGold} />
          <Text style={s.headerVaultBadgeText}>VAULT OVERVIEW</Text>
        </View>
        <View style={s.heroPillsRow}>
          <View style={s.headerMetaPill}>
            <Package size={11} color="rgba(255, 255, 255, 0.85)" />
            <Text style={s.headerMetaText}>{totalItems} Pieces</Text>
          </View>
          <View style={s.headerMetaPill}>
            <Sparkles size={11} color="rgba(255, 255, 255, 0.85)" />
            <Text style={s.headerMetaText}>{data.length} Categories</Text>
          </View>
        </View>
      </View>

      <View style={s.headerDivider} />

      <View style={s.heroScaleContainer}>
        <Text style={s.headerScaleLabel}>TOTAL PHYSICAL NET WEIGHT</Text>
        <View style={s.heroScaleValueRow}>
          <Scale size={20} color={COLORS.bullionGold} style={{ marginRight: 6 }} />
          <Text style={s.headerScaleDigits}>
            {formatWeight(totalWeightMg)}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="Stock Ledger" showBack headerContent={headerVaultCard}>
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
            contentContainerStyle={{ 
              paddingHorizontal: 16,
              paddingTop: 16, 
              paddingBottom: Math.max(insets.bottom + 120, 140) 
            }}
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

  // HEADER VAULT OVERVIEW CARD (DARK GLASS STYLE)
  headerVaultCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  headerVaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.40)',
  },
  headerVaultBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: COLORS.bullionGold,
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

  // CATEGORY ROW CARD
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    paddingRight: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metalStripe: {
    width: 5,
    alignSelf: 'stretch',
  },
  metalBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  categoryName: {
    fontWeight: '800',
    fontSize: 15.5,
    flexShrink: 1,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4.5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  weightText: {
    fontSize: 11.5,
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
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

