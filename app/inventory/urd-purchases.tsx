// app/inventory/urd-purchases.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { WebView } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill, FixedGlassBar } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { urdPurchaseRepository } from '@/repositories/phase2/urdPurchaseRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { urdPurchaseService } from '@/services/phase2/urdPurchaseService';
import { formatRupees, formatWeightMg as formatWeight, formatKaratBadge } from '@/utils/calculations';
import { FileDown, Plus, Scale, Banknote, ShieldAlert, CheckCircle, Printer, Trash2, Eye, X, Share2, Edit3, Sparkles, ChevronRight, ShieldCheck } from 'lucide-react-native';
import type { URDPurchase } from '@/types/phase2/phase2.types';
import type { Firm } from '@/types/phase1/firm';
import { 
  getFirmURDBillTemplateId, 
  getFirmURDDeclarationTemplateId, 
  setFirmURDDeclarationTemplateId, 
  URD_PRINT_FORMATS,
  type URDDeclarationTemplateId, 
  type URDBillTemplateId 
} from '@/templates/urd';
import { COLORS, getThemeColors } from '@/constants/theme';

interface URDRowProps {
  item: URDPurchase;
  colors: ReturnType<typeof getThemeColors>;
  isSelected: boolean;
  isTablet: boolean;
  onSelect: (item: URDPurchase) => void;
}

const URDPurchaseRow = memo(({
  item,
  colors,
  isSelected,
  isTablet,
  onSelect,
}: URDRowProps) => {
  const isConfirmed = item.status === 'CONFIRMED';
  const metalColor = item.metalType === 'GOLD' ? COLORS.bullionGold : COLORS.bullionSilver;
  const karatBadge = formatKaratBadge(item.purityPercent, item.metalType as 'GOLD' | 'SILVER');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onSelect(item)}
      testID={`urd-purchase-card-${item.id}`}
      style={{ marginBottom: isTablet ? 16 : 12 }}
    >
      <GlassCard 
        style={[
          s.card, 
          { 
            borderColor: isSelected ? colors.vjAccent : `${colors.vjAccent}25`,
            borderWidth: isSelected ? 1.8 : 1,
            backgroundColor: isSelected ? 'rgba(212, 175, 55, 0.08)' : undefined,
            padding: isTablet ? 20 : 14,
          }
        ]}
      >
        <View style={s.cardTop}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
              <Text style={[s.customerName, { color: colors.vjText, fontSize: isTablet ? 17.5 : 15.5 }]} numberOfLines={1}>
                {item.customerName}
              </Text>
              {isSelected && (
                <View style={[s.selectedChip, { backgroundColor: `${colors.vjAccent}22`, borderColor: colors.vjAccent }]}>
                  <Sparkles size={10} color={colors.vjAccent} />
                  <Text style={[s.selectedChipText, { color: colors.vjAccent }]}>SELECTED</Text>
                </View>
              )}
            </View>
            {isConfirmed ? (
              <Text style={[s.billNumber, { color: colors.vjAccent, fontSize: isTablet ? 14 : 12.5 }]}>{item.urdNumber}</Text>
            ) : (
              <Text style={[s.draftDate, { color: colors.vjText, opacity: 0.55, fontSize: isTablet ? 13 : 11.5 }]}>Draft — {item.purchaseDate}</Text>
            )}
          </View>

          <View 
            style={[
              s.statusBadge, 
              { 
                backgroundColor: isConfirmed ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                borderColor: isConfirmed ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
                paddingHorizontal: isTablet ? 10 : 8,
                paddingVertical: isTablet ? 4.5 : 3,
              }
            ]}
          >
            {isConfirmed ? (
              <CheckCircle size={isTablet ? 13 : 11.5} color="#10B981" />
            ) : (
              <ShieldAlert size={isTablet ? 13 : 11.5} color="#F59E0B" />
            )}
            <Text style={[s.statusText, { color: isConfirmed ? '#047857' : '#D97706', fontSize: isTablet ? 11 : 9.5 }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={[s.cardMiddle, { backgroundColor: `${colors.vjAccent}08`, padding: isTablet ? 14 : 10 }]}>
          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <Scale size={isTablet ? 13 : 11.5} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText, fontSize: isTablet ? 11.5 : 9.5 }]}>Gross Wt</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjText, fontSize: isTablet ? 14.5 : 12.5 }]}>{formatWeight(item.grossWeightMg)}</Text>
          </View>

          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <Scale size={isTablet ? 13 : 11.5} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText, fontSize: isTablet ? 11.5 : 9.5 }]}>Fine Wt</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjText, fontSize: isTablet ? 14.5 : 12.5 }]}>{formatWeight(item.fineWeightMg)}</Text>
          </View>

          <View style={s.detailCol}>
            <View style={s.iconRow}>
              <Banknote size={isTablet ? 13 : 11.5} color={colors.vjAccent} style={{ opacity: 0.7 }} />
              <Text style={[s.detailLabel, { color: colors.vjText, fontSize: isTablet ? 11.5 : 9.5 }]}>Payout</Text>
            </View>
            <Text style={[s.detailValue, { color: colors.vjAccent, fontSize: isTablet ? 14.5 : 12.5 }]}>{formatRupees(item.totalValuePaise)}</Text>
          </View>

          <View style={s.detailCol}>
            <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
              <Text style={[s.metalPillText, { color: metalColor, fontSize: isTablet ? 11 : 9.5 }]}>
                {karatBadge ? `${karatBadge}` : `${item.metalType}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.cardFooterHint, { borderTopColor: `${colors.vjAccent}15` }]}>
          <Text style={[s.cardFooterHintText, { color: isSelected ? colors.vjAccent : colors.vjText, opacity: isSelected ? 1 : 0.55, fontSize: isTablet ? 12 : 10.5 }]}>
            {isSelected 
              ? (isConfirmed ? 'Print & declaration options active below' : 'Draft actions active in bottom bar below')
              : (isConfirmed ? 'Tap to preview or print bill' : 'Tap to manage draft & confirm')}
          </Text>
          <ChevronRight size={isTablet ? 15 : 13} color={isSelected ? colors.vjAccent : colors.vjText} style={{ opacity: isSelected ? 1 : 0.4 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
});

export default function URDPurchasesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<URDPurchase[]>([]);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);

  // Modern Confirmation & Success Modal States
  const [confirmingPurchase, setConfirmingPurchase] = useState<URDPurchase | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedPurchase, setConfirmedPurchase] = useState<URDPurchase | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<URDPurchase | null>(null);
  const [previewType, setPreviewType] = useState<'BILL' | 'DECLARATION'>('BILL');
  const [selectedTemplate, setSelectedTemplate] = useState<URDDeclarationTemplateId>('urdDeclaration1');

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const selectedPurchase = useMemo(() => {
    return data.find((p) => p.id === selectedId) || null;
  }, [data, selectedId]);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
      setData(results || []);
      const firmData = await firmRepository.getById(activeFirmId);
      setFirm(firmData);

      // Auto-select latest draft if none selected
      const drafts = (results || []).filter((r) => r.status === 'DRAFT');
      if (drafts.length > 0) {
        setSelectedId((prev) => (prev && results?.some((r) => r.id === prev) ? prev : drafts[0].id));
      }
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
          if (active) {
            setData(results || []);
            const drafts = (results || []).filter((r) => r.status === 'DRAFT');
            if (drafts.length > 0) {
              setSelectedId((prev) => (prev && results?.some((r) => r.id === prev) ? prev : drafts[0].id));
            }
          }
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

  const handleSelectCard = useCallback((item: URDPurchase) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedId((prev) => (prev === item.id ? null : item.id));
  }, []);

  const handleConfirm = useCallback((id: string, name: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const purchase = data.find((p) => p.id === id);
    if (purchase) {
      setConfirmingPurchase(purchase);
    }
  }, [data]);

  const handleExecuteConfirm = useCallback(async () => {
    if (!confirmingPurchase || !activeFirmId) return;
    setIsConfirming(true);
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      const updated = await urdPurchaseService.confirmURDPurchase(confirmingPurchase.id, activeFirmId);
      setConfirmingPurchase(null);
      setConfirmedPurchase(updated);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to confirm purchase.');
    } finally {
      setIsConfirming(false);
    }
  }, [confirmingPurchase, activeFirmId, loadData]);

  const loadDeclarationPreview = useCallback(async (item: URDPurchase, tId: URDDeclarationTemplateId) => {
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
      const templateId = getFirmURDBillTemplateId(activeFirmId);
      const html = await urdPurchaseService.generateURDPurchaseBill(item.id, activeFirmId, templateId);
      setPreviewHtml(html);
    } catch (error: any) {
      setPreviewVisible(false);
      Alert.alert('Preview Error', error.message || 'Failed to generate bill preview.');
    }
  }, [activeFirmId]);

  const handlePreviewDeclaration = useCallback(async (item: URDPurchase, tId?: URDDeclarationTemplateId) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const resolvedTId = tId || getFirmURDDeclarationTemplateId(activeFirmId);
    setSelectedItem(item);
    setPreviewType('DECLARATION');
    setSelectedTemplate(resolvedTId);
    setPreviewTitle('घोषणापत्र / शपथपत्र Preview');
    setPreviewHtml(null);
    setPreviewVisible(true);

    await loadDeclarationPreview(item, resolvedTId);
  }, [activeFirmId, loadDeclarationPreview]);

  const handleSwitchTemplate = useCallback(async (tId: URDDeclarationTemplateId) => {
    if (!selectedItem || tId === selectedTemplate) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedTemplate(tId);
    if (activeFirmId) {
      setFirmURDDeclarationTemplateId(activeFirmId, tId);
    }
    await loadDeclarationPreview(selectedItem, tId);
  }, [selectedItem, selectedTemplate, activeFirmId, loadDeclarationPreview]);

  const handlePrintFromPreview = async () => {
    if (!previewHtml) return;
    try {
      const isBill = previewType === 'BILL';
      const printConfig = isBill ? URD_PRINT_FORMATS.BILL : URD_PRINT_FORMATS.DECLARATION;
      await Print.printAsync({
        html: previewHtml,
        width: printConfig.width,
        height: printConfig.height,
        orientation: printConfig.orientation,
      });
    } catch (error: any) {
      Alert.alert('Print Error', error.message || 'Failed to print document.');
    }
  };

  const handleShareFromPreview = async () => {
    if (!previewHtml) return;
    try {
      const isBill = previewType === 'BILL';
      const printConfig = isBill ? URD_PRINT_FORMATS.BILL : URD_PRINT_FORMATS.DECLARATION;
      const { uri } = await Print.printToFileAsync({
        html: previewHtml,
        width: printConfig.width,
        height: printConfig.height,
      });
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
            extraData={selectedId}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <URDPurchaseRow
                item={item}
                colors={colors}
                isSelected={item.id === selectedId}
                isTablet={isTablet}
                onSelect={handleSelectCard}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={isTablet ? 160 : 140}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: isTablet ? 24 : 16,
              paddingBottom: Math.max(insets.bottom + 180, 200),
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <FileDown size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No URD Purchases Yet</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  Tap "+ New Purchase" below to record an unrefined gold/silver purchase from a customer.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* MODERN FLOATING STICKY ACTION BAR */}
      <FixedGlassBar
        cardStyle={{ borderRadius: 22 }}
        contentStyle={{ paddingHorizontal: 16, paddingVertical: 13, borderRadius: 22 }}
      >
        {selectedPurchase ? (
          selectedPurchase.status === 'CONFIRMED' ? (
            // CONFIRMED PURCHASE DOCKED CONTROLS
            <View style={s.dockedContainer}>
              <View style={s.dockedHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <CheckCircle size={14} color="#10B981" />
                  <Text style={[s.dockedCustomerName, { color: colors.vjText }]} numberOfLines={1}>
                    {selectedPurchase.customerName}
                  </Text>
                  <Text style={[s.dockedBillNum, { color: colors.vjAccent }]}>
                    · {selectedPurchase.urdNumber}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setSelectedId(null)}
                  style={s.dockedCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={14} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  testID={`preview-bill-btn-${selectedPurchase.id}`}
                  style={[s.glassPillPrimary, { flex: 1.3, backgroundColor: colors.vjAccent }]}
                  onPress={() => handlePreviewBill(selectedPurchase)}
                  activeOpacity={0.85}
                >
                  <Printer size={15} color="#fff" />
                  <Text style={s.glassPillPrimaryText}>Preview & Print Bill</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID={`preview-declaration-btn-${selectedPurchase.id}`}
                  style={[s.glassPillSecondary, { flex: 1, borderColor: `${colors.vjAccent}45` }]}
                  onPress={() => handlePreviewDeclaration(selectedPurchase)}
                  activeOpacity={0.85}
                >
                  <Eye size={14} color={colors.vjAccent} />
                  <Text style={[s.glassPillSecondaryText, { color: colors.vjAccent }]}>शपथपत्र</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // DRAFT PURCHASE DOCKED CONTROLS
            <View style={s.dockedContainer}>
              <View style={s.dockedHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <ShieldAlert size={14} color="#F59E0B" />
                  <Text style={[s.dockedCustomerName, { color: colors.vjText }]} numberOfLines={1}>
                    Draft: {selectedPurchase.customerName}
                  </Text>
                  <Text style={[s.dockedAmount, { color: colors.vjAccent }]}>
                    ({formatRupees(selectedPurchase.totalValuePaise)})
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setSelectedId(null)}
                  style={s.dockedCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={14} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              {/* Responsive actions: single row on tablet, stacked on phone */}
              {isTablet ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity
                    testID={`confirm-urd-btn-${selectedPurchase.id}`}
                    style={[s.glassPillSuccess, { flex: 1.8 }]}
                    onPress={() => handleConfirm(selectedPurchase.id, selectedPurchase.customerName)}
                    activeOpacity={0.85}
                  >
                    <CheckCircle size={16} color="#ffffff" />
                    <Text style={s.glassPillSuccessText}>Confirm & Generate Bill</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID={`preview-draft-bill-btn-${selectedPurchase.id}`}
                    style={[s.glassPillSecondary, { flex: 1, borderColor: `${colors.vjAccent}35` }]}
                    onPress={() => handlePreviewBill(selectedPurchase)}
                    activeOpacity={0.8}
                  >
                    <Eye size={13} color={colors.vjText} />
                    <Text style={[s.glassPillSecondaryText, { color: colors.vjText }]}>Preview Bill</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID={`preview-declaration-btn-${selectedPurchase.id}`}
                    style={[s.glassPillSecondary, { flex: 1.1, borderColor: `${colors.vjAccent}35` }]}
                    onPress={() => handlePreviewDeclaration(selectedPurchase)}
                    activeOpacity={0.8}
                  >
                    <Eye size={13} color={colors.vjAccent} />
                    <Text style={[s.glassPillSecondaryText, { color: colors.vjAccent }]}>शपथपत्र</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID={`edit-urd-btn-${selectedPurchase.id}`}
                    style={[s.glassPillSecondary, { flex: 0.9, borderColor: `${colors.vjAccent}35` }]}
                    onPress={() => handleEdit(selectedPurchase.id)}
                    activeOpacity={0.8}
                  >
                    <Edit3 size={13} color={colors.vjText} />
                    <Text style={[s.glassPillSecondaryText, { color: colors.vjText }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID={`delete-urd-btn-${selectedPurchase.id}`}
                    style={[s.glassPillDanger, { flex: 0.9 }]}
                    onPress={() => handleDelete(selectedPurchase.id, selectedPurchase.customerName)}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={13} color={COLORS.danger} />
                    <Text style={s.glassPillDangerText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    testID={`confirm-urd-btn-${selectedPurchase.id}`}
                    style={s.glassPillSuccess}
                    onPress={() => handleConfirm(selectedPurchase.id, selectedPurchase.customerName)}
                    activeOpacity={0.85}
                  >
                    <CheckCircle size={15} color="#ffffff" />
                    <Text style={s.glassPillSuccessText}>Confirm & Generate Bill</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <TouchableOpacity
                      testID={`preview-draft-bill-btn-${selectedPurchase.id}`}
                      style={[s.glassPillSecondary, { flex: 1, borderColor: `${colors.vjAccent}35` }]}
                      onPress={() => handlePreviewBill(selectedPurchase)}
                      activeOpacity={0.8}
                    >
                      <Eye size={12} color={colors.vjText} />
                      <Text style={[s.glassPillSecondaryText, { color: colors.vjText }]}>Bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID={`preview-declaration-btn-${selectedPurchase.id}`}
                      style={[s.glassPillSecondary, { flex: 1.2, borderColor: `${colors.vjAccent}35` }]}
                      onPress={() => handlePreviewDeclaration(selectedPurchase)}
                      activeOpacity={0.8}
                    >
                      <Eye size={12} color={colors.vjAccent} />
                      <Text style={[s.glassPillSecondaryText, { color: colors.vjAccent }]}>शपथपत्र</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID={`edit-urd-btn-${selectedPurchase.id}`}
                      style={[s.glassPillSecondary, { flex: 1, borderColor: `${colors.vjAccent}35` }]}
                      onPress={() => handleEdit(selectedPurchase.id)}
                      activeOpacity={0.8}
                    >
                      <Edit3 size={12} color={colors.vjText} />
                      <Text style={[s.glassPillSecondaryText, { color: colors.vjText }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID={`delete-urd-btn-${selectedPurchase.id}`}
                      style={s.glassPillDanger}
                      onPress={() => handleDelete(selectedPurchase.id, selectedPurchase.customerName)}
                      activeOpacity={0.8}
                    >
                      <Trash2 size={12} color={COLORS.danger} />
                      <Text style={s.glassPillDangerText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )
        ) : (
          // DEFAULT: NO SELECTION -> SUMMARY METRICS + NEW PURCHASE BUTTON
          <View style={s.defaultBarContainer}>
            <View style={{ flex: 1 }}>
              <Text style={[s.defaultSummaryCount, { color: colors.vjText }]}>
                {data.length} Total {data.length === 1 ? 'Purchase' : 'Purchases'}
              </Text>
              <Text style={[s.defaultSummaryPayout, { color: colors.vjAccent }]}>
                {formatRupees(totalPayoutPaise)}
              </Text>
            </View>

            <TouchableOpacity
              testID="urd-fab-add"
              style={[s.glassPillPrimary, { flex: 1.2, backgroundColor: colors.vjAccent }]}
              onPress={() => router.push('/inventory/add-urd')}
              activeOpacity={0.85}
            >
              <Plus size={18} color="#ffffff" />
              <Text style={s.glassPillPrimaryText}>New Purchase</Text>
            </TouchableOpacity>
          </View>
        )}
      </FixedGlassBar>

      {/* 1. MODERN FROSTED PRE-CONFIRMATION MODAL */}
      <Modal visible={!!confirmingPurchase} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => !isConfirming && setConfirmingPurchase(null)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[
              s.modernModalContent, 
              { 
                backgroundColor: colors.vjBg, 
                borderColor: `${colors.vjAccent}35`,
                maxWidth: isTablet ? 500 : 400,
              }
            ]}
          >
            {/* Modal Glow Header Icon */}
            <View style={[s.modalIconCircle, { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' }]}>
              <ShieldCheck size={32} color="#10B981" />
            </View>

            <Text style={[s.modernModalTitle, { color: colors.vjText }]}>Confirm & Generate Bill</Text>
            <Text style={[s.modernModalSubtitle, { color: colors.vjText, opacity: 0.65 }]}>
              Finalize unrefined purchase from {confirmingPurchase?.customerName} and generate an official URD voucher.
            </Text>

            {/* Purchase Details Summary Card */}
            {confirmingPurchase && (
              <View style={[s.modalSummaryCard, { backgroundColor: `${colors.vjAccent}0A`, borderColor: `${colors.vjAccent}25` }]}>
                <View style={s.modalSummaryRow}>
                  <Text style={[s.modalSummaryLabel, { color: colors.vjText }]}>Metal & Purity</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.metalPill, { borderColor: confirmingPurchase.metalType === 'GOLD' ? colors.vjAccent : COLORS.silver, backgroundColor: `${confirmingPurchase.metalType === 'GOLD' ? colors.vjAccent : COLORS.silver}15` }]}>
                      <Text style={[s.metalPillText, { color: confirmingPurchase.metalType === 'GOLD' ? colors.vjAccent : COLORS.silver }]}>
                        {formatKaratBadge(confirmingPurchase.purityPercent, confirmingPurchase.metalType as 'GOLD' | 'SILVER') ?? confirmingPurchase.metalType}
                      </Text>
                    </View>
                    <Text style={[s.modalSummaryValue, { color: colors.vjText }]}>{confirmingPurchase.purityPercent}%</Text>
                  </View>
                </View>

                <View style={s.modalSummaryRow}>
                  <Text style={[s.modalSummaryLabel, { color: colors.vjText }]}>Weights</Text>
                  <Text style={[s.modalSummaryValue, { color: colors.vjText }]}>
                    Gross: {formatWeight(confirmingPurchase.grossWeightMg)} · Fine: {formatWeight(confirmingPurchase.fineWeightMg)}
                  </Text>
                </View>

                <View style={[s.modalSummaryRow, { borderTopWidth: 1, borderTopColor: `${colors.vjAccent}18`, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.modalSummaryLabel, { color: colors.vjAccent, fontWeight: '800' }]}>Total Payout</Text>
                  <Text style={[s.modalSummaryAmount, { color: colors.vjAccent }]}>
                    {formatRupees(confirmingPurchase.totalValuePaise)}
                  </Text>
                </View>
              </View>
            )}

            <View style={{ width: '100%', flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor: `${colors.vjAccent}35` }]}
                onPress={() => setConfirmingPurchase(null)}
                disabled={isConfirming}
                activeOpacity={0.8}
              >
                <Text style={[s.modalCancelBtnText, { color: colors.vjText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="execute-confirm-urd-btn"
                style={[s.modalConfirmBtn, { backgroundColor: COLORS.success }]}
                onPress={handleExecuteConfirm}
                disabled={isConfirming}
                activeOpacity={0.85}
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <CheckCircle size={16} color="#ffffff" />
                    <Text style={s.modalConfirmBtnText}>Confirm & Generate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 2. MODERN SUCCESS VOUCHER MODAL WITH DIRECT PRINT ACTIONS */}
      <Modal visible={!!confirmedPurchase} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => setConfirmedPurchase(null)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={[
              s.modernModalContent, 
              { 
                backgroundColor: colors.vjBg, 
                borderColor: 'rgba(16,185,129,0.3)',
                maxWidth: isTablet ? 500 : 400,
              }
            ]}
          >
            {/* Glowing Success Badge */}
            <View style={[s.modalIconCircle, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.35)' }]}>
              <Sparkles size={32} color="#10B981" />
            </View>

            <Text style={[s.modernModalTitle, { color: colors.vjText }]}>URD Bill Generated!</Text>
            
            {confirmedPurchase && (
              <>
                {/* URD Voucher Number Banner */}
                <View style={[s.urdNumberBanner, { backgroundColor: `${colors.vjAccent}18`, borderColor: colors.vjAccent }]}>
                  <Text style={[s.urdNumberLabel, { color: colors.vjAccent }]}>OFFICIAL VOUCHER NO.</Text>
                  <Text style={[s.urdNumberValue, { color: colors.vjText }]}>{confirmedPurchase.urdNumber}</Text>
                </View>

                <Text style={[s.modernModalSubtitle, { color: colors.vjText, opacity: 0.7, marginTop: 10 }]}>
                  Purchase finalized from <Text style={{ fontWeight: '800' }}>{confirmedPurchase.customerName}</Text> for payout of <Text style={{ fontWeight: '800', color: colors.vjAccent }}>{formatRupees(confirmedPurchase.totalValuePaise)}</Text>.
                </Text>

                {/* Instant Actions Stack */}
                <View style={{ width: '100%', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity
                    style={[s.modalActionPrimaryBtn, { backgroundColor: colors.vjAccent }]}
                    onPress={() => {
                      const p = confirmedPurchase;
                      setConfirmedPurchase(null);
                      handlePreviewBill(p);
                    }}
                    activeOpacity={0.85}
                  >
                    <Printer size={17} color="#ffffff" />
                    <Text style={s.modalActionPrimaryBtnText}>Print / Preview Bill</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.modalActionSecondaryBtn, { borderColor: `${colors.vjAccent}40` }]}
                    onPress={() => {
                      const p = confirmedPurchase;
                      setConfirmedPurchase(null);
                      handlePreviewDeclaration(p);
                    }}
                    activeOpacity={0.8}
                  >
                    <Eye size={16} color={colors.vjAccent} />
                    <Text style={[s.modalActionSecondaryBtnText, { color: colors.vjAccent }]}>Customer Affidavit (शपथपत्र)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.modalDoneBtn}
                    onPress={() => setConfirmedPurchase(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.modalDoneBtnText, { color: colors.vjText, opacity: 0.6 }]}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
                  testID="declaration-template-marathi-btn"
                  style={[s.templateSegmentBtn, selectedTemplate === 'urdDeclaration1' && [s.templateSegmentBtnActive, { backgroundColor: colors.vjText }]]}
                  onPress={() => handleSwitchTemplate('urdDeclaration1')}
                >
                  <Text style={[s.templateSegmentText, selectedTemplate === 'urdDeclaration1' && s.templateSegmentTextActive]}>
                    Marathi (मराठी)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="declaration-template-english-btn"
                  style={[s.templateSegmentBtn, selectedTemplate === 'urdDeclaration2' && [s.templateSegmentBtnActive, { backgroundColor: colors.vjText }]]}
                  onPress={() => handleSwitchTemplate('urdDeclaration2')}
                >
                  <Text style={[s.templateSegmentText, selectedTemplate === 'urdDeclaration2' && s.templateSegmentTextActive]}>
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
              <Text style={s.previewPrintBtnText}>
                {previewType === 'BILL' ? 'Print Bill (A5 Landscape)' : 'Print Declaration (A4 Portrait)'}
              </Text>
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
  card: { padding: 16, borderRadius: 18, borderWidth: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  customerName: { fontSize: 16, fontWeight: '800', maxWidth: 230 },
  billNumber: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },
  draftDate: { fontSize: 12, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  selectedChipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  detailCol: { flex: 1, gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
  detailValue: { fontSize: 13.5, fontWeight: '800', fontFamily: 'monospace' },
  metalPill: { paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  cardFooterHint: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  cardFooterHintText: { fontSize: 11, fontWeight: '600' },

  // Docked FixedGlassBar styles
  dockedContainer: { width: '100%', gap: 8, paddingHorizontal: 2 },
  dockedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingHorizontal: 2 },
  dockedCustomerName: { fontSize: 13, fontWeight: '800', maxWidth: 200 },
  dockedBillNum: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  dockedAmount: { fontSize: 12, fontWeight: '800', fontFamily: 'monospace' },
  dockedCloseBtn: { padding: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },

  glassPillPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12 },
  glassPillPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  glassPillSuccess: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.success },
  glassPillSuccessText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  glassPillSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.4)' },
  glassPillSecondaryText: { fontSize: 12, fontWeight: '800' },
  glassPillDanger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' },
  glassPillDangerText: { fontSize: 12, fontWeight: '800', color: COLORS.danger },

  defaultBarContainer: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
  defaultSummaryCount: { fontSize: 11, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase' },
  defaultSummaryPayout: { fontSize: 14.5, fontWeight: '800', fontFamily: 'monospace' },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modernModalContent: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 12 },
  modalIconCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  modernModalTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  modernModalSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 4 },

  modalSummaryCard: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14, gap: 8 },
  modalSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalSummaryLabel: { fontSize: 12, fontWeight: '700', opacity: 0.7 },
  modalSummaryValue: { fontSize: 12.5, fontWeight: '700', fontFamily: 'monospace' },
  modalSummaryAmount: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },

  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  modalCancelBtnText: { fontSize: 13.5, fontWeight: '700' },
  modalConfirmBtn: { flex: 1.5, flexDirection: 'row', gap: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalConfirmBtnText: { fontSize: 13.5, fontWeight: '800', color: '#ffffff' },

  urdNumberBanner: { width: '100%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.2, marginTop: 12 },
  urdNumberLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  urdNumberValue: { fontSize: 18, fontWeight: '800', fontFamily: 'monospace', letterSpacing: 1 },

  modalActionPrimaryBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  modalActionPrimaryBtnText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  modalActionSecondaryBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.5)' },
  modalActionSecondaryBtnText: { fontSize: 13.5, fontWeight: '800' },
  modalDoneBtn: { paddingVertical: 8, alignItems: 'center', marginTop: 2 },
  modalDoneBtnText: { fontSize: 13, fontWeight: '600' },

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