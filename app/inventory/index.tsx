// app/inventory/index.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, HeaderPill } from '../../components/ui/Glass';
import { InventoryStockSummary } from '../../components/InventoryStockSummary';
import { useFirmStore } from '../../store/firmStore';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { 
  PackageSearch, 
  Layers, 
  PackagePlus, 
  ClipboardList, 
  Gem,
  Coins,
  Database,
  ChevronRight,
  Search,
  Package,
  TrendingUp
} from 'lucide-react-native';
import { COLORS, getThemeColors } from '../../constants/theme';

export default function InventoryHubScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const inventoryHeaderPills = (
    <View className="flex-row items-center gap-2 flex-wrap mt-1">
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label="Stock Operations" />
      <HeaderPill icon={<TrendingUp size={12} color="#4ADE80" />} label="Live Valuation" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Inventory Hub" showBack headerContent={inventoryHeaderPills}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 20, paddingBottom: 100 }}>
        
        {/* The Live Jewelry Stock Display lives here natively */}
        {activeFirmId && (
          <View className="mb-6">
            <InventoryStockSummary firmId={activeFirmId} />
          </View>
        )}

        {/* Global Glass Smart Search */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/inventory/search');
          }}
          className="mb-4"
        >
          <GlassCard style={{ padding: 0 }}>
            <View className="flex-row items-center p-4 bg-white/40 justify-between">
              <View className="flex-row items-center flex-1 mr-2">
                <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25 mr-3">
                  <Search size={18} color="#D4AF37" />
                </View>
                <Text className="text-vj-text/60 font-semibold text-sm flex-1" numberOfLines={1}>
                  Search SKU, HUID, or Design...
                </Text>
              </View>
              <View className="bg-vj-text px-3 py-1.5 rounded-full border border-vj-text/20">
                <Text className="text-white text-[10px] font-black text-center uppercase tracking-widest">
                  SEARCH
                </Text>
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION: CATALOG DEFINITIONS */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-3 ml-1">
          Catalog Definitions
        </Text>

        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/masters');
          }} 
          className="mb-6"
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(180, 83, 9, 0.25)' }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="p-3 rounded-2xl border border-black/5 items-center justify-center" style={{ backgroundColor: 'rgba(180, 83, 9, 0.12)' }}>
                <Database size={24} color="#B45309" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-0.5">
                  <Text className="text-vj-text font-black text-lg">Metal Master</Text>
                  <View className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <Text className="text-[8px] font-black text-amber-800 uppercase tracking-wider">MASTERS</Text>
                  </View>
                </View>
                <Text className="text-vj-text/60 text-xs font-semibold">
                  Categories, Designs, Stones & HSN Codes
                </Text>
              </View>
              <View className="p-2 bg-vj-text/5 rounded-full border border-vj-text/10">
                <ChevronRight size={18} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 1: STOCK OPERATIONS */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 ml-1">
          Stock Operations
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          <MenuTile 
            title="Stock Ledger" 
            subtitle="Drill-Down View" 
            icon={<PackageSearch size={22} color="#4F46E5" />} 
            iconBg="rgba(79, 70, 229, 0.12)"
            borderColor="rgba(79, 70, 229, 0.25)"
            badgeText="ALL STOCKS"
            onPress={() => router.push('/inventory/drill-down')} 
          />

          <MenuTile 
            title="Draft Items" 
            subtitle="Pending Verification" 
            icon={<ClipboardList size={22} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.25)"
            badgeText="VERIFY"
            onPress={() => router.push('/inventory/drafts')} 
          />
        </View>

        {/* SECTION 2: STOCK INWARD ENTRY */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 mt-8 ml-1">
          Stock Inward Entry
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          <MenuTile 
            title="Single Item Add" 
            subtitle="Detailed Entry" 
            icon={<PackagePlus size={22} color="#059669" />} 
            iconBg="rgba(5, 150, 105, 0.12)"
            borderColor="rgba(5, 150, 105, 0.25)"
            badgeText="1-BY-1"
            onPress={() => router.push('/inventory/add-stock')} 
          />

          <MenuTile 
            title="Bulk Add Matrix" 
            subtitle="Rapid Batch Entry" 
            icon={<Layers size={22} color="#7C3AED" />} 
            iconBg="rgba(124, 58, 237, 0.12)"
            borderColor="rgba(124, 58, 237, 0.25)"
            badgeText="BATCH"
            onPress={() => router.push('/inventory/bulk-add')} 
          />
        </View>

        {/* SECTION 3: UNREGISTERED & STONES */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 mt-8 ml-1">
          Unregistered & Stones
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4 mb-8">
          <MenuTile 
            title="URD Purchases" 
            subtitle="Scrap & Old Gold" 
            icon={<Coins size={22} color="#E11D48" />} 
            iconBg="rgba(225, 29, 72, 0.12)"
            borderColor="rgba(225, 29, 72, 0.25)"
            badgeText="SCRAP"
            onPress={() => router.push('/inventory/urd-purchases')} 
          />

          <MenuTile 
            title="Gemstone Lots" 
            subtitle="Physical Intake" 
            icon={<Gem size={22} color="#0891B2" />} 
            iconBg="rgba(8, 145, 178, 0.12)"
            borderColor="rgba(8, 145, 178, 0.25)"
            badgeText="GEM LOTS"
            onPress={() => router.push('/inventory/gemstones')} 
          />
        </View>

      </ScrollView>
    </TwoToneWrapper>
  );
}

function MenuTile({ 
  title, 
  subtitle, 
  icon, 
  iconBg,
  borderColor,
  badgeText,
  disabled, 
  onPress 
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  borderColor: string;
  badgeText: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={{ width: '48%' }}> 
      <TouchableOpacity 
        disabled={disabled} 
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
          if (onPress) onPress();
        }} 
        activeOpacity={0.8}
      >
        <GlassCard 
          style={{ 
            height: 144, 
            marginBottom: 0, 
            opacity: disabled ? 0.6 : 1,
            borderColor: disabled ? 'rgba(255, 255, 255, 0.6)' : borderColor,
            padding: 14
          }}
        >
          <View className="h-full justify-between">
            {/* Top row: Icon + Badge */}
            <View className="flex-row items-center justify-between">
              <View 
                className="p-2.5 rounded-2xl border border-black/5 items-center justify-center"
                style={{ backgroundColor: iconBg }}
              >
                {icon}
              </View>

              <View className="px-2 py-0.5 rounded-full border bg-black/5 border-black/10">
                <Text className="text-[8px] font-black uppercase tracking-wider text-vj-text/60">
                  {badgeText}
                </Text>
              </View>
            </View>

            {/* Bottom text */}
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