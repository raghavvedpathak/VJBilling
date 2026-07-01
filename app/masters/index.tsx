// app/masters/index.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard } from '../../components/ui/Glass';
import { Settings2, Layers, Tag, ChevronRight, Gem } from 'lucide-react-native';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
};

export default function MastersIndexScreen() {
  const router = useRouter();

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Settings2 size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>Metal Master</Text>
      <Text style={s.headerSubtitle}>Manage Core Entities</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 100 }}>
        <Text style={s.sectionTitle}>Inventory Structure</Text>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/masters/categories')}>
          <GlassCard style={s.tile}>
            <View style={s.tileContent}>
              <View style={s.iconWrapper}>
                <Layers size={24} color="#5C1623" />
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
                <Tag size={24} color="#5C1623" />
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
                <Gem size={24} color="#5C1623" />
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