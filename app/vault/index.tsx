// app/vault/index.tsx — Phase 4: Vault & Refinery Command Center
// Integrates Metal Balance Engine, Location Summary & Refinery Yield Analytics

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, HeaderPill, MenuTile } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useSession } from '@/hooks/useSession';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import { metalFlowService } from '@/services/phase4/metalFlowService';
import { refineryBatchService } from '@/services/phase4/refineryBatchService';
import { formatWeightMg } from '@/utils/calculations';
import type {
  FineBalanceBreakdown,
  MetalLocationSummary,
  RefineryGainLossReport,
} from '@/types/phase4/phase4.types';
import {
  Landmark,
  Flame,
  Factory,
  Coins,
  Hammer,
  Scale,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
} from 'lucide-react-native';

export default function VaultRefineryHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { activeFirmId } = useFirmStore();
  const { activeFY } = useSession();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [fineBalanceMg, setFineBalanceMg] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<FineBalanceBreakdown | null>(null);
  const [locationSummary, setLocationSummary] = useState<MetalLocationSummary | null>(null);
  const [yieldReport, setYieldReport] = useState<RefineryGainLossReport | null>(null);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const fyId = activeFY?.id;
      const [breakd, locSummary, rep] = await Promise.all([
        metalFlowService.getFineBalance(activeFirmId, fyId).catch(() => null),
        metalFlowService.getMetalLocationSummary(activeFirmId, fyId).catch(() => null),
        refineryBatchService.getGainLossReport(activeFirmId).catch(() => null),
      ]);

      if (breakd) {
        setFineBalanceMg(breakd.currentFineBalanceMg || 0);
        setBreakdown(breakd);
      }
      setLocationSummary(locSummary);
      setYieldReport(rep);
    } catch (e) {
      console.warn('[VaultRefineryHub] Error loading data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFirmId, activeFY?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const headerPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      <HeaderPill
        icon={<Scale size={12} color="#4ADE80" />}
        label={`Fine Balance: ${formatWeightMg(fineBalanceMg)}`}
        variant="success"
      />
      <HeaderPill
        icon={<Coins size={12} color={colors.vjBg} />}
        label={`In-Hand: ${formatWeightMg(locationSummary?.inHand.fineWeightMg || 0)}`}
      />
      <HeaderPill
        icon={<Hammer size={12} color="#38BDF8" />}
        label={`At Karigar: ${formatWeightMg(locationSummary?.withKarigar.fineWeightMg || 0)}`}
      />
    </View>
  );

  const tileContainerStyle = isTablet ? { width: '48.5%' } : { width: '48%' };

  return (
    <TwoToneWrapper title="Vault & Refinery" showBack headerContent={headerPills}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom + 32, 80),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.vjAccent}
            colors={[colors.vjAccent]}
          />
        }
      >
        {/* 1. MASTER METAL BALANCE BANNER */}
        <GlassCard
          style={{
            borderColor: isDark ? 'rgba(212, 175, 55, 0.45)' : 'rgba(217, 119, 6, 0.35)',
            backgroundColor: isDark ? 'rgba(30, 20, 24, 0.90)' : 'rgba(255, 255, 255, 0.92)',
            padding: 18,
            marginBottom: 20,
          }}
        >
          <View style={s.bannerTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.iconBoxGold, { backgroundColor: `${colors.vjAccent}18` }]}>
                <Landmark size={24} color={colors.vjAccent} />
              </View>
              <View>
                <Text style={[s.bannerSubtitle, { color: colors.vjText }]}>Firm Fine Gold Balance</Text>
                <Text style={[s.bannerValue, { color: colors.vjAccent }]}>
                  {formatWeightMg(fineBalanceMg)}
                </Text>
              </View>
            </View>
            <View style={[s.badgeActive, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.28)' }]}>
              <View style={s.dotActive} />
              <Text style={s.badgeActiveText}>FY ACTIVE</Text>
            </View>
          </View>

          {/* Location breakdown mini-strip */}
          <View style={[s.stripContainer, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)' }]}>
            <View style={s.stripCol}>
              <Text style={[s.stripLabel, { color: colors.vjText }]}>Vault In-Hand</Text>
              <Text style={[s.stripVal, { color: colors.vjText }]}>
                {formatWeightMg(locationSummary?.inHand.fineWeightMg || 0)}
              </Text>
              <Text style={[s.stripSub, { color: colors.vjText }]}>
                {locationSummary?.inHand.lotCount || 0} Lots
              </Text>
            </View>

            <View style={s.stripDivider} />

            <View style={s.stripCol}>
              <Text style={[s.stripLabel, { color: colors.vjText }]}>With Karigars</Text>
              <Text style={[s.stripVal, { color: '#0284C7' }]}>
                {formatWeightMg(locationSummary?.withKarigar.fineWeightMg || 0)}
              </Text>
              <Text style={[s.stripSub, { color: colors.vjText }]}>
                {locationSummary?.withKarigar.karigarCount || 0} Artisans
              </Text>
            </View>

            <View style={s.stripDivider} />

            <View style={s.stripCol}>
              <Text style={[s.stripLabel, { color: colors.vjText }]}>At Refinery</Text>
              <Text style={[s.stripVal, { color: '#D97706' }]}>
                {formatWeightMg(locationSummary?.atRefinery.fineWeightMg || 0)}
              </Text>
              <Text style={[s.stripSub, { color: colors.vjText }]}>
                {locationSummary?.atRefinery.lotCount || 0} Lots
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* SECTION 1: CORE METALLURGY OPERATIONS */}
        <View style={s.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#D97706' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Metal Conversion Operations
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: 'rgba(217, 119, 6, 0.12)', borderColor: 'rgba(217, 119, 6, 0.30)' }]}>
            <Flame size={11} color="#D97706" />
            <Text style={s.sectionBadgeText}>WORKFLOW</Text>
          </View>
        </View>

        <View style={s.menuGrid}>
          <MenuTile
            containerStyle={tileContainerStyle}
            title="Melt Batches"
            subtitle="Produce Assayed Bars"
            icon={<Flame size={22} color="#EA580C" />}
            iconBg="rgba(234, 88, 12, 0.12)"
            borderColor="rgba(234, 88, 12, 0.3)"
            badgeText="ASSAY BAR"
            badgeVariant="active"
            onPress={() => router.push('/vault/melt')}
          />

          <MenuTile
            containerStyle={tileContainerStyle}
            title="Refinery Batches"
            subtitle="Scrap Dispatch & Settlement"
            icon={<Factory size={22} color="#D97706" />}
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.3)"
            badgeText="REFINERY"
            badgeVariant="active"
            onPress={() => router.push('/vault/refinery')}
          />
        </View>

        {/* SECTION 2: SCRAP & ARTISAN TRACKING */}
        <View style={[s.sectionHeaderRow, { marginTop: 24 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#2563EB' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Gold Lot Registers
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderColor: 'rgba(37, 99, 235, 0.30)' }]}>
            <Layers size={11} color="#2563EB" />
            <Text style={[s.sectionBadgeText, { color: '#2563EB' }]}>REGISTERS</Text>
          </View>
        </View>

        <View style={s.menuGrid}>
          <MenuTile
            containerStyle={tileContainerStyle}
            title="Old Metal Vault"
            subtitle="Customer Scrap Lots"
            icon={<Coins size={22} color="#D97706" />}
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.3)"
            badgeText={`${locationSummary?.inHand.lotCount || 0} IN-HAND`}
            onPress={() => router.push('/inventory/old-metal-lots')}
          />

          <MenuTile
            containerStyle={tileContainerStyle}
            title="Karigar Artisans"
            subtitle="Dual Ledger & Issues"
            icon={<Hammer size={22} color="#0284C7" />}
            iconBg="rgba(2, 132, 199, 0.12)"
            borderColor="rgba(2, 132, 199, 0.3)"
            badgeText={`${locationSummary?.withKarigar.karigarCount || 0} ACTIVE`}
            onPress={() => router.push('/billing/karigars')}
          />
        </View>

        {/* SECTION 3: REFINERY YIELD & ANALYTICS */}
        <View style={[s.sectionHeaderRow, { marginTop: 24 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#10B981' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Refinery Yield & Gain/Loss Report
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.30)' }]}>
            <TrendingUp size={11} color="#10B981" />
            <Text style={[s.sectionBadgeText, { color: '#10B981' }]}>ANALYTICS</Text>
          </View>
        </View>

        <GlassCard
          style={{
            borderColor: isDark ? 'rgba(212, 175, 55, 0.3)' : 'rgba(212, 175, 55, 0.35)',
            padding: 16,
            marginBottom: 24,
          }}
        >
          <View style={s.analyticsTopRow}>
            <View>
              <Text style={[s.analyticsLabel, { color: colors.vjText }]}>Total Refinery Batches</Text>
              <Text style={[s.analyticsValue, { color: colors.vjText }]}>
                {yieldReport?.totalBatches || 0} Batches
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.analyticsLabel, { color: colors.vjText }]}>Overall Yield %</Text>
              <Text style={[s.analyticsValue, { color: colors.vjAccent }]}>
                {yieldReport?.overallYieldPct !== null && yieldReport?.overallYieldPct !== undefined
                  ? `${yieldReport.overallYieldPct.toFixed(2)}%`
                  : '—'}
              </Text>
            </View>
          </View>

          <View style={[s.analyticsGrid, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
            <View style={s.analyticsCol}>
              <Text style={[s.analyticsSubLabel, { color: colors.vjText }]}>Total Input Fine</Text>
              <Text style={[s.analyticsSubVal, { color: colors.vjText }]}>
                {formatWeightMg(yieldReport?.totalInputFineMg || 0)}
              </Text>
            </View>

            <View style={s.analyticsCol}>
              <Text style={[s.analyticsSubLabel, { color: colors.vjText }]}>Total Output Fine</Text>
              <Text style={[s.analyticsSubVal, { color: colors.vjText }]}>
                {formatWeightMg(yieldReport?.totalOutputFineMg || 0)}
              </Text>
            </View>

            <View style={s.analyticsCol}>
              <Text style={[s.analyticsSubLabel, { color: colors.vjText }]}>Net Gain / Loss</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {(yieldReport?.netGainLossMg || 0) >= 0 ? (
                  <TrendingUp size={13} color="#10B981" />
                ) : (
                  <TrendingDown size={13} color="#EF4444" />
                )}
                <Text
                  style={[
                    s.analyticsSubVal,
                    {
                      color:
                        (yieldReport?.netGainLossMg || 0) >= 0
                          ? '#10B981'
                          : '#EF4444',
                    },
                  ]}
                >
                  {formatWeightMg(Math.abs(yieldReport?.netGainLossMg || 0))}
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>
      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBoxGold: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  bannerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.65,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  badgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  badgeActiveText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  stripContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  stripCol: {
    flex: 1,
    alignItems: 'center',
  },
  stripDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
  },
  stripLabel: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.6,
    marginBottom: 2,
  },
  stripVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  stripSub: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.5,
    marginTop: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionHeaderDiamond: {
    width: 8,
    height: 8,
    transform: [{ rotate: '45deg' }],
    borderRadius: 1.5,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  analyticsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  analyticsLabel: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.6,
  },
  analyticsValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  analyticsCol: {
    flex: 1,
  },
  analyticsSubLabel: {
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.55,
    marginBottom: 2,
  },
  analyticsSubVal: {
    fontSize: 13,
    fontWeight: '900',
  },
});
