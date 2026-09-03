// app/masters/index.tsx — Phase 2 v2.24 Canonical Screen

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, HeaderPill } from '@/components/ui/Glass';
import { Layers, Tag, ChevronRight, Gem, ShieldCheck, LayoutGrid } from 'lucide-react-native';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function MastersIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const mastersHeaderPills = (
    <View style={s.headerPillsContainer}>
      <HeaderPill icon={<LayoutGrid size={12} color={colors.vjBg} />} label="Catalog Masters" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="HSN Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Master Catalog" showBack headerContent={mastersHeaderPills}>
      <ScrollView 
        style={{ flex: 1 }} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ 
          paddingTop: 20, 
          paddingBottom: Math.max(insets.bottom + 24, 40) 
        }}
      >
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Inventory Structure
        </Text>

        {/* Categories Master Tile */}
        <TouchableOpacity 
          testID="masters-categories-tile"
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/masters/categories');
          }}
          style={{ marginBottom: 16 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(5, 150, 105, 0.25)' }}>
            <View style={s.cardInner}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(5, 150, 105, 0.12)' }]}>
                <Layers size={24} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.cardTitle, { color: colors.vjText }]}>Categories</Text>
                  <View style={s.badgeEmerald}>
                    <Text style={s.badgeEmeraldText}>PRODUCT CATS</Text>
                  </View>
                </View>
                <Text style={[s.cardSubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Manage gold and silver product categories
                </Text>
              </View>
              <View style={[s.chevronBox, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}25` }]}>
                <ChevronRight size={18} color={colors.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Designs Master Tile */}
        <TouchableOpacity 
          testID="masters-designs-tile"
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/masters/designs');
          }}
          style={{ marginBottom: 16 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(124, 58, 237, 0.25)' }}>
            <View style={s.cardInner}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(124, 58, 237, 0.12)' }]}>
                <Tag size={24} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.cardTitle, { color: colors.vjText }]}>Designs</Text>
                  <View style={s.badgePurple}>
                    <Text style={s.badgePurpleText}>DESIGN MATRIX</Text>
                  </View>
                </View>
                <Text style={[s.cardSubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Manage design names under each category
                </Text>
              </View>
              <View style={[s.chevronBox, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}25` }]}>
                <ChevronRight size={18} color={colors.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6, marginTop: 8 }]}>
          Gemstones & Materials
        </Text>

        {/* Stone Master Tile */}
        <TouchableOpacity 
          testID="masters-stones-tile"
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/masters/stones');
          }}
          style={{ marginBottom: 16 }}
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(8, 145, 178, 0.25)' }}>
            <View style={s.cardInner}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(8, 145, 178, 0.12)' }]}>
                <Gem size={24} color="#0891B2" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.cardTitle, { color: colors.vjText }]}>Stone Master</Text>
                  <View style={s.badgeCyan}>
                    <Text style={s.badgeCyanText}>GEMSTONES</Text>
                  </View>
                </View>
                <Text style={[s.cardSubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Define diamond and precious stone types
                </Text>
              </View>
              <View style={[s.chevronBox, { backgroundColor: `${colors.vjAccent}10`, borderColor: `${colors.vjAccent}25` }]}>
                <ChevronRight size={18} color={colors.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>
      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 14,
    marginLeft: 4,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: {
    fontWeight: '900',
    fontSize: 18,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  chevronBox: {
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeEmerald: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  badgeEmeraldText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgePurple: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
  },
  badgePurpleText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#6D28D9',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeCyan: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 145, 178, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(8, 145, 178, 0.25)',
  },
  badgeCyanText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#0E7490',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});