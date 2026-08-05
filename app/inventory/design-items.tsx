// app/inventory/design-items.tsx
// FEAT-SCREEN-C-FLAT-1 (v1.97) — Screen C: Individual Items Under Design (STEP 16.3)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition
// FlashList MANDATORY | estimatedItemSize defined | React.memo() rows
// Flat list layout: purityPercent DESC, then created_at DESC (client-side sort)

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { HeaderPill } from '../../components/ui/Glass';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity, formatSKUDisplay, formatWeightMg as formatWeight } from '../../utils/calculations';
import { MapPin, Tag, Package, Printer, Scale } from 'lucide-react-native';
import { getJewelryCategoryIcon } from '../../utils/jewelryIcons';
import type { ItemSearchResult } from '../../types/phase2.types';
import { COLORS, getThemeColors } from '../../constants/theme';

const ItemRow = memo(({ item, onPress, onPrint }: { item: ItemSearchResult, onPress: (id: string) => void, onPrint: (id: string) => void }) => {
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal as any);
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;

  return (
    <TouchableOpacity 
      activeOpacity={0.7} 
      style={s.itemCard} 
      onPress={() => onPress(item.itemId)}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <View style={s.itemMainRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.skuText}>{formatSKUDisplay(item.sku)}</Text>
            <Text style={s.barcodeText}>Barcode: {item.barcode}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={(e) => { e.stopPropagation(); onPrint(item.itemId); }}
              style={s.printBtn}
            >
              <Printer size={16} color={COLORS.vjAccent} />
            </TouchableOpacity>
            <View style={[s.purityBadge, { borderColor: metalColor }]}>
              <Text style={[s.purityBadgeText, { color: metalColor }]}>{purityDisplay}</Text>
            </View>
          </View>
        </View>

        <View style={s.itemDetailsRow}>
          <View style={s.weightCol}>
            <Text style={s.detailLabel}>Net Wt</Text>
            <Text style={s.weightValue}>{formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
          </View>
          <View style={s.weightCol}>
            <Text style={s.detailLabel}>Gross Wt</Text>
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

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.purityPercent - a.purityPercent);
  }, [items]);

  const handleItemPress = useCallback((itemId: string) => {
    router.push({
      pathname: '/inventory/item-detail',
      params: { itemId },
    });
  }, [router]);

  const handlePrint = useCallback((itemId: string) => {
    router.push({
      pathname: '/inventory/barcode-print',
      params: { itemId },
    });
  }, [router]);

  const totalNetWeightMg = sortedItems.reduce((sum, i) => sum + (i.netWeightMg ?? i.grossWeightMg), 0);

  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const designHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${sortedItems.length} Tagged Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={designName || 'Design Items'} showBack headerContent={designHeaderPills}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading items...</Text>
          </View>
        ) : (
          <FlashList
            data={sortedItems}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <ItemRow item={item} onPress={handleItemPress} onPrint={handlePrint} />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={120}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Package size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No Items Available</Text>
                <Text style={s.emptySubtitle}>There are no available items under this design</Text>
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
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  itemMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  skuText: {
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 15,
    color: COLORS.vjText,
  },
  barcodeText: {
    fontSize: 11,
    color: 'rgba(92,22,35,0.4)',
    fontWeight: '600',
    marginTop: 2,
  },
  printBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  purityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(92,22,35,0.03)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  weightCol: {
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(92,22,35,0.4)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.vjText,
  },
  huidValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.vjAccent,
  },
  noHuidValue: {
    color: 'rgba(92,22,35,0.3)',
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    color: 'rgba(92,22,35,0.5)',
    fontWeight: '600',
  },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
});