// app/settings/rates.tsx — Phase 3 Daily Metal Rates Screen
// Implements STEP RE (v5.6 / v5.41) — Modernized Luxury Bullion Architecture

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { RateEngineOutput } from '@/types/phase3/phase3.types';
import { GlassCard, HeaderPill } from '@/components/ui/Glass';
import { FixedGlassBar, fixedBarStyles } from '@/components/ui/FixedGlassBar';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import {
  Coins,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { getCurrencySymbol } from '@/utils/currency';

// Micro 3D Bullion Bar Component for Metal Rate Cards
const BhavBullionBadge = ({ label, isGold }: { label: string; isGold: boolean }) => (
  <View
    style={{
      width: 42,
      height: 24,
      borderRadius: 5,
      backgroundColor: isGold ? '#D4AF37' : '#9CA3AF',
      borderWidth: 1.2,
      borderColor: isGold ? '#FFE87C' : '#F3F4F6',
      borderBottomWidth: 2.8,
      borderBottomColor: isGold ? '#8B6508' : '#374151',
      borderRightWidth: 2.2,
      borderRightColor: isGold ? '#B8860B' : '#4B5563',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.28,
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
        height: 9,
        backgroundColor: 'rgba(255, 255, 255, 0.45)',
        transform: [{ skewY: '-15deg' }],
      }}
    />
    <Text
      style={{
        fontSize: 9.5,
        fontWeight: '900',
        color: isGold ? '#4A2E00' : '#111827',
        letterSpacing: 0.4,
      }}
    >
      {label}
    </Text>
  </View>
);

export default function MetalRatesScreen() {
  const router = useRouter();
  const { firm } = useSession();
  const currencySymbol = getCurrencySymbol();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';
  const colors = {
    ...rawColors,
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B',
  };

  const [gold24Rupees, setGold24Rupees] = useState('');
  const [gold22Rupees, setGold22Rupees] = useState('');
  const [goldCashRupees, setGoldCashRupees] = useState('');
  const [silverCashRupees, setSilverCashRupees] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRates, setCurrentRates] = useState<RateEngineOutput | null>(null);

  const loadCurrentRates = useCallback(async () => {
    if (!firm?.id) return;
    setIsLoading(true);
    try {
      const current = await rateEngineService.getCurrentRates(firm.id);
      setCurrentRates(current);
      if (current) {
        setGold24Rupees(String(Math.round((current.gold24BasePerGramPaise * 10) / 100)));
        setGold22Rupees(String(Math.round((current.gold22BasePerGramPaise * 10) / 100)));
        setGoldCashRupees(String(Math.round((current.goldCashPerGramPaise * 10) / 100)));
        setSilverCashRupees(String(Math.round((current.silverCashPerGramPaise * 1000) / 100)));
      }
    } catch (e) {
      console.warn('[MetalRatesScreen] Failed to load current rates:', e);
    } finally {
      setIsLoading(false);
    }
  }, [firm?.id]);

  useEffect(() => {
    loadCurrentRates();
  }, [loadCurrentRates]);

  // Real-time live preview calculations
  const g24Num = parseInt(gold24Rupees, 10) || 0;
  const g24PerGram = Math.round(g24Num / 10);
  const g24Gst = Math.round(g24PerGram * 0.03);
  const g24WithGst = g24PerGram + g24Gst;

  const g22Num = parseInt(gold22Rupees, 10) || 0;
  const g22PerGram = Math.round(g22Num / 10);
  const g22Gst = Math.round(g22PerGram * 0.03);
  const g22WithGst = g22PerGram + g22Gst;

  const gCashNum = parseInt(goldCashRupees, 10) || 0;
  const gCashPerGram = Math.round(gCashNum / 10);

  const sCashNum = parseInt(silverCashRupees, 10) || 0;
  const sCashPerGram = (sCashNum / 1000).toFixed(2);
  const sCashPer10g = Math.round(sCashNum / 100);

  const handleSave = async () => {
    if (!firm?.id) return;
    const g24 = parseInt(gold24Rupees.trim(), 10);
    const g22 = parseInt(gold22Rupees.trim(), 10);
    const gCash = parseInt(goldCashRupees.trim(), 10);
    const sCash = parseInt(silverCashRupees.trim(), 10);

    if (isNaN(g24) || g24 <= 0 || isNaN(g22) || g22 <= 0 || isNaN(gCash) || gCash <= 0 || isNaN(sCash) || sCash <= 0) {
      Alert.alert(
        'Validation Error',
        `All four rates must be positive whole numbers in rupees (e.g. ${currencySymbol}60,000).`
      );
      return;
    }

    setIsSaving(true);
    try {
      await rateEngineService.saveRates(firm.id, {
        gold24BasePer10g_rupees: g24,
        gold22BasePer10g_rupees: g22,
        goldCashPer10g_rupees: gCash,
        silverCashPerKg_rupees: sCash,
      });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert('Success', "Today's metal rates have been saved successfully.");
      await loadCurrentRates();
    } catch (e: any) {
      Alert.alert('Error', getUserFriendlyErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const headerPills = (
    <View style={s.headerPillsRow}>
      <HeaderPill icon={<Coins size={12} color={colors.vjBg} />} label="Daily Bhav" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Live Invoicing" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Daily Rates" showBack headerContent={headerPills}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Active Status Card */}
        <View
          style={[
            s.statusBanner,
            {
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
              borderColor: 'rgba(16, 185, 129, 0.25)',
            },
          ]}
        >
          <View style={s.statusDot} />
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: isDark ? '#34D399' : '#065F46' }]}>
              Metal Bhav Active for {firm?.name || 'Shop'}
            </Text>
            <Text style={[s.statusSubtitle, { color: isDark ? '#A7F3D0' : '#047857' }]}>
              Entered rates auto-populate customer invoice drafts and URD purchases.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text style={[s.loadingText, { color: colors.textSecondary }]}>
              Loading active rates...
            </Text>
          </View>
        ) : (
          <View>
            {/* ============================================================== */}
            {/* SECTION 1: RETAIL INVOICING RATES (WITH 3% GST)                */}
            {/* ============================================================== */}
            <View style={s.sectionHeader}>
              <View style={s.sectionTitleRow}>
                <Text style={[s.sectionTitle, { color: colors.vjText }]}>1. Retail Invoicing Rates</Text>
                <View style={s.badgeInvoice}>
                  <Text style={s.badgeInvoiceText}>INVOICES (GST)</Text>
                </View>
              </View>
              <Text style={[s.sectionSubtitle, { color: colors.textSecondary }]}>
                Applied automatically when generating customer billing invoices.
              </Text>
            </View>

            {/* GOLD 24K CARD */}
            <GlassCard
              style={[
                s.rateCard,
                {
                  backgroundColor: isDark ? 'rgba(69, 39, 0, 0.22)' : 'rgba(253, 248, 238, 0.88)',
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.35)',
                },
              ]}
            >
              <View style={s.cardHeaderRow}>
                <View style={s.cardTitleLeft}>
                  <BhavBullionBadge label="24K" isGold={true} />
                  <View>
                    <Text style={[s.cardTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                      Gold 24K Pure Base Rate
                    </Text>
                    <Text style={[s.cardSubtitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                      Fine Bullion (99.9% Purity) • Per 10 Grams
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[s.inputBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.85)', borderColor: isDark ? 'rgba(212,175,55,0.3)' : 'rgba(0,0,0,0.1)' }]}>
                <Text style={[s.currencyPrefix, { color: colors.vjText }]}>{currencySymbol}</Text>
                <TextInput
                  value={gold24Rupees}
                  onChangeText={setGold24Rupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 74500"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { color: colors.vjText }]}
                />
                {gold24Rupees.length > 0 && (
                  <TouchableOpacity onPress={() => setGold24Rupees('')} style={s.clearBtn}>
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Showroom Quotation Strip */}
              {g24Num > 0 && (
                <View style={[s.quotationStrip, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : 'rgba(245, 158, 11, 0.1)' }]}>
                  <View style={s.quoteCol}>
                    <Text style={[s.quoteLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>Base /g</Text>
                    <Text style={[s.quoteValue, { color: colors.vjText }]}>
                      {currencySymbol}{g24PerGram}
                    </Text>
                  </View>
                  <View style={s.quoteDivider} />
                  <View style={s.quoteCol}>
                    <Text style={[s.quoteLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>+ 3% GST</Text>
                    <Text style={[s.quoteValue, { color: colors.vjText }]}>
                      +{currencySymbol}{g24Gst}
                    </Text>
                  </View>
                  <View style={s.quoteDivider} />
                  <View style={s.quoteColHero}>
                    <Text style={[s.quoteLabelHero, { color: isDark ? '#34D399' : '#059669' }]}>Retail Quote /g</Text>
                    <Text style={[s.quoteValueHero, { color: isDark ? '#34D399' : '#059669' }]}>
                      {currencySymbol}{g24WithGst}
                    </Text>
                  </View>
                </View>
              )}
            </GlassCard>

            {/* GOLD 22K CARD */}
            <GlassCard
              style={[
                s.rateCard,
                {
                  backgroundColor: isDark ? 'rgba(69, 39, 0, 0.22)' : 'rgba(253, 248, 238, 0.88)',
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.35)',
                },
              ]}
            >
              <View style={s.cardHeaderRow}>
                <View style={s.cardTitleLeft}>
                  <BhavBullionBadge label="22K" isGold={true} />
                  <View>
                    <Text style={[s.cardTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                      Gold 22K Standard Base Rate
                    </Text>
                    <Text style={[s.cardSubtitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                      Standard Hallmark (91.6% Purity) • Per 10 Grams
                    </Text>
                  </View>
                </View>
              </View>

              {/* Quick 91.6% Calculator Helper Chip */}
              {g24Num > 0 && (
                <TouchableOpacity
                  style={[s.helperChip, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : 'rgba(217, 119, 6, 0.1)' }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    const derived = Math.round(g24Num * 0.916);
                    setGold22Rupees(String(derived));
                  }}
                  activeOpacity={0.8}
                >
                  <Sparkles size={12} color={isDark ? '#FCD34D' : '#B45309'} />
                  <Text style={[s.helperChipText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                    Auto-Fill 91.6% Benchmark: {currencySymbol}{Math.round(g24Num * 0.916)}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={[s.inputBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.85)', borderColor: isDark ? 'rgba(212,175,55,0.3)' : 'rgba(0,0,0,0.1)' }]}>
                <Text style={[s.currencyPrefix, { color: colors.vjText }]}>{currencySymbol}</Text>
                <TextInput
                  value={gold22Rupees}
                  onChangeText={setGold22Rupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 68250"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { color: colors.vjText }]}
                />
                {gold22Rupees.length > 0 && (
                  <TouchableOpacity onPress={() => setGold22Rupees('')} style={s.clearBtn}>
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Showroom Quotation Strip */}
              {g22Num > 0 && (
                <View style={[s.quotationStrip, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : 'rgba(245, 158, 11, 0.1)' }]}>
                  <View style={s.quoteCol}>
                    <Text style={[s.quoteLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>Base /g</Text>
                    <Text style={[s.quoteValue, { color: colors.vjText }]}>
                      {currencySymbol}{g22PerGram}
                    </Text>
                  </View>
                  <View style={s.quoteDivider} />
                  <View style={s.quoteCol}>
                    <Text style={[s.quoteLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>+ 3% GST</Text>
                    <Text style={[s.quoteValue, { color: colors.vjText }]}>
                      +{currencySymbol}{g22Gst}
                    </Text>
                  </View>
                  <View style={s.quoteDivider} />
                  <View style={s.quoteColHero}>
                    <Text style={[s.quoteLabelHero, { color: isDark ? '#34D399' : '#059669' }]}>Retail Quote /g</Text>
                    <Text style={[s.quoteValueHero, { color: isDark ? '#34D399' : '#059669' }]}>
                      {currencySymbol}{g22WithGst}
                    </Text>
                  </View>
                </View>
              )}
            </GlassCard>

            {/* ============================================================== */}
            {/* SECTION 2: CASH & PURCHASE RATES (NO GST)                      */}
            {/* ============================================================== */}
            <View style={s.sectionHeader}>
              <View style={s.sectionTitleRow}>
                <Text style={[s.sectionTitle, { color: colors.vjText }]}>2. Cash & Purchase Rates</Text>
                <View style={s.badgePurchase}>
                  <Text style={s.badgePurchaseText}>PURCHASES & URD</Text>
                </View>
              </View>
              <Text style={[s.sectionSubtitle, { color: colors.textSecondary }]}>
                Used for Old Gold scrap purchase from customers and cash settlements.
              </Text>
            </View>

            {/* GOLD CASH CARD */}
            <GlassCard
              style={[
                s.rateCard,
                {
                  backgroundColor: isDark ? 'rgba(69, 39, 0, 0.22)' : 'rgba(253, 248, 238, 0.88)',
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.35)',
                },
              ]}
            >
              <View style={s.cardHeaderRow}>
                <View style={s.cardTitleLeft}>
                  <BhavBullionBadge label="CASH" isGold={true} />
                  <View>
                    <Text style={[s.cardTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                      Gold Cash Rate (No GST)
                    </Text>
                    <Text style={[s.cardSubtitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                      Old Gold / URD Purchase • Per 10 Grams
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[s.inputBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.85)', borderColor: isDark ? 'rgba(212,175,55,0.3)' : 'rgba(0,0,0,0.1)' }]}>
                <Text style={[s.currencyPrefix, { color: colors.vjText }]}>{currencySymbol}</Text>
                <TextInput
                  value={goldCashRupees}
                  onChangeText={setGoldCashRupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 72000"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { color: colors.vjText }]}
                />
                {goldCashRupees.length > 0 && (
                  <TouchableOpacity onPress={() => setGoldCashRupees('')} style={s.clearBtn}>
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Flat Cash Bhav Strip */}
              {gCashNum > 0 && (
                <View style={[s.quotationStripCash, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : 'rgba(245, 158, 11, 0.1)' }]}>
                  <Text style={[s.quoteLabelCash, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                    URD Purchase Rate:
                  </Text>
                  <Text style={[s.quoteValueCash, { color: colors.vjText }]}>
                    {currencySymbol}{gCashPerGram} / gram (Flat / No GST)
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* SILVER CASH CARD */}
            <GlassCard
              style={[
                s.rateCard,
                {
                  backgroundColor: isDark ? 'rgba(55, 65, 81, 0.22)' : 'rgba(244, 245, 247, 0.88)',
                  borderColor: isDark ? 'rgba(156, 163, 175, 0.25)' : 'rgba(156, 163, 175, 0.35)',
                  marginBottom: 16,
                },
              ]}
            >
              <View style={s.cardHeaderRow}>
                <View style={s.cardTitleLeft}>
                  <BhavBullionBadge label="999" isGold={false} />
                  <View>
                    <Text style={[s.cardTitle, { color: isDark ? '#E5E7EB' : '#374151' }]}>
                      Silver Cash Rate (per KG — No GST)
                    </Text>
                    <Text style={[s.cardSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                      Fine Silver Bullion Bar (99.9% Purity) • Per Kilogram
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[s.inputBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.85)', borderColor: isDark ? 'rgba(156,163,175,0.3)' : 'rgba(0,0,0,0.1)' }]}>
                <Text style={[s.currencyPrefix, { color: colors.vjText }]}>{currencySymbol}</Text>
                <TextInput
                  value={silverCashRupees}
                  onChangeText={setSilverCashRupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 89000"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { color: colors.vjText }]}
                />
                {silverCashRupees.length > 0 && (
                  <TouchableOpacity onPress={() => setSilverCashRupees('')} style={s.clearBtn}>
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Silver Trade Strip */}
              {sCashNum > 0 && (
                <View style={[s.quotationStripSilver, { backgroundColor: isDark ? 'rgba(107, 114, 128, 0.15)' : 'rgba(229, 231, 235, 0.7)' }]}>
                  <View style={s.silverQuoteCol}>
                    <Text style={[s.silverQuoteLabel, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>Per 10 Grams</Text>
                    <Text style={[s.silverQuoteValue, { color: colors.vjText }]}>
                      {currencySymbol}{sCashPer10g}
                    </Text>
                  </View>
                  <View style={s.silverDivider} />
                  <View style={s.silverQuoteCol}>
                    <Text style={[s.silverQuoteLabel, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>Per Gram Rate</Text>
                    <Text style={[s.silverQuoteValueHero, { color: colors.vjText }]}>
                      {currencySymbol}{sCashPerGram} /g
                    </Text>
                  </View>
                </View>
              )}
            </GlassCard>
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <FixedGlassBar>
        <TouchableOpacity
          style={fixedBarStyles.pillPrimaryBtn}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Coins size={18} color="#FFFFFF" />
          )}
          <Text style={fixedBarStyles.pillPrimaryText}>
            {isSaving ? "Saving Rates..." : "Save Today's Rates"}
          </Text>
        </TouchableOpacity>
      </FixedGlassBar>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 110,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  statusSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 4,
  },
  badgeInvoice: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgeInvoiceText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.4,
  },
  badgePurchase: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.3)',
  },
  badgePurchaseText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.4,
  },
  rateCard: {
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  helperChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    marginBottom: 8,
  },
  helperChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 8,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '900',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'monospace',
    height: '100%',
  },
  clearBtn: {
    padding: 6,
  },
  quotationStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quoteCol: {
    flex: 1,
  },
  quoteColHero: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  quoteDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: 8,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  quoteValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  quoteLabelHero: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  quoteValueHero: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  quotationStripCash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quoteLabelCash: {
    fontSize: 11,
    fontWeight: '700',
  },
  quoteValueCash: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  quotationStripSilver: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  silverQuoteCol: {
    flex: 1,
  },
  silverDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: 8,
  },
  silverQuoteLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  silverQuoteValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  silverQuoteValueHero: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'monospace',
    marginTop: 1,
  },
});

