// app/vault/refinery.tsx — Phase 4: Refinery Batches Operation Screen
// Dispatches scrap batches to refinery houses, receives assayed fine output & settles gain/loss

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import { refineryBatchService } from '@/services/phase4/refineryBatchService';
import { refineryBatchRepository } from '@/repositories/phase4/refineryBatchRepository';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { formatWeightMg, formatKaratBadge } from '@/utils/calculations';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { formatDate } from '@/utils/formatDate';
import type { RefineryBatch } from '@/types/phase4/phase4.types';
import type { Supplier } from '@/types/phase3/phase3.types';
import type { OldMetalLot } from '@/types/phase2/phase2.types';
import {
  Factory,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  Coins,
  Scale,
  Sparkles,
  X,
  ChevronRight,
  ShieldCheck,
  CheckSquare,
  Square,
  TrendingUp,
  TrendingDown,
  Building,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

interface RefineryBatchLotItem {
  lotId: string;
  inputFineMg: number;
  outputFineMg: number | null;
  shareRatio: number;
  settled: number;
  customerName: string;
  purityPercent: number;
  grossWeightMg: number;
  metal: 'GOLD' | 'SILVER';
}

interface RefineryBatchSummary {
  count: number;
  totalInputFineMg: number;
  lots: RefineryBatchLotItem[];
}

export default function RefineryBatchesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batches, setBatches] = useState<RefineryBatch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'IN_TRANSIT' | 'CLOSED'>('ALL');
  const [batchLotsMap, setBatchLotsMap] = useState<Record<string, RefineryBatchSummary>>({});
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [availableLots, setAvailableLots] = useState<OldMetalLot[]>([]);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [createNotes, setCreateNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receive Output Modal State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<RefineryBatch | null>(null);
  const [outputWeightGrams, setOutputWeightGrams] = useState('');
  const [outputPurityPct, setOutputPurityPct] = useState('99.90');

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const [batchList, suppList, allLots] = await Promise.all([
        refineryBatchService.listBatches(activeFirmId).catch(() => []),
        Promise.resolve(supplierRepository.listByFirm(activeFirmId) || []),
        oldMetalLotRepository.findByFirmId(activeFirmId).catch(() => []),
      ]);
      setBatches(batchList || []);
      setSuppliers(suppList || []);

      const lotLookup = new Map<string, OldMetalLot>();
      for (const l of allLots || []) {
        lotLookup.set(l.id, l);
      }

      const lotsMap: Record<string, RefineryBatchSummary> = {};
      for (const b of batchList || []) {
        const bLots = refineryBatchRepository.getBatchLots(b.id) || [];
        const items: RefineryBatchLotItem[] = bLots.map((bl: any) => {
          const lot = lotLookup.get(bl.lotId);
          return {
            lotId: bl.lotId,
            inputFineMg: bl.inputFineMg || 0,
            outputFineMg: bl.outputFineMg || null,
            shareRatio: bl.shareRatio || 0,
            settled: bl.settled || 0,
            customerName: lot?.receivedFrom || 'Scrap Lot',
            purityPercent: lot?.purityPercent || 0,
            grossWeightMg: lot?.grossWeightMg || 0,
            metal: (lot?.metal || 'GOLD') as 'GOLD' | 'SILVER',
          };
        });
        lotsMap[b.id] = {
          count: items.length,
          totalInputFineMg: items.reduce((sum, item) => sum + item.inputFineMg, 0),
          lots: items,
        };
      }
      setBatchLotsMap(lotsMap);
    } catch (e) {
      console.warn('[RefineryBatchesScreen] Error loading data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) {
      map.set(s.id, s.name);
    }
    return map;
  }, [suppliers]);

  const openCreateModal = async () => {
    if (!activeFirmId) return;
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const rawLots = await oldMetalLotRepository.findEligible(activeFirmId);
      const goldLots = (rawLots || []).filter((l) => l.metal === 'GOLD');
      setAvailableLots(goldLots);
      setSelectedLotIds([]);
      setSelectedSupplierId(suppliers[0]?.id || '');
      setCreateNotes('');
      setShowCreateModal(true);
    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Unable to load scrap lots.');
    }
  };

  const toggleSelectLot = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedLotIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateBatch = async () => {
    if (!activeFirmId) return;
    if (!selectedSupplierId) {
      Alert.alert('Supplier Required', 'Please select a refinery house vendor.');
      return;
    }
    if (selectedLotIds.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one scrap lot.');
      return;
    }

    setIsSubmitting(true);
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      await refineryBatchService.createRefineryBatch(
        {
          supplierId: selectedSupplierId,
          lotIds: selectedLotIds,
          ...(createNotes.trim() ? { notes: createNotes.trim() } : {}),
        },
        activeFirmId
      );
      setShowCreateModal(false);
      Alert.alert('Refinery Batch Created', 'Lots grouped into a new refinery batch.');
      loadData();
    } catch (e: any) {
      Alert.alert('Creation Failed', e.message || 'Could not create refinery batch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatchBatch = async (batchId: string) => {
    if (!activeFirmId) return;
    Alert.alert(
      'Dispatch to Refinery',
      'Confirm physical dispatch of this scrap batch to the refinery house?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Dispatch',
          style: 'default',
          onPress: async () => {
            try {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              await refineryBatchService.sendRefineryBatch(batchId, activeFirmId);
              Alert.alert('Dispatched', 'Batch marked as SENT to refinery.');
              loadData();
            } catch (e: any) {
              Alert.alert('Dispatch Failed', e.message || 'Could not mark batch as sent.');
            }
          },
        },
      ]
    );
  };

  const openReceiveModal = (batch: RefineryBatch) => {
    setSelectedBatch(batch);
    setOutputWeightGrams('');
    setOutputPurityPct('99.90');
    setShowReceiveModal(true);
  };

  const handleReceiveAndSettle = async () => {
    if (!activeFirmId || !selectedBatch) return;

    const parsedGrams = parseFloat(outputWeightGrams);
    const parsedPurity = parseFloat(outputPurityPct);

    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid output weight in grams.');
      return;
    }

    if (isNaN(parsedPurity) || parsedPurity <= 0 || parsedPurity > 100) {
      Alert.alert('Invalid Purity', 'Purity percentage must be between 0 and 100.');
      return;
    }

    const grossWeightMg = Math.round(parsedGrams * 1000);

    setIsSubmitting(true);
    try {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      // 1. Receive output fine metal
      await refineryBatchService.receiveRefineryOutput(
        selectedBatch.id,
        {
          grossWeightMg,
          purityPercent: parsedPurity,
          notes: `Assayed fine received from ${supplierMap.get(selectedBatch.supplierId) || 'Refinery'}`,
        },
        activeFirmId
      );

      // 2. Settle individual constituent lots
      const batchLots = refineryBatchRepository.getBatchLots(selectedBatch.id);
      for (const bl of batchLots) {
        if (bl.settled !== 1) {
          await refineryBatchService.settleLot(selectedBatch.id, bl.lotId, activeFirmId);
        }
      }

      // 3. Close the batch
      await refineryBatchService.closeRefineryBatch(selectedBatch.id, activeFirmId);

      setShowReceiveModal(false);
      Alert.alert(
        'Settlement Complete',
        `Assayed fine received and credited to vault inventory. Batch #${selectedBatch.id.slice(0, 8)} is now closed.`
      );
      loadData();
    } catch (e: any) {
      Alert.alert('Settlement Failed', e.message || 'Could not complete refinery settlement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBatches = useMemo(() => {
    if (activeTab === 'IN_TRANSIT') {
      return batches.filter((b) => b.status === 'CREATED' || b.status === 'SENT' || b.status === 'RECEIVED');
    }
    if (activeTab === 'CLOSED') {
      return batches.filter((b) => b.status === 'CLOSED');
    }
    return batches;
  }, [batches, activeTab]);

  const inTransitCount = batches.filter(
    (b) => b.status === 'CREATED' || b.status === 'SENT' || b.status === 'RECEIVED'
  ).length;
  const closedCount = batches.filter((b) => b.status === 'CLOSED').length;

  const totalInputFineSelected = useMemo(() => {
    return availableLots
      .filter((l) => selectedLotIds.includes(l.id))
      .reduce((acc, curr) => acc + (curr.fineWeightMg || 0), 0);
  }, [availableLots, selectedLotIds]);

  return (
    <TwoToneWrapper
      title="Refinery Batches"
      showBack
      headerContent={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <HeaderPill icon={<Clock size={12} color="#D97706" />} label={`${inTransitCount} In-Transit`} />
          <HeaderPill icon={<CheckCircle2 size={12} color="#4ADE80" />} label={`${closedCount} Settled`} variant="success" />
        </View>
      }
    >
      <View style={s.container}>
        {/* TOP TAB CONTROLS + NEW BUTTON */}
        <View style={s.topBar}>
          <View style={s.tabGroup}>
            {(['ALL', 'IN_TRANSIT', 'CLOSED'] as const).map((tab) => {
              const isSelected = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setActiveTab(tab);
                  }}
                  style={[
                    s.tabBtn,
                    isSelected && {
                      backgroundColor: colors.vjAccent,
                      borderColor: colors.vjAccent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.tabText,
                      { color: isSelected ? colors.vjBg : colors.vjText },
                    ]}
                  >
                    {tab === 'IN_TRANSIT' ? `In-Transit (${inTransitCount})` : tab === 'CLOSED' ? `Closed (${closedCount})` : 'All'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID="new-refinery-batch-btn"
            onPress={openCreateModal}
            style={[s.newBtn, { backgroundColor: colors.vjAccent }]}
          >
            <Plus size={16} color={colors.vjBg} />
            <Text style={[s.newBtnText, { color: colors.vjBg }]}>New Batch</Text>
          </TouchableOpacity>
        </View>

        {/* BATCHES LIST */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 60) }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.vjAccent}
              colors={[colors.vjAccent]}
            />
          }
        >
          {loading && batches.length === 0 ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={colors.vjAccent} />
              <Text style={[s.loadingText, { color: colors.vjText }]}>Loading refinery batches...</Text>
            </View>
          ) : filteredBatches.length === 0 ? (
            <View style={s.emptyBox}>
              <Factory size={40} color={colors.vjAccent} style={{ opacity: 0.4, marginBottom: 12 }} />
              <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Refinery Batches</Text>
              <Text style={[s.emptySubtitle, { color: colors.vjText }]}>
                {activeTab === 'IN_TRANSIT'
                  ? 'No batches currently dispatched or awaiting settlement.'
                  : 'Create a new batch to dispatch scrap gold to a refinery.'}
              </Text>
            </View>
          ) : (
            filteredBatches.map((batch) => {
              const isClosed = batch.status === 'CLOSED';
              const isSent = batch.status === 'SENT';
              const isCreated = batch.status === 'CREATED';
              const supplierName = supplierMap.get(batch.supplierId) || 'Refinery House';

              return (
                <GlassCard
                  key={batch.id}
                  style={{
                    borderColor: isClosed
                      ? 'rgba(16, 185, 129, 0.28)'
                      : isSent
                      ? 'rgba(217, 119, 6, 0.35)'
                      : 'rgba(59, 130, 246, 0.35)',
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <View style={s.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={[
                          s.batchIconBox,
                          {
                            backgroundColor: isClosed
                              ? 'rgba(16, 185, 129, 0.12)'
                              : 'rgba(217, 119, 6, 0.12)',
                            borderColor: isClosed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(217, 119, 6, 0.3)',
                          },
                        ]}
                      >
                        <Factory size={18} color={isClosed ? '#10B981' : '#D97706'} />
                      </View>
                      <View>
                        <Text style={[s.batchTitle, { color: colors.vjText }]}>
                          {supplierName}
                        </Text>
                        <Text style={[s.batchDate, { color: colors.vjText }]}>
                          Batch #{batch.id.slice(0, 8).toUpperCase()} · {formatDate(batch.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        s.statusPill,
                        {
                          backgroundColor: isClosed
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(217, 119, 6, 0.12)',
                          borderColor: isClosed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(217, 119, 6, 0.3)',
                        },
                      ]}
                    >
                      {isClosed ? (
                        <CheckCircle2 size={11} color="#10B981" />
                      ) : isSent ? (
                        <Send size={11} color="#D97706" />
                      ) : (
                        <Clock size={11} color="#3B82F6" />
                      )}
                      <Text
                        style={[
                          s.statusText,
                          {
                            color: isClosed ? '#10B981' : isSent ? '#D97706' : '#3B82F6',
                          },
                        ]}
                      >
                        {batch.status}
                      </Text>
                    </View>
                  </View>

                  {/* Body stats */}
                  <View style={[s.cardBody, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
                    {(() => {
                      const summary = batchLotsMap[batch.id];
                      const effectiveInputFineMg = batch.totalInputFineMg ?? summary?.totalInputFineMg ?? 0;
                      const isExpanded = expandedBatchId === batch.id;

                      return (
                        <View>
                          <View style={s.metricsRow}>
                            <View style={s.metricCol}>
                              <Text style={[s.metricLabel, { color: colors.vjText }]}>Input Fine</Text>
                              <Text style={[s.metricVal, { color: colors.vjText }]}>
                                {formatWeightMg(effectiveInputFineMg)}
                              </Text>
                              <Text style={{ fontSize: 10, color: `${colors.vjText}80`, fontWeight: '600', marginTop: 2 }}>
                                {summary?.count || 0} Scrap {summary?.count === 1 ? 'Lot' : 'Lots'}
                              </Text>
                            </View>

                            <View style={s.metricCol}>
                              <Text style={[s.metricLabel, { color: colors.vjText }]}>Output Fine</Text>
                              <Text style={[s.metricVal, { color: isClosed ? '#10B981' : colors.vjAccent }]}>
                                {batch.totalOutputFineMg ? formatWeightMg(batch.totalOutputFineMg) : 'Awaiting'}
                              </Text>
                              <Text style={{ fontSize: 10, color: isClosed ? '#10B981' : `${colors.vjText}80`, fontWeight: '600', marginTop: 2 }}>
                                {isClosed ? 'Pure Bullion Stored' : 'In Refinery'}
                              </Text>
                            </View>

                            {isClosed ? (
                              <View style={s.metricCol}>
                                <Text style={[s.metricLabel, { color: colors.vjText }]}>Gain / Loss</Text>
                                <Text
                                  style={[
                                    s.metricVal,
                                    {
                                      color: (batch.gainLossMg || 0) >= 0 ? '#10B981' : '#EF4444',
                                    },
                                  ]}
                                >
                                  {(batch.gainLossMg || 0) >= 0 ? '+' : ''}
                                  {formatWeightMg(batch.gainLossMg || 0)}
                                </Text>
                                <Text style={{ fontSize: 10, color: (batch.gainLossMg || 0) >= 0 ? '#10B981' : '#EF4444', fontWeight: '700', marginTop: 2 }}>
                                  Settled
                                </Text>
                              </View>
                            ) : (
                              <View style={s.metricCol}>
                                <Text style={[s.metricLabel, { color: colors.vjText }]}>Stage</Text>
                                <Text style={[s.metricVal, { color: '#D97706' }]}>
                                  {isCreated ? 'Ready to Dispatch' : 'Refining in House'}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600', marginTop: 2 }}>
                                  {isCreated ? 'Not Dispatched Yet' : 'En Route / At Vendor'}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Toggle to view feedstock lots */}
                          {summary && summary.lots.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                              style={[s.expandLotsToggle, { borderColor: `${colors.vjAccent}25`, backgroundColor: `${colors.vjAccent}06` }]}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Coins size={12} color={colors.vjAccent} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.vjAccent }}>
                                  {isExpanded ? 'Hide Scrap Lots' : `View Scrap Lots (${summary.count} Lots · ${formatWeightMg(effectiveInputFineMg)} Fine)`}
                                </Text>
                              </View>
                              {isExpanded ? <ChevronUp size={13} color={colors.vjAccent} /> : <ChevronDown size={13} color={colors.vjAccent} />}
                            </TouchableOpacity>
                          )}

                          {isExpanded && summary && (
                            <View style={[s.feedstockBox, { borderColor: `${colors.vjAccent}20`, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                              {summary.lots.map((item, idx) => (
                                <View key={`${item.lotId}-${idx}`} style={[s.feedstockRow, idx > 0 && { borderTopWidth: 1, borderTopColor: `${colors.vjAccent}10` }]}>
                                  <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={[s.feedstockCustomer, { color: colors.vjText }]} numberOfLines={1}>{item.customerName}</Text>
                                    <Text style={{ fontSize: 10.5, color: `${colors.vjText}80`, fontWeight: '600' }}>
                                      {formatKaratBadge(item.purityPercent, item.metal)} ({item.purityPercent}%) · Gross: {formatWeightMg(item.grossWeightMg)} · Share: {(item.shareRatio * 100).toFixed(1)}%
                                    </Text>
                                  </View>
                                  <Text style={[s.feedstockFine, { color: colors.vjAccent }]}>
                                    {formatWeightMg(item.inputFineMg)} Fine
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Action buttons for in-transit stages */}
                          {!isClosed && (
                            <View style={s.actionRow}>
                              {isCreated && (
                                <TouchableOpacity
                                  onPress={() => handleDispatchBatch(batch.id)}
                                  style={[s.actionBtn, { backgroundColor: '#D97706' }]}
                                >
                                  <Send size={13} color="#FFFFFF" />
                                  <Text style={s.actionBtnText}>Mark Dispatched (SENT)</Text>
                                </TouchableOpacity>
                              )}

                              {isSent && (
                                <TouchableOpacity
                                  testID={`receive-refinery-btn-${batch.id}`}
                                  onPress={() => openReceiveModal(batch)}
                                  style={[s.actionBtn, { backgroundColor: colors.vjAccent }]}
                                >
                                  <Sparkles size={13} color={colors.vjBg} />
                                  <Text style={[s.actionBtnText, { color: colors.vjBg }]}>
                                    Receive Fine Output & Settle
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                </GlassCard>
              );
            })
          )}
        </ScrollView>

        {/* MODAL: CREATE REFINERY BATCH */}
        <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { backgroundColor: isDark ? '#1C1418' : '#FFFFFF' }]}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Factory size={20} color="#D97706" />
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Create Refinery Batch</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <X size={20} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalHint, { color: colors.vjText }]}>
                Select the refinery house vendor and scrap lots to consolidate for purification.
              </Text>

              {/* Vendor Selector */}
              <View style={{ marginTop: 12 }}>
                <Text style={[s.inputLabel, { color: colors.vjText }]}>Refinery Vendor</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  {suppliers.map((supp) => {
                    const isSelected = selectedSupplierId === supp.id;
                    return (
                      <TouchableOpacity
                        key={supp.id}
                        onPress={() => setSelectedSupplierId(supp.id)}
                        style={[
                          s.suppChip,
                          {
                            backgroundColor: isSelected ? colors.vjAccent : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            borderColor: isSelected ? colors.vjAccent : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                          },
                        ]}
                      >
                        <Text style={[s.suppChipText, { color: isSelected ? colors.vjBg : colors.vjText }]}>
                          {supp.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Scrap Lots Selector */}
              <Text style={[s.inputLabel, { color: colors.vjText, marginTop: 10 }]}>Select Scrap Lots</Text>
              {availableLots.length === 0 ? (
                <View style={{ padding: 18, alignItems: 'center' }}>
                  <Text style={{ color: colors.vjText, opacity: 0.6 }}>No eligible scrap lots in vault.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 200, marginVertical: 6 }}>
                  {availableLots.map((lot) => {
                    const isSelected = selectedLotIds.includes(lot.id);
                    return (
                      <TouchableOpacity
                        key={lot.id}
                        onPress={() => toggleSelectLot(lot.id)}
                        style={[
                          s.lotPickRow,
                          {
                            backgroundColor: isSelected
                              ? isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(217, 119, 6, 0.08)'
                              : 'transparent',
                            borderColor: isSelected ? colors.vjAccent : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 }}>
                          {isSelected ? (
                            <CheckSquare size={18} color={colors.vjAccent} />
                          ) : (
                            <Square size={18} color={colors.vjText} style={{ opacity: 0.4 }} />
                          )}
                          <JewelryMonogramEmblem metal={lot.metal} size={28} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.lotCustomerText, { color: colors.vjText }]} numberOfLines={1}>{lot.receivedFrom}</Text>
                            <Text style={[s.lotPurityText, { color: colors.vjText }]}>
                              {formatKaratBadge(lot.purityPercent, lot.metal)} ({lot.purityPercent}%) · Gross: {formatWeightMg(lot.grossWeightMg)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.lotFineText, { color: colors.vjAccent }]}>
                          Fine: {formatWeightMg(lot.fineWeightMg)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Total Summary */}
              <View style={[s.summaryBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[s.summaryLabel, { color: colors.vjText }]}>
                  Selected: {selectedLotIds.length} Lots
                </Text>
                <Text style={[s.summaryValue, { color: colors.vjAccent }]}>
                  Total Input Fine: {formatWeightMg(totalInputFineSelected)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCreateBatch}
                disabled={isSubmitting || selectedLotIds.length === 0 || !selectedSupplierId}
                style={[
                  s.submitBtn,
                  {
                    backgroundColor: colors.vjAccent,
                    opacity: isSubmitting || selectedLotIds.length === 0 || !selectedSupplierId ? 0.5 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.vjBg} />
                ) : (
                  <Text style={[s.submitBtnText, { color: colors.vjBg }]}>Create Batch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: RECEIVE FINE OUTPUT */}
        <Modal visible={showReceiveModal} animationType="slide" transparent onRequestClose={() => setShowReceiveModal(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { backgroundColor: isDark ? '#1C1418' : '#FFFFFF' }]}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color="#10B981" />
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Receive Assayed Fine</Text>
                </View>
                <TouchableOpacity onPress={() => setShowReceiveModal(false)}>
                  <X size={20} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalHint, { color: colors.vjText }]}>
                Record the pure fine gold returned by the refinery. The system will settle constituent lots and compute gain/loss analytics.
              </Text>

              <View style={{ marginVertical: 14, gap: 12 }}>
                <View>
                  <Text style={[s.inputLabel, { color: colors.vjText }]}>Output Gross Weight (Grams)</Text>
                  <TextInput
                    value={outputWeightGrams}
                    onChangeText={setOutputWeightGrams}
                    placeholder="e.g. 100.500"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    keyboardType="decimal-pad"
                    style={[s.textInput, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>

                <View>
                  <Text style={[s.inputLabel, { color: colors.vjText }]}>Assayed Purity Percentage (%)</Text>
                  <TextInput
                    value={outputPurityPct}
                    onChangeText={setOutputPurityPct}
                    placeholder="e.g. 99.90"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    keyboardType="decimal-pad"
                    style={[s.textInput, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleReceiveAndSettle}
                disabled={isSubmitting}
                style={[
                  s.submitBtn,
                  {
                    backgroundColor: colors.vjAccent,
                    opacity: isSubmitting ? 0.6 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.vjBg} />
                ) : (
                  <Text style={[s.submitBtnText, { color: colors.vjBg }]}>Settle & Close Batch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tabGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  newBtnText: {
    fontSize: 12,
    fontWeight: '900',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
    textAlign: 'center',
    maxWidth: 260,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  batchDate: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  cardBody: {
    borderTopWidth: 1,
    paddingTop: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    opacity: 0.6,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  modalHint: {
    fontSize: 11.5,
    fontWeight: '600',
    opacity: 0.65,
    lineHeight: 16,
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
    fontWeight: '800',
  },
  lotPickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  lotCustomerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  lotPurityText: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 1,
  },
  lotFineText: {
    fontSize: 12,
    fontWeight: '900',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  expandLotsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  feedstockBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  feedstockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  feedstockCustomer: {
    fontSize: 12,
    fontWeight: '800',
  },
  feedstockFine: {
    fontSize: 11.5,
    fontWeight: '800',
  },
});
