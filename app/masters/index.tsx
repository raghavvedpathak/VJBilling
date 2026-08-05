// app/masters/index.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, HeaderPill } from '../../components/ui/Glass';
import { Settings2, Layers, Tag, ChevronRight, Gem, ShieldCheck, LayoutGrid } from 'lucide-react-native';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { COLORS, getThemeColors } from '../../constants/theme';

export default function MastersIndexScreen() {
  const router = useRouter();
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const mastersHeaderPills = (
    <View className="flex-row items-center gap-2 flex-wrap mt-1">
      <HeaderPill icon={<LayoutGrid size={12} color={colors.vjBg} />} label="Catalog Masters" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="GST HSN Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Master Catalog" showBack headerContent={mastersHeaderPills}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 20, paddingBottom: 100 }}>
        <Text style={s.sectionTitle}>Inventory Structure</Text>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/masters/categories')}>
          <GlassCard style={s.tile}>
            <View style={s.tileContent}>
              <View style={s.iconWrapper}>
                <Layers size={24} color={COLORS.vjText} />
              </View>
              <View style={s.textWrapper}>
                <Text style={s.tileTitle}>Categories</Text>
                <Text style={s.tileSubtitle}>Manage gold and silver product categories</Text>
              </View>
              <ChevronRight size={20} color="#D4AF37" style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/masters/designs')}>
          <GlassCard style={s.tile}>
            <View style={s.tileContent}>
              <View style={s.iconWrapper}>
                <Tag size={24} color={COLORS.vjText} />
              </View>
              <View style={s.textWrapper}>
                <Text style={s.tileTitle}>Designs</Text>
                <Text style={s.tileSubtitle}>Manage design names under each category</Text>
              </View>
              <ChevronRight size={20} color="#D4AF37" style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        <Text style={s.sectionTitle}>Gemstones & Materials</Text>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/masters/stones')}>
          <GlassCard style={s.tile}>
            <View style={s.tileContent}>
              <View style={s.iconWrapper}>
                <Gem size={24} color={COLORS.vjText} />
              </View>
              <View style={s.textWrapper}>
                <Text style={s.tileTitle}>Stone Master</Text>
                <Text style={s.tileSubtitle}>Define diamond and precious stone types</Text>
              </View>
              <ChevronRight size={20} color="#D4AF37" style={{ opacity: 0.5 }} />
            </View>
          </GlassCard>
        </TouchableOpacity>

      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: {
    width: 52, height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg,
    fontSize: 28, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)',
    fontSize: 12, fontWeight: '600',
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  sectionTitle: {
    color: 'rgba(92,22,35,0.6)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
    marginTop: 8,
    marginLeft: 4,
  },
  tile: {
    padding: 0,
    marginBottom: 16,
  },
  tileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  iconWrapper: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  textWrapper: {
    flex: 1,
  },
  tileTitle: {
    color: COLORS.vjText,
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 2,
  },
  tileSubtitle: {
    color: 'rgba(92,22,35,0.6)',
    fontSize: 12,
  },
});