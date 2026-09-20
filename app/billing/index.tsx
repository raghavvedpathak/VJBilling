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
} from 'lucide-react-native';

export default function BillingHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currencySymbol = getCurrencySymbol();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [gold24kRate, setGold24kRate] = useState<number | null>(null);
  const [gold22kRate, setGold22kRate] = useState<number | null>(null);
  const [silverRate, setSilverRate] = useState<number | null>(null);
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
        {/* LIVE BHAV RATES SUMMARY CARD */}
        <TouchableOpacity
          testID="billing-rates-card"
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/settings/rates');
          }}
          style={{ marginBottom: 20 }}
        >
          <GlassCard style={{ padding: 16, borderColor: `${colors.vjAccent}35` }}>
            <View style={s.ratesCardHeader}>
              <View style={s.ratesTitleRow}>
                <Coins size={18} color="#D97706" />
                <Text style={[s.ratesHeaderTitle, { color: colors.vjText }]}>Today's Metal Bhav Rates</Text>
              </View>
              <View style={s.ratesBadge}>
                <Text style={s.ratesBadgeText}>UPDATE</Text>
                <ChevronRight size={12} color="#D97706" />
              </View>
            </View>

            <View style={s.ratesRow}>
              <View style={s.rateItem}>
                <Text style={s.rateItemLabel}>Gold 24K (10g)</Text>
                <Text style={[s.rateItemValue, { color: colors.vjText }]}>
                  {gold24kRate ? formatRupees(gold24kRate) : '—'}
                </Text>
              </View>

              <View style={s.rateDivider} />

              <View style={s.rateItem}>
                <Text style={s.rateItemLabel}>Gold 22K (10g)</Text>
                <Text style={[s.rateItemValue, { color: colors.vjText }]}>
                  {gold22kRate ? formatRupees(gold22kRate) : '—'}
                </Text>
              </View>

              <View style={s.rateDivider} />

              <View style={s.rateItem}>
                <Text style={s.rateItemLabel}>Silver (1kg)</Text>
                <Text style={[s.rateItemValue, { color: colors.vjText }]}>
                  {silverRate ? formatRupees(silverRate) : '—'}
                </Text>
              </View>
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
  ratesCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ratesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratesHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  ratesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  ratesBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  ratesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rateItem: {
    flex: 1,
    alignItems: 'center',
  },
  rateItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  rateItemValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  rateDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(0,0,0,0.08)',
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
