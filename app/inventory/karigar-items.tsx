// app/inventory/karigar-items.tsx — Phase 2 v2.34 Canonical Screen
// Implements FEAT-GAP6-KARIGAR-SUMMARY-1 (v1.66) & RULE-1A-WEIGHT-DISPLAY (v1.54)

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { formatWeightMg as formatWeight, formatKaratBadge } from '@/utils/calculations';
import { formatSKUDisplay } from '@/services/phase2/skuEngine';
import { formatDate } from '@/utils/formatDate';
import { Wrench, Scale, User, Clock, ChevronRight, CheckCircle2 } from 'lucide-react-native';
import type { KarigarIssuedItem } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const KarigarItemRow = memo(({
  item,
  colors,
  onPress,
}: {
  item: KarigarIssuedItem;
  colors: ReturnType<typeof getThemeColors>;
  onPress: (itemId: string) => void;
}) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.bullionGold : COLORS.bullionSilver;
  const karatBadge = formatKaratBadge(item.purityPercent, item.metal);

  return (
    <TouchableOpacity
      testID={`karigar-item-card-${item.id}`}
      activeOpacity={0.85}
      style={{ marginBottom: 12 }}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.id);
      }}
    >
      <GlassCard style={[s.card, { borderColor: `${colors.vjAccent}25` }]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[s.designName, { color: colors.vjText }]} numberOfLines={1}>
              {item.designName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
                <Text style={[s.metalPillText, { color: metalColor }]}>
                  {karatBadge ? `${karatBadge} · ${item.purityPercent}%` : `${item.metal} ${item.purityPercent}%`}
                </Text>
              </View>
              <Text style={[s.skuText, { color: colors.vjAccent }]}>
                {formatSKUDisplay(item.sku)}
              </Text>
            </View>
          </View>

          <View style={[s.statusBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
            <Wrench size={12} color="#D97706" />
            <Text style={[s.statusText, { color: '#D97706' }]}>AT WORK</Text>
          </View>
        </View>

        <View style={[s.cardMiddle, { backgroundColor: `${colors.vjAccent}08` }]}>
          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <User size={12} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText }]}>Karigar</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjText }]} numberOfLines={1}>
              {item.karigarName || 'Unassigned Artisan'}
            </Text>
          </View>

          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <Scale size={12} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText }]}>Net Wt</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjAccent }]}>
              {formatWeight(item.netWeightMg ?? item.grossWeightMg)}
            </Text>
          </View>

          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <Clock size={12} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText }]}>Issued On</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjText }]}>
              {formatDate(item.updatedAt)}
            </Text>
          </View>
        </View>

        <View style={[s.cardFooter, { borderTopColor: `${colors.vjAccent}15` }]}>
          <Text style={[s.footerHint, { color: colors.vjText, opacity: 0.55 }]}>
            Tap to view item history or process return
          </Text>
          <ChevronRight size={13} color={colors.vjAccent} style={{ opacity: 0.5 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
});

export default function KarigarItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [items, setItems] = useState<KarigarIssuedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const data = await inventoryDrillDownService.getKarigarIssuedItems(activeFirmId);
          if (active) setItems(data || []);
        } catch (e) {
          console.error('[KarigarItemsScreen] Failed to fetch items:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId])
  );

  const totalNetMg = useMemo(
    () => items.reduce((acc, curr) => acc + (curr.netWeightMg || curr.grossWeightMg || 0), 0),
    [items]
  );

  const headerPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Wrench size={12} color={colors.vjBg} />} label={`${items.length} In Progress`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Circulation: ${formatWeight(totalNetMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Items at Karigar" showBack headerContent={headerPills}>
      <View style={s.container}>
        {loading && items.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading workshop inventory...</Text>
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <KarigarItemRow
                item={item}
                colors={colors}
                onPress={(id) => router.push({ pathname: '/inventory/item-detail', params: { itemId: id } })}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={145}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: Math.max(insets.bottom + 60, 80),
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <CheckCircle2 size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>Workshop Clear</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  There are currently no items issued to artisans or undergoing workshop repairs.
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
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 60 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySubtitle: { fontSize: 13, textAlign: 'center' },
  card: { padding: 16, borderRadius: 18, borderWidth: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  designName: { fontSize: 16, fontWeight: '900' },
  skuText: { fontSize: 12, fontWeight: '800', fontFamily: 'monospace' },
  metalPill: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 12, marginBottom: 10 },
  detailCol: { gap: 3 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
  detailValue: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  footerHint: { fontSize: 11, fontWeight: '600' },
});
