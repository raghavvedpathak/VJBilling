// components/InventoryStockSummary.tsx — Phase 2 v2.24 Canonical Implementation
// Enforces Phantom Debt visibility, Phase 3 Rate Engine boundary, and Net Weight display rules.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/ui/Glass';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getCurrencySymbol, formatWeightMg } from '@/utils/calculations';
import { Scale, AlertCircle, Wallet, TrendingUp, ShieldCheck } from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

interface StockWeightSummary {
  goldNetWeightMg: number;
  goldPhantomDebtMg: number;
  goldBalanceMg: number;
  silverNetWeightMg: number;
  silverPhantomDebtMg: number;
  silverBalanceMg: number;
}

export interface InventoryStockSummaryProps {
  firmId: string;
  goldRatePerGramPaise?: number | undefined; // Injected by Phase 3 Rate Engine
  silverRatePerGramPaise?: number | undefined; // Injected by Phase 3 Rate Engine
  refreshTrigger?: number | undefined;
}

interface SummaryCardProps {
  metal: 'GOLD' | 'SILVER';
  totalMg: number;
  debtMg: number;
  balanceMg: number;
  ratePaise?: number | undefined;
  accentColor: string;
  colors: ReturnType<typeof getThemeColors>;
  testID?: string | undefined;
}

// RULE-1A-WEIGHT-DISPLAY (v1.54): (mg / 1000).toFixed(3) + ' g'
const formatWeight = (mg: number) => formatWeightMg(mg);

// CURRENCY-DISPLAY-RULE (v1.54): getCurrencySymbol() + (paise / 100).toFixed(2)
const formatLiveValue = (mg: number, ratePerGramPaise?: number | undefined) => {
  if (!ratePerGramPaise || isNaN(ratePerGramPaise)) return null; // Awaiting Phase 3 Rate Engine
  const totalValuePaise = Math.round((mg / 1000) * ratePerGramPaise);
  return `${getCurrencySymbol()}${(totalValuePaise / 100).toFixed(2)}`;
};

// Custom 3D Bullion Bar Component for Gold & Silver Vault Headers
const BullionBar3D = ({ isGold }: { isGold: boolean }) => {
  return (
    <View 
      style={{
        width: 44,
        height: 26,
        borderRadius: 5,
        backgroundColor: isGold ? '#D4AF37' : '#9CA3AF',
        borderWidth: 1.5,
        borderColor: isGold ? '#FFE87C' : '#F3F4F6',
        borderBottomWidth: 3,
        borderBottomColor: isGold ? '#8B6508' : '#374151',
        borderRightWidth: 2.5,
        borderRightColor: isGold ? '#B8860B' : '#4B5563',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glossy Metallic Light Reflective Highlight */}
      <View 
        style={{
          position: 'absolute',
          top: -2,
          left: -4,
          right: 0,
          height: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.45)',
          transform: [{ skewY: '-15deg' }],
        }}
      />
      {/* Inner Bevel Border */}
      <View 
        style={{
          width: 36,
          height: 18,
          borderRadius: 3,
          borderWidth: 1,
          borderColor: isGold ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isGold ? 'rgba(184, 134, 11, 0.25)' : 'rgba(75, 85, 99, 0.25)',
        }}
      >
        <Text 
          style={{
            fontSize: 8,
            fontWeight: '900',
            color: isGold ? '#4A2E00' : '#111827',
            letterSpacing: 0.6,
          }}
        >
          999
        </Text>
      </View>
    </View>
  );
};

const SummaryCard = ({ metal, totalMg, debtMg, balanceMg, ratePaise, accentColor, colors, testID }: SummaryCardProps) => {
  const isGold = metal === 'GOLD';
  const hasDebt = debtMg > 0;
  const estimatedValue = formatLiveValue(totalMg, ratePaise);

  const handleCardPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };
  
  return (
    <TouchableOpacity testID={testID} activeOpacity={0.9} onPress={handleCardPress}>
      <GlassCard 
        style={{
          backgroundColor: isGold ? 'rgba(253, 248, 238, 0.82)' : 'rgba(244, 245, 247, 0.82)',
          borderColor: isGold ? 'rgba(212, 175, 55, 0.35)' : 'rgba(156, 163, 175, 0.35)',
          padding: 0,
          borderRadius: 20,
        }}
      >
        {/* Header Section */}
        <View style={s.header}>
          <View style={s.titleRow}>
            <BullionBar3D isGold={isGold} />
            <Text style={[s.metalTitle, { color: colors.vjText }]}>
              {isGold ? 'Gold Stock' : 'Silver Stock'}
            </Text>
          </View>

          <View style={s.valueContainer}>
            <Text style={[s.valueLabel, { color: colors.vjText }]}>Live Valuation</Text>
            {estimatedValue ? (
              <View style={s.valueRow}>
                <TrendingUp size={14} color={accentColor} />
                <Text style={[s.valueText, { color: accentColor }]}>{estimatedValue}</Text>
              </View>
            ) : (
              <View style={[s.noRateBadge, { backgroundColor: `${colors.vjAccent}10` }]}>
                <Text style={[s.noRateText, { color: colors.vjText }]}>{getCurrencySymbol()} —</Text>
              </View>
            )}
          </View>
        </View>

        {/* Data Grid Section */}
        <View style={s.grid}>
          {/* Physical Net Weight Box */}
          <View style={s.gridBox}>
            <View style={s.gridLabelRow}>
              <Scale size={12} color={colors.vjText} style={{ opacity: 0.5 }} />
              <Text style={[s.gridLabel, { color: colors.vjText }]}>Available Net Wt</Text>
            </View>
            <Text 
              testID={`${metal.toLowerCase()}-net-weight-value`}
              style={[s.gridValue, { color: colors.vjText }]}
            >
              {formatWeight(totalMg)}
            </Text>
          </View>

          {/* Divider */}
          <View style={[s.gridDivider, { backgroundColor: `${colors.vjAccent}18` }]} />

          {/* Phantom Debt Box */}
          <View style={s.gridBox}>
            <View style={s.gridLabelRow}>
              {hasDebt ? (
                <AlertCircle size={12} color={COLORS.danger} />
              ) : (
                <ShieldCheck size={12} color="#059669" />
              )}
              <Text style={[s.gridLabel, hasDebt ? { color: COLORS.danger } : { color: '#059669' }]}>
                {hasDebt ? 'Phantom Debt' : 'Phantom Status'}
              </Text>
            </View>
            {hasDebt ? (
              <View style={s.phantomAlertPill}>
                <Text 
                  testID={`${metal.toLowerCase()}-phantom-debt-value`}
                  style={s.phantomAlertText}
                >
                  -{formatWeight(debtMg)}
                </Text>
              </View>
            ) : (
              <Text style={s.cleanPhantomText}>Clean (0.000 g)</Text>
            )}
          </View>
        </View>

        {/* Bottom Hero Balance */}
        <View 
          style={[
            s.balanceRow, 
            { 
              backgroundColor: isGold ? 'rgba(212, 175, 55, 0.08)' : 'rgba(156, 163, 175, 0.08)',
              borderTopColor: `${colors.vjAccent}18`,
            }
          ]}
        >
          <View style={s.balanceLabelRow}>
            <Wallet size={16} color={accentColor} />
            <Text style={[s.balanceLabel, { color: accentColor }]}>True Ledger Balance</Text>
          </View>
          <Text 
            testID={`${metal.toLowerCase()}-ledger-balance-value`}
            style={[
              s.balanceValue, 
              { color: colors.vjText },
              balanceMg < 0 && { color: COLORS.danger }
            ]}
          >
            {formatWeight(balanceMg)}
          </Text>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
};

export function InventoryStockSummary({ firmId, goldRatePerGramPaise, silverRatePerGramPaise, refreshTrigger }: InventoryStockSummaryProps) {
  const [summary, setSummary] = useState<StockWeightSummary>({
    goldNetWeightMg: 0,
    goldPhantomDebtMg: 0,
    goldBalanceMg: 0,
    silverNetWeightMg: 0,
    silverPhantomDebtMg: 0,
    silverBalanceMg: 0,
  });

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    let isActive = true;
    const fetchSummary = async () => {
      if (!firmId) return;
      try {
        const data = await itemRepository.getStockWeightSummary(firmId);
        if (isActive && data) setSummary(data);
      } catch (error) {
        console.error('[InventoryStockSummary] Failed to fetch summary:', error);
      }
    };
    fetchSummary();
    return () => { isActive = false; };
  }, [firmId, refreshTrigger]);

  return (
    <View style={s.container}>
      <SummaryCard 
        testID="gold-stock-summary-card"
        metal="GOLD" 
        totalMg={summary.goldNetWeightMg} 
        debtMg={summary.goldPhantomDebtMg} 
        balanceMg={summary.goldBalanceMg} 
        ratePaise={goldRatePerGramPaise}
        accentColor={COLORS.goldAccent}
        colors={colors}
      />
      <SummaryCard 
        testID="silver-stock-summary-card"
        metal="SILVER" 
        totalMg={summary.silverNetWeightMg} 
        debtMg={summary.silverPhantomDebtMg} 
        balanceMg={summary.silverBalanceMg} 
        ratePaise={silverRatePerGramPaise}
        accentColor={COLORS.silverAccent}
        colors={colors}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metalTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  valueLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    opacity: 0.55,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  noRateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noRateText: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.55,
  },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  gridBox: {
    flex: 1,
  },
  gridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  cleanPhantomText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
    fontFamily: 'monospace',
  },
  phantomAlertPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phantomAlertText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.danger,
    fontFamily: 'monospace',
  },
  gridDivider: {
    width: 1,
    marginHorizontal: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
});