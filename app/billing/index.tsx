// app/billing/index.tsx — Phase 3 Canonical Screen (Billing & Money Truth Hub)
// Central hub for Sales Invoicing, Payments, Parties & Ledgers, and Tax Configuration

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, HeaderPill, MenuTile } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { karigarMasterRepository } from '@/repositories/phase3/karigarMasterRepository';
import { formatRupees, getCurrencySymbol } from '@/utils/currency';
import { getThemeColors } from '@/constants/theme';
import {
  FileText,
  CreditCard,
  Users,
  Truck,
  Hammer,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Coins,
  Receipt,
  Plus,
  ArrowUpRight,
  SlidersHorizontal,
  Edit2,
  Sparkles,
} from 'lucide-react-native';

// Micro 3D Bullion Bar Component for Live Bhav Card
const BhavBullionBadge = ({ label, isGold }: { label: string; isGold: boolean }) => (
  <View
    style={{
      width: 38,
      height: 22,
      borderRadius: 4,
      backgroundColor: isGold ? '#D4AF37' : '#9CA3AF',
      borderWidth: 1,
      borderColor: isGold ? '#FFE87C' : '#F3F4F6',
      borderBottomWidth: 2.5,
      borderBottomColor: isGold ? '#8B6508' : '#374151',
      borderRightWidth: 2,
      borderRightColor: isGold ? '#B8860B' : '#4B5563',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1.5 },
      shadowOpacity: 0.25,
      shadowRadius: 2.5,
      elevation: 3,
      overflow: 'hidden',
      position: 'relative',
    }}
  >
    <View
      style={{
        position: 'absolute',
        top: -2,
        left: -3,
        right: 0,
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.45)',
        transform: [{ skewY: '-15deg' }],
      }}
    />
    <Text
      style={{
        fontSize: 9,
        fontWeight: '900',
        color: isGold ? '#4A2E00' : '#111827',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </Text>
  </View>
);

export default function BillingHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currencySymbol = getCurrencySymbol();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';
  const colors = {
    ...rawColors,
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B',
  };

  const [gold24kRate, setGold24kRate] = useState<number | null>(null);
  const [gold22kRate, setGold22kRate] = useState<number | null>(null);
  const [silverRate, setSilverRate] = useState<number | null>(null);
  const [gold24PerGram, setGold24PerGram] = useState<number | null>(null);
  const [gold22PerGram, setGold22PerGram] = useState<number | null>(null);
  const [silverPerGram, setSilverPerGram] = useState<number | null>(null);
  const [silverPer10g, setSilverPer10g] = useState<number | null>(null);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [supplierCount, setSupplierCount] = useState<number>(0);
  const [karigarCount, setKarigarCount] = useState<number>(0);

  const loadHubData = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const [rates, custs, supps, karigs] = await Promise.all([
        rateEngineService.getCurrentRates(activeFirmId),
        customerRepository.listByFirm(activeFirmId),
        supplierRepository.listByFirm(activeFirmId),
        karigarMasterRepository.listByFirm(activeFirmId),
      ]);

      if (rates) {
        setGold24kRate(rates.gold24BasePerGramPaise * 10);
        setGold22kRate(rates.gold22BasePerGramPaise * 10);
        setSilverRate(rates.silverCashPerGramPaise * 1000);
        setGold24PerGram(rates.gold24BasePerGramPaise);
        setGold22PerGram(rates.gold22BasePerGramPaise);
        setSilverPerGram(rates.silverCashPerGramPaise);
        setSilverPer10g(rates.silverCashPer10gPaise || rates.silverCashPerGramPaise * 10);
      }
      setCustomerCount((custs || []).length);
      setSupplierCount((supps || []).length);
      setKarigarCount((karigs || []).length);
    } catch (e) {
      console.warn('[BillingHubScreen] Error loading hub data:', e);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadHubData();
  }, [loadHubData]);

  useFocusEffect(
    useCallback(() => {
      loadHubData();
    }, [loadHubData])
  );

  const billingHeaderPills = (
    <View style={s.headerPillsContainer}>
      <HeaderPill icon={<FileText size={12} color={colors.vjBg} />} label="Billing Hub" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="GST Ready" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Billing & Sales" showBack headerContent={billingHeaderPills}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom + 32, 80),
        }}
      >
        {/* LIVE BHAV RATES SUMMARY CARD (OPTION A - UNIFIED SEGMENTED BULLION BOARD) */}
        <TouchableOpacity
          testID="billing-rates-card"
          activeOpacity={0.88}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/settings/rates');
          }}
          style={{ marginBottom: 20 }}
        >
          <GlassCard style={s.bhavCard}>
            {/* Header: Title, Live Pulse Dot, and Edit Action Pill */}
            <View style={s.bhavHeader}>
              <View style={s.bhavTitleLeft}>
                <View style={s.liveDotPulse} />
                <Text style={[s.bhavHeaderTitle, { color: colors.vjText }]}>TODAY'S METAL BHAV</Text>
                <View style={s.liveTag}>
                  <Text style={s.liveTagText}>LIVE</Text>
                </View>
              </View>
              <View style={[s.updatePill, { backgroundColor: `${colors.vjAccent}18`, borderColor: `${colors.vjAccent}40` }]}>
                <Edit2 size={11} color={colors.vjAccent} />
                <Text style={[s.updatePillText, { color: colors.vjAccent }]}>UPDATE</Text>
                <ChevronRight size={11} color={colors.vjAccent} />
              </View>
            </View>

            {/* Segment 1: Gold Bhav Pane (Warm Champagne Gold) */}
            <View
              style={[
                s.goldPane,
                {
                  backgroundColor: isDark ? 'rgba(69, 39, 0, 0.22)' : 'rgba(253, 248, 238, 0.82)',
                  borderBottomColor: isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(212, 175, 55, 0.18)',
                },
              ]}
            >
              <View style={s.paneTitleRow}>
                <View style={s.paneTitleLeft}>
                  <BhavBullionBadge label="GOLD" isGold={true} />
                  <Text style={[s.goldPaneTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>Gold Bullion Rates</Text>
                </View>
                <Text style={[s.paneBenchmarkTag, { color: isDark ? '#F59E0B' : '#B45309' }]}>
                  Benchmark: 10g • Retail: /g
                </Text>
              </View>

              <View style={s.paneGrid}>
                {/* 24K Pure */}
                <View style={s.rateCol}>
                  <View style={s.ratePurityRow}>
                    <Text style={[s.ratePurityTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>24K Pure</Text>
                    <View style={s.purityTagGold}><Text style={s.purityTagGoldText}>999</Text></View>
                  </View>
                  <Text style={[s.rateMainValue, { color: colors.vjText }]}>
                    {gold24kRate ? formatRupees(gold24kRate) : '—'}
                  </Text>
                  <Text style={[s.rateSubValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {gold24PerGram ? `${formatRupees(gold24PerGram)} /g` : '—'}
                  </Text>
                </View>

                {/* Vertical Divider */}
                <View style={s.goldDivider} />

                {/* 22K Standard */}
                <View style={s.rateCol}>
                  <View style={s.ratePurityRow}>
                    <Text style={[s.ratePurityTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>22K Standard</Text>
                    <View style={s.purityTagGold}><Text style={s.purityTagGoldText}>916</Text></View>
                  </View>
                  <Text style={[s.rateMainValue, { color: colors.vjText }]}>
                    {gold22kRate ? formatRupees(gold22kRate) : '—'}
                  </Text>
                  <Text style={[s.rateSubValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {gold22PerGram ? `${formatRupees(gold22PerGram)} /g` : '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Segment 2: Silver Bhav Pane (Cool Platinum Mist) */}
            <View
              style={[
                s.silverPane,
                {
                  backgroundColor: isDark ? 'rgba(55, 65, 81, 0.22)' : 'rgba(244, 245, 247, 0.82)',
                },
              ]}
            >
              <View style={s.paneTitleRow}>
                <View style={s.paneTitleLeft}>
                  <BhavBullionBadge label="999" isGold={false} />
                  <Text style={[s.silverPaneTitle, { color: isDark ? '#E5E7EB' : '#374151' }]}>Silver Bullion Rate</Text>
                </View>
                <Text style={[s.paneBenchmarkTagSilver, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                  Benchmark: 1kg • Retail: /g
                </Text>
              </View>

              <View style={s.paneGrid}>
                {/* 1 KG Bulk Bar */}
                <View style={s.rateCol}>
                  <View style={s.ratePurityRow}>
                    <Text style={[s.ratePurityTitleSilver, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>Silver Bar (1 kg)</Text>
                  </View>
                  <Text style={[s.rateMainValue, { color: colors.vjText }]}>
                    {silverRate ? formatRupees(silverRate) : '—'}
                  </Text>
                  <Text style={[s.rateSubValueSilver, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    {silverPer10g ? `${formatRupees(silverPer10g)} / 10g` : '—'}
                  </Text>
                </View>

                {/* Vertical Divider */}
                <View style={s.silverDivider} />

                {/* Per Gram Retail */}
                <View style={s.rateCol}>
                  <View style={s.ratePurityRow}>
                    <Text style={[s.ratePurityTitleSilver, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>Retail Rate (/g)</Text>
                  </View>
                  <Text style={[s.rateMainValue, { color: colors.vjText }]}>
                    {silverPerGram ? `${formatRupees(silverPerGram)} /g` : '—'}
                  </Text>
                  <Text style={[s.rateSubValueSilver, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    Spot Counter Rate
                  </Text>
                </View>
              </View>
            </View>

            {/* Bottom Micro-Footer */}
            <View style={[s.bhavFooter, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.5)' }]}>
              <View style={s.bhavFooterLeft}>
                <Sparkles size={12} color={colors.vjAccent} />
                <Text style={[s.bhavFooterText, { color: colors.textSecondary }]}>
                  Used to auto-fill item rates in billing invoices
                </Text>
              </View>
              <Text style={[s.bhavFooterLink, { color: colors.vjAccent }]}>Edit Rates ›</Text>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* HERO TILE: NEW SALE INVOICE */}
        <TouchableOpacity
          testID="billing-new-sale-tile"
          activeOpacity={0.85}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            router.push('/billing/sale');
          }}
          style={{ marginBottom: 24 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(5, 150, 105, 0.4)' }}>
            <View style={[s.heroCardInner, { backgroundColor: 'rgba(5, 150, 105, 0.08)' }]}>
              <View style={[s.heroIconBox, { backgroundColor: '#059669' }]}>
                <FileText size={28} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.heroTitle, { color: colors.vjText }]}>New Sale Invoice</Text>
                  <View style={s.badgeEmerald}>
                    <Text style={s.badgeEmeraldText}>DRAFT & GST</Text>
                  </View>
                </View>
                <Text style={[s.heroSubtitle, { color: colors.vjText, opacity: 0.7 }]}>
                  Create retail invoice with customer details, item barcode/loose lots & old metal
                </Text>
              </View>
              <View style={[s.chevronBox, { backgroundColor: '#05966920', borderColor: '#05966940' }]}>
                <ChevronRight size={20} color="#059669" />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 1: SETTLEMENTS & TRANSACTIONS */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Cash & Financial Settlements
        </Text>

        <View style={s.menuGrid}>
          <MenuTile
            title="Payments & Cash"
            subtitle="Receipts & Vouchers"
            badgeText="LIVE"
            badgeVariant="active"
            icon={<CreditCard size={22} color="#7C3AED" />}
            iconBg="rgba(124, 58, 237, 0.12)"
            borderColor="rgba(124, 58, 237, 0.3)"
            onPress={() => router.push('/billing/payments')}
          />

          <MenuTile
            title="Daily Bhav Rates"
            subtitle="Gold & Silver Setup"
            badgeText="BHAW ENGINE"
            badgeVariant="default"
            icon={<Coins size={22} color="#D97706" />}
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.25)"
            onPress={() => router.push('/settings/rates')}
          />
        </View>

        {/* SECTION 2: PARTY DIRECTORIES */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6, marginTop: 12 }]}>
          Party Masters & Ledgers
        </Text>

        {/* Customers Tile */}
        <TouchableOpacity
          testID="billing-customers-tile"
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/billing/customers');
          }}
          style={{ marginBottom: 12 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(5, 150, 105, 0.25)' }}>
            <View style={s.partyCardInner}>
              <View style={[s.partyIconBox, { backgroundColor: 'rgba(5, 150, 105, 0.12)' }]}>
                <Users size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.partyTitle, { color: colors.vjText }]}>Customers Master</Text>
                  <View style={s.badgeEmerald}>
                    <Text style={s.badgeEmeraldText}>{customerCount} REGISTERED</Text>
                  </View>
                </View>
                <Text style={[s.partySubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Customer directory, URD PAN/Aadhaar & derived balances
                </Text>
              </View>
              <ChevronRight size={18} color={colors.vjText} style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Suppliers Tile */}
        <TouchableOpacity
          testID="billing-suppliers-tile"
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/billing/suppliers');
          }}
          style={{ marginBottom: 12 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(217, 119, 6, 0.25)' }}>
            <View style={s.partyCardInner}>
              <View style={[s.partyIconBox, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
                <Truck size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.partyTitle, { color: colors.vjText }]}>Suppliers Master</Text>
                  <View style={s.badgeAmber}>
                    <Text style={s.badgeAmberText}>{supplierCount} PARTIES</Text>
                  </View>
                </View>
                <Text style={[s.partySubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Bullion wholesale dealers, refineries & bank accounts
                </Text>
              </View>
              <ChevronRight size={18} color={colors.vjText} style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Karigars Tile */}
        <TouchableOpacity
          testID="billing-karigars-tile"
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/billing/karigars');
          }}
          style={{ marginBottom: 20 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(37, 99, 235, 0.25)' }}>
            <View style={s.partyCardInner}>
              <View style={[s.partyIconBox, { backgroundColor: 'rgba(37, 99, 235, 0.12)' }]}>
                <Hammer size={22} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.partyTitle, { color: colors.vjText }]}>Karigars Master</Text>
                  <View style={s.badgeBlue}>
                    <Text style={s.badgeBlueText}>{karigarCount} ARTISANS</Text>
                  </View>
                </View>
                <Text style={[s.partySubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Job work party directory, metal outstanding & labour ledger
                </Text>
              </View>
              <ChevronRight size={18} color={colors.vjText} style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 3: INVOICE CONFIGURATION */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6, marginTop: 4 }]}>
          Tax & Invoice Configuration
        </Text>

        <View style={s.menuGrid}>
          <MenuTile
            title="GST Rates"
            subtitle="CGST & SGST Groups"
            icon={<SlidersHorizontal size={22} color="#059669" />}
            iconBg="rgba(5, 150, 105, 0.12)"
            borderColor="rgba(5, 150, 105, 0.25)"
            onPress={() => router.push('/settings/gst')}
          />

          <MenuTile
            title="Print Settings"
            subtitle="Paper Size & Terms"
            icon={<Receipt size={22} color="#0891B2" />}
            iconBg="rgba(8, 145, 178, 0.12)"
            borderColor="rgba(8, 145, 178, 0.25)"
            onPress={() => router.push('/settings/invoice')}
          />
        </View>
      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 14,
    marginLeft: 4,
  },
  bhavCard: {
    padding: 0,
    borderRadius: 20,
    overflow: 'hidden',
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  bhavHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  bhavTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  bhavHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  liveTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  liveTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  updatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  updatePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  goldPane: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  silverPane: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  paneTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paneTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goldPaneTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  silverPaneTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  paneBenchmarkTag: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.85,
  },
  paneBenchmarkTagSilver: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.85,
  },
  paneGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rateCol: {
    flex: 1,
  },
  ratePurityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  ratePurityTitle: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.9,
  },
  ratePurityTitleSilver: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.9,
  },
  purityTagGold: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  purityTagGoldText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  rateMainValue: {
    fontSize: 15.5,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.3,
  },
  rateSubValue: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  rateSubValueSilver: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  goldDivider: {
    width: 1,
    height: 42,
    backgroundColor: 'rgba(217, 119, 6, 0.18)',
    marginHorizontal: 12,
  },
  silverDivider: {
    width: 1,
    height: 42,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    marginHorizontal: 12,
  },
  bhavFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  bhavFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  bhavFooterText: {
    fontSize: 11,
    fontWeight: '500',
  },
  bhavFooterLink: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 20,
  },
  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  chevronBox: {
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  partyCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  partyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  partySubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeEmerald: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  badgeEmeraldText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeAmber: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  badgeAmberText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#B45309',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeBlue: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  badgeBlueText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#2563EB',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
