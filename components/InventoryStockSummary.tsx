// components/InventoryStockSummary.tsx
// Phase 2 v1.73 — Canonical Implementation
// Enforces Phantom Debt visibility, Phase 3 Rate Engine boundary, and Purchase Cost Aggregation.

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './ui/Glass';
import { useFocusEffect } from '@react-navigation/native';
import { itemRepository } from '../repositories/itemRepository';
import { getCurrencySymbol } from '../utils/currency';
import { Scale, AlertCircle, Wallet, TrendingUp } from 'lucide-react-native';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  goldAccent: '#D97706', // Premium Gold
  silverAccent: '#9CA3AF', // True Gray (Removed Blue Tint)
  danger: '#DC2626',
  surface: '#FFFFFF',
  border: 'rgba(46,29,0,0.06)',
};

interface StockWeightSummary {
  goldNetWeightMg: number;
  goldPhantomDebtMg: number;
  goldBalanceMg: number;
  goldInvestedPaise?: number; // Added for Purchase Cost
  silverNetWeightMg: number;
  silverPhantomDebtMg: number;
  silverBalanceMg: number;
  silverInvestedPaise?: number; // Added for Purchase Cost
}

export interface InventoryStockSummaryProps {
  firmId: string;
  goldRatePerGramPaise?: number; // Injected by Phase 3 Rate Engine
  silverRatePerGramPaise?: number; // Injected by Phase 3 Rate Engine
}

// Custom Bullion Bar Icon
const IngotIcon = ({ color }: { color: string }) => (
  <View style={[s.ingotContainer, { backgroundColor: color }]}>
    <View style={s.ingotInnerBorder}>
      <Text style={s.ingotText}>999</Text>
    </View>
  </View>
);

export function InventoryStockSummary({ firmId, goldRatePerGramPaise, silverRatePerGramPaise }: InventoryStockSummaryProps) {
  const [summary, setSummary] = useState<StockWeightSummary>({
    goldNetWeightMg: 0,
    goldPhantomDebtMg: 0,
    goldBalanceMg: 0,
    silverNetWeightMg: 0,
    silverPhantomDebtMg: 0,
    silverBalanceMg: 0,
  });

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const fetchSummary = async () => {
        try {
          const data = await itemRepository.getStockWeightSummary(firmId);
          if (isActive) setSummary(data);
        } catch (error) {
          console.error('[InventoryStockSummary] Failed to fetch summary:', error);
        }
      };
      fetchSummary();
      return () => { isActive = false; };
    }, [firmId])
  );

  const formatWeight = (mg: number) => (mg / 1000).toFixed(3) + ' g';

  const formatLiveValue = (mg: number, ratePerGramPaise?: number) => {
    if (!ratePerGramPaise) return null; // Awaiting Phase 3 rate
    const totalValuePaise = Math.round((mg / 1000) * ratePerGramPaise);
    return getCurrencySymbol() + (totalValuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatInvestedCost = (paise?: number) => {
    if (!paise) return getCurrencySymbol() + ' 0.00';
    return getCurrencySymbol() + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const SummaryCard = ({ metal, totalMg, debtMg, balanceMg, ratePaise, investedPaise, accentColor }: any) => {
    const hasDebt = debtMg > 0;
    const estimatedValue = formatLiveValue(balanceMg, ratePaise);
    
    return (
      <GlassCard>
        
        {/* Header Section */}
        <View style={s.header}>
          <View style={s.titleRow}>
            <View style={[s.iconBox, { backgroundColor: accentColor + '15' }]}>
              <IngotIcon color={accentColor} />
            </View>
            <Text style={s.metalTitle}>{metal} VAULT</Text>
          </View>

          <View style={s.valueContainer}>
            {/* Total Invested (Purchase Cost) */}
            <Text style={s.valueLabel}>Total Invested Cost</Text>
            <Text style={s.investedText}>{formatInvestedCost(investedPaise)}</Text>

            {/* Estimated Live Value (Phase 3) */}
            <Text style={[s.valueLabel, { marginTop: 10 }]}>Est. Live Value</Text>
            {estimatedValue ? (
              <Text style={[s.valueText, { color: accentColor }]}>{estimatedValue}</Text>
            ) : (
              <View style={s.noRateBadge}>
                <TrendingUp size={12} color="rgba(46,29,0,0.5)" />
                <Text style={s.noRateText}>Awaiting Live Rate</Text>
              </View>
            )}
          </View>
        </View>

        {/* Data Grid Section */}
        <View style={s.grid}>
          {/* Physical Box */}
          <View style={s.gridBox}>
            <View style={s.gridLabelRow}>
              <Scale size={12} color="rgba(46,29,0,0.4)" />
              <Text style={s.gridLabel}>Physical</Text>
            </View>
            <Text style={s.gridValue}>{formatWeight(totalMg)}</Text>
          </View>

          {/* Divider */}
          <View style={s.gridDivider} />

          {/* Phantom Box */}
          <View style={s.gridBox}>
            <View style={s.gridLabelRow}>
              <AlertCircle size={12} color={hasDebt ? COLORS.danger : 'rgba(46,29,0,0.4)'} />
              <Text style={[s.gridLabel, hasDebt && { color: COLORS.danger }]}>Phantom</Text>
            </View>
            <Text style={[s.gridValue, hasDebt && { color: COLORS.danger }]}>
              {hasDebt ? `-${formatWeight(debtMg)}` : '0.000 g'}
            </Text>
          </View>
        </View>

        {/* Bottom Hero Balance */}
        <View style={[s.balanceRow, { backgroundColor: accentColor + '08' }]}>
          <View style={s.balanceLabelRow}>
            <Wallet size={16} color={accentColor} />
            <Text style={[s.balanceLabel, { color: accentColor }]}>True Ledger Balance</Text>
          </View>
          <Text style={[s.balanceValue, balanceMg < 0 && { color: COLORS.danger }]}>
            {formatWeight(balanceMg)}
          </Text>
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={s.container}>
      <SummaryCard 
        metal="GOLD" 
        totalMg={summary.goldNetWeightMg} 
        debtMg={summary.goldPhantomDebtMg} 
        balanceMg={summary.goldBalanceMg} 
        ratePaise={goldRatePerGramPaise}
        investedPaise={summary.goldInvestedPaise}
        accentColor={COLORS.goldAccent}
      />
      <SummaryCard 
        metal="SILVER" 
        totalMg={summary.silverNetWeightMg} 
        debtMg={summary.silverPhantomDebtMg} 
        balanceMg={summary.silverBalanceMg} 
        ratePaise={silverRatePerGramPaise}
        investedPaise={summary.silverInvestedPaise}
        accentColor={COLORS.silverAccent}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    gap: 16,
  },

  // Custom Bullion Bar Styles
  ingotContainer: {
    width: 26,
    height: 16,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
    elevation: 2,
  },
  ingotInnerBorder: {
    position: 'absolute',
    top: 2, left: 2, right: 2, bottom: 2,
    borderRadius: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ingotText: {
    fontSize: 5,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.8)',
  },
  // Typography & Layout
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    padding: 6,
    borderRadius: 8,
  },
  metalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.vjText,
    letterSpacing: 0.5,
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  valueLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(46,29,0,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  investedText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.vjText,
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  valueText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  noRateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(46,29,0,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  noRateText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(46,29,0,0.5)',
  },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(46,29,0,0.5)',
    textTransform: 'uppercase',
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.vjText,
    fontFamily: 'monospace',
  },
  gridDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.vjText,
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
});