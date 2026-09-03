// app/inventory/gemstones.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { gemstoneLotRepository } from '@/repositories/phase2/gemstoneLotRepository';
import { formatRupees } from '@/utils/calculations';
import { Gem, Plus, Diamond, Banknote, ShieldAlert, CheckCircle, Sparkles, Scale } from 'lucide-react-native';
import type { GemstoneLot } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const formatCarats = (caratsX100: number) => (caratsX100 / 100).toFixed(2) + ' ct';
const formatCurrency = (paise: number | null) => (paise === null || paise === undefined ? '—' : formatRupees(paise));

const LotRow = memo(({ 
  item, 
  colors 
}: { 
  item: GemstoneLot; 
  colors: ReturnType<typeof getThemeColors>; 
}) => {
  const isAvailable = item.status === 'AVAILABLE';

  return (
    <GlassCard testID={`gemstone-lot-card-${item.id}`} style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[s.lotName, { color: colors.vjText }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[s.supplierName, { color: colors.vjText, opacity: 0.55 }]}>
            {item.supplierName || 'Self / Direct Lot'}
          </Text>
        </View>

        <View 
          style={[
            s.statusBadge, 
            { 
              backgroundColor: isAvailable ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              borderColor: isAvailable ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
            }
          ]}
        >
          {isAvailable ? (
            <CheckCircle size={12} color="#10B981" />
          ) : (
            <ShieldAlert size={12} color="#EF4444" />
          )}
          <Text 
            style={[
              s.statusText, 
              { color: isAvailable ? '#047857' : '#DC2626' }
            ]}
          >
            {item.status}
          </Text>
        </View>
      </View>

      <View style={[s.cardMiddle, { backgroundColor: `${colors.vjAccent}08` }]}>
        <View style={s.detailCol}>
          <View style={s.iconRow}>
            <Diamond size={13} color={colors.vjAccent} style={{ opacity: 0.7 }} />
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Weight</Text>
          </View>
          <Text style={[s.detailValue, { color: colors.vjText }]}>
            {formatCarats(item.weightCaratX100)}
          </Text>
        </View>
        
        <View style={s.detailCol}>
          <View style={s.iconRow}>
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Quantity</Text>
          </View>
          <Text style={[s.detailValue, { color: colors.vjText }]}>
            {item.quantity} pcs
          </Text>
        </View>

        <View style={s.detailCol}>
          <View style={s.iconRow}>
            <Banknote size={13} color={colors.vjAccent} style={{ opacity: 0.7 }} />
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Valuation</Text>
          </View>
          <Text style={[s.detailValue, { color: colors.vjAccent }]}>
            {formatCurrency(item.totalPurchaseAmountPaise)}
          </Text>
        </View>
      </View>
      
      {item.certificationRef ? (
        <View style={[s.certRow, { borderTopColor: `${colors.vjAccent}18` }]}>
          <Text style={[s.certLabel, { color: colors.vjText, opacity: 0.5 }]}>Cert Ref:</Text>
          <Text style={[s.certValue, { color: colors.vjAccent }]} selectable>
            {item.certificationRef}
          </Text>
        </View>
      ) : null}
    </GlassCard>
  );
});

export default function GemstonesInventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<GemstoneLot[]>([]);
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
          const results = await gemstoneLotRepository.findByFirmId(activeFirmId);
          if (active) {
            const sorted = (results || []).slice().sort((a, b) => 
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            setData(sorted);
          }
        } catch (e) {
          console.error('[GemstonesInventoryScreen] Failed to fetch gemstone lots:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId])
  );

  const totalCarats = useMemo(() => {
    const totalX100 = data.reduce((acc, curr) => acc + (curr.weightCaratX100 || 0), 0);
    return (totalX100 / 100).toFixed(2);
  }, [data]);

  const gemstoneHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Gem size={12} color={colors.vjBg} />} label={`${data.length} Stone Lots`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Total: ${totalCarats} ct`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Gemstone Lots" showBack headerContent={gemstoneHeaderPills}>
      <View style={s.listContainer}>
        {loading && data.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading gemstone inventory...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LotRow item={item} colors={colors} />}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={140}
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom + 120, 140),
              paddingTop: 24,
              paddingHorizontal: 16,
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Gem size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Gemstones Found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  Tap the + button to add a new physical gemstone lot.
                </Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity 
        testID="gemstones-fab-add"
        style={[s.fab, { backgroundColor: colors.vjAccent, bottom: Math.max(insets.bottom + 24, 40) }]} 
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          router.push('/inventory/add-gemstone');
        }} 
        activeOpacity={0.85}
      >
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { 
    flex: 1 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 12,
    marginTop: 60,
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
    paddingHorizontal: 24,
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: '700',
    opacity: 0.7, 
  },
  emptySubtitle: { 
    fontSize: 13, 
    textAlign: 'center',
  },
  fab: { 
    position: 'absolute', 
    right: 24, 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 6, 
    elevation: 8 
  },
  card: { 
    padding: 16, 
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 14 
  },
  lotName: { 
    fontSize: 16, 
    fontWeight: '800', 
    marginBottom: 2 
  },
  supplierName: { 
    fontSize: 12, 
    fontWeight: '500',
  },
  statusBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    paddingHorizontal: 8, 
    paddingVertical: 3.5, 
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: { 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardMiddle: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 12, 
    borderRadius: 12 
  },
  detailCol: { 
    gap: 4 
  },
  iconRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  detailLabel: { 
    fontSize: 10.5, 
    fontWeight: '700', 
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.6,
  },
  detailValue: { 
    fontSize: 13.5, 
    fontWeight: '800', 
    fontFamily: 'monospace' 
  },
  certRow: { 
    marginTop: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    paddingTop: 10, 
    borderTopWidth: 1, 
  },
  certLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  certValue: { 
    fontSize: 12, 
    fontWeight: '800', 
    fontFamily: 'monospace',
    letterSpacing: 0.5, 
  },
});