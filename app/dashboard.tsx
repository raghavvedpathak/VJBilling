// app/dashboard.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Modal, BackHandler, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '@/components/TwoToneWrapper'; 
import { useSession } from '@/hooks/useSession';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { GlassCard, GlassButton, HeaderPill, MenuTile, ListTileCard } from '@/components/ui/Glass'; 
import { LeaseStatusBanner } from '@/components/LeaseStatusBanner'; 
import { FYEndBanner } from '@/components/FYEndBanner'; 
import { 
  LogOut, Settings, ShieldCheck, FileText, Package, TrendingUp, 
  ChevronRight, Gem, Landmark, CalendarClock, CheckCircle2
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

export default function Dashboard() {
  const router = useRouter();
  const { clearActiveFirm } = useFirmStore();
  const { firm, activeFY, isLoading, bisLogoUri, refreshSession } = useSession();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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

  // Re-verify session state whenever Dashboard regains focus
  useFocusEffect(
    useCallback(() => {
      refreshSession?.();
    }, [refreshSession])
  );

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

  const displayLogo = firm.firmLogoRef;

  const dashboardHeader = (
    <View>
      <View className="mb-4">
        <LeaseStatusBanner />
        <FYEndBanner />
      </View>

      <View className="py-2">
        <View className="flex-row items-center gap-3 mb-4">
          <View className="h-16 w-16 bg-vj-bg rounded-2xl border-2 border-white/30 justify-center items-center overflow-hidden shadow-lg shrink-0 p-1.5">
            {displayLogo ? (
              <Image 
                source={{ uri: displayLogo }} 
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
              />
            ) : (
              <Text className="text-3xl font-extrabold text-vj-text">
                {firm.name.substring(0, 1)}
              </Text>
            )}
          </View>
          
          <View className="flex-1 min-w-0 pr-1">
            <Text className="text-vj-bg text-2xl font-black tracking-tight" numberOfLines={1}>
              {firm.name}
            </Text>
            <Text className="text-vj-bg/70 text-sm font-semibold mt-0.5" numberOfLines={1}>
              {firm.proprietor}
            </Text>
          </View>

          {bisLogoUri && (
            <View className="h-16 w-16 bg-vj-bg rounded-2xl border-2 border-white/30 justify-center items-center overflow-hidden shadow-lg p-1.5 shrink-0">
              <Image 
                source={{ uri: bisLogoUri }} 
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
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
            variant={firm.gstin ? "success" : "default"}
          />
          {bisLogoUri ? (
            <View className="flex-row items-center gap-1.5 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-400/30">
              <View className="w-4 h-4 bg-vj-bg rounded-xs justify-center items-center overflow-hidden">
                <Image 
                  source={{ uri: bisLogoUri }} 
                  style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 24, paddingBottom: 100 }}>

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
            badgeText="PHASE 3"
            disabled 
          />

          <MenuTile 
            variant="dashboard"
            title="Vault & Refinery" 
            subtitle="Phase 4 Layer" 
            icon={<Landmark size={22} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.2)"
            badgeText="PHASE 4"
            disabled 
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
            <Text className="text-2xl font-black text-vj-text mb-1 text-center tracking-tight">Close Session</Text>
            <Text className="text-vj-text/60 text-center mb-6 font-semibold text-sm">
              Are you sure you want to exit <Text className="font-bold text-vj-text">{firm.name}</Text>?
            </Text>
            <View className="w-full gap-2.5">
              <GlassButton title="Exit Firm" variant="danger" onPress={executeLogout} />
              <GlassButton title="Cancel" variant="secondary" onPress={() => setShowLogoutModal(false)} />
            </View>
          </View>
        </View>
      </Modal>

    </TwoToneWrapper>
  );
}