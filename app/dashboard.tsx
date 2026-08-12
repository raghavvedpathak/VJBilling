// app/dashboard.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '@/components/TwoToneWrapper'; 
import { useSession } from '@/hooks/useSession';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass'; 
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
  const { firm, activeFY, isLoading } = useSession();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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
        <View className="flex-row items-center gap-4 mb-4">
          <View className="h-16 w-16 bg-vj-bg rounded-2xl border-2 border-white/30 justify-center items-center overflow-hidden shadow-lg">
            {displayLogo ? (
              <Image 
                source={{ uri: displayLogo }} 
                style={{ width: '100%', height: '100%', resizeMode: 'cover' }} 
              />
            ) : (
              <Text className="text-3xl font-extrabold text-vj-text">
                {firm.name.substring(0, 1)}
              </Text>
            )}
          </View>
          
          <View className="flex-1">
            <Text className="text-vj-bg text-2xl font-black tracking-tight" numberOfLines={1}>
              {firm.name}
            </Text>
            <Text className="text-vj-bg/70 text-sm font-semibold mt-0.5">
              {firm.proprietor}
            </Text>
          </View>

          <TouchableOpacity 
            onPress={() => setShowLogoutModal(true)} 
            className="bg-white/15 p-3 rounded-full border border-white/25 active:bg-vj-danger/50"
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
          {firm.bisLicence && (
            <HeaderPill 
              icon={<ShieldCheck size={12} color="#38BDF8" />} 
              label="BIS HALLMARK" 
              variant="info" 
            />
          )}
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
          
          <ModernMenuTile 
            title="Inventory & Stock" 
            subtitle="Phase 2 Layer" 
            icon={<Package size={24} color="#7C3AED" />} 
            iconBg="rgba(124, 58, 237, 0.12)"
            borderColor="rgba(124, 58, 237, 0.25)"
            onPress={() => router.push('/inventory')} 
          />

          <ModernMenuTile 
            title="Billing & Sales" 
            subtitle="Phase 3 Layer" 
            icon={<FileText size={24} color="#059669" />} 
            iconBg="rgba(5, 150, 105, 0.12)"
            borderColor="rgba(5, 150, 105, 0.2)"
            badgeText="PHASE 3 LAYER"
            disabled 
          />

          <ModernMenuTile 
            title="Vault & Refinery" 
            subtitle="Phase 4 Layer" 
            icon={<Landmark size={24} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.2)"
            badgeText="PHASE 4 LAYER"
            disabled 
          />

          <ModernMenuTile 
            title="Business Reports" 
            subtitle="Phase 6 Layer" 
            icon={<TrendingUp size={24} color="#DB2777" />} 
            iconBg="rgba(219, 39, 119, 0.12)"
            borderColor="rgba(219, 39, 119, 0.2)"
            badgeText="PHASE 6 LAYER"
            disabled 
          />
        </View>

        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 ml-1">
          System Settings
        </Text>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/settings')}>
          <GlassCard style={{ padding: 0 }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="bg-vj-text/10 p-3.5 rounded-2xl border border-vj-text/10 items-center justify-center">
                <Settings size={24} color={COLORS.vjText} />
              </View>
              <View className="flex-1">
                <Text className="text-vj-text font-black text-lg">Firm Settings</Text>
                <Text className="text-vj-text/60 text-xs font-semibold mt-0.5">
                  Manage Identity, Backup & Restore
                </Text>
              </View>
              <View className="p-2 bg-vj-text/5 rounded-full border border-vj-text/10">
                <ChevronRight size={20} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

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

function ModernMenuTile({ 
  title, 
  subtitle, 
  icon, 
  iconBg, 
  borderColor, 
  badgeText, 
  badgeVariant, 
  disabled, 
  onPress 
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  borderColor: string;
  badgeText?: string;
  badgeVariant?: 'active' | 'upcoming';
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={{ width: '48%' }}> 
      <TouchableOpacity 
        disabled={disabled} 
        onPress={() => {
          if (onPress) onPress();
        }} 
        activeOpacity={0.8}
      >
        <GlassCard 
          style={{ 
            height: 148, 
            marginBottom: 0, 
            opacity: disabled ? 0.65 : 1,
            borderColor: disabled ? 'rgba(255, 255, 255, 0.6)' : borderColor,
            padding: 16
          }}
        >
          <View className="h-full justify-between">
            <View className="flex-row items-center justify-between">
              <View 
                className="p-2.5 rounded-2xl border border-black/5 items-center justify-center"
                style={{ backgroundColor: iconBg }}
              >
                {icon}
              </View>

              {badgeText ? (
                <View 
                  className={`px-2 py-0.5 rounded-full border ${
                    badgeVariant === 'active' 
                      ? 'bg-emerald-500/10 border-emerald-500/20' 
                      : 'bg-black/5 border-black/10'
                  }`}
                >
                  <Text 
                    className={`text-[8px] font-black uppercase tracking-wider ${
                      badgeVariant === 'active' ? 'text-emerald-700' : 'text-vj-text/50'
                    }`}
                  >
                    {badgeText}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="mt-2">
              <Text className="text-vj-text font-black text-base leading-5 mb-0.5" numberOfLines={1}>
                {title}
              </Text>
              <Text className="text-vj-text/50 text-[10px] font-bold uppercase" numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}