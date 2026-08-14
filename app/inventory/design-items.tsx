// app/inventory/design-items.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { getDisplayPurity, formatSKUDisplay, formatWeightMg as formatWeight } from '@/utils/calculations';
import { MapPin, Package, Printer, Scale, Sparkles } from 'lucide-react-native';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const ItemRow = memo(({ item, colors, onPress, onPrint }: { item: ItemSearchResult, colors: ReturnType<typeof getThemeColors>, onPress: (id: string) => void, onPrint: (id: string) => void }) => {
  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;

  // Format Purity in both Karat and Percentage: e.g. "22K (91.6%)" or "92.5%"
  const purityFull = item.purityKarat 
    ? `${item.purityKarat}K (${item.purityPercent.toFixed(1)}%)`
    : `${item.purityPercent.toFixed(1)}%`;

  // Size string if available
  const hasSize = item.sizeValue !== null && item.sizeValue !== undefined;
  const sizeDisplay = hasSize ? `${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}` : null;

  return (
    <TouchableOpacity 
      activeOpacity={0.75} 
      style={s.itemCard} 
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
        onPress(item.itemId);
      }}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        {/* TOP ROW: SKU WITH SIZE IN FRONT & PURITY IN TOP-RIGHT CORNER */}
        <View style={s.itemMainRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[s.skuText, { color: colors.vjText }]}>{formatSKUDisplay(item.sku)}</Text>
              {sizeDisplay && (
                <View style={[s.sizeBadge, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}30` }]}>
                  <Text style={[s.sizeBadgeText, { color: colors.vjText }]}>Size: {sizeDisplay}</Text>
                </View>
              )}
            </View>
            <Text style={[s.barcodeText, { color: colors.vjText, opacity: 0.5 }]}>Barcode: {item.barcode}</Text>
          </View>

          {/* PURITY BADGE (KARAT & PERCENTAGE IN TOP-RIGHT CORNER) */}
          <View style={[s.purityBadge, { borderColor: metalColor, backgroundColor: `${metalColor}15` }]}>
            <Text style={[s.purityBadgeText, { color: metalColor }]}>{purityFull}</Text>
          </View>
        </View>

        {/* METRICS ROW: GROSS WT -> NET WT -> HUID */}
        <View style={[s.itemDetailsRow, { backgroundColor: `${colors.vjAccent}0A`, borderColor: `${colors.vjAccent}25` }]}>
          <View style={s.weightCol}>
            <Text style={[s.detailLabel, { color: colors.vjText, opacity: 0.5 }]}>GROSS WT</Text>
            <Text style={[s.weightValue, { color: colors.vjText }]}>{formatWeight(item.grossWeightMg)}</Text>
          </View>

          <View style={[s.colDivider, { backgroundColor: `${colors.vjText}1A` }]} />

          <View style={s.weightCol}>
            <Text style={[s.detailLabel, { color: colors.vjAccent }]}>NET WT</Text>
            <Text style={[s.weightValue, { color: colors.vjAccent }]}>{formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
          </View>

          <View style={[s.colDivider, { backgroundColor: `${colors.vjText}1A` }]} />

          <View style={s.weightCol}>
            <Text style={[s.detailLabel, { color: colors.vjText, opacity: 0.5 }]}>HUID</Text>
            <Text style={[s.huidValue, { color: item.huid ? colors.vjAccent : colors.vjText }, !item.huid && s.noHuidValue]}>{item.huid || 'No HUID'}</Text>
          </View>
        </View>

        {/* BOTTOM ROW: LOCATION & SLIGHTLY LARGER PRINT BUTTON */}
        <View style={s.bottomRow}>
          <View style={s.locationRow}>
            <MapPin size={13} color={colors.vjAccent} style={{ opacity: 0.6 }} />
            <Text style={[s.locationText, { color: colors.vjText, opacity: 0.6 }]}>{item.location || '—'}</Text>
          </View>

          <TouchableOpacity 
            activeOpacity={0.75}
            onPress={(e) => {
              e.stopPropagation();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
              onPrint(item.itemId);
            }}
            style={[s.printBtn, { borderColor: `${colors.vjAccent}45`, backgroundColor: `${colors.vjAccent}14` }]}
          >
            <Printer size={15} color={colors.vjAccent} />
            <Text style={[s.printBtnText, { color: colors.vjAccent }]}>Print</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function DesignItemsScreen() {
  const router = useRouter();
  const { designId, designName, purityPercent } = useLocalSearchParams<{ designId: string; designName: string; purityPercent?: string }>();
  const { activeFirmId } = useFirmStore();
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Reactive theme subscription
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const purityNum = purityPercent ? parseFloat(purityPercent) : undefined;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getItemsByDesign(activeFirmId, designId, purityNum);
          if (active) setItems(results);
        } catch (e) {
          console.error('[DesignItems] getItemsByDesign failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, designId, purityNum])
  );

  const handleItemPress = useCallback((itemId: string) => {
    router.push(`/inventory/item-detail?itemId=${itemId}`);
  }, [router]);

  const handlePrint = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/barcode-print', params: { itemId } });
  }, [router]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (b.netWeightMg ?? b.grossWeightMg) - (a.netWeightMg ?? a.grossWeightMg));
  }, [items]);

  const totalNetWeightMg = useMemo(() => {
    return sortedItems.reduce((sum, i) => sum + (i.netWeightMg ?? i.grossWeightMg), 0);
  }, [sortedItems]);

  const purityPillLabel = useMemo(() => {
    if (!purityNum || sortedItems.length === 0) return null;
    return getDisplayPurity(purityNum, sortedItems[0]?.purityKarat || null, sortedItems[0]?.metal || 'GOLD');
  }, [purityNum, sortedItems]);

  const designHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${sortedItems.length} Tagged Items`} />
      {purityPillLabel && (
        <HeaderPill icon={<Sparkles size={12} color="#38BDF8" />} label={purityPillLabel} variant="info" />
      )}
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={designName || 'Design Stock'} showBack headerContent={designHeaderPills}>
      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.vjAccent} />
          <Text style={[s.loadingText, { color: colors.vjText }]}>Loading design items...</Text>
        </View>
      ) : (
        <FlashList
          data={sortedItems}
          keyExtractor={(item: ItemSearchResult) => item.itemId}
          renderItem={({ item }: { item: ItemSearchResult }) => (
            <ItemRow item={item} colors={colors} onPress={handleItemPress} onPrint={handlePrint} />
          )}
          // @ts-ignore
          estimatedItemSize={140}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 100, paddingHorizontal: 14 }}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Package size={48} color={colors.vjAccent} style={{ opacity: 0.3 }} />
              <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Stock Items Found</Text>
              <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>There are currently no items for this design.</Text>
            </View>
          }
        />
      )}
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 14,
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
  },
  barcodeText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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
  sizeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  sizeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  weightCol: {
    alignItems: 'center',
    flex: 1,
  },
  colDivider: {
    width: 1,
    height: 22,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  huidValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  noHuidValue: {
    opacity: 0.4,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  printBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', opacity: 0.7 },
  emptySubtitle: { fontSize: 13 },
});