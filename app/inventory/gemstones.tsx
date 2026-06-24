// app/inventory/gemstones.tsx
import React, { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { gemstoneLotRepository } from '../../repositories/gemstoneLotRepository';
import { getCurrencySymbol } from '../../utils/currency';
import { Gem, Plus, Diamond, Banknote, ShieldAlert, CheckCircle } from 'lucide-react-native';
import type { GemstoneLot } from '../../types/phase2.types';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
  success: '#10B981',
  error: '#EF4444',
};

const formatCarats = (caratsX100: number) => (caratsX100 / 100).toFixed(2) + ' ct';
const formatCurrency = (paise: number | null) => paise === null ? '—' : getCurrencySymbol() + (paise / 100).toFixed(2);

const LotRow = memo(({ item }: { item: GemstoneLot }) => {
  const isAvailable = item.status === 'AVAILABLE';

  return (
    <GlassCard style={s.card}>
      <View style={s.cardTop}>
        <View>
          <Text style={s.lotName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.supplierName}>{item.supplierName || 'Unknown Supplier'}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: isAvailable ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
          {isAvailable ? <CheckCircle size={12} color={COLORS.success} /> : <ShieldAlert size={12} color={COLORS.error} />}
          <Text style={[s.statusText, { color: isAvailable ? COLORS.success : COLORS.error }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={s.cardMiddle}>
        <View style={s.detailCol}>
          <View style={s.iconRow}><Diamond size={14} color="rgba(46,29,0,0.4)" /><Text style={s.detailLabel}>Weight</Text></View>
          <Text style={s.detailValue}>{formatCarats(item.weightCaratX100)}</Text>
        </View>
        
        <View style={s.detailCol}>
          <View style={s.iconRow}><Text style={s.detailLabel}>Qty</Text></View>
          <Text style={s.detailValue}>{item.quantity} pcs</Text>
        </View>

        <View style={s.detailCol}>
          <View style={s.iconRow}><Banknote size={14} color="rgba(46,29,0,0.4)" /><Text style={s.detailLabel}>Total Value</Text></View>
          <Text style={s.detailValue}>{formatCurrency(item.totalPurchaseAmountPaise)}</Text>
        </View>
      </View>
      
      {item.certificationRef && (
        <View style={s.certRow}>
          <Text style={s.certLabel}>Cert Ref:</Text>
          <Text style={s.certValue} selectable>{item.certificationRef}</Text>
        </View>
      )}
    </GlassCard>
  );
});

export default function GemstonesInventoryScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<GemstoneLot[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const results = await gemstoneLotRepository.findByFirmId(activeFirmId);
          // Sort newest first
          if (active) setData(results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        } catch (e) {
          console.error(e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId])
  );

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}><Gem size={28} color={COLORS.vjBg} /></View>
      </View>
      <Text style={s.headerTitle}>Gemstone Inventory</Text>
      <Text style={s.headerSubtitle}>Loose Diamonds & Precious Stones</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LotRow item={item} />}
            // @ts-ignore
            estimatedItemSize={140}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Gem size={48} color="rgba(46,29,0,0.2)" />
                <Text style={s.emptyTitle}>No Gemstones Found</Text>
                <Text style={s.emptySubtitle}>Tap the + button to add a new physical lot.</Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity style={s.fab} onPress={() => router.push('/inventory/add-gemstone')} activeOpacity={0.8}>
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(250,243,224,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(46,29,0,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(46,29,0,0.35)', fontSize: 13 },
  fab: { position: 'absolute', bottom: 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.vjAccent, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  
  card: { padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  lotName: { fontSize: 16, fontWeight: '800', color: COLORS.vjText, maxWidth: '75%', marginBottom: 2 },
  supplierName: { fontSize: 12, color: 'rgba(46,29,0,0.5)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(46,29,0,0.03)', padding: 12, borderRadius: 12 },
  detailCol: { gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 11, color: 'rgba(46,29,0,0.5)', fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, fontWeight: '700', color: COLORS.vjText, fontFamily: 'monospace' },
  
  certRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(46,29,0,0.06)' },
  certLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(46,29,0,0.4)', textTransform: 'uppercase' },
  certValue: { fontSize: 12, fontWeight: '600', color: COLORS.vjAccent, fontFamily: 'monospace' },
});