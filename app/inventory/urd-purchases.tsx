// app/inventory/urd-purchases.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { WebView } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/useFirmStore';
import { urdPurchaseRepository } from '../../repositories/urdPurchaseRepository';
import { firmRepository } from '../../repositories/firmRepository';
import { urdPurchaseService } from '../../services/urdPurchaseService';
import { getCurrencySymbol, formatWeightMg as formatWeight } from '../../utils/calculations';
import { FileDown, Plus, Scale, Banknote, ShieldAlert, CheckCircle, Printer, Trash2, Eye, X, Share2 } from 'lucide-react-native';
import type { URDPurchase } from '../../types/phase2.types';
import type { Firm } from '../../types/firm';
import { COLORS } from '../../constants/theme';

const FlashListAny: any = FlashList;

const formatCurrency = (paise: number) => getCurrencySymbol() + (paise / 100).toFixed(2);

export default function URDPurchasesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<URDPurchase[]>([]);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
      setData(results);
      const firmData = await firmRepository.getById(activeFirmId);
      setFirm(firmData);
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
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
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
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

  const handlePreviewBill = async (item: URDPurchase) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setPreviewTitle('URD Purchase Bill Preview');
    setPreviewHtml(null);
    setPreviewVisible(true);

    try {
      const html = await urdPurchaseService.generateURDPurchaseBill(item.id, activeFirmId);
      setPreviewHtml(html);
    } catch (error: any) {
      setPreviewVisible(false);
      Alert.alert('Preview Error', error.message);
    }
  };

  const handlePreviewDeclaration = async (item: URDPurchase) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setPreviewTitle('घोषणापत्र / शपथपत्र Preview');
    setPreviewHtml(null);
    setPreviewVisible(true);

    try {
      const html = await urdPurchaseService.generateURDCustomerDeclaration(item.id, activeFirmId);
      setPreviewHtml(html);
    } catch (error: any) {
      setPreviewVisible(false);
      Alert.alert('Preview Error', error.message);
    }
  };

  const handlePrintFromPreview = async () => {
    if (!previewHtml) return;
    try {
      await Print.printAsync({ html: previewHtml });
    } catch (error: any) {
      Alert.alert('Print Error', error.message);
    }
  };

  const handleShareFromPreview = async () => {
    if (!previewHtml) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml });
      await Sharing.shareAsync(uri);
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Entry',
      `Are you sure you want to delete draft purchase from ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!activeFirmId) return;
              await urdPurchaseService.deleteURDPurchase(id, activeFirmId);
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: URDPurchase }) => {
    const isConfirmed = item.status === 'CONFIRMED';
    const metalColor = item.metalType === 'GOLD' ? COLORS.gold : COLORS.silver;

    return (
      <GlassCard style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName} numberOfLines={1}>{item.customerName}</Text>
            {isConfirmed ? (
              <Text style={s.billNumber}>{item.urdNumber}</Text>
            ) : (
              <Text style={s.draftDate}>Draft — {item.purchaseDate}</Text>
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
            <View style={s.iconRow}><Scale size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Net Fine</Text></View>
            <Text style={s.detailValue}>{formatWeight(item.fineWeightMg)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={s.iconRow}><Banknote size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Total Payout</Text></View>
            <Text style={s.detailValue}>{formatCurrency(item.totalValuePaise)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={[s.metalPill, { borderColor: metalColor }]}><Text style={[s.metalPillText, { color: metalColor }]}>{item.metalType}</Text></View>
          </View>
        </View>

        <View style={s.cardActions}>
          <View style={s.actionRowMain}>
            {isConfirmed ? (
              <TouchableOpacity style={s.printBillBtn} onPress={() => handlePreviewBill(item)}>
                <Eye size={15} color={COLORS.vjText} />
                <Text style={s.printBillBtnText}>Preview & Print Bill</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.confirmBtn} onPress={() => handleConfirm(item.id, item.customerName)}>
                <CheckCircle size={15} color="#fff" />
                <Text style={s.confirmBtnText}>Confirm & Generate Bill</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.actionRowSub}>
            <TouchableOpacity style={s.declarationBtn} onPress={() => handlePreviewDeclaration(item)}>
              <Eye size={14} color="#C8860A" />
              <Text style={s.declarationBtnText}>Preview शपथपत्र (Declaration)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id, item.customerName)}>
              <Trash2 size={14} color={COLORS.danger} />
              <Text style={s.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
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
      <Text style={s.headerSubtitle}>Customer Old Gold Receipts & शपथपत्र</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
        ) : (
          <FlashListAny
            data={data}
            renderItem={renderItem}
            estimatedItemSize={180}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 160 }}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <FileDown size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No URD Purchases Yet</Text>
                <Text style={s.emptySubtitle}>Tap + to record an unrefined gold/silver purchase.</Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity
        style={[s.fab, { bottom: Math.max(insets.bottom + 24, 64) }]}
        onPress={() => router.push('/inventory/add-urd')}
        activeOpacity={0.85}
      >
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

      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={s.previewModalContainer}>
          <View style={s.previewHeader}>
            <Text style={s.previewHeaderTitle} numberOfLines={1}>{previewTitle}</Text>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} style={s.closeIconBtn}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            {previewHtml ? (
              <WebView
                source={{ html: previewHtml }}
                style={{ flex: 1 }}
                originWhitelist={['*']}
                scalesPageToFit={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={true}
                setBuiltInZoomControls={false}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator size="large" color="#8B2538" />
                <Text style={{ color: '#8B2538', fontWeight: '700', fontSize: 14 }}>Loading preview document...</Text>
              </View>
            )}
          </View>

          <View style={[s.previewFooter, { paddingBottom: Math.max(insets.bottom + 12, 16) }]}>
            <TouchableOpacity style={s.previewShareBtn} onPress={handleShareFromPreview}>
              <Share2 size={16} color={COLORS.vjText} />
              <Text style={s.previewShareBtnText}>Share PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.previewPrintBtn} onPress={handlePrintFromPreview}>
              <Printer size={16} color="#fff" />
              <Text style={s.previewPrintBtnText}>Print Full Document</Text>
            </TouchableOpacity>
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
  customerName: { fontSize: 16, fontWeight: '800', color: COLORS.vjText, maxWidth: 250, marginBottom: 2 },
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

  cardActions: { borderTopWidth: 1, borderTopColor: 'rgba(92,22,35,0.06)', paddingTop: 12, gap: 10 },
  actionRowMain: { flexDirection: 'row' },
  actionRowSub: { flexDirection: 'row', gap: 10 },
  printBillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  printBillBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.vjText },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.success },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  declarationBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(200,134,10,0.12)', borderWidth: 1, borderColor: 'rgba(200,134,10,0.3)' },
  declarationBtnText: { fontSize: 12, fontWeight: '800', color: '#C8860A' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  deleteBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.danger },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successModalContent: { backgroundColor: COLORS.vjBg, alignSelf: 'stretch', maxWidth: 400, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  successIconContainer: { marginBottom: 16, backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 50 },
  successTitle: { fontSize: 24, fontWeight: '800', color: COLORS.vjText, marginBottom: 8 },
  successSubtitle: { fontSize: 14, color: 'rgba(92,22,35,0.6)', textAlign: 'center', marginBottom: 24 },

  previewModalContainer: { flex: 1, backgroundColor: '#FCFBF8' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#8B2538', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16 },
  previewHeaderTitle: { color: '#FCFBF8', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 16 },
  closeIconBtn: { padding: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  previewFooter: { flexDirection: 'row', gap: 12, backgroundColor: '#FCFBF8', padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' },
  previewShareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(92,22,35,0.08)' },
  previewShareBtnText: { color: COLORS.vjText, fontWeight: '700', fontSize: 14 },
  previewPrintBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#D4AF37' },
  previewPrintBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
});