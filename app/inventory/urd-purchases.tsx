// app/inventory/urd-purchases.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { WebView } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { urdPurchaseService } from '@/services/phase2/urdPurchaseService';
import { formatRupees, formatWeightMg as formatWeight } from '@/utils/calculations';
import { FileDown, Plus, Scale, Banknote, ShieldAlert, CheckCircle, Printer, Trash2, Eye, X, Share2, Edit3, Sparkles } from 'lucide-react-native';
import type { URDPurchase } from '@/types/phase2/phase2.types';
import type { Firm } from '@/types/phase1/firm';
import { COLORS, getThemeColors } from '@/constants/theme';

interface URDRowProps {
  item: URDPurchase;
  colors: ReturnType<typeof getThemeColors>;
  onConfirm: (id: string, name: string) => void;
  onPreviewBill: (item: URDPurchase) => void;
  onPreviewDeclaration: (item: URDPurchase) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

const URDPurchaseRow = memo(({
  item,
  colors,
  onConfirm,
  onPreviewBill,
  onPreviewDeclaration,
  onEdit,
  onDelete,
}: URDRowProps) => {
  const isConfirmed = item.status === 'CONFIRMED';
  const metalColor = item.metalType === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;

  return (
    <GlassCard testID={`urd-purchase-card-${item.id}`} style={[s.card, { borderColor: `${colors.vjAccent}25` }]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.customerName, { color: colors.vjText }]} numberOfLines={1}>{item.customerName}</Text>
          {isConfirmed ? (
            <Text style={[s.billNumber, { color: colors.vjAccent }]}>{item.urdNumber}</Text>
          ) : (
            <Text style={[s.draftDate, { color: colors.vjText, opacity: 0.55 }]}>Draft — {item.purchaseDate}</Text>
          )}
        </View>

        <View 
          style={[
            s.statusBadge, 
            { 
              backgroundColor: isConfirmed ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
              borderColor: isConfirmed ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
            }
          ]}
        >
          {isConfirmed ? (
            <CheckCircle size={12} color="#10B981" />
          ) : (
            <ShieldAlert size={12} color="#F59E0B" />
          )}
          <Text style={[s.statusText, { color: isConfirmed ? '#047857' : '#D97706' }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={[s.cardMiddle, { backgroundColor: `${colors.vjAccent}08` }]}>
        <View style={s.detailCol}>
          <View style={s.iconRow}>
            <Scale size={13} color={colors.vjAccent} style={{ opacity: 0.7 }} />
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Fine Wt</Text>
          </View>
          <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(item.fineWeightMg)}</Text>
        </View>
        <View style={s.detailCol}>
          <View style={s.iconRow}>
            <Banknote size={13} color={colors.vjAccent} style={{ opacity: 0.7 }} />
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Payout</Text>
          </View>
          <Text style={[s.detailValue, { color: colors.vjAccent }]}>{formatRupees(item.totalValuePaise)}</Text>
        </View>
        <View style={s.detailCol}>
          <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{item.metalType}</Text>
          </View>
        </View>
      </View>

      <View style={[s.cardActions, { borderTopColor: `${colors.vjAccent}15` }]}>
        <View style={s.actionRowMain}>
          {isConfirmed ? (
            <TouchableOpacity 
              testID={`preview-bill-btn-${item.id}`}
              style={[s.printBillBtn, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]} 
              onPress={() => onPreviewBill(item)}
            >
              <Eye size={15} color={colors.vjText} />
              <Text style={[s.printBillBtnText, { color: colors.vjText }]}>Preview & Print Bill</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              testID={`confirm-urd-btn-${item.id}`}
              style={s.confirmBtn} 
              onPress={() => onConfirm(item.id, item.customerName)}
            >
              <CheckCircle size={15} color="#fff" />
              <Text style={s.confirmBtnText}>Confirm & Generate Bill</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.actionRowSub}>
          {!isConfirmed && (
            <TouchableOpacity 
              testID={`preview-draft-bill-btn-${item.id}`}
              style={[s.printBillBtn, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]} 
              onPress={() => onPreviewBill(item)}
            >
              <Eye size={14} color={colors.vjText} />
              <Text style={[s.printBillBtnText, { color: colors.vjText }]}>Bill</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            testID={`preview-declaration-btn-${item.id}`}
            style={[s.declarationBtn, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}30` }]} 
            onPress={() => onPreviewDeclaration(item)}
          >
            <Eye size={14} color={colors.vjAccent} />
            <Text style={[s.declarationBtnText, { color: colors.vjAccent }]}>शपथपत्र</Text>
          </TouchableOpacity>

          {!isConfirmed && (
            <TouchableOpacity
              testID={`edit-urd-btn-${item.id}`}
              style={[s.editDraftBtn, { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}30` }]}
              onPress={() => onEdit(item.id)}
            >
              <Edit3 size={14} color={colors.vjText} />
              <Text style={[s.editDraftBtnText, { color: colors.vjText }]}>Edit</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            testID={`delete-urd-btn-${item.id}`}
            style={s.deleteBtn} 
            onPress={() => onDelete(item.id, item.customerName)}
          >
            <Trash2 size={14} color={COLORS.danger} />
            <Text style={s.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassCard>
  );
});

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

  const [selectedItem, setSelectedItem] = useState<URDPurchase | null>(null);
  const [previewType, setPreviewType] = useState<'BILL' | 'DECLARATION'>('BILL');
  const [selectedTemplate, setSelectedTemplate] = useState<'template1' | 'template2'>('template1');

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
      setData(results || []);
      const firmData = await firmRepository.getById(activeFirmId);
      setFirm(firmData);
    } catch (e) {
      console.error('[URDPurchasesScreen] loadData failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchCurrent = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
          if (active) setData(results || []);
          const firmData = await firmRepository.getById(activeFirmId);
          if (active) setFirm(firmData);
        } catch (e) {
          console.error('[URDPurchasesScreen] fetchCurrent failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      fetchCurrent();
      return () => {
        active = false;
      };
    }, [activeFirmId])
  );

  const handleConfirm = useCallback((id: string, name: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
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
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              await urdPurchaseService.confirmURDPurchase(id, activeFirmId);
              setSuccessMessage('Purchase confirmed. Bill number generated.');
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to confirm purchase.');
            }
          }
        }
      ]
    );
  }, [activeFirmId, loadData]);

  const loadDeclarationPreview = useCallback(async (item: URDPurchase, tId: 'template1' | 'template2') => {
    if (!activeFirmId) return;
    setPreviewHtml(null);
    try {
      const html = await urdPurchaseService.generateURDCustomerDeclaration(item.id, activeFirmId, tId);
      setPreviewHtml(html);
    } catch (error: any) {
      Alert.alert('Preview Error', error.message || 'Failed to load declaration preview.');
    }
  }, [activeFirmId]);

  const handlePreviewBill = useCallback(async (item: URDPurchase) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedItem(item);
    setPreviewType('BILL');
    setPreviewTitle('URD Purchase Bill Preview');
    setPreviewHtml(null);
    setPreviewVisible(true);

    try {
      const html = await urdPurchaseService.generateURDPurchaseBill(item.id, activeFirmId);
      setPreviewHtml(html);
    } catch (error: any) {
      setPreviewVisible(false);
      Alert.alert('Preview Error', error.message || 'Failed to generate bill preview.');
    }
  }, [activeFirmId]);

  const handlePreviewDeclaration = useCallback(async (item: URDPurchase, tId: 'template1' | 'template2' = 'template1') => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedItem(item);
    setPreviewType('DECLARATION');
    setSelectedTemplate(tId);
    setPreviewTitle('घोषणापत्र / शपथपत्र Preview');
    setPreviewHtml(null);
    setPreviewVisible(true);

    await loadDeclarationPreview(item, tId);
  }, [activeFirmId, loadDeclarationPreview]);

  const handleSwitchTemplate = useCallback(async (tId: 'template1' | 'template2') => {
    if (!selectedItem || tId === selectedTemplate) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedTemplate(tId);
    await loadDeclarationPreview(selectedItem, tId);
  }, [selectedItem, selectedTemplate, loadDeclarationPreview]);

  const handlePrintFromPreview = async () => {
    if (!previewHtml) return;
    try {
      await Print.printAsync({ html: previewHtml });
    } catch (error: any) {
      Alert.alert('Print Error', error.message || 'Failed to print document.');
    }
  };

  const handleShareFromPreview = async () => {
    if (!previewHtml) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml });
      await Sharing.shareAsync(uri);
    } catch (error: any) {
      Alert.alert('Share Error', error.message || 'Failed to share document.');
    }
  };

  const handleEdit = useCallback((id: string) => {
    router.push({ pathname: '/inventory/edit-urd', params: { urdId: id } });
  }, [router]);

  const handleDelete = useCallback((id: string, name: string) => {
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
              Alert.alert('Error', error.message || 'Failed to delete draft purchase.');
            }
          }
        }
      ]
    );
  }, [activeFirmId, loadData]);

  const { totalFineWeightMg, totalPayoutPaise } = useMemo(() => {
    let fineMg = 0;
    let payoutPaise = 0;
    data.forEach((p) => {
      fineMg += p.fineWeightMg || 0;
      payoutPaise += p.totalValuePaise || 0;
    });
    return { totalFineWeightMg: fineMg, totalPayoutPaise: payoutPaise };
  }, [data]);

  const urdHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<FileDown size={12} color={colors.vjBg} />} label={`${data.length} Purchases`} />
      <HeaderPill icon={<Scale size={12} color={colors.vjBg} />} label={`Fine: ${formatWeight(totalFineWeightMg)}`} />
      <HeaderPill icon={<Banknote size={12} color="#4ADE80" />} label={`Payout: ${formatRupees(totalPayoutPaise)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="URD Purchases" showBack headerContent={urdHeaderPills}>
      <View style={s.listContainer}>
        {loading && data.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading URD purchases...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <URDPurchaseRow
                item={item}
                colors={colors}
                onConfirm={handleConfirm}
                onPreviewBill={handlePreviewBill}
                onPreviewDeclaration={handlePreviewDeclaration}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={190}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 24,
              paddingBottom: Math.max(insets.bottom + 120, 140),
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <FileDown size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No URD Purchases Yet</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  Tap + to record an unrefined gold/silver purchase from a customer.
                </Text>
              </View>
            }
          />
        )}
      </View>

      <TouchableOpacity
        testID="urd-fab-add"
        style={[s.fab, { backgroundColor: colors.vjAccent, bottom: Math.max(insets.bottom + 24, 40) }]}
        onPress={() => router.push('/inventory/add-urd')}
        activeOpacity={0.85}
      >
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Success Modal with Backdrop Tap-to-Dismiss */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => setSuccessMessage(null)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Success!</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{successMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={() => setSuccessMessage(null)} 
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Preview Modal for Bill & Declaration */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={[s.previewModalContainer, { backgroundColor: colors.vjBg }]}>
          <View style={[s.previewHeader, { backgroundColor: colors.vjAccent, paddingTop: Math.max(insets.top + 12, 44) }]}>
            <Text style={s.previewHeaderTitle} numberOfLines={1}>{previewTitle}</Text>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} style={s.closeIconBtn}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {previewType === 'DECLARATION' && (
            <View style={[s.templateBar, { backgroundColor: `${colors.vjAccent}EE` }]}>
              <Text style={s.templateBarLabel}>Format / Language:</Text>
              <View style={s.templateSegmentGroup}>
                <TouchableOpacity
                  style={[s.templateSegmentBtn, selectedTemplate === 'template1' && [s.templateSegmentBtnActive, { backgroundColor: colors.vjText }]]}
                  onPress={() => handleSwitchTemplate('template1')}
                >
                  <Text style={[s.templateSegmentText, selectedTemplate === 'template1' && s.templateSegmentTextActive]}>
                    Marathi (मराठी)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.templateSegmentBtn, selectedTemplate === 'template2' && [s.templateSegmentBtnActive, { backgroundColor: colors.vjText }]]}
                  onPress={() => handleSwitchTemplate('template2')}
                >
                  <Text style={[s.templateSegmentText, selectedTemplate === 'template2' && s.templateSegmentTextActive]}>
                    English (Affidavit)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                <ActivityIndicator size="large" color={colors.vjAccent} />
                <Text style={{ color: colors.vjText, fontWeight: '700', fontSize: 14 }}>Loading preview document...</Text>
              </View>
            )}
          </View>

          <View style={[s.previewFooter, { paddingBottom: Math.max(insets.bottom + 12, 16), borderTopColor: `${colors.vjAccent}20` }]}>
            <TouchableOpacity style={[s.previewShareBtn, { backgroundColor: `${colors.vjAccent}14` }]} onPress={handleShareFromPreview}>
              <Share2 size={16} color={colors.vjText} />
              <Text style={[s.previewShareBtnText, { color: colors.vjText }]}>Share PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.previewPrintBtn, { backgroundColor: colors.vjAccent }]} onPress={handlePrintFromPreview}>
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
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  fab: { 
    position: 'absolute', 
    right: 24, 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 6, 
    elevation: 8 
  },
  
  card: { padding: 16, marginBottom: 12, borderRadius: 18, borderWidth: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  customerName: { fontSize: 16, fontWeight: '800', maxWidth: 250, marginBottom: 2 },
  billNumber: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },
  draftDate: { fontSize: 12, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 12 },
  detailCol: { gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
  detailValue: { fontSize: 13.5, fontWeight: '800', fontFamily: 'monospace' },
  metalPill: { paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  cardActions: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  actionRowMain: { flexDirection: 'row' },
  actionRowSub: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  printBillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  printBillBtnText: { fontSize: 13, fontWeight: '800' },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.success },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  declarationBtn: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  declarationBtnText: { fontSize: 12, fontWeight: '800' },
  editDraftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  editDraftBtnText: { fontSize: 12, fontWeight: '800' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  deleteBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.danger },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successModalContent: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  successIconContainer: { marginBottom: 16, backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 50 },
  successTitle: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  successSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, opacity: 0.7 },

  previewModalContainer: { flex: 1 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  previewHeaderTitle: { color: '#FCFBF8', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 16 },
  closeIconBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  templateBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  templateBarLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  templateSegmentGroup: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 3, gap: 4 },
  templateSegmentBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  templateSegmentBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  templateSegmentText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  templateSegmentTextActive: { color: '#ffffff', fontWeight: '800' },
  previewFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  previewShareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  previewShareBtnText: { fontWeight: '700', fontSize: 14 },
  previewPrintBtn: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  previewPrintBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 40 },
  loadingText: { fontSize: 14, fontWeight: '600' },
});