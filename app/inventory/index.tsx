// app/inventory/index.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard } from '../../components/ui/Glass';
import { InventoryStockSummary } from '../../components/InventoryStockSummary';
import { useFirmStore } from '../../store/firmStore';
import { 
  PackageSearch, 
  Layers, 
  PackagePlus, 
  ClipboardList, 
  FileDown, 
  Diamond,
  Database,
  ChevronRight
} from 'lucide-react-native';

export default function InventoryHubScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();

  return (
    <TwoToneWrapper title="Inventory Hub" showBack>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* The Live Jewelry Stock Display now lives here natively */}
        {activeFirmId && (
          <View className="mb-6 -mt-2">
            <InventoryStockSummary firmId={activeFirmId} />
          </View>
        )}

        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 ml-1">
          Stock Operations
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          <MenuTile 
            title="Stock Ledger" 
            subtitle="Drill-Down View" 
            icon={<PackageSearch size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/drill-down')} 
          />

          <MenuTile 
            title="Draft Items" 
            subtitle="Pending Verification" 
            icon={<ClipboardList size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/drafts')} 
          />
        </View>

        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 mt-8 ml-1">
          Stock Inward Entry
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          <MenuTile 
            title="Single Item Add" 
            subtitle="Detailed Entry" 
            icon={<PackagePlus size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/add-stock')} 
          />

          <MenuTile 
            title="Bulk Add Matrix" 
            subtitle="Rapid Batch Entry" 
            icon={<Layers size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/bulk-add')} 
          />
        </View>

        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 mt-8 ml-1">
          Unregistered & Stones
        </Text>

        <View className="flex-row flex-wrap justify-between gap-y-4 mb-8">
          <MenuTile 
            title="URD Purchases" 
            subtitle="Scrap & Old Gold" 
            icon={<FileDown size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/urd-purchases')} 
          />

          <MenuTile 
            title="Gemstone Lots" 
            subtitle="Physical Intake" 
            icon={<Diamond size={24} color="#2E1D00" />} 
            onPress={() => router.push('/inventory/gemstones')} 
          />
        </View>

        {/* --- MOVED FROM DASHBOARD --- */}
        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-4 mt-2 ml-1">
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
                <Text className="text-vj-text/60 text-xs">Categories, Designs, Stones, HSN</Text>
              </View>
              <ChevronRight size={20} color="#B87333" className="opacity-50" />
            </View>
          </GlassCard>
        </TouchableOpacity>

      </ScrollView>
    </TwoToneWrapper>
  );
}

function MenuTile({ title, subtitle, icon, disabled, onPress }: any) {
  return (
    <View style={{ width: '48%' }}> 
       <TouchableOpacity 
         disabled={disabled} 
         onPress={onPress} 
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