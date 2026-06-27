// app/inventory/purity-items.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity } from '../../utils/purity.constants';
import { formatSKUDisplay } from '../../utils/skuDisplay';
import { ChevronRight, Tag, Gem, MapPin, Printer } from 'lucide-react-native';
import type { ItemSearchResult } from '../../types/phase2.types';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
};

const SkuRow = React.memo(({
  item,
  onPress,
  onPrint
}: {
  item: ItemSearchResult;
  onPress: (itemId: string) => void;
  onPrint: (itemId: string) => void;
}) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);
  const displaySku = formatSKUDisplay(item.sku);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={s.itemCard}
      onPress={() => onPress(item.itemId)}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />
      <View style={s.itemCardBody}>
        <View style={s.topRow}>
          <Text style={s.skuText} selectable>{displaySku}</Text>
          <View style={s.badgeRow}>
            {item.huid ? (
              <View style={s.huidBadge}>
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
          <Text style={s.barcodeText}>BC: {item.barcode}</Text>
        )}

        <View style={s.itemMetaRow}>
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Gross</Text>
            <Text style={s.itemMetaValue}>{formatWeight(item.grossWeightMg)}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Net</Text>
            <Text style={s.itemMetaValue}>{formatWeight(item.netWeightMg || 0)}</Text>
          </View>
          <View style={s.metaDivider} />
          <View style={s.itemMetaBlock}>
            <Text style={s.itemMetaLabel}>Purity</Text>
            <Text style={[s.itemMetaValue, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
        </View>

        <View style={s.locationRow}>
          <MapPin size={12} color="rgba(92,22,35,0.3)" />
          <Text style={s.locationText}>{item.location?.replace(/_/g, ' ') || '—'}</Text>
        </View>
      </View>

      <View style={s.actionContainer}>
        <TouchableOpacity
          style={s.printBtn}
          activeOpacity={0.7}
          onPress={() => onPrint(item.itemId)}
        >
          <Printer size={20} color={COLORS.vjAccent} />
        </TouchableOpacity>
        <ChevronRight size={20} color="rgba(92,22,35,0.2)" />
      </View>
    </TouchableOpacity>
  );
});

export default function PurityItemsScreen() {
  const router = useRouter();
  const { designId, designName, purityPercent } = useLocalSearchParams<{ designId: string; designName: string; purityPercent: string }>();
  const { activeFirmId } = useFirmStore();
  const [items, setItems] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !designId || !purityPercent) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getItemsByDesign(activeFirmId, designId);
          if (active) {
            const targetPurity = Number(purityPercent);
            const filtered = results.filter(r => r.purityPercent === targetPurity);
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

  const headerContent = useMemo(() => {
    const firstItem = items[0];
    const metal = firstItem?.metal || 'GOLD';
    const karat = firstItem?.purityKarat ?? null;
    const targetPurity = Number(purityPercent);
    const purityDisplay = getDisplayPurity(targetPurity, karat, metal);

    return (
      <View>
        <View style={s.headerIconRow}>
          <View style={s.headerIconCircle}>
            <Gem size={28} color={COLORS.vjBg} />
          </View>
        </View>
        <Text style={s.headerTitle} numberOfLines={1}>{designName || 'Items'}</Text>
        <Text style={s.headerSubtitle}>
          {purityDisplay} • {items.length} Items
        </Text>
      </View>
    );
  }, [designName, purityPercent, items]);

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading items...</Text>
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <SkuRow item={item} onPress={handleItemPress} onPrint={handlePrint} />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Tag size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No Items Found</Text>
                <Text style={s.emptySubtitle}>No available stock for this purity</Text>
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
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    paddingRight: 20,
  },
  metalStripe: { width: 5, alignSelf: 'stretch' },
  itemCardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  skuText: { color: COLORS.vjText, fontSize: 15, fontWeight: '800', fontFamily: 'monospace', letterSpacing: 0.5 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  huidBadge: { backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' },
  huidText: { color: '#3B82F6', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  noHuidBadge: { backgroundColor: 'rgba(92,22,35,0.04)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  noHuidText: { color: 'rgba(92,22,35,0.4)', fontSize: 10, fontWeight: '700' },
  barcodeText: { color: 'rgba(92,22,35,0.4)', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemMetaBlock: { paddingRight: 12 },
  metaDivider: { width: 1, height: 18, backgroundColor: 'rgba(92,22,35,0.08)', marginRight: 12 },
  itemMetaLabel: { color: 'rgba(92,22,35,0.4)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  itemMetaValue: { color: COLORS.vjText, fontSize: 13, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(92,22,35,0.02)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  locationText: { color: 'rgba(92,22,35,0.5)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  actionContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  printBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(184,115,51,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
});
