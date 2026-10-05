// app/inventory/purity-items.tsx — Phase 2 v2.34 Canonical Screen
// Aligned with FEAT-DRILL-DOWN-1 (v1.65), FIX-24KS-DISPLAY-1 (v2.25), and MastersSyncStore

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, StatusPillBadge } from '@/components/ui/Glass';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { 
  getDisplayPurity, 
  formatKaratBadge,
  formatSKUDisplay, 
  formatWeightMg as formatWeight,
  parseCleanFloat 
} from '@/utils/calculations';
import { ChevronRight, Tag, MapPin, Printer, Sparkles, Package, Scale, ShieldCheck, ShieldAlert, Barcode } from 'lucide-react-native';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

interface SkuRowProps {
  item: ItemSearchResult;
  designName: string;
  colors: ReturnType<typeof getThemeColors>;
  isDark: boolean;
  onPress: (itemId: string) => void;
  onPrint: (itemId: string) => void;
}

const SkuRow = React.memo(({
  item,
  designName,
  colors,
  isDark,
  onPress,
  onPrint
}: SkuRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.bullionGold : COLORS.bullionSilver;
  const isGold = item.metal === 'GOLD';

  const karatBadge = formatKaratBadge(item.purityPercent, item.metal);
  const purityDisplay = (isGold && karatBadge)
    ? `${karatBadge} · ${item.purityPercent.toFixed(1)}%`
    : getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);

  const displaySku = formatSKUDisplay(item.sku);
  const netWeightDisplay = formatWeight(item.netWeightMg ?? item.grossWeightMg ?? 0);
  const hasDistinctBarcode = Boolean(item.barcode && item.barcode !== item.sku);

  return (
    <TouchableOpacity
      testID={`purity-item-row-${item.itemId}`}
      activeOpacity={0.85}
      style={[
        s.itemCard,
        {
          backgroundColor: isDark ? 'rgba(28, 20, 24, 0.88)' : '#FFFFFF',
          borderColor: isDark ? 'rgba(212, 175, 55, 0.28)' : 'rgba(212, 175, 55, 0.22)',
        }
      ]}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.itemId);
      }}
    >
      {/* Metallic Vault Left Stripe */}
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.itemCardBody}>
        {/* Top Row: Monogram Emblem, SKU, Barcode, and HUID / Status Badge */}
        <View style={s.topRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
            <JewelryMonogramEmblem 
              designName={item.designName || designName} 
              metal={item.metal}
              size={34} 
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.skuText, { color: colors.vjText }]} selectable numberOfLines={1}>
                {displaySku}
              </Text>
              {hasDistinctBarcode ? (
                <View style={s.barcodeTag}>
                  <Barcode size={10} color={isDark ? 'rgba(255,255,255,0.48)' : 'rgba(92,22,35,0.52)'} />
                  <Text style={[s.barcodeText, { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(92,22,35,0.60)' }]} numberOfLines={1}>
                    {item.barcode}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Badges: BIS HUID & Special Status */}
          <View style={s.badgeRow}>
            {item.status && item.status !== 'AVAILABLE' && (
              <StatusPillBadge 
                label={item.status === 'DRAFT' ? 'DRAFT' : String(item.status).replace(/_/g, ' ')} 
                variant={item.status === 'DRAFT' ? 'warning' : 'info'} 
              />
            )}
            {item.huid ? (
              <View style={[s.huidBadge, { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.16)' : 'rgba(22, 163, 74, 0.08)' }]}>
                <ShieldCheck size={11} color="#16A34A" />
                <Text style={s.huidText}>HUID: {item.huid}</Text>
              </View>
            ) : (
              <View style={[s.noHuidBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                <ShieldAlert size={10} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <Text style={[s.noHuidText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>No HUID</Text>
              </View>
            )}
          </View>
        </View>

        {/* Digital Scale Metrics Row: Net Weight Tag, Gross, Purity, Size */}
        <View style={s.itemMetaRow}>
          {/* NET WEIGHT BADGE (Primary Jewel Tag) */}
          <View 
            style={[
              s.weightChip, 
              { 
                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(212, 175, 55, 0.12)', 
                borderColor: isDark ? 'rgba(212, 175, 55, 0.38)' : 'rgba(212, 175, 55, 0.30)' 
              }
            ]}
          >
            <Scale size={11} color={colors.vjAccent} />
            <Text style={[s.weightLabel, { color: colors.vjText }]}>NET</Text>
            <Text style={[s.netWeightValue, { color: colors.vjAccent }]}>{netWeightDisplay}</Text>
          </View>

          {/* GROSS WEIGHT REFERENCE */}
          <View 
            style={[
              s.metricChip, 
              { 
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', 
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' 
              }
            ]}
          >
            <Text style={[s.metricLabel, { color: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(92,22,35,0.48)' }]}>GROSS</Text>
            <Text style={[s.metricValue, { color: colors.vjText }]}>{formatWeight(item.grossWeightMg)}</Text>
          </View>

          {/* PURITY BADGE */}
          <View 
            style={[
              s.metricChip, 
              { 
                backgroundColor: isGold 
                  ? (isDark ? 'rgba(212, 175, 55, 0.12)' : '#FEF3C7') 
                  : (isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9'), 
                borderColor: isGold ? 'rgba(212, 175, 55, 0.30)' : 'rgba(148, 163, 184, 0.30)' 
              }
            ]}
          >
            <Sparkles size={10} color={metalColor} />
            <Text style={[s.purityValue, { color: isGold ? (isDark ? '#FDE68A' : '#92400E') : (isDark ? '#E2E8F0' : '#334155') }]}>
              {purityDisplay}
            </Text>
          </View>

          {/* SIZE BADGE (If Present) */}
          {item.sizeValue != null && (
            <View 
              style={[
                s.metricChip, 
                { 
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', 
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' 
                }
              ]}
            >
              <Tag size={10} color={colors.vjText} style={{ opacity: 0.5 }} />
              <Text style={[s.metricValue, { color: colors.vjText }]}>
                {item.sizeUnit === 'RING_SIZE' ? `Ring ${item.sizeValue}` : `${item.sizeValue} ${item.sizeUnit || ''}`}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom Row: Location Badge & Actions */}
        <View style={s.bottomRow}>
          <View 
            style={[
              s.locationRow, 
              { 
                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.08)' : `${colors.vjAccent}08`, 
                borderColor: isDark ? 'rgba(212, 175, 55, 0.18)' : `${colors.vjAccent}18` 
              }
            ]}
          >
            <MapPin size={11} color={colors.vjAccent} />
            <Text style={[s.locationText, { color: colors.vjText }]} numberOfLines={1}>
              {item.location?.replace(/_/g, ' ') || 'Counter Tray'}
            </Text>
          </View>

          <View style={s.actionContainer}>
            <TouchableOpacity
              testID={`print-item-btn-${item.itemId}`}
              style={[
                s.printBtn, 
                { 
                  backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : `${colors.vjAccent}12`, 
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : `${colors.vjAccent}28` 
                }
              ]}
              activeOpacity={0.75}
              onPress={(e) => {
                e?.stopPropagation?.();
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                onPrint(item.itemId);
              }}
            >
              <Printer size={16} color={isDark ? '#FDE68A' : colors.vjAccent} />
            </TouchableOpacity>

            <View 
              style={[
                s.chevronBox, 
                { 
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : `${colors.vjAccent}08`,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : `${colors.vjAccent}18`
                }
              ]}
            >
              <ChevronRight size={14} color={isDark ? '#E5E7EB' : colors.vjAccent} />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function PurityItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;

  const params = useLocalSearchParams<{ designId: string; designName: string; purityPercent: string }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId;
  const designName = Array.isArray(params.designName) ? params.designName[0] : params.designName;
  const purityPercent = Array.isArray(params.purityPercent) ? params.purityPercent[0] : params.purityPercent;

  const { activeFirmId } = useFirmStore();
  const designVersion = useMastersSyncStore((s) => s.designVersion);
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId || !purityPercent) return;
        setLoading(true);
        try {
          const targetPurity = parseCleanFloat(purityPercent);
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
    }, [activeFirmId, designId, purityPercent, designVersion])
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
    
    const karatBadge = formatKaratBadge(targetPurity, metal);
    const purityDisplay = (isGold && karatBadge)
      ? `${karatBadge} (${targetPurity.toFixed(1)}%)`
      : getDisplayPurity(targetPurity, karat, metal);

    return (
      <View style={[{ width: '100%' }, isTablet && { maxWidth: 780, alignSelf: 'center' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <HeaderPill icon={<Sparkles size={12} color={colors.vjBg} />} label={purityDisplay} />
          <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${items.length} Items`} />
          <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalNetWeightMg)}`} variant="success" />
        </View>
      </View>
    );
  }, [items, purityPercent, totalNetWeightMg, colors.vjBg, isTablet]);

  const currentDesignName = items[0]?.designName || designName || 'Purity Items';

  return (
    <TwoToneWrapper title={currentDesignName} showBack headerContent={purityHeaderPills}>
      <View style={[s.listContainer, isTablet && { maxWidth: 780, width: '100%', alignSelf: 'center' }]}>
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
                designName={currentDesignName}
                colors={colors} 
                isDark={isDark}
                onPress={handleItemPress} 
                onPrint={handlePrint} 
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={135}
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom + 40, 80),
              paddingTop: 18,
              paddingHorizontal: isTablet ? 24 : 14,
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
  listContainer: { 
    flex: 1 
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  metalStripe: { 
    width: 6, 
    alignSelf: 'stretch' 
  },
  itemCardBody: { 
    flex: 1, 
    paddingVertical: 14, 
    paddingHorizontal: 14 
  },
  topRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 10 
  },
  skuText: { 
    fontSize: 15, 
    fontWeight: '900', 
    fontFamily: 'monospace', 
    letterSpacing: 0.6 
  },
  barcodeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  barcodeText: { 
    fontSize: 10.5, 
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  badgeRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 6 
  },
  huidBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 3.5, 
    paddingHorizontal: 7.5, 
    paddingVertical: 3, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: 'rgba(22, 163, 74, 0.30)' 
  },
  huidText: { 
    color: '#16A34A', 
    fontSize: 9.5, 
    fontWeight: '800', 
    letterSpacing: 0.6, 
    fontFamily: 'monospace' 
  },
  noHuidBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  noHuidText: { 
    fontSize: 9.5, 
    fontWeight: '700' 
  },
  itemMetaRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10, 
    flexWrap: 'wrap', 
    gap: 6 
  },
  weightChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  weightLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  netWeightValue: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7.5,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  purityValue: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  locationRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4.5, 
    paddingHorizontal: 8, 
    paddingVertical: 3.5, 
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '65%',
  },
  locationText: { 
    fontSize: 10, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.4,
  },
  actionContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 7 
  },
  printBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1.2 
  },
  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
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
