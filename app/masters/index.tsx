// app/masters/index.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, HeaderPill } from '../../components/ui/Glass';
import { Layers, Tag, ChevronRight, Gem, ShieldCheck, LayoutGrid } from 'lucide-react-native';
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
        
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 ml-1">
          Inventory Structure
        </Text>

        {/* Categories Master Tile */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/masters/categories');
          }}
          className="mb-4"
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(5, 150, 105, 0.25)' }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="p-3 rounded-2xl border border-black/5 items-center justify-center" style={{ backgroundColor: 'rgba(5, 150, 105, 0.12)' }}>
                <Layers size={24} color="#059669" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-0.5">
                  <Text className="text-vj-text font-black text-lg">Categories</Text>
                  <View className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Text className="text-[8px] font-black text-emerald-800 uppercase tracking-wider">PRODUCT CATS</Text>
                  </View>
                </View>
                <Text className="text-vj-text/60 text-xs font-semibold">
                  Manage gold and silver product categories
                </Text>
              </View>
              <View className="p-2 bg-vj-text/5 rounded-full border border-vj-text/10">
                <ChevronRight size={18} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Designs Master Tile */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/masters/designs');
          }}
          className="mb-4"
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(124, 58, 237, 0.25)' }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="p-3 rounded-2xl border border-black/5 items-center justify-center" style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)' }}>
                <Tag size={24} color="#7C3AED" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-0.5">
                  <Text className="text-vj-text font-black text-lg">Designs</Text>
                  <View className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                    <Text className="text-[8px] font-black text-purple-800 uppercase tracking-wider">DESIGN MATRIX</Text>
                  </View>
                </View>
                <Text className="text-vj-text/60 text-xs font-semibold">
                  Manage design names under each category
                </Text>
              </View>
              <View className="p-2 bg-vj-text/5 rounded-full border border-vj-text/10">
                <ChevronRight size={18} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-4 mt-4 ml-1">
          Gemstones & Materials
        </Text>

        {/* Stone Master Tile */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/masters/stones');
          }}
          className="mb-4"
        >
          <GlassCard style={{ padding: 0, borderColor: 'rgba(8, 145, 178, 0.25)' }}>
            <View className="flex-row items-center gap-4 p-4">
              <View className="p-3 rounded-2xl border border-black/5 items-center justify-center" style={{ backgroundColor: 'rgba(8, 145, 178, 0.12)' }}>
                <Gem size={24} color="#0891B2" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-0.5">
                  <Text className="text-vj-text font-black text-lg">Stone Master</Text>
                  <View className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                    <Text className="text-[8px] font-black text-cyan-800 uppercase tracking-wider">GEMSTONES</Text>
                  </View>
                </View>
                <Text className="text-vj-text/60 text-xs font-semibold">
                  Define diamond and precious stone types
                </Text>
              </View>
              <View className="p-2 bg-vj-text/5 rounded-full border border-vj-text/10">
                <ChevronRight size={18} color={COLORS.vjText} />
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>

      </ScrollView>
    </TwoToneWrapper>
  );
}