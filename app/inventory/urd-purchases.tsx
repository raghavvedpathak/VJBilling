// app/inventory/urd-purchases.tsx
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; // Auto-generates PDF/Print dialogs from HTML
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { urdPurchaseRepository } from '../../repositories/urdPurchaseRepository';
import { urdPurchaseService } from '../../services/urdPurchaseService';
import { getCurrencySymbol } from '../../utils/currency';
import { FileDown, Plus, Scale, Banknote, ShieldAlert, CheckCircle, Printer } from 'lucide-react-native';
import type { URDPurchase } from '../../types/phase2.types';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
};

const formatWeight = (mg: number) => (mg / 1000).toFixed(3) + ' g';
const formatCurrency = (paise: number) => getCurrencySymbol() + (paise / 100).toFixed(2);

export default function URDPurchasesScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<URDPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
      setData(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleConfirm = (id: string, name: string) => {
    Alert.alert(
      'Confirm Purchase',
      `Are you sure you want to finalize the purchase from ${name}? This will generate a permanent URD bill number.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              if (!activeFirmId) return;
              await urdPurchaseService.confirmURDPurchase(id, activeFirmId);
              setSuccessMessage('Purchase confirmed. Bill number generated.');
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const handlePrint = async (id: string) => {
    try {
      if (!activeFirmId) return;
      const html = await urdPurchaseService.generateURDPurchaseBill(id, activeFirmId);
      await Print.printAsync({ html });
    } catch (error: any) {
      Alert.alert('Print Error', error.message);
    }
  };

  const renderItem = ({ item }: { item: URDPurchase }) => {
    const isConfirmed = item.status === 'CONFIRMED';
    const metalColor = item.metalType === 'GOLD' ? COLORS.gold : COLORS.silver;

    return (
      <GlassCard style={s.card}>
        <View style={s.cardTop}>
          <View>
            <Text style={s.customerName} numberOfLines={1}>{item.customerName}</Text>
            {isConfirmed ? (
              <Text style={s.billNumber}>{item.urdNumber}</Text>
            ) : (
              <Text style={s.draftDate}>{item.purchaseDate}</Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: isConfirmed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }]}>
            {isConfirmed ? <CheckCircle size={12} color={COLORS.success} /> : <ShieldAlert size={12} color={COLORS.warning} />}
            <Text style={[s.statusText, { color: isConfirmed ? COLORS.success : COLORS.warning }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={s.cardMiddle}>
          <View style={s.detailCol}>
            <View style={s.iconRow}><Scale size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Net</Text></View>
            <Text style={s.detailValue}>{formatWeight(item.fineWeightMg)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={s.iconRow}><Banknote size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Total</Text></View>
            <Text style={s.detailValue}>{formatCurrency(item.totalValuePaise)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={[s.metalPill, { borderColor: metalColor }]}><Text style={[s.metalPillText, { color: metalColor }]}>{item.metalType}</Text></View>
          </View>
        </View>

        <View style={s.cardActions}>
          {isConfirmed ? (
            <TouchableOpacity style={s.actionBtn} onPress={() => handlePrint(item.id)}>
              <Printer size={16} color={COLORS.vjText} />
              <Text style={s.actionText}>Print Bill</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.actionBtn, s.confirmBtn]} onPress={() => handleConfirm(item.id, item.customerName)}>
              <CheckCircle size={16} color="#fff" />
              <Text style={[s.actionText, { color: '#fff' }]}>Confirm & Generate Bill</Text>
            </TouchableOpacity>
          )}
        </View>
      </GlassCard>
    );
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}><FileDown size={28} color={COLORS.vjBg} /></View>
      </View>
      <Text style={s.headerTitle}>URD Purchases</Text>
      <Text style={s.headerSubtitle}>Customer Old Gold Receipts</Text>
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
            renderItem={renderItem}
            // @ts-ignore: estimatedItemSize required by spec even if missing from standard local FlashList type signatures
            estimatedItemSize={140}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <FileDown size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No URD Bills</Text>
                <Text style={s.emptySubtitle}>Purchase gold from a customer to start.</Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity style={s.fab} onPress={() => router.push('/inventory/add-urd')} activeOpacity={0.8}>
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Success!</Text>
            <Text style={s.successSubtitle}>{successMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={() => setSuccessMessage(null)} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
  fab: { position: 'absolute', bottom: 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.vjAccent, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  
  card: { padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  customerName: { fontSize: 16, fontWeight: '800', color: COLORS.vjText, maxWidth: '75%', marginBottom: 2 },
  billNumber: { fontSize: 13, fontWeight: '700', color: COLORS.vjAccent, fontFamily: 'monospace' },
  draftDate: { fontSize: 12, color: 'rgba(92,22,35,0.5)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(92,22,35,0.03)', padding: 12, borderRadius: 12, marginBottom: 12 },
  detailCol: { gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 11, color: 'rgba(92,22,35,0.5)', fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, fontWeight: '700', color: COLORS.vjText },
  metalPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  cardActions: { borderTopWidth: 1, borderTopColor: 'rgba(92,22,35,0.06)', paddingTop: 12, alignItems: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: 'rgba(92,22,35,0.05)' },
  confirmBtn: { backgroundColor: COLORS.success },
  actionText: {
    textAlign: 'center', fontSize: 13, fontWeight: '700', color: COLORS.vjText },
  
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: COLORS.vjBg,
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 16,
    borderRadius: 50,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});