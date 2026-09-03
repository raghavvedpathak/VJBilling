// app/inventory/purity-items.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { 
  getDisplayPurity, 
  formatSKUDisplay, 
  formatWeightMg as formatWeight,
  parseCleanFloat 
} from '@/utils/calculations';
import { ChevronRight, Tag, MapPin, Printer, Sparkles, Package, Scale, ShieldCheck } from 'lucide-react-native';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

interface SkuRowProps {
  item: ItemSearchResult;
  colors: ReturnType<typeof getThemeColors>;
  onPress: (itemId: string) => void;
  onPrint: (itemId: string) => void;
}

const SkuRow = React.memo(({
  item,
  colors,
  onPress,
  onPrint
}: SkuRowProps) => {
  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;
  const isGold = item.metal === 'GOLD';

  const purityDisplay = (isGold && item.purityKarat && item.purityKarat > 0)
    ? `${item.purityKarat}K · ${item.purityPercent.toFixed(1)}%`
    : getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);

  const displaySku = formatSKUDisplay(item.sku);
  const netWeightDisplay = formatWeight(item.netWeightMg ?? item.grossWeightMg ?? 0);

  return (
    <TouchableOpacity
      testID={`purity-item-row-${item.itemId}`}
      activeOpacity={0.7}
      style={[
        s.itemCard,
        {
          borderColor: `${colors.vjAccent}25`,
        }
      ]}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.itemId);
      }}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />
      <View style={s.itemCardBody}>
        <View style={s.topRow}>
          <Text style={[s.skuText, { color: colors.vjText }]} selectable>{displaySku}</Text>
          <View style={s.badgeRow}>
            {item.huid ? (
              <View style={s.huidBadge}>
                <ShieldCheck size={11} color="#15803d" />
                <Text style={s.huidText}>{item.huid}</Text>
              </View>
            ) : (
              <View style={s.noHuidBadge}>
                <Text style={s.noHuidText}>No HUID</Text>
              </View>
            )}
          </View>
        </View>

        {item.barcode && item.barcode !== item.sku && (
          <Text style={[s.barcodeText, { color: colors.vjText, opacity: 0.45 }]}>BC: {item.barcode}</Text>
        )}

        <View style={s.itemMetaRow}>
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Gross</Text>
            <Text style={[s.itemMetaValue, { color: colors.vjText }]}>{formatWeight(item.grossWeightMg)}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Net</Text>
            <Text style={[s.itemMetaValue, { color: colors.vjAccent }]}>{netWeightDisplay}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Purity</Text>
            <Text style={[s.itemMetaValue, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
          {item.sizeValue != null && (
            <>
              <View style={s.metaDivider} />
              <View style={s.itemMetaBlock}>
                <Text style={s.itemMetaLabel}>Size</Text>
                <Text style={[s.itemMetaValue, { color: colors.vjText }]}>
                  {item.sizeValue} {item.sizeUnit ? item.sizeUnit : ''}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={[s.locationRow, { backgroundColor: `${colors.vjAccent}08` }]}>
          <MapPin size={12} color={colors.vjAccent} style={{ opacity: 0.6 }} />
          <Text style={[s.locationText, { color: colors.vjText }]}>{item.location?.replace(/_/g, ' ') || '—'}</Text>
        </View>
      </View>

      <View style={s.actionContainer}>
        <TouchableOpacity
          testID={`print-item-btn-${item.itemId}`}
          style={[s.printBtn, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}30` }]}
          activeOpacity={0.7}
          onPress={(e) => {
            e.stopPropagation();
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            onPrint(item.itemId);
          }}
        >
          <Printer size={18} color={colors.vjAccent} />
        </TouchableOpacity>
        <ChevronRight size={18} color={colors.vjAccent} style={{ opacity: 0.4 }} />
      </View>
    </TouchableOpacity>
  );
});

export default function PurityItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ designId: string; designName: string; purityPercent: string }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId;
  const designName = Array.isArray(params.designName) ? params.designName[0] : params.designName;
  const purityPercent = Array.isArray(params.purityPercent) ? params.purityPercent[0] : params.purityPercent;

  const { activeFirmId } = useFirmStore();
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId || !purityPercent) return;
        setLoading(true);
        try {
          const targetPurity = parseCleanFloat(purityPercent);
          // Query directly with target purity filter at the repository/service layer
          const results = await inventoryDrillDownService.getItemsByDesign(activeFirmId, designId, targetPurity);
          if (active) {
            const filtered = (results || []).filter((r: ItemSearchResult) => 
              targetPurity ? Math.abs(r.purityPercent - targetPurity) < 0.05 : true
            );
            setItems(filtered);
          }
        } catch (e) {
          console.error('[PurityItems] getItemsByDesign failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, designId, purityPercent])
  );

  const handleItemPress = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/item-detail', params: { itemId } });
  }, [router]);

  const handlePrint = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/barcode-print', params: { itemId } });
  }, [router]);

  const totalNetWeightMg = useMemo(() => {
    return items.reduce((acc, curr) => acc + (curr.netWeightMg ?? curr.grossWeightMg ?? 0), 0);
  }, [items]);

  const purityHeaderPills = useMemo(() => {
    const firstItem = items[0];
    const metal = firstItem?.metal || 'GOLD';
    const karat = firstItem?.purityKarat ?? null;
    const targetPurity = purityPercent ? parseCleanFloat(purityPercent) : 0;
    const isGold = metal === 'GOLD';
    
    const purityDisplay = (isGold && karat && karat > 0)
      ? `${karat}K (${targetPurity.toFixed(1)}%)`
      : getDisplayPurity(targetPurity, karat, metal);

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <HeaderPill icon={<Sparkles size={12} color={colors.vjBg} />} label={purityDisplay} />
        <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${items.length} Items`} />
        <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
      </View>
    );
  }, [items, purityPercent, totalNetWeightMg, colors.vjBg]);

  return (
    <TwoToneWrapper title={designName || 'Purity Items'} showBack headerContent={purityHeaderPills}>
      <View style={s.listContainer}>
        {loading && items.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading items...</Text>
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <SkuRow 
                item={item} 
                colors={colors}
                onPress={handleItemPress} 
                onPrint={handlePrint} 
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={100}
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom + 40, 80),
              paddingTop: 24,
              paddingHorizontal: 14,
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Tag size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Items Found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  No available stock matching this purity grade
                </Text>
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    paddingRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metalStripe: { 
    width: 6, 
    alignSelf: 'stretch' 
  },
  itemCardBody: { 
    flex: 1, 
    paddingVertical: 14, 
    paddingHorizontal: 12 
  },
  topRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 6 
  },
  skuText: { 
    fontSize: 15, 
    fontWeight: '800', 
    fontFamily: 'monospace', 
    letterSpacing: 0.5 
  },
  badgeRow: { 
    flexDirection: 'row', 
    gap: 6 
  },
  huidBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(22, 163, 74, 0.08)', 
    paddingHorizontal: 7, 
    paddingVertical: 2.5, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: 'rgba(22, 163, 74, 0.25)' 
  },
  huidText: { 
    color: '#15803d', 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 0.5,
    fontFamily: 'monospace' 
  },
  noHuidBadge: { 
    backgroundColor: 'rgba(92,22,35,0.04)', 
    paddingHorizontal: 7, 
    paddingVertical: 2.5, 
    borderRadius: 6 
  },
  noHuidText: { 
    color: 'rgba(92,22,35,0.4)', 
    fontSize: 10, 
    fontWeight: '700' 
  },
  barcodeText: { 
    fontSize: 11, 
    fontFamily: 'monospace', 
    marginBottom: 8 
  },
  itemMetaRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 4,
  },
  itemMetaBlock: { 
    paddingRight: 8 
  },
  metaDivider: { 
    width: 1, 
    height: 16, 
    backgroundColor: 'rgba(92,22,35,0.08)', 
    marginRight: 8 
  },
  itemMetaLabel: { 
    color: 'rgba(92,22,35,0.4)', 
    fontSize: 9, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5, 
    marginBottom: 2 
  },
  itemMetaValue: { 
    fontSize: 12.5, 
    fontWeight: '700' 
  },
  locationRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    alignSelf: 'flex-start', 
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 6 
  },
  locationText: { 
    fontSize: 10.5, 
    fontWeight: '600', 
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  actionContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  printBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 11, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1,
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 12 
  },
  loadingText: { 
    fontSize: 14, 
    fontWeight: '600', 
    opacity: 0.6 
  },
  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 60, 
    gap: 8,
    paddingHorizontal: 24 
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: '700',
    opacity: 0.7 
  },
  emptySubtitle: { 
    fontSize: 13, 
    textAlign: 'center' 
  },
});
