// app/inventory/index.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, HeaderPill, MenuTile } from '@/components/ui/Glass';
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
  TrendingUp,
  Boxes
} from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function InventoryHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshTrigger((prev) => prev + 1);
      if (activeFirmId) {
        try {
          const count = inventoryDrillDownService.getDraftCountSync(activeFirmId);
          setDraftCount(count || 0);
        } catch (e) {
          console.error('[InventoryHub] Failed to get draft count:', e);
          setDraftCount(0);
        }
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
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ 
          paddingTop: 20, 
          paddingBottom: Math.max(insets.bottom + 32, 80) 
        }}
      >
        
        {/* The Live Jewelry Stock Display lives here natively */}
        {activeFirmId && (
          <View style={{ marginBottom: 24 }}>
            <InventoryStockSummary firmId={activeFirmId} refreshTrigger={refreshTrigger} />
          </View>
        )}

        {/* Global Glass Smart Search */}
        <TouchableOpacity
          testID="inventory-hub-search-btn"
          activeOpacity={0.8}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/inventory/search');
          }}
          style={{ marginBottom: 16 }}
        >
          <GlassCard style={{ padding: 0 }}>
            <View style={[s.searchInner, { backgroundColor: 'rgba(255,255,255,0.45)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <View style={[s.searchIconContainer, { backgroundColor: `${colors.vjAccent}18`, borderColor: `${colors.vjAccent}30` }]}>
                  <Search size={18} color={colors.vjAccent} />
                </View>
                <Text style={[s.searchPlaceholderText, { color: colors.vjText, opacity: 0.6 }]} numberOfLines={1}>
                  Search SKU, HUID, or Design...
                </Text>
              </View>
              <View style={[s.searchBadge, { backgroundColor: colors.vjText, borderColor: `${colors.vjAccent}35` }]}>
                <Text style={s.searchBadgeText}>
                  SEARCH
                </Text>
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION: CATALOG DEFINITIONS */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Catalog Definitions
        </Text>

        <TouchableOpacity 
          testID="metal-master-tile"
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/masters');
          }} 
          style={{ marginBottom: 24 }}
        >
          <GlassCard style={{ padding: 0, borderColor: `${colors.vjAccent}35` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}>
              <View style={[s.masterIconContainer, { backgroundColor: `${colors.vjAccent}15` }]}>
                <Database size={24} color={colors.vjAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={{ color: colors.vjText, fontWeight: '900', fontSize: 18 }}>Metal Master</Text>
                  <View style={[s.masterBadge, { backgroundColor: `${colors.vjAccent}18`, borderColor: `${colors.vjAccent}30` }]}>
                    <Text style={[s.masterBadgeText, { color: colors.vjAccent }]}>MASTERS</Text>
                  </View>
                </View>
                <Text style={{ color: colors.vjText, opacity: 0.65, fontSize: 12, fontWeight: '600' }}>
                  Categories, Designs, Stones & HSN Codes
                </Text>
              </View>
              <View style={[s.chevronContainer, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}25` }]}>
                <ChevronRight size={18} color={colors.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 1: STOCK OPERATIONS */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Stock Operations
        </Text>

        <View style={s.menuGrid}>
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
            icon={<ClipboardList size={22} color="#D97706" />} 
            iconBg={draftCount > 0 ? "rgba(245, 158, 11, 0.2)" : "rgba(217, 119, 6, 0.12)"}
            borderColor={draftCount > 0 ? "rgba(245, 158, 11, 0.5)" : "rgba(217, 119, 6, 0.25)"}
            badgeText={draftCount > 0 ? `${draftCount} PENDING` : "0 DRAFTS"}
            alertCount={draftCount}
            onPress={() => router.push('/inventory/drafts')} 
          />
        </View>

        {/* SECTION 2: STOCK INWARD ENTRY */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6, marginTop: 32 }]}>
          Stock Inward Entry
        </Text>

        <View style={s.menuGrid}>
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

          <MenuTile 
            title="Loose Stock Add" 
            subtitle="Pooled Weight Lot" 
            icon={<Boxes size={22} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.25)"
            badgeText="POOLED"
            onPress={() => router.push('/inventory/add-loose-stock')} 
          />
        </View>

        {/* SECTION 3: UNREGISTERED & STONES */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6, marginTop: 32 }]}>
          Unregistered & Stones
        </Text>

        <View style={[s.menuGrid, { marginBottom: 32 }]}>
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

const s = StyleSheet.create({
  sectionHeader: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 14,
    marginLeft: 4,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  searchIconContainer: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 12,
  },
  searchPlaceholderText: {
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  searchBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  masterIconContainer: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  masterBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chevronContainer: {
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
});