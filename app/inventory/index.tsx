// app/inventory/index.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, HeaderPill } from '@/components/ui/Glass';
import { InventoryStockSummary } from '@/components/InventoryStockSummary';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
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
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshTrigger(prev => prev + 1);
      if (activeFirmId) {
        const count = inventoryDrillDownService.getDraftCountSync(activeFirmId);
        setDraftCount(count);
      }
    }, [activeFirmId])
  );

  const inventoryHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label="Stock Operations" />
      <HeaderPill icon={<TrendingUp size={12} color="#4ADE80" />} label="Live Valuation" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Inventory Hub" showBack headerContent={inventoryHeaderPills}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 20, paddingBottom: 100 }}>
        
        {/* The Live Jewelry Stock Display lives here natively */}
        {activeFirmId && (
          <View style={{ marginBottom: 24 }}>
            <InventoryStockSummary firmId={activeFirmId} refreshTrigger={refreshTrigger} />
          </View>
        )}

        {/* Global Glass Smart Search */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/inventory/search');
          }}
          style={{ marginBottom: 16 }}
        >
          <GlassCard style={{ padding: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(255,255,255,0.4)', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', marginRight: 12 }}>
                  <Search size={18} color="#D4AF37" />
                </View>
                <Text style={{ color: 'rgba(92,22,35,0.6)', fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>
                  Search SKU, HUID, or Design...
                </Text>
              </View>
              <View style={{ backgroundColor: COLORS.vjText, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(92,22,35,0.2)' }}>
                <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  SEARCH
                </Text>
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION: CATALOG DEFINITIONS */}
        <Text style={{ color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>
          Catalog Definitions
        </Text>

        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/masters');
          }} 
          style={{ marginBottom: 24 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(180, 83, 9, 0.25)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}>
              <View style={{ padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(180, 83, 9, 0.12)' }}>
                <Database size={24} color="#B45309" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={{ color: COLORS.vjText, fontWeight: '900', fontSize: 18 }}>Metal Master</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' }}>
                    <Text style={{ fontSize: 8, fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: 1 }}>MASTERS</Text>
                  </View>
                </View>
                <Text style={{ color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '600' }}>
                  Categories, Designs, Stones & HSN Codes
                </Text>
              </View>
              <View style={{ padding: 8, backgroundColor: 'rgba(92,22,35,0.05)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(92,22,35,0.1)' }}>
                <ChevronRight size={18} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 1: STOCK OPERATIONS */}
        <Text style={{ color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginLeft: 4 }}>
          Stock Operations
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }}>
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
            subtitle={draftCount > 0 ? `${draftCount} Pending Review` : "Pending Verification"} 
            icon={<ClipboardList size={22} color={draftCount > 0 ? "#D97706" : "#D97706"} />} 
            iconBg={draftCount > 0 ? "rgba(245, 158, 11, 0.2)" : "rgba(217, 119, 6, 0.12)"}
            borderColor={draftCount > 0 ? "rgba(245, 158, 11, 0.5)" : "rgba(217, 119, 6, 0.25)"}
            badgeText={draftCount > 0 ? `${draftCount} PENDING` : "0 DRAFTS"}
            alertCount={draftCount}
            onPress={() => router.push('/inventory/drafts')} 
          />
        </View>

        {/* SECTION 2: STOCK INWARD ENTRY */}
        <Text style={{ color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginTop: 32, marginLeft: 4 }}>
          Stock Inward Entry
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }}>
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
        <Text style={{ color: 'rgba(92,22,35,0.6)', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginTop: 32, marginLeft: 4 }}>
          Unregistered & Stones
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16, marginBottom: 32 }}>
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
  alertCount,
  disabled, 
  onPress 
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  borderColor: string;
  badgeText: string;
  alertCount?: number;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const hasAlert = alertCount !== undefined && alertCount > 0;
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
            borderColor: hasAlert ? '#F59E0B' : (disabled ? 'rgba(255, 255, 255, 0.6)' : borderColor),
            borderWidth: hasAlert ? 1.5 : 1,
            padding: 14,
            backgroundColor: hasAlert ? 'rgba(254, 243, 199, 0.55)' : undefined,
          }}
        >
          <View style={{ height: '100%', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ position: 'relative' }}>
                <View 
                  style={{ padding: 10, borderRadius: 16, borderWidth: 1, borderColor: hasAlert ? 'rgba(245,158,11,0.4)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}
                >
                  {icon}
                </View>
                {hasAlert && (
                  <View 
                    style={{ 
                      position: 'absolute', 
                      top: -4, 
                      right: -4, 
                      backgroundColor: '#EF4444', 
                      borderRadius: 10, 
                      minWidth: 18, 
                      height: 18, 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      paddingHorizontal: 4,
                      borderWidth: 1.5,
                      borderColor: '#FFFFFF',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                      {alertCount > 99 ? '99+' : alertCount}
                    </Text>
                  </View>
                )}
              </View>

              <View 
                style={{ 
                  paddingHorizontal: 8, 
                  paddingVertical: 3, 
                  borderRadius: 999, 
                  borderWidth: 1, 
                  backgroundColor: hasAlert ? 'rgba(245, 158, 11, 0.25)' : 'rgba(0,0,0,0.05)', 
                  borderColor: hasAlert ? 'rgba(245, 158, 11, 0.6)' : 'rgba(0,0,0,0.1)' 
                }}
              >
                <Text 
                  style={{ 
                    fontSize: 8.5, 
                    fontWeight: '900', 
                    textTransform: 'uppercase', 
                    letterSpacing: 0.8, 
                    color: hasAlert ? '#B45309' : 'rgba(92,22,35,0.6)' 
                  }}
                >
                  {badgeText}
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.vjText, fontWeight: '900', fontSize: 16, lineHeight: 20, marginBottom: 2 }} numberOfLines={1}>
                {title}
              </Text>
              <Text style={{ color: 'rgba(92,22,35,0.5)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}