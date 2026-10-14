// app/inventory/old-metal-lots.tsx — Phase 2 & 4 Canonical Screen
// Implements FIX-OLDMETAL-RENAME-1 (v2.32), FIX-OLDMETAL-VOID-1 (v2.33), FIX-OLDGOLD-TXNLINK-1 (v2.31), and Phase 4 Metallurgy Linking

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, useWindowDimensions, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { oldMetalLotService } from '@/services/phase2/oldGoldLotService';
import { meltBatchService } from '@/services/phase4/meltBatchService';
import { refineryBatchService } from '@/services/phase4/refineryBatchService';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { formatWeightMg as formatWeight, formatKaratBadge } from '@/utils/calculations';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { formatDate } from '@/utils/formatDate';
import {
  Coins,
  Scale,
  ChevronRight,
  Ban,
  Flame,
  Factory,
  Hammer,
  CheckCircle2,
  Clock,
  Send,
  X,
} from 'lucide-react-native';
import type { OldMetalLot, OldMetalLotStatus } from '@/types/phase2/phase2.types';
import type { Supplier } from '@/types/phase3/phase3.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const LotCard = memo(({
  lot,
  batchId,
  colors,
  isTablet,
  onOpenTransition,
}: {
  lot: OldMetalLot;
  batchId?: string;
  colors: ReturnType<typeof getThemeColors>;
  isTablet?: boolean;
  onOpenTransition: (lot: OldMetalLot, batchId?: string) => void;
}) => {
  const isGold = lot.metal === 'GOLD';
  const metalColor = isGold ? COLORS.bullionGold : COLORS.bullionSilver;
  const karatBadge = formatKaratBadge(lot.purityPercent, lot.metal);

  const statusConfig = {
    RECEIVED: { bg: `${colors.vjAccent}12`, border: `${colors.vjAccent}30`, text: colors.vjAccent, label: 'IN VAULT', Icon: Coins },
    SENT_TO_MELT: {
      bg: 'rgba(234, 88, 12, 0.12)',
      border: 'rgba(234, 88, 12, 0.35)',
      text: '#EA580C',
      label: batchId ? `IN MELT #${batchId.slice(0, 6).toUpperCase()}` : 'IN MELT',
      Icon: Flame,
    },
    SENT_TO_REFINERY: {
      bg: 'rgba(217, 119, 6, 0.12)',
      border: 'rgba(217, 119, 6, 0.35)',
      text: '#D97706',
      label: batchId ? `AT REFINERY #${batchId.slice(0, 6).toUpperCase()}` : 'AT REFINERY',
      Icon: Factory,
    },
    ISSUED_TO_KARIGAR: { bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.35)', text: '#0284C7', label: 'WITH ARTISAN', Icon: Hammer },
    SETTLED: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#10B981', label: 'SETTLED', Icon: CheckCircle2 },
    VOIDED: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', text: '#DC2626', label: 'VOIDED', Icon: Ban },
    PENDING: { bg: 'rgba(107, 114, 128, 0.12)', border: 'rgba(107, 114, 128, 0.35)', text: '#6B7280', label: 'PENDING', Icon: Clock },
  }[lot.status as OldMetalLotStatus] || { bg: `${colors.vjAccent}12`, border: `${colors.vjAccent}30`, text: colors.vjAccent, label: lot.status, Icon: Coins };

  const footerHint = {
    RECEIVED: 'Tap to send to Melt Run or Refinery',
    SENT_TO_MELT: batchId ? `In furnace Melt Run #${batchId.slice(0, 8).toUpperCase()} · Tap to view in Melt Batches` : 'In furnace melt run · Tap to view in Melt Batches',
    SENT_TO_REFINERY: batchId ? `Dispatched in Refinery Batch #${batchId.slice(0, 8).toUpperCase()} · Tap to view in Refinery Batches` : 'At refinery house · Tap to view in Refinery Batches',
    ISSUED_TO_KARIGAR: 'Issued to karigar · Tap to view in Karigar Register',
    SETTLED: 'Purified & settled · Tap to view in Refinery Batches',
    VOIDED: 'Voided transaction · Excluded from vault',
    PENDING: 'Pending dispatch',
  }[lot.status as OldMetalLotStatus] || 'Tap to manage lifecycle';

  const StatusIcon = statusConfig.Icon;

  return (
    <TouchableOpacity
      testID={`old-metal-lot-card-${lot.id}`}
      activeOpacity={0.88}
      onPress={() => onOpenTransition(lot, batchId)}
      style={{ marginBottom: isTablet ? 14 : 12 }}
    >
      <GlassCard style={[s.card, { borderColor: statusConfig.border }]}>
        <View style={s.cardTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 }}>
            <JewelryMonogramEmblem metal={lot.metal} size={isTablet ? 38 : 34} />
            <View style={{ flex: 1 }}>
              <Text style={[s.lotCustomer, { color: colors.vjText }]} numberOfLines={1}>
                {lot.receivedFrom}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
                  <Text style={[s.metalPillText, { color: metalColor }]}>
                    {karatBadge ? `${karatBadge} · ${lot.purityPercent}%` : `${lot.metal} ${lot.purityPercent}%`}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: `${colors.vjText}80`, fontWeight: '600' }}>
                  {formatDate(lot.receivedDate)}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              s.statusBadge,
              {
                backgroundColor: statusConfig.bg,
                borderColor: statusConfig.border,
              },
            ]}
          >
            <StatusIcon size={11} color={statusConfig.text} />
            <Text style={[s.statusText, { color: statusConfig.text }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={[s.cardMiddle, { backgroundColor: `${colors.vjAccent}08` }]}>
          <View style={s.detailCol}>
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Gross Wt</Text>
            <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(lot.grossWeightMg)}</Text>
          </View>

          <View style={s.detailCol}>
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Fine Wt</Text>
            <Text style={[s.detailValue, { color: colors.vjAccent }]}>{formatWeight(lot.fineWeightMg)}</Text>
          </View>

          <View style={s.detailCol}>
            <Text style={[s.detailLabel, { color: colors.vjText }]}>Origin Source</Text>
            <Text style={[s.detailValue, { color: colors.vjText }]} numberOfLines={1}>
              {lot.saleInvoiceId ? 'Sale Exchange' : lot.urdPurchaseId ? 'URD Purchase' : lot.metalSource === 'MELT_OUTPUT' ? 'Melt Output' : lot.metalSource === 'REFINERY_OUTPUT' ? 'Refinery Output' : 'Direct Inward'}
            </Text>
          </View>
        </View>

        <View style={[s.cardFooter, { borderTopColor: `${colors.vjAccent}15` }]}>
          <Text style={[s.footerHint, { color: colors.vjText, opacity: 0.65 }]}>
            {footerHint}
          </Text>
          <ChevronRight size={13} color={colors.vjAccent} style={{ opacity: 0.5 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
});

export default function OldMetalLotsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { activeFirmId } = useFirmStore();
  const [lots, setLots] = useState<OldMetalLot[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLot, setSelectedLot] = useState<OldMetalLot | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(undefined);
  const [lotBatchMap, setLotBatchMap] = useState<Record<string, string>>({});
  const [showRefineryPicker, setShowRefineryPicker] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [updating, setUpdating] = useState(false);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';
  const colors = getThemeColors(activeTheme);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const [results, suppList] = await Promise.all([
        oldMetalLotRepository.findByFirmId(activeFirmId),
        Promise.resolve(supplierRepository.listByFirm(activeFirmId) || []),
      ]);
      setLots(results || []);
      setSuppliers(suppList || []);
      if (suppList && suppList.length > 0) {
        setSelectedSupplierId(suppList[0].id);
      }

      // Resolve linked batch IDs for scrap lots in metallurgy lifecycle
      const bMap: Record<string, string> = {};
      for (const l of results || []) {
        if (l.status === 'SENT_TO_MELT') {
          const input = await meltBatchService.getBatchInputByLotId(l.id).catch(() => null);
          if (input?.batchId) bMap[l.id] = input.batchId;
        } else if (l.status === 'SENT_TO_REFINERY') {
          const rLot = await refineryBatchService.getBatchLotByLot(l.id).catch(() => null);
          if (rLot?.batchId) bMap[l.id] = rLot.batchId;
        }
      }
      setLotBatchMap(bMap);
    } catch (e) {
      console.error('[OldMetalLotsScreen] Failed to load lots:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Directly create an official Melt Batch for this scrap lot
  const handleSendToMelt = async (lot: OldMetalLot) => {
    if (!activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setUpdating(true);
    try {
      const batch = await meltBatchService.createMeltBatch({ lotIds: [lot.id] }, activeFirmId);
      setSelectedLot(null);
      await loadData();
      Alert.alert(
        'Melt Run Initiated',
        `Lot from "${lot.receivedFrom}" has been sent to the furnace in Melt Batch #${batch.id.slice(0, 8).toUpperCase()}. You can now complete and assay the melted bar in Melt Batches.`,
        [
          { text: 'Stay in Vault', style: 'cancel' },
          { text: 'View in Melt Batches', onPress: () => router.push('/vault/melt') },
        ]
      );
    } catch (err: any) {
      Alert.alert('Melt Error', err.message || 'Could not initiate melt run.');
    } finally {
      setUpdating(false);
    }
  };

  // Directly create an official Refinery Batch for this scrap lot
  const handleSendToRefinery = async (lot: OldMetalLot, supplierId: string) => {
    if (!activeFirmId) return;
    if (!supplierId) {
      Alert.alert('Supplier Required', 'Please select a refinery house vendor.');
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setUpdating(true);
    try {
      const chosenSupplier = suppliers.find((s) => s.id === supplierId);
      const batch = await refineryBatchService.createRefineryBatch({
        supplierId,
        lotIds: [lot.id],
        notes: `Dispatched from Old Metal Vault: ${lot.receivedFrom}`,
      }, activeFirmId);
      setSelectedLot(null);
      setShowRefineryPicker(false);
      await loadData();
      Alert.alert(
        'Refinery Batch Created',
        `Lot from "${lot.receivedFrom}" has been dispatched to ${chosenSupplier?.name || 'Refinery'} in Batch #${batch.id.slice(0, 8).toUpperCase()}. You can track dispatch and record assayed output in Refinery Batches.`,
        [
          { text: 'Stay in Vault', style: 'cancel' },
          { text: 'View in Refinery Batches', onPress: () => router.push('/vault/refinery') },
        ]
      );
    } catch (err: any) {
      Alert.alert('Refinery Error', err.message || 'Could not create refinery batch.');
    } finally {
      setUpdating(false);
    }
  };

  const handleVoidLot = (lot: OldMetalLot) => {
    if (!activeFirmId) return;
    Alert.alert(
      'Void Scrap Lot',
      `Are you sure you want to mark lot "${lot.receivedFrom}" as VOIDED? This excludes it from active vault inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void Lot',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              await oldMetalLotService.updateOldMetalLotStatus(
                lot.id,
                activeFirmId,
                'VOIDED',
                'Manually marked voided by user'
              );
              setSelectedLot(null);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not void lot.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const totalGrossMg = useMemo(
    () => lots.reduce((acc, curr) => acc + (curr.status !== 'VOIDED' ? curr.grossWeightMg : 0), 0),
    [lots]
  );
  const totalFineMg = useMemo(
    () => lots.reduce((acc, curr) => acc + (curr.status !== 'VOIDED' ? curr.fineWeightMg : 0), 0),
    [lots]
  );

  const headerPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Coins size={12} color={colors.vjBg} />} label={`${lots.length} Scrap Lots`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Fine: ${formatWeight(totalFineMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Old Metal Vault" showBack headerContent={headerPills}>
      <View style={s.container}>
        {/* Top Quick Navigation Shortcuts to Phase 4 Metallurgy Batches */}
        <View style={[s.shortcutBar, isTablet && { maxWidth: 780, alignSelf: 'center', width: '100%' }]}>
          <TouchableOpacity
            style={[s.hubShortcutBtn, { borderColor: 'rgba(234, 88, 12, 0.35)', backgroundColor: 'rgba(234, 88, 12, 0.10)' }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push('/vault/melt');
            }}
            activeOpacity={0.8}
          >
            <Flame size={15} color="#EA580C" />
            <Text style={[s.hubShortcutText, { color: '#EA580C' }]}>Melt Batches</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.hubShortcutBtn, { borderColor: 'rgba(217, 119, 6, 0.35)', backgroundColor: 'rgba(217, 119, 6, 0.10)' }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push('/vault/refinery');
            }}
            activeOpacity={0.8}
          >
            <Factory size={15} color="#D97706" />
            <Text style={[s.hubShortcutText, { color: '#D97706' }]}>Refinery Batches</Text>
          </TouchableOpacity>
        </View>

        {loading && lots.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading scrap lots...</Text>
          </View>
        ) : (
          <FlashList
            data={lots}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LotCard
                lot={item}
                batchId={lotBatchMap[item.id]}
                colors={colors}
                isTablet={isTablet}
                onOpenTransition={(l, bId) => {
                  setShowRefineryPicker(false);
                  setSelectedLot(l);
                  setSelectedBatchId(bId);
                }}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={140}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom + 60, 80),
              ...(isTablet ? { maxWidth: 780, alignSelf: 'center', width: '100%' } : {})
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Coins size={48} color={colors.vjAccent} style={{ opacity: 0.25 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Scrap Metal Lots</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  Customer exchange scrap and confirmed URD purchases will accumulate here.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Lot Management Modal */}
      <Modal visible={!!selectedLot} transparent animationType="fade" onRequestClose={() => !updating && setSelectedLot(null)}>
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => !updating && setSelectedLot(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              s.modalCard,
              {
                backgroundColor: isDark ? '#1C1418' : colors.vjBg,
                borderColor: isDark ? 'rgba(212,175,55,0.3)' : `${colors.vjAccent}35`,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <JewelryMonogramEmblem metal={selectedLot?.metal} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: colors.vjText, marginBottom: 2 }]} numberOfLines={1}>
                    {selectedLot?.receivedFrom}
                  </Text>
                  <Text style={[s.modalSub, { color: colors.vjText, opacity: 0.7, marginBottom: 0 }]}>
                    Status: <Text style={{ fontWeight: '800', color: colors.vjAccent }}>{selectedLot?.status}</Text>
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => !updating && setSelectedLot(null)} style={{ padding: 4 }}>
                <X size={20} color={colors.vjText} />
              </TouchableOpacity>
            </View>

            {/* LOT DETAILS BANNER */}
            <View style={[s.lotDetailBanner, { backgroundColor: `${colors.vjAccent}08`, borderColor: `${colors.vjAccent}20` }]}>
              <View style={s.detailCol}>
                <Text style={[s.detailLabel, { color: colors.vjText }]}>Gross</Text>
                <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(selectedLot?.grossWeightMg || 0)}</Text>
              </View>
              <View style={s.detailCol}>
                <Text style={[s.detailLabel, { color: colors.vjText }]}>Purity</Text>
                <Text style={[s.detailValue, { color: colors.vjAccent }]}>{selectedLot?.purityPercent}%</Text>
              </View>
              <View style={s.detailCol}>
                <Text style={[s.detailLabel, { color: colors.vjText }]}>Fine Weight</Text>
                <Text style={[s.detailValue, { color: '#10B981' }]}>{formatWeight(selectedLot?.fineWeightMg || 0)}</Text>
              </View>
            </View>

            {/* STATE-DEPENDENT WORKFLOW ACTIONS */}
            {selectedLot?.status === 'RECEIVED' ? (
              <View style={{ width: '100%', gap: 10, marginTop: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.vjAccent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Choose Metallurgy Workflow:
                </Text>

                {/* Option 1: Send to Furnace (Melt Run) */}
                <TouchableOpacity
                  style={[s.workflowBtn, { borderColor: 'rgba(234, 88, 12, 0.4)', backgroundColor: 'rgba(234, 88, 12, 0.08)' }]}
                  onPress={() => selectedLot && handleSendToMelt(selectedLot)}
                  disabled={updating}
                  activeOpacity={0.8}
                >
                  <View style={[s.workflowIconBox, { backgroundColor: 'rgba(234, 88, 12, 0.15)' }]}>
                    <Flame size={18} color="#EA580C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.workflowBtnTitle, { color: colors.vjText }]}>Send to Furnace (Melt Run)</Text>
                    <Text style={[s.workflowBtnSub, { color: colors.vjText, opacity: 0.65 }]}>
                      Groups this lot into an active Melt Batch to produce assayed pure bullion
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Dispatch to Refinery */}
                {showRefineryPicker ? (
                  <View style={[s.refineryPickerBox, { borderColor: `${colors.vjAccent}35`, backgroundColor: `${colors.vjAccent}06` }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.vjText, marginBottom: 8 }}>
                      Select Refinery House Vendor:
                    </Text>
                    {suppliers.length === 0 ? (
                      <Text style={{ fontSize: 12, color: colors.vjText, opacity: 0.6, marginBottom: 8 }}>
                        No refinery suppliers registered. Add a refinery supplier in Settings first.
                      </Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                        {suppliers.map((supp) => {
                          const isSel = selectedSupplierId === supp.id;
                          return (
                            <TouchableOpacity
                              key={supp.id}
                              onPress={() => setSelectedSupplierId(supp.id)}
                              style={[
                                s.suppChip,
                                {
                                  backgroundColor: isSel ? colors.vjAccent : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                  borderColor: isSel ? colors.vjAccent : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                },
                              ]}
                            >
                              <Text style={[s.suppChipText, { color: isSel ? colors.vjBg : colors.vjText }]}>
                                {supp.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[s.cancelMiniBtn, { borderColor: colors.border }]}
                        onPress={() => setShowRefineryPicker(false)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.vjText }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.confirmMiniBtn, { backgroundColor: colors.vjAccent, opacity: !selectedSupplierId ? 0.5 : 1 }]}
                        onPress={() => selectedLot && selectedSupplierId && handleSendToRefinery(selectedLot, selectedSupplierId)}
                        disabled={!selectedSupplierId || updating}
                      >
                        <Send size={12} color={colors.vjBg} style={{ marginRight: 4 }} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.vjBg }}>Confirm Dispatch</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.workflowBtn, { borderColor: 'rgba(217, 119, 6, 0.4)', backgroundColor: 'rgba(217, 119, 6, 0.08)' }]}
                    onPress={() => setShowRefineryPicker(true)}
                    disabled={updating}
                    activeOpacity={0.8}
                  >
                    <View style={[s.workflowIconBox, { backgroundColor: 'rgba(217, 119, 6, 0.15)' }]}>
                      <Factory size={18} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.workflowBtnTitle, { color: colors.vjText }]}>Dispatch to Refinery</Text>
                      <Text style={[s.workflowBtnSub, { color: colors.vjText, opacity: 0.65 }]}>
                        Creates a tracked Refinery Batch with vendor dispatch & pro-rata settlement
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Option 3: Mark as Voided */}
                <TouchableOpacity
                  style={[s.voidBtn, { borderColor: 'rgba(239, 68, 68, 0.25)', backgroundColor: 'rgba(239, 68, 68, 0.06)' }]}
                  onPress={() => selectedLot && handleVoidLot(selectedLot)}
                  disabled={updating}
                  activeOpacity={0.8}
                >
                  <Ban size={14} color="#DC2626" />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#DC2626' }}>Mark as Voided</Text>
                </TouchableOpacity>
              </View>
            ) : selectedLot?.status === 'SENT_TO_MELT' ? (
              <View style={{ width: '100%', gap: 12, marginTop: 14 }}>
                <View style={[s.statusInfoBox, { backgroundColor: 'rgba(234, 88, 12, 0.08)', borderColor: 'rgba(234, 88, 12, 0.3)' }]}>
                  <Flame size={20} color="#EA580C" />
                  <Text style={[s.statusInfoText, { color: colors.vjText }]}>
                    {selectedBatchId
                      ? `This scrap lot from "${selectedLot.receivedFrom}" is currently melting in the furnace in Melt Batch #${selectedBatchId.slice(0, 8).toUpperCase()}. You can complete and assay the melted bar in Melt Batches.`
                      : `This scrap lot is currently in the furnace in an active Melt Batch. You can complete and assay the bar in Melt Batches.`}
                  </Text>
                </View>
                <GlassButton
                  title={selectedBatchId ? `Open Melt Batch #${selectedBatchId.slice(0, 8).toUpperCase()}` : 'Open Melt Batches'}
                  icon={<Flame size={16} color="#fff" />}
                  onPress={() => {
                    setSelectedLot(null);
                    router.push('/vault/melt');
                  }}
                />
              </View>
            ) : selectedLot?.status === 'SENT_TO_REFINERY' ? (
              <View style={{ width: '100%', gap: 12, marginTop: 14 }}>
                <View style={[s.statusInfoBox, { backgroundColor: 'rgba(217, 119, 6, 0.08)', borderColor: 'rgba(217, 119, 6, 0.3)' }]}>
                  <Factory size={20} color="#D97706" />
                  <Text style={[s.statusInfoText, { color: colors.vjText }]}>
                    {selectedBatchId
                      ? `This scrap lot from "${selectedLot.receivedFrom}" is currently dispatched in Refinery Batch #${selectedBatchId.slice(0, 8).toUpperCase()}. You can track dispatch and record assayed output in Refinery Batches.`
                      : `This scrap lot has been dispatched to a refinery vendor and is awaiting assayed fine return & settlement.`}
                  </Text>
                </View>
                <GlassButton
                  title={selectedBatchId ? `Open Refinery Batch #${selectedBatchId.slice(0, 8).toUpperCase()}` : 'Open Refinery Batches'}
                  icon={<Factory size={16} color="#fff" />}
                  onPress={() => {
                    setSelectedLot(null);
                    router.push('/vault/refinery');
                  }}
                />
              </View>
            ) : selectedLot?.status === 'ISSUED_TO_KARIGAR' ? (
              <View style={{ width: '100%', gap: 12, marginTop: 14 }}>
                <View style={[s.statusInfoBox, { backgroundColor: 'rgba(2, 132, 199, 0.08)', borderColor: 'rgba(2, 132, 199, 0.3)' }]}>
                  <Hammer size={20} color="#0284C7" />
                  <Text style={[s.statusInfoText, { color: colors.vjText }]}>
                    This lot has been issued to an artisan/karigar for manufacture.
                  </Text>
                </View>
                <GlassButton
                  title="Open Karigar Ledger"
                  icon={<Hammer size={16} color="#fff" />}
                  onPress={() => {
                    setSelectedLot(null);
                    router.push('/billing/karigars');
                  }}
                />
              </View>
            ) : selectedLot?.status === 'SETTLED' ? (
              <View style={{ width: '100%', gap: 12, marginTop: 14 }}>
                <View style={[s.statusInfoBox, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                  <CheckCircle2 size={20} color="#10B981" />
                  <Text style={[s.statusInfoText, { color: colors.vjText }]}>
                    This scrap lot has been purified and settled by the refinery house. Pure bullion has been credited to the vault.
                  </Text>
                </View>
                <GlassButton
                  title="View in Refinery Batches"
                  icon={<Factory size={16} color="#fff" />}
                  onPress={() => {
                    setSelectedLot(null);
                    router.push('/vault/refinery');
                  }}
                />
              </View>
            ) : (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ textAlign: 'center', fontSize: 13, color: colors.vjText, opacity: 0.6 }}>
                  This lot is in a terminal state ({selectedLot?.status}). Excluded from active metallurgy.
                </Text>
              </View>
            )}

            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton
                title="Close"
                onPress={() => setSelectedLot(null)}
                variant="secondary"
                disabled={updating}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  shortcutBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  hubShortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  hubShortcutText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 60 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySubtitle: { fontSize: 13, textAlign: 'center' },
  card: { padding: 16, borderRadius: 18, borderWidth: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  lotCustomer: { fontSize: 16, fontWeight: '900' },
  metalPill: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 12, marginBottom: 10 },
  detailCol: { gap: 3 },
  detailLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
  detailValue: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  footerHint: { fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 22, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13 },
  lotDetailBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 4,
  },
  workflowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  workflowIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workflowBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  workflowBtnSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  refineryPickerBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  suppChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  suppChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelMiniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmMiniBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  voidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  statusInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusInfoText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
});

