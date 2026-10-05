// app/inventory/index.tsx — Phase 2 v2.34 Canonical Screen (Inventory Hub)
// Integrates FEAT-GAP6-KARIGAR-SUMMARY-1 (/inventory/karigar-items),
// FIX-OLDMETAL-RENAME-1 (/inventory/old-metal-lots), and live master subscriptions

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, HeaderPill, MenuTile } from '@/components/ui/Glass';
import { InventoryStockSummary } from '@/components/phase2/InventoryStockSummary';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { useMastersSyncStore } from '@/store/phase2/mastersSyncStore';
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
  Boxes, 
  Wrench, 
  FileDown,
  ScanLine
} from 'lucide-react-native';
import { getThemeColors } from '@/constants/theme';

export default function InventoryHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const isTablet = width >= 768 || Math.min(width, height) >= 600;
  const tileContainerStyle = { width: isTablet ? '31.8%' : '48.2%' };

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [karigarCount, setKarigarCount] = useState(0);

  const categoryVersion = useMastersSyncStore((s) => s.categoryVersion);
  const designVersion = useMastersSyncStore((s) => s.designVersion);
  const stoneVersion = useMastersSyncStore((s) => s.stoneVersion);

  useEffect(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, [categoryVersion, designVersion, stoneVersion]);

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

        inventoryDrillDownService.getKarigarIssuedItems(activeFirmId)
          .then((items) => setKarigarCount(items?.length || 0))
          .catch(() => setKarigarCount(0));
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
          paddingTop: 16, 
          paddingBottom: Math.max(insets.bottom + 32, 80) 
        }}
      >
        
        {/* Native Live Jewelry Stock Display */}
        {activeFirmId && (
          <View style={{ marginBottom: 20 }}>
            <InventoryStockSummary firmId={activeFirmId} refreshTrigger={refreshTrigger} />
          </View>
        )}

        {/* Global Glass Smart Search */}
        <TouchableOpacity
          testID="inventory-hub-search-btn"
          activeOpacity={0.85}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/inventory/search');
          }}
          style={{ marginBottom: 22 }}
        >
          <GlassCard style={{ padding: 0 }}>
            <View 
              style={[
                s.searchInner, 
                { 
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.75)',
                  borderColor: isDark ? 'rgba(212, 175, 55, 0.32)' : 'rgba(212, 175, 55, 0.35)',
                }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                <View style={[s.searchIconContainer, { backgroundColor: `${colors.vjAccent}18`, borderColor: `${colors.vjAccent}35` }]}>
                  <Search size={18} color={isDark ? '#FDE68A' : colors.vjAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.searchPlaceholderText, { color: colors.vjText }]} numberOfLines={1}>
                    Search SKU, HUID, or Design...
                  </Text>
                  <Text style={{ fontSize: 10.5, color: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(92,22,35,0.55)', fontWeight: '600', marginTop: 1 }}>
                    Direct live camera scan or tag number
                  </Text>
                </View>
              </View>
              <View style={[s.searchBadge, { backgroundColor: colors.vjText, borderColor: isDark ? 'rgba(212, 175, 55, 0.40)' : `${colors.vjAccent}35` }]}>
                <ScanLine size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={s.searchBadgeText}>
                  SCAN / SEARCH
                </Text>
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION: CATALOG DEFINITIONS */}
        <View style={s.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#D4AF37' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Catalog Definitions
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(212, 175, 55, 0.10)', borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(212, 175, 55, 0.25)' }]}>
            <Database size={11} color={isDark ? '#FDE68A' : colors.vjAccent} />
            <Text style={[s.sectionBadgeText, { color: isDark ? '#E5E7EB' : colors.vjText }]}>
              SHOWROOM MASTERS
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          testID="metal-master-tile"
          activeOpacity={0.85} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/masters');
          }} 
          style={{ marginBottom: 24 }}
        >
          <GlassCard 
            style={{ 
              padding: 0, 
              borderColor: isDark ? 'rgba(212, 175, 55, 0.40)' : 'rgba(212, 175, 55, 0.45)',
              borderWidth: 1.2,
              backgroundColor: isDark ? 'rgba(28, 20, 24, 0.88)' : 'rgba(255, 255, 255, 0.90)',
              borderRadius: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}>
              <View 
                style={[
                  s.masterIconContainer, 
                  { 
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(212, 175, 55, 0.15)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.30)',
                  }
                ]}
              >
                <Database size={24} color={isDark ? '#FDE68A' : colors.vjAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={{ color: colors.vjText, fontWeight: '900', fontSize: 17, letterSpacing: 0.3 }}>
                    Metal Master
                  </Text>
                  <View style={[s.masterBadge, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.22)' : `${colors.vjAccent}18`, borderColor: isDark ? 'rgba(212, 175, 55, 0.45)' : `${colors.vjAccent}30` }]}>
                    <Text style={[s.masterBadgeText, { color: isDark ? '#FDE68A' : colors.vjAccent }]}>MASTERS</Text>
                  </View>
                </View>
                <Text style={{ color: colors.vjText, opacity: 0.65, fontSize: 12, fontWeight: '600' }}>
                  Categories, Designs, Stones & HSN Codes
                </Text>
              </View>
              <View style={[s.chevronContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : `${colors.vjAccent}10`, borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : `${colors.vjAccent}25` }]}>
                <ChevronRight size={18} color={isDark ? '#E5E7EB' : colors.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* SECTION 1: STOCK OPERATIONS & WORKFLOW */}
        <View style={s.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#4F46E5' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Stock Operations
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : 'rgba(79, 70, 229, 0.10)', borderColor: 'rgba(79, 70, 229, 0.30)' }]}>
            <Package size={11} color="#4F46E5" />
            <Text style={[s.sectionBadgeText, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>
              REGISTERS
            </Text>
          </View>
        </View>

        <View style={s.menuGrid}>
          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Stock Ledger" 
            subtitle="Drill-Down View" 
            icon={<PackageSearch size={22} color="#4F46E5" />} 
            iconBg="rgba(79, 70, 229, 0.12)"
            borderColor="rgba(79, 70, 229, 0.28)"
            badgeText="ALL STOCKS"
            onPress={() => router.push('/inventory/drill-down')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Draft Items" 
            subtitle={draftCount > 0 ? `${draftCount} Pending Review` : "Pending Verification"} 
            icon={<ClipboardList size={22} color="#D97706" />} 
            iconBg={draftCount > 0 ? "rgba(245, 158, 11, 0.2)" : "rgba(217, 119, 6, 0.12)"}
            borderColor={draftCount > 0 ? "rgba(245, 158, 11, 0.55)" : "rgba(217, 119, 6, 0.28)"}
            badgeText={draftCount > 0 ? `${draftCount} PENDING` : "0 DRAFTS"}
            alertCount={draftCount}
            onPress={() => router.push('/inventory/drafts')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            testID="karigar-items-menu-tile"
            title="Items at Karigar" 
            subtitle={karigarCount > 0 ? `${karigarCount} in workshop` : "Artisan Tracking"} 
            icon={<Wrench size={22} color="#0284C7" />} 
            iconBg="rgba(2, 132, 199, 0.12)"
            borderColor="rgba(2, 132, 199, 0.28)"
            badgeText={karigarCount > 0 ? `${karigarCount} ACTIVE` : "WORKSHOP"}
            alertCount={karigarCount}
            onPress={() => router.push('/inventory/karigar-items')} 
          />
        </View>

        {/* SECTION 2: STOCK INWARD ENTRY */}
        <View style={[s.sectionHeaderRow, { marginTop: 28 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#059669' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Stock Inward Entry
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : 'rgba(5, 150, 105, 0.10)', borderColor: 'rgba(5, 150, 105, 0.30)' }]}>
            <PackagePlus size={11} color="#059669" />
            <Text style={[s.sectionBadgeText, { color: isDark ? '#6EE7B7' : '#047857' }]}>
              INTAKE
            </Text>
          </View>
        </View>

        <View style={s.menuGrid}>
          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Single Item Add" 
            subtitle="Detailed Entry" 
            icon={<PackagePlus size={22} color="#059669" />} 
            iconBg="rgba(5, 150, 105, 0.12)"
            borderColor="rgba(5, 150, 105, 0.28)"
            badgeText="1-BY-1"
            onPress={() => router.push('/inventory/add-stock')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Bulk Add Matrix" 
            subtitle="Rapid Batch Entry" 
            icon={<Layers size={22} color="#7C3AED" />} 
            iconBg="rgba(124, 58, 237, 0.12)"
            borderColor="rgba(124, 58, 237, 0.28)"
            badgeText="BATCH"
            onPress={() => router.push('/inventory/bulk-add')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Loose Stock Add" 
            subtitle="Pooled Weight Lot" 
            icon={<Boxes size={22} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.28)"
            badgeText="POOLED"
            onPress={() => router.push('/inventory/add-loose-stock')} 
          />
        </View>

        {/* SECTION 3: PROCUREMENT, SCRAP & GEMSTONES */}
        <View style={[s.sectionHeaderRow, { marginTop: 28 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={[s.sectionHeaderDiamond, { backgroundColor: '#E11D48' }]} />
            <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
              Procurement, Scrap & Stones
            </Text>
          </View>
          <View style={[s.sectionBadge, { backgroundColor: isDark ? 'rgba(225, 29, 72, 0.15)' : 'rgba(225, 29, 72, 0.10)', borderColor: 'rgba(225, 29, 72, 0.30)' }]}>
            <Coins size={11} color="#E11D48" />
            <Text style={[s.sectionBadgeText, { color: isDark ? '#FDA4AF' : '#BE123C' }]}>
              VALUABLES
            </Text>
          </View>
        </View>

        <View style={[s.menuGrid, { marginBottom: 32 }]}>
          <MenuTile 
            containerStyle={tileContainerStyle}
            title="URD Purchases" 
            subtitle="Customer Buying" 
            icon={<FileDown size={22} color="#E11D48" />} 
            iconBg="rgba(225, 29, 72, 0.12)"
            borderColor="rgba(225, 29, 72, 0.28)"
            badgeText="PURCHASES"
            onPress={() => router.push('/inventory/urd-purchases')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            testID="old-metal-lots-menu-tile"
            title="Old Metal Vault" 
            subtitle="Scrap & Melt Lots" 
            icon={<Coins size={22} color="#D97706" />} 
            iconBg="rgba(217, 119, 6, 0.12)"
            borderColor="rgba(217, 119, 6, 0.28)"
            badgeText="SCRAP LOTS"
            onPress={() => router.push('/inventory/old-metal-lots')} 
          />

          <MenuTile 
            containerStyle={tileContainerStyle}
            title="Gemstone Lots" 
            subtitle="Physical Intake" 
            icon={<Gem size={22} color="#0891B2" />} 
            iconBg="rgba(8, 145, 178, 0.12)"
            borderColor="rgba(8, 145, 178, 0.28)"
            badgeText="GEM LOTS"
            onPress={() => router.push('/inventory/gemstones')} 
          />
        </View>
      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionHeaderDiamond: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    paddingHorizontal: 7.5,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1.2,
  },
  searchIconContainer: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 12,
  },
  searchPlaceholderText: {
    fontWeight: '700',
    fontSize: 14.5,
  },
  searchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
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
    letterSpacing: 1.2,
  },
  masterIconContainer: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
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
    rowGap: 14,
  },
});