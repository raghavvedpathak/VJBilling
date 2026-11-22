// app/dashboard.tsx — Phase 1 v8.0 & Phase 2–4 Canonical Dashboard Screen
// Implements FIX-V740-12 (D2=P1 PIN-not-set banner), FIX-V745-3 (useAutoBackupTrigger + Backing up... indicator),
// FIX-V745-5 & FIX-V746-5 (Auto-backup status banner with localDay count), Step 11 WARNING banner, G59

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  BackHandler,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { useAutoBackupTrigger } from '@/hooks/useAutoBackupTrigger';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useLeaseStore } from '@/store/phase1/leaseStore';
import { useVerifyStore } from '@/store/phase1/verifyStore';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';
import { storage } from '@/utils/storage';
import { AB_KEYS, localDay } from '@/constants/autoBackup';
import { GlassButton, HeaderPill, MenuTile, ListTileCard, GlassCard } from '@/components/ui/Glass';
import { LeaseStatusBanner } from '@/components/phase1/LeaseStatusBanner';
import { FYEndBanner } from '@/components/phase1/FYEndBanner';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { dashboardService, type DashboardLiveData } from '@/services/dashboardService';
import { formatRupees } from '@/utils/currency';
import { formatWeightMg } from '@/utils/purity.constants';
import * as Haptics from 'expo-haptics';
import {
  LogOut,
  Settings,
  ShieldCheck,
  FileText,
  Package,
  TrendingUp,
  Gem,
  Landmark,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  LockOpen,
  CloudOff,
  ChevronRight,
  Scale,
  Receipt,
  ReceiptIndianRupee,
  Coins,
  Search,
  Zap,
  Edit2,
  Sparkles,
  Power,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

function computeLocalCalendarDaysSince(isoString: string | undefined): number | null {
  if (!isoString) return null;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;
  const startOfThen = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  ).getTime();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((startOfToday - startOfThen) / 86_400_000));
}

export default function Dashboard() {
  const router = useRouter();
  const { clearActiveFirm } = useFirmStore();
  const activeLease = useLeaseStore((s) => s.activeLease);
  const { firm, activeFY, isLoading, bisLogoUri, refreshSession } = useSession();
  const hasUnviewedWarnings = useVerifyStore((s) => s.hasUnviewedWarnings);
  const markWarningsViewed = useVerifyStore((s) => s.markWarningsViewed);
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';

  // FIX-V745-3: Mounted on Dashboard screen ONLY
  useAutoBackupTrigger();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [firmLogoBroken, setFirmLogoBroken] = useState(false);
  const [bisLogoBroken, setBisLogoBroken] = useState(false);
  const [pinSkippedBannerVisible, setPinSkippedBannerVisible] = useState(false);
  const [autoBackupBanner, setAutoBackupBanner] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<DashboardLiveData | null>(null);

  const isBackingUp =
    activeLease?.type === 'BACKUP' || activeLease?.leaseType === 'BACKUP';

  const refreshBanners = useCallback(() => {
    // 1. FIX-V740-12 (D2 = P1): Non-dismissible banner when PIN is skipped and no PIN is set
    setPinSkippedBannerVisible(!isPinSet() && isPinSkipped());

    // 2. FIX-V745-5 & FIX-V746-5: Auto-backup attention banner using localDay calendar counts
    const enabled = storage.getString(AB_KEYS.enabled) === 'true';
    if (!enabled) {
      setAutoBackupBanner(null);
      return;
    }

    const lastStatus = storage.getString(AB_KEYS.lastStatus);
    const lastSuccessAt = storage.getString(AB_KEYS.lastSuccessAt);
    const enabledAt = storage.getString(AB_KEYS.enabledAt);
    const todayLocal = localDay(new Date());
    const lastSuccessDay = storage.getString(AB_KEYS.lastSuccessDay);

    if (lastStatus === 'NEEDS_FOLDER') {
      setAutoBackupBanner(
        'Automatic backup needs folder access. Tap to grant Documents folder permission.'
      );
      return;
    }

    if (lastStatus === 'FAILED') {
      const days = computeLocalCalendarDaysSince(lastSuccessAt);
      setAutoBackupBanner(
        days !== null && days > 0
          ? `Automatic backup failed (last saved ${days} ${
              days === 1 ? 'day' : 'days'
            } ago). Tap to review.`
          : 'Automatic backup did not complete. Tap to review.'
      );
      return;
    }

    if (lastSuccessAt && lastSuccessDay !== todayLocal) {
      const days = computeLocalCalendarDaysSince(lastSuccessAt);
      if (days !== null && days >= 2) {
        setAutoBackupBanner(`No automatic backup for ${days} days. Tap to back up now.`);
        return;
      }
    } else if (!lastSuccessAt && enabledAt) {
      const daysSinceEnabled = computeLocalCalendarDaysSince(enabledAt);
      if (daysSinceEnabled !== null && daysSinceEnabled >= 1) {
        setAutoBackupBanner(
          'Automatic backup has not completed its first run yet. Tap to back up now.'
        );
        return;
      }
    }

    setAutoBackupBanner(null);
  }, []);

  // Prevent Android hardware back button from navigating back to Welcome / Setup screen; show modern exit modal
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        setShowExitModal(true);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  const loadDashboardMetrics = useCallback(async () => {
    if (!firm?.id) return;
    try {
      const data = await dashboardService.getDashboardData(firm.id);
      setLiveData(data);
    } catch (e) {
      console.warn('[Dashboard] Failed to load live metrics:', e);
    }
  }, [firm?.id]);

  // Re-verify session, banner state, and live metrics whenever Dashboard regains focus
  useFocusEffect(
    useCallback(() => {
      refreshSession?.();
      refreshBanners();
      loadDashboardMetrics();
    }, [refreshSession, refreshBanners, loadDashboardMetrics])
  );

  useEffect(() => {
    setFirmLogoBroken(false);
    setBisLogoBroken(false);
  }, [firm?.firmLogoRef, bisLogoUri]);

  const executeLogout = () => {
    setShowLogoutModal(false);
    clearActiveFirm();
    router.replace('/welcome');
  };

  useEffect(() => {
    if (!isLoading && !firm) {
      router.replace('/welcome');
    }
  }, [isLoading, firm, router]);

  if (isLoading || !firm) {
    return (
      <TwoToneWrapper title="Loading...">
        <View className="flex-1 justify-center items-center">
          <Text className="text-vj-text/50 font-bold">Hydrating Session...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const displayLogo = !firmLogoBroken ? firm.firmLogoRef : null;
  const displayBisLogo = !bisLogoBroken ? bisLogoUri : null;

  const dashboardHeader = (
    <View>
      <View className="mb-4">
        <View className="flex-row items-center gap-2 flex-wrap">
          <LeaseStatusBanner />
          {/* FIX-V745-3: Small "Backing up..." indicator while a BACKUP lease is active */}
          {isBackingUp && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(212,175,55,0.2)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(212,175,55,0.45)',
                marginBottom: 8,
                gap: 6,
              }}
            >
              <ActivityIndicator size="small" color="#F7D273" />
              <Text style={{ color: '#FCFBF8', fontWeight: '700', fontSize: 11 }}>
                Backing up...
              </Text>
            </View>
          )}
        </View>
        <FYEndBanner />

        {/* Step 11 Bootstrap WARNING Display Policy: Persistent amber banner until user views details */}
        {hasUnviewedWarnings && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              markWarningsViewed();
              router.push('/settings/verify');
            }}
            className="bg-amber-100/95 border border-amber-500/60 rounded-2xl p-3.5 mb-2 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-2">
              <View className="bg-amber-500/20 p-2 rounded-xl mr-3">
                <AlertTriangle size={18} color="#B45309" />
              </View>
              <Text className="text-amber-900 text-xs font-bold flex-1 leading-4">
                Data check found a minor issue. Tap to view details.
              </Text>
            </View>
            <ChevronRight size={16} color="#B45309" />
          </TouchableOpacity>
        )}

        {/* FIX-V745-5 & FIX-V746-5: Auto-backup status banner */}
        {autoBackupBanner && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/settings/backup-restore')}
            className="bg-amber-100/95 border border-amber-500/60 rounded-2xl p-3.5 mb-2 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-2">
              <View className="bg-amber-500/20 p-2 rounded-xl mr-3">
                <CloudOff size={18} color="#B45309" />
              </View>
              <Text className="text-amber-900 text-xs font-bold flex-1 leading-4">
                {autoBackupBanner}
              </Text>
            </View>
            <ChevronRight size={16} color="#B45309" />
          </TouchableOpacity>
        )}
      </View>

      <View className="py-2">
        <View className="flex-row items-center gap-3 mb-4">
          <View className="h-16 w-16 bg-vj-bg rounded-2xl border-2 border-white/30 justify-center items-center overflow-hidden shadow-lg shrink-0 p-1.5">
            {displayLogo ? (
              <Image
                source={{ uri: displayLogo }}
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                onError={() => {
                  // G59: On dead URI or missing file, treat as null and log warning
                  console.warn('[Dashboard] Firm logo URI missing or unreadable:', displayLogo);
                  setFirmLogoBroken(true);
                }}
              />
            ) : (
              <Text className="text-3xl font-extrabold text-vj-text">
                {firm.name.substring(0, 1)}
              </Text>
            )}
          </View>

          <View className="flex-1 min-w-0 pr-1">
            <Text
              className="text-vj-bg text-2xl font-black tracking-tight"
              numberOfLines={1}
            >
              {firm.name}
            </Text>
            <Text
              className="text-vj-bg/70 text-sm font-semibold mt-0.5"
              numberOfLines={1}
            >
              {firm.proprietor}
            </Text>
          </View>

          {displayBisLogo && (
            <View className="h-16 w-16 bg-vj-bg rounded-2xl border-2 border-white/30 justify-center items-center overflow-hidden shadow-lg p-1.5 shrink-0">
              <Image
                source={{ uri: displayBisLogo }}
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                onError={() => {
                  // G59: On dead URI or missing file, treat as null and log warning
                  console.warn('[Dashboard] BIS logo URI missing or unreadable:', displayBisLogo);
                  setBisLogoBroken(true);
                }}
              />
            </View>
          )}

          <TouchableOpacity
            onPress={() => setShowLogoutModal(true)}
            className="bg-white/15 p-3 rounded-full border border-white/25 active:bg-vj-danger/50 shrink-0"
            activeOpacity={0.7}
          >
            <LogOut size={20} color="#FCFBF8" />
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2 flex-wrap items-center">
          <HeaderPill
            icon={<CalendarClock size={12} color={COLORS.vjBg} />}
            label={activeFY ? activeFY.label : 'NO ACTIVE FY'}
          />
          <HeaderPill
            icon={<CheckCircle2 size={12} color="#4ADE80" />}
            label={firm.gstin ? 'GST REGISTERED' : 'NON-GST'}
            variant={firm.gstin ? 'success' : 'default'}
          />
          {displayBisLogo ? (
            <View className="flex-row items-center gap-1.5 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-400/30">
              <View className="w-4 h-4 bg-vj-bg rounded-xs justify-center items-center overflow-hidden">
                <Image
                  source={{ uri: displayBisLogo }}
                  style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                  onError={() => setBisLogoBroken(true)}
                />
              </View>
              <Text className="text-[10px] font-bold text-emerald-200 uppercase tracking-wide">
                BIS CERTIFIED
              </Text>
            </View>
          ) : firm.bisLicence ? (
            <HeaderPill
              icon={<ShieldCheck size={12} color="#4ADE80" />}
              label="BIS CERTIFIED"
              variant="success"
            />
          ) : null}
          {pinSkippedBannerVisible && (
            <TouchableOpacity
              onPress={() => router.push('/settings/pin')}
              activeOpacity={0.75}
            >
              <HeaderPill
                icon={<LockOpen size={12} color="#FBBF24" />}
                label="APP LOCK OFF"
                variant="warning"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={dashboardHeader}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
      >
        {/* 1. TODAY'S LIVE METAL RATES STRIP */}
        {liveData?.rates && (liveData.rates.gold24kPer10gPaise || liveData.rates.silverPerKgPaise) ? (
          <TouchableOpacity
            testID="dashboard-rates-strip"
            activeOpacity={0.88}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push('/settings/rates');
            }}
            style={{ marginBottom: 16 }}
          >
            <GlassCard
              contentPadding={14}
              style={{
                borderColor: 'rgba(212, 175, 55, 0.45)',
                backgroundColor: isDark ? 'rgba(28, 20, 24, 0.92)' : 'rgba(255, 255, 255, 0.92)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 0.8, color: '#D4AF37' }}>
                    TODAY'S LIVE METAL BHAV
                  </Text>
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#10B981' }}>LIVE</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(212, 175, 55, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)' }}>
                  <Edit2 size={11} color="#D4AF37" />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#D4AF37' }}>Edit Rates</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {liveData.rates.gold24kPer10gPaise ? (
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(212, 175, 55, 0.14)' : '#FEF3C7', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E' }}>GOLD 24K (10g)</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isDark ? '#FCFBF8' : '#78350F', marginTop: 2 }}>
                      {formatRupees(liveData.rates.gold24kPer10gPaise)}
                    </Text>
                  </View>
                ) : null}

                {liveData.rates.gold22kPer10gPaise ? (
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(212, 175, 55, 0.08)' : '#FFFBEB', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.22)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E' }}>GOLD 22K (10g)</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isDark ? '#FCFBF8' : '#78350F', marginTop: 2 }}>
                      {formatRupees(liveData.rates.gold22kPer10gPaise)}
                    </Text>
                  </View>
                ) : null}

                {liveData.rates.silverPerKgPaise ? (
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.25)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#CBD5E1' : '#475569' }}>SILVER (1kg)</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isDark ? '#FCFBF8' : '#1E293B', marginTop: 2 }}>
                      {formatRupees(liveData.rates.silverPerKgPaise)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </GlassCard>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="dashboard-set-rates-btn"
            activeOpacity={0.88}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push('/settings/rates');
            }}
            style={{ marginBottom: 16 }}
          >
            <GlassCard
              contentPadding={12}
              style={{
                borderColor: 'rgba(212, 175, 55, 0.35)',
                backgroundColor: isDark ? 'rgba(28, 20, 24, 0.88)' : 'rgba(255, 255, 255, 0.88)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212, 175, 55, 0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)' }}>
                    <Coins size={18} color="#D4AF37" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.vjText }}>
                      Daily Metal Rates Not Set
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>
                      Tap to set Gold & Silver shop board rates
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#D4AF37', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={12} color="#1C1418" />
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#1C1418' }}>SET BHAV</Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        {/* 2. 1-TAP QUICK ACTION COMMAND BAR */}
        <View style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(92, 22, 35, 0.65)', marginBottom: 8, marginLeft: 2 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
            <TouchableOpacity
              testID="quick-action-new-bill"
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push('/billing/sale');
              }}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: isDark ? 'rgba(5, 150, 105, 0.18)' : '#ECFDF5',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(5, 150, 105, 0.4)' : '#A7F3D0',
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <ReceiptIndianRupee size={18} color="#059669" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#A7F3D0' : '#065F46' }}>
                + New Bill
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="quick-action-add-stock"
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push('/inventory/add-stock');
              }}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: isDark ? 'rgba(124, 58, 237, 0.18)' : '#F5F3FF',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(124, 58, 237, 0.4)' : '#DDD6FE',
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Package size={18} color="#7C3AED" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#DDD6FE' : '#5B21B6' }}>
                + Add Item
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="quick-action-add-urd"
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push('/inventory/add-urd');
              }}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FFFBEB',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(217, 119, 6, 0.4)' : '#FDE68A',
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Coins size={18} color="#D97706" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E' }}>
                + Old Gold
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="quick-action-search"
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push('/inventory/search');
              }}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : '#FEF9C3',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(212, 175, 55, 0.4)' : '#FEF08A',
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Search size={18} color="#CA8A04" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FEF08A' : '#854D0E' }}>
                Search
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. TODAY'S LIVE BUSINESS PULSE (BENTO KPI CARDS) */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(92, 22, 35, 0.65)', marginBottom: 8, marginLeft: 2 }}>
            Live Business Pulse
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* CARD A: TODAY'S SALES */}
            <TouchableOpacity
              testID="kpi-today-sales"
              onPress={() => router.push('/billing')}
              activeOpacity={0.88}
              style={{ flex: 1 }}
            >
              <GlassCard
                contentPadding={14}
                style={{
                  flex: 1,
                  borderColor: 'rgba(5, 150, 105, 0.35)',
                  backgroundColor: isDark ? 'rgba(5, 150, 105, 0.10)' : 'rgba(236, 253, 245, 0.85)',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#059669', letterSpacing: 0.5 }}>TODAY'S SALES</Text>
                  <TrendingUp size={14} color="#059669" />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.vjText }} numberOfLines={1}>
                  {formatRupees(liveData?.todaySales.totalSalesPaise || 0)}
                </Text>
                <View style={{ marginTop: 4, gap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.7)' : '#065F46' }} numberOfLines={1}>
                    {liveData?.todaySales.invoicesCount || 0} Invoices Today
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? 'rgba(255,255,255,0.5)' : '#047857' }} numberOfLines={1}>
                    URD: {formatRupees(liveData?.todayUrd.totalValuePaise || 0)}
                  </Text>
                </View>
              </GlassCard>
            </TouchableOpacity>

            {/* CARD B: VAULT STOCK */}
            <TouchableOpacity
              testID="kpi-vault-stock"
              onPress={() => router.push('/inventory')}
              activeOpacity={0.88}
              style={{ flex: 1 }}
            >
              <GlassCard
                contentPadding={14}
                style={{
                  flex: 1,
                  borderColor: 'rgba(124, 58, 237, 0.35)',
                  backgroundColor: isDark ? 'rgba(124, 58, 237, 0.10)' : 'rgba(245, 243, 255, 0.85)',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#7C3AED', letterSpacing: 0.5 }}>VAULT STOCK</Text>
                  <Scale size={14} color="#7C3AED" />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.vjText }} numberOfLines={1}>
                  {liveData?.vaultStock.totalItemsCount || 0} Pieces
                </Text>
                <View style={{ marginTop: 4, gap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E' }} numberOfLines={1}>
                    Au: {formatWeightMg(liveData?.vaultStock.goldNetWeightMg || 0)}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#CBD5E1' : '#475569' }} numberOfLines={1}>
                    Ag: {formatWeightMg(liveData?.vaultStock.silverNetWeightMg || 0)}
                  </Text>
                </View>
              </GlassCard>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. CORE MODULES (Bento Grid with Live Micro-Stats) */}
        <View style={{ marginBottom: 4, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(92, 22, 35, 0.65)', marginBottom: 8 }}>
            Core Modules
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between gap-y-4 mb-8">
          <MenuTile
            variant="dashboard"
            title="Inventory & Stock"
            subtitle={`${liveData?.vaultStock.totalItemsCount || 0} items • ${liveData?.mastersCount.categories || 0} categories`}
            badgeText="LIVE"
            badgeVariant="active"
            icon={<Package size={22} color="#7C3AED" />}
            iconBg="rgba(124, 58, 237, 0.12)"
            borderColor="rgba(124, 58, 237, 0.3)"
            onPress={() => router.push('/inventory')}
          />

          <MenuTile
            variant="dashboard"
            title="Billing & Sales"
            subtitle={`${liveData?.todaySales.invoicesCount || 0} today • ${liveData?.allTimeInvoicesCount || 0} total`}
            icon={<FileText size={22} color="#059669" />}
            iconBg="rgba(5, 150, 105, 0.12)"
            borderColor="rgba(5, 150, 105, 0.2)"
            badgeText="LIVE"
            badgeVariant="active"
            onPress={() => router.push('/billing')}
          />

          <MenuTile
            variant="dashboard"
            title="Vault & Refinery"
            subtitle="Melt & Refining Batches"
            icon={<Landmark size={22} color="#D97706" />}
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.2)"
            badgeText="LIVE"
            badgeVariant="active"
            onPress={() => router.push('/vault')}
          />

          <MenuTile
            variant="dashboard"
            title="Audit & Reports"
            subtitle="Activity Logs & Security"
            icon={<TrendingUp size={22} color="#DB2777" />}
            iconBg="rgba(219, 39, 119, 0.12)"
            borderColor="rgba(219, 39, 119, 0.2)"
            badgeText="LIVE"
            badgeVariant="active"
            onPress={() => router.push('/settings/audit-logs')}
          />
        </View>

        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 ml-1">
          System Settings
        </Text>

        <ListTileCard
          title="Firm Settings"
          subtitle="Manage Identity, Backup & Restore"
          icon={<Settings size={22} color="#D97706" />}
          iconBg="rgba(217, 119, 6, 0.12)"
          borderColor="rgba(212, 175, 55, 0.25)"
          onPress={() => router.push('/settings')}
        />

        <View className="mt-12 items-center opacity-40 mb-4">
          <Gem size={20} color={COLORS.vjText} />
          <Text className="text-[10px] font-black text-vj-text mt-2 tracking-widest">
            VJ BILLING • HUB ARCHITECTURE
          </Text>
        </View>
      </ScrollView>

      <Modal animationType="fade" transparent={true} visible={showLogoutModal}>
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-6 items-center border border-white/50 shadow-2xl">
            <View className="p-5 rounded-2xl mb-4 border bg-vj-danger/10 border-vj-danger/30 items-center justify-center">
              <LogOut size={40} color="#ef4444" />
            </View>
            <Text className="text-2xl font-black text-vj-text mb-1 text-center tracking-tight">
              Close Session
            </Text>
            <Text className="text-vj-text/60 text-center mb-6 font-semibold text-sm">
              Are you sure you want to exit{' '}
              <Text className="font-bold text-vj-text">{firm.name}</Text>?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <GlassButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowLogoutModal(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton title="Exit Firm" variant="danger" onPress={executeLogout} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODERN LUXURY APP EXIT CONFIRMATION MODAL */}
      <Modal
        testID="exit-app-modal"
        animationType="fade"
        transparent={true}
        visible={showExitModal}
        onRequestClose={() => setShowExitModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-6">
          <View
            style={{
              width: '100%',
              maxWidth: 380,
              backgroundColor: isDark ? '#1C1418' : '#FCFBF8',
              borderRadius: 28,
              padding: 24,
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: isDark ? 'rgba(212, 175, 55, 0.4)' : 'rgba(92, 22, 35, 0.25)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 12,
            }}
          >
            {/* Glowing Accent Ring with Power / Exit Icon */}
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderWidth: 1.5,
                borderColor: 'rgba(239, 68, 68, 0.35)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Power size={32} color="#EF4444" />
            </View>

            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: COLORS.vjText,
                textAlign: 'center',
                letterSpacing: -0.3,
                marginBottom: 8,
              }}
            >
              Exit Application?
            </Text>

            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: isDark ? 'rgba(255, 255, 255, 0.68)' : 'rgba(92, 22, 35, 0.72)',
                textAlign: 'center',
                lineHeight: 19,
                marginBottom: 24,
                paddingHorizontal: 8,
              }}
            >
              Are you sure you want to close VJ Billing? All active firm data and vaults are securely encrypted.
            </Text>

            {/* Symmetrical 50/50 Dual Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <GlassButton
                  testID="exit-app-cancel-btn"
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowExitModal(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton
                  testID="exit-app-confirm-btn"
                  title="Exit App"
                  variant="danger"
                  onPress={() => {
                    setShowExitModal(false);
                    BackHandler.exitApp();
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}
