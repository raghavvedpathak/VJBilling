// app/dashboard.tsx — Phase 1 v7.47 & Phase 2 Canonical Dashboard Screen
// Implements FIX-V740-12 (D2=P1 PIN-not-set banner), FIX-V745-3 (useAutoBackupTrigger),
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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { useAutoBackupTrigger } from '@/hooks/useAutoBackupTrigger';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { useVerifyStore } from '@/store/phase1/verifyStore';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';
import { storage } from '@/utils/storage';
import { AB_KEYS, localDay } from '@/constants/autoBackup';
import {
  GlassButton,
  HeaderPill,
  MenuTile,
  ListTileCard,
} from '@/components/ui/Glass';
import { LeaseStatusBanner } from '@/components/phase1/LeaseStatusBanner';
import { FYEndBanner } from '@/components/phase1/FYEndBanner';
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
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return Math.max(0, Math.round((startOfToday - startOfThen) / 86_400_000));
}

export default function Dashboard() {
  const router = useRouter();
  const { clearActiveFirm } = useFirmStore();
  const { firm, activeFY, isLoading, bisLogoUri, refreshSession } = useSession();
  const hasUnviewedWarnings = useVerifyStore((s) => s.hasUnviewedWarnings);
  const markWarningsViewed = useVerifyStore((s) => s.markWarningsViewed);

  // FIX-V745-3: Mounted on Dashboard screen ONLY
  useAutoBackupTrigger();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [firmLogoBroken, setFirmLogoBroken] = useState(false);
  const [bisLogoBroken, setBisLogoBroken] = useState(false);
  const [pinSkippedBannerVisible, setPinSkippedBannerVisible] = useState(false);
  const [autoBackupBanner, setAutoBackupBanner] = useState<string | null>(null);

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
        setAutoBackupBanner(
          `No automatic backup for ${days} days. Tap to back up now.`
        );
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

  // Prevent Android hardware back button from navigating back to Welcome / Setup screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          'Exit Application',
          'Are you sure you want to exit VJ Billing?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => {} },
            { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ]
        );
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // Re-verify session and banner state whenever Dashboard regains focus
  useFocusEffect(
    useCallback(() => {
      refreshSession?.();
      refreshBanners();
    }, [refreshSession, refreshBanners])
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
        <LeaseStatusBanner />
        <FYEndBanner />

        {/* FIX-V740-12 (D2 = P1): Non-dismissible PIN-not-set banner while PIN is skipped */}
        {pinSkippedBannerVisible && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/settings/pin')}
            className="bg-amber-100/95 border border-amber-500/60 rounded-2xl p-3.5 mb-2 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-2">
              <View className="bg-amber-500/20 p-2 rounded-xl mr-3">
                <LockOpen size={18} color="#B45309" />
              </View>
              <Text className="text-amber-900 text-xs font-bold flex-1 leading-4">
                App lock is off. Anyone who opens this app can see your data. Set a PIN.
              </Text>
            </View>
            <ChevronRight size={16} color="#B45309" />
          </TouchableOpacity>
        )}

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
        </View>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={dashboardHeader}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 100 }}
      >
        <View className="mb-4 px-1">
          <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest">
            Core Modules
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between gap-y-4 mb-8">
          <MenuTile
            variant="dashboard"
            title="Inventory & Stock"
            subtitle="Stock & URD Intake"
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
            subtitle="Phase 3 Layer"
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
            subtitle="Phase 4 Layer"
            icon={<Landmark size={22} color="#D97706" />}
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.2)"
            badgeText="LIVE"
            badgeVariant="active"
            onPress={() => router.push('/vault')}
          />

          <MenuTile
            variant="dashboard"
            title="Business Reports"
            subtitle="Phase 6 Layer"
            icon={<TrendingUp size={22} color="#DB2777" />}
            iconBg="rgba(219, 39, 119, 0.12)"
            borderColor="rgba(219, 39, 119, 0.2)"
            badgeText="PHASE 6"
            disabled
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
            <View className="w-full gap-2.5">
              <GlassButton
                title="Exit Firm"
                variant="danger"
                onPress={executeLogout}
              />
              <GlassButton
                title="Cancel"
                variant="secondary"
                onPress={() => setShowLogoutModal(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}
