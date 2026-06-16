// app/dashboard.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { TwoToneWrapper } from '../components/TwoToneWrapper'; 
import { useSession } from '../hooks/useSession';
import { useFirmStore } from '../store/firmStore';
import { GlassCard, GlassButton } from '../components/ui/Glass'; 
import { LeaseStatusBanner } from '../components/LeaseStatusBanner'; 
import { LogOut, Settings, ShieldCheck, FileText, Package, Users, TrendingUp, ChevronRight, Gem, ClipboardList, Database } from 'lucide-react-native';

export default function Dashboard() {
  const router = useRouter();
  const { clearActiveFirm } = useFirmStore();
  const { firm, activeFY, isLoading } = useSession();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const executeLogout = () => {
    setShowLogoutModal(false);
    clearActiveFirm();
    router.replace('/settings/firms'); 
  };

  if (isLoading) {
    return (
      <TwoToneWrapper title="Loading...">
        <View className="flex-1 justify-center items-center">
          <Text className="text-vj-text/50 font-bold">Hydrating Session...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  if (!firm) {
    return <Redirect href="/settings/firms" />;
  }

  const displayLogo = firm.firmLogoRef;

  const dashboardHeader = (
    <View>
      <View className="mb-4">
         <LeaseStatusBanner />
      </View>

      <View className="py-2">
        <View className="flex-row items-center gap-4 mb-4">
          <View className="h-16 w-16 bg-vj-bg rounded-full border border-white/20 justify-center items-center overflow-hidden shadow-sm">
            {displayLogo ? (
              <Image 
                source={{ uri: displayLogo }} 
                style={{ width: '100%', height: '100%', resizeMode: 'cover' }} 
              />
            ) : (
              <Text className="text-3xl font-bold text-vj-text">
                {firm.name.substring(0, 1)}
              </Text>
            )}
          </View>
          
          <View className="flex-1">
            <Text className="text-vj-bg text-2xl font-bold tracking-tight" numberOfLines={1}>
              {firm.name}
            </Text>
            <Text className="text-vj-bg/60 text-sm font-medium">
              {firm.proprietor}
            </Text>
          </View>

          <TouchableOpacity onPress={() => setShowLogoutModal(true)} className="bg-white/10 p-3 rounded-full border border-white/20 active:bg-vj-danger/50">
            <LogOut size={20} color="#FAF3E0" />
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2 flex-wrap">
          <View className="bg-vj-bg px-3 py-1.5 rounded-full shadow-sm">
            <Text className="text-vj-text text-xs font-bold">
              {activeFY ? activeFY.label : 'NO ACTIVE FY'}
            </Text>
          </View>
          <View className={`px-3 py-1.5 rounded-full border ${firm.gstin ? 'bg-vj-success/20 border-vj-success/30' : 'bg-white/10 border-white/20'}`}>
            <Text className={`text-xs font-bold ${firm.gstin ? 'text-green-300' : 'text-vj-bg/60'}`}>
              {firm.gstin ? 'GST REGISTERED' : 'NON-GST'}
            </Text>
          </View>
          {firm.bisLicence && (
            <View className="bg-vj-accent/20 px-3 py-1.5 rounded-full border border-vj-accent/30 flex-row items-center gap-1">
              <ShieldCheck size={12} color="#FDBA74" />
              <Text className="text-orange-200 text-xs font-bold">BIS HALLMARK</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={dashboardHeader}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 ml-1">
          Operations
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          <MenuTile title="Tax Invoice" subtitle="Billing & Sales" icon={<FileText size={24} color="#B87333" />} disabled />
          
          <MenuTile 
            title="Stock Inventory" 
            subtitle="Manage Items" 
            icon={<Package size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/drill-down')} 
          />
          
          <MenuTile 
            title="Draft Items" 
            subtitle="Pending Verify" 
            icon={<ClipboardList size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/drafts')} 
          />

          <MenuTile title="Business Reports" subtitle="Insights" icon={<TrendingUp size={24} color="#2E1D00" />} disabled />
        </View>

        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 mt-8 ml-1">
          Governance & Masters
        </Text>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/masters')} className="mb-4">
          <GlassCard style={{ padding: 0 }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                <Database size={24} color="#2E1D00" />
              </View>
              <View className="flex-1">
                <Text className="text-vj-text font-bold text-lg">Master Catalogs</Text>
                <Text className="text-vj-text/60 text-xs">Categories, Designs, HSN Codes</Text>
              </View>
              <ChevronRight size={20} color="#B87333" className="opacity-50" />
            </View>
          </GlassCard>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/settings')}>
          <GlassCard style={{ padding: 0 }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                <Settings size={24} color="#2E1D00" />
              </View>
              <View className="flex-1">
                <Text className="text-vj-text font-bold text-lg">Firm Settings</Text>
                <Text className="text-vj-text/60 text-xs">Manage Identity, Backup & Restore</Text>
              </View>
              <ChevronRight size={20} color="#B87333" className="opacity-50" />
            </View>
          </GlassCard>
        </TouchableOpacity>

        <View className="mt-8 items-center opacity-30 mb-8">
          <Gem size={20} color="#2E1D00" />
          <Text className="text-[10px] font-bold text-vj-text mt-2">
            VJ BILLING • PHASE 2 • INVENTORY LAYER
          </Text>
        </View>

      </ScrollView>

      {/* MODAL */}
      <Modal animationType="fade" transparent={true} visible={showLogoutModal}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-8 shadow-xl items-center border border-white/50">
            <View className="p-6 rounded-full mb-6 border bg-vj-danger/10 border-vj-danger/30">
               <LogOut size={48} color="#ef4444" />
            </View>
            <Text className="text-2xl font-bold text-vj-text mb-2 text-center tracking-tight">Close Session</Text>
            <Text className="text-vj-text/60 text-center mb-8 font-medium">Are you sure you want to exit {firm.name}?</Text>
            <View className="w-full gap-3">
              <GlassButton title="Exit Firm" variant="danger" onPress={executeLogout} />
              <GlassButton title="Cancel" variant="secondary" onPress={() => setShowLogoutModal(false)} />
            </View>
          </View>
        </View>
      </Modal>

    </TwoToneWrapper>
  );
}

// Updated MenuTile to support routing
function MenuTile({ title, subtitle, icon, disabled, onPress }: any) {
  return (
    <View style={{ width: '48%' }}> 
       <TouchableOpacity 
         disabled={disabled} 
         onPress={() => onPress ? onPress() : alert("Feature coming in Phase 3+")} 
         activeOpacity={0.7}
       >
        <GlassCard style={{ height: 140, marginBottom: 0, opacity: disabled ? 0.6 : 1 }}>
          <View className="h-full justify-between">
            <View className="bg-white/40 p-2.5 rounded-xl self-start border border-white/30 shadow-sm">
              {icon}
            </View>
            <View>
              <Text className="text-vj-text font-bold text-base leading-5 mb-1">{title}</Text>
              <Text className="text-vj-text/50 text-[10px] font-bold uppercase">{subtitle}</Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}