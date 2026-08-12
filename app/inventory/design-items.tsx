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
import { MapPin, Package, Printer, Scale } from 'lucide-react-native';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const ItemRow = memo(({ item, onPress, onPrint }: { item: ItemSearchResult, onPress: (id: string) => void, onPrint: (id: string) => void }) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;

  // Format Purity in both Karat and Percentage: e.g. "22K (91.6%)" or "92.5%"
  const purityFull = item.purityKarat 
    ? `${item.purityKarat}K (${item.purityPercent.toFixed(1)}%)`
    : `${item.purityPercent.toFixed(1)}%`;

  // Size string if available
  const hasSize = item.sizeValue !== null && item.sizeValue !== undefined;
  const sizeDisplay = hasSize ? `${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}` : null;

  return (
    <TouchableOpacity 
      activeOpacity={0.7} 
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
              <Text style={s.skuText}>{formatSKUDisplay(item.sku)}</Text>
              {sizeDisplay && (
                <View style={s.sizeBadge}>
                  <Text style={s.sizeBadgeText}>Size: {sizeDisplay}</Text>
                </View>
              )}
            </View>
            <Text style={s.barcodeText}>Barcode: {item.barcode}</Text>
          </View>

          {/* PURITY BADGE (KARAT & PERCENTAGE IN TOP-RIGHT CORNER) */}
          <View style={[s.purityBadge, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
            <Text style={[s.purityBadgeText, { color: metalColor }]}>{purityFull}</Text>
          </View>
        </View>

        {/* METRICS ROW: GROSS WT -> NET WT -> HUID */}
        <View style={s.itemDetailsRow}>
          <View style={s.weightCol}>
            <Text style={s.detailLabel}>GROSS WT</Text>
            <Text style={s.weightValue}>{formatWeight(item.grossWeightMg)}</Text>
          </View>

          <View style={s.colDivider} />

          <View style={s.weightCol}>
            <Text style={[s.detailLabel, { color: COLORS.vjAccent }]}>NET WT</Text>
            <Text style={[s.weightValue, { color: COLORS.vjAccent }]}>{formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
          </View>

          <View style={s.colDivider} />

          <View style={s.weightCol}>
            <Text style={s.detailLabel}>HUID</Text>
            <Text style={[s.huidValue, !item.huid && s.noHuidValue]}>{item.huid || 'No HUID'}</Text>
          </View>
        </View>

        {/* BOTTOM ROW: LOCATION & SLIGHTLY LARGER PRINT BUTTON */}
        <View style={s.bottomRow}>
          <View style={s.locationRow}>
            <MapPin size={13} color="rgba(92,22,35,0.4)" />
            <Text style={s.locationText}>{item.location || '—'}</Text>
          </View>

          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
              onPrint(item.itemId);
            }}
            style={s.printBtn}
          >
            <Printer size={15} color={COLORS.vjAccent} />
            <Text style={s.printBtnText}>Print</Text>
          </TouchableOpacity>
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

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const designHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${sortedItems.length} Tagged Items`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title={designName || 'Design Stock'} showBack headerContent={designHeaderPills}>
      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
          <Text style={s.loadingText}>Loading design items...</Text>
        </View>
      ) : (
        <FlashList
          data={sortedItems}
          keyExtractor={(item: ItemSearchResult) => item.itemId}
          renderItem={({ item }: { item: ItemSearchResult }) => (
            <ItemRow item={item} onPress={handleItemPress} onPrint={handlePrint} />
          )}
          // @ts-ignore
          estimatedItemSize={140}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 100, paddingHorizontal: 14 }}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={s.emptyTitle}>No Stock Items Found</Text>
              <Text style={s.emptySubtitle}>There are currently no items for this design.</Text>
            </View>
          }
        />
      )}
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
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
    color: COLORS.vjText,
  },
  barcodeText: {
    fontSize: 11,
    color: 'rgba(92,22,35,0.45)',
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
    backgroundColor: 'rgba(92,22,35,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.12)',
  },
  sizeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(92,22,35,0.65)',
  },
  itemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
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
    backgroundColor: 'rgba(92, 22, 35, 0.12)',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: 'rgba(92,22,35,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.vjText,
  },
  huidValue: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.vjAccent,
  },
  noHuidValue: {
    color: 'rgba(92,22,35,0.3)',
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
    color: 'rgba(92,22,35,0.5)',
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
    borderColor: 'rgba(212,175,55,0.4)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  printBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.vjAccent,
    letterSpacing: 0.5,
  },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
});