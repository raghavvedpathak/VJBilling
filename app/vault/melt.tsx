// app/vault/melt.tsx — Phase 4: Melt Batches Operation Screen
// Consolidates scrap lots into pure assayed bullion bars (metalSource = MELT_OUTPUT)

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
import { meltBatchService } from '@/services/phase4/meltBatchService';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { formatWeightMg, formatKaratBadge } from '@/utils/calculations';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { formatDate } from '@/utils/formatDate';
import type { MeltBatch } from '@/types/phase4/phase4.types';
import type { OldMetalLot } from '@/types/phase2/phase2.types';
import {
  Flame,
  Plus,
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
  BarChart2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

interface BatchInputLotItem {
  lotId: string;
  inputFineMg: number;
  customerName: string;
  purityPercent: number;
  grossWeightMg: number;
  metal: 'GOLD' | 'SILVER';
}

interface BatchInputSummary {
  count: number;
  totalInputFineMg: number;
  lots: BatchInputLotItem[];
}

export default function MeltBatchesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batches, setBatches] = useState<MeltBatch[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');
  const [batchInputsMap, setBatchInputsMap] = useState<Record<string, BatchInputSummary>>({});
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [availableLots, setAvailableLots] = useState<OldMetalLot[]>([]);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close / Complete Modal State
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<MeltBatch | null>(null);
  const [outputWeightGrams, setOutputWeightGrams] = useState('');
  const [outputPurityPct, setOutputPurityPct] = useState('99.50');

  const loadBatches = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const [batchData, allLots] = await Promise.all([
        meltBatchService.listBatches(activeFirmId),
        oldMetalLotRepository.findByFirmId(activeFirmId).catch(() => []),
      ]);
      setBatches(batchData || []);

      const lotLookup = new Map<string, OldMetalLot>();
      for (const l of allLots || []) {
        lotLookup.set(l.id, l);
      }

      const inputsMap: Record<string, BatchInputSummary> = {};
      for (const b of batchData || []) {
        const inputs = await meltBatchService.getBatchInputs(b.id).catch(() => []);
        const items: BatchInputLotItem[] = (inputs || []).map((inp: any) => {
          const lot = lotLookup.get(inp.lotId);
          return {
            lotId: inp.lotId,
            inputFineMg: inp.inputFineMg || 0,
            customerName: lot?.receivedFrom || 'Scrap Lot',
            purityPercent: lot?.purityPercent || 0,
            grossWeightMg: lot?.grossWeightMg || 0,
            metal: (lot?.metal || 'GOLD') as 'GOLD' | 'SILVER',
          };
        });
        inputsMap[b.id] = {
          count: items.length,
          totalInputFineMg: items.reduce((sum, item) => sum + item.inputFineMg, 0),
          lots: items,
        };
      }
      setBatchInputsMap(inputsMap);
    } catch (e) {
      console.warn('[MeltBatchesScreen] Error loading batches:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadBatches();
  };

  const openCreateModal = async () => {
    if (!activeFirmId) return;
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const rawLots = await oldMetalLotRepository.findEligible(activeFirmId);
      // Melt run consolidates gold scrap into pure assayed bullion bars
      const goldLots = (rawLots || []).filter((l) => l.metal === 'GOLD');
      setAvailableLots(goldLots);
      setSelectedLotIds([]);
      setShowCreateModal(true);
    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Unable to load eligible scrap lots.');
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
    if (selectedLotIds.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one scrap lot to melt.');
      return;
    }

    setIsSubmitting(true);
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      await meltBatchService.createMeltBatch({ lotIds: selectedLotIds }, activeFirmId);
      setShowCreateModal(false);
      Alert.alert('Melt Batch Initiated', 'Scrap lots have been grouped into a new melt run.');
      loadBatches();
    } catch (e: any) {
      Alert.alert('Creation Failed', e.message || 'Could not initiate melt batch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCloseModal = (batch: MeltBatch) => {
    setSelectedBatch(batch);
    setOutputWeightGrams('');
    setOutputPurityPct('99.50');
    setShowCloseModal(true);
  };

  const handleCloseBatch = async () => {
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

    const outputGrossWeightMg = Math.round(parsedGrams * 1000);

    setIsSubmitting(true);
    try {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      await meltBatchService.closeMeltBatch(
        selectedBatch.id,
        outputGrossWeightMg,
        parsedPurity,
        activeFirmId
      );
      setShowCloseModal(false);
      Alert.alert(
        'Melt Completed',
        `Assayed Bar produced: ${parsedGrams.toFixed(3)}g at ${parsedPurity}% purity. New MELT_OUTPUT lot generated for Karigar issuance.`
      );
      loadBatches();
    } catch (e: any) {
      Alert.alert('Close Failed', e.message || 'Could not close melt batch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBatches = useMemo(() => {
    if (activeTab === 'ACTIVE') return batches.filter((b) => b.status === 'CREATED');
    if (activeTab === 'CLOSED') return batches.filter((b) => b.status === 'CLOSED');
    return batches;
  }, [batches, activeTab]);

  const activeCount = batches.filter((b) => b.status === 'CREATED').length;
  const closedCount = batches.filter((b) => b.status === 'CLOSED').length;

  const totalInputFineSelected = useMemo(() => {
    return availableLots
      .filter((l) => selectedLotIds.includes(l.id))
      .reduce((acc, curr) => acc + (curr.fineWeightMg || 0), 0);
  }, [availableLots, selectedLotIds]);

  return (
    <TwoToneWrapper
      title="Melt Batches"
      showBack
      headerContent={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <HeaderPill icon={<Flame size={12} color="#EA580C" />} label={`${activeCount} Active Runs`} />
          <HeaderPill icon={<CheckCircle2 size={12} color="#4ADE80" />} label={`${closedCount} Settled`} variant="success" />
        </View>
      }
    >
      <View style={s.container}>
        {/* TOP TAB CONTROLS + NEW BUTTON */}
        <View style={s.topBar}>
          <View style={s.tabGroup}>
            {(['ALL', 'ACTIVE', 'CLOSED'] as const).map((tab) => {
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
                    {tab === 'ACTIVE' ? `Active (${activeCount})` : tab === 'CLOSED' ? `Closed (${closedCount})` : 'All'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID="start-melt-run-btn"
            onPress={openCreateModal}
            style={[s.newBtn, { backgroundColor: colors.vjAccent }]}
          >
            <Plus size={16} color={colors.vjBg} />
            <Text style={[s.newBtnText, { color: colors.vjBg }]}>New Melt</Text>
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
              <Text style={[s.loadingText, { color: colors.vjText }]}>Loading melt runs...</Text>
            </View>
          ) : filteredBatches.length === 0 ? (
            <View style={s.emptyBox}>
              <Flame size={40} color={colors.vjAccent} style={{ opacity: 0.4, marginBottom: 12 }} />
              <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Melt Batches Found</Text>
              <Text style={[s.emptySubtitle, { color: colors.vjText }]}>
                {activeTab === 'ACTIVE'
                  ? 'There are currently no active melt runs in the furnace.'
                  : 'Start a new melt run to consolidate raw scrap lots.'}
              </Text>
            </View>
          ) : (
            filteredBatches.map((batch) => {
              const isClosed = batch.status === 'CLOSED';
              return (
                <GlassCard
                  key={batch.id}
                  style={{
                    borderColor: isClosed ? 'rgba(16, 185, 129, 0.28)' : 'rgba(234, 88, 12, 0.35)',
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
                            backgroundColor: isClosed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(234, 88, 12, 0.12)',
                            borderColor: isClosed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 88, 12, 0.3)',
                          },
                        ]}
                      >
                        <Flame size={18} color={isClosed ? '#10B981' : '#EA580C'} />
                      </View>
                      <View>
                        <Text style={[s.batchTitle, { color: colors.vjText }]}>
                          Melt #{batch.id.slice(0, 8).toUpperCase()}
                        </Text>
                        <Text style={[s.batchDate, { color: colors.vjText }]}>
                          Initiated: {formatDate(batch.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        s.statusPill,
                        {
                          backgroundColor: isClosed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(234, 88, 12, 0.12)',
                          borderColor: isClosed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 88, 12, 0.3)',
                        },
                      ]}
                    >
                      {isClosed ? <CheckCircle2 size={11} color="#10B981" /> : <Clock size={11} color="#EA580C" />}
                      <Text style={[s.statusText, { color: isClosed ? '#10B981' : '#EA580C' }]}>
                        {batch.status}
                      </Text>
                    </View>
                  </View>

                  {/* Body stats */}
                  <View style={[s.cardBody, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
                    {(() => {
                      const inputSummary = batchInputsMap[batch.id];
                      const isExpanded = expandedBatchId === batch.id;

                      if (isClosed) {
                        return (
                          <View>
                            <View style={s.metricsRow}>
                              <View style={s.metricCol}>
                                <Text style={[s.metricLabel, { color: colors.vjText }]}>Input Fine</Text>
                                <Text style={[s.metricVal, { color: colors.vjText }]}>
                                  {formatWeightMg(inputSummary?.totalInputFineMg || 0)}
                                </Text>
                                <Text style={{ fontSize: 10, color: `${colors.vjText}80`, fontWeight: '600', marginTop: 2 }}>
                                  {inputSummary?.count || 0} Scrap {inputSummary?.count === 1 ? 'Lot' : 'Lots'}
                                </Text>
                              </View>
                              <View style={s.metricCol}>
                                <Text style={[s.metricLabel, { color: colors.vjText }]}>Output Gross</Text>
                                <Text style={[s.metricVal, { color: colors.vjText }]}>
                                  {formatWeightMg(batch.outputGrossWeightMg || 0)}
                                </Text>
                                <Text style={{ fontSize: 10, color: colors.vjAccent, fontWeight: '700', marginTop: 2 }}>
                                  {batch.outputPurityPct ? `${batch.outputPurityPct}% Pure` : '—'}
                                </Text>
                              </View>
                              <View style={s.metricCol}>
                                <Text style={[s.metricLabel, { color: colors.vjText }]}>Assayed Fine</Text>
                                <Text style={[s.metricVal, { color: '#10B981' }]}>
                                  {formatWeightMg(batch.outputFineWeightMg || 0)}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700', marginTop: 2 }}>
                                  Bar Ingot Stored
                                </Text>
                              </View>
                            </View>

                            {/* Feedstock Lots Toggle */}
                            {inputSummary && inputSummary.lots.length > 0 && (
                              <TouchableOpacity
                                onPress={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                                style={[s.expandLotsToggle, { borderColor: `${colors.vjAccent}25`, backgroundColor: `${colors.vjAccent}06` }]}
                                activeOpacity={0.7}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Coins size={12} color={colors.vjAccent} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.vjAccent }}>
                                    {isExpanded ? 'Hide Feedstock Lots' : `View Feedstock (${inputSummary.count} Lots)`}
                                  </Text>
                                </View>
                                {isExpanded ? <ChevronUp size={13} color={colors.vjAccent} /> : <ChevronDown size={13} color={colors.vjAccent} />}
                              </TouchableOpacity>
                            )}

                            {isExpanded && inputSummary && (
                              <View style={[s.feedstockBox, { borderColor: `${colors.vjAccent}20`, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                                {inputSummary.lots.map((item, idx) => (
                                  <View key={`${item.lotId}-${idx}`} style={[s.feedstockRow, idx > 0 && { borderTopWidth: 1, borderTopColor: `${colors.vjAccent}10` }]}>
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                      <Text style={[s.feedstockCustomer, { color: colors.vjText }]} numberOfLines={1}>{item.customerName}</Text>
                                      <Text style={{ fontSize: 10.5, color: `${colors.vjText}80`, fontWeight: '600' }}>
                                        {formatKaratBadge(item.purityPercent, item.metal)} ({item.purityPercent}%) · Gross: {formatWeightMg(item.grossWeightMg)}
                                      </Text>
                                    </View>
                                    <Text style={[s.feedstockFine, { color: colors.vjAccent }]}>
                                      {formatWeightMg(item.inputFineMg)} Fine
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      }

                      // Active Melt Run (status = CREATED)
                      return (
                        <View>
                          <View style={s.metricsRow}>
                            <View style={s.metricCol}>
                              <Text style={[s.metricLabel, { color: colors.vjText }]}>Input Fine Gold</Text>
                              <Text style={[s.metricVal, { color: colors.vjAccent }]}>
                                {formatWeightMg(inputSummary?.totalInputFineMg || 0)}
                              </Text>
                            </View>
                            <View style={s.metricCol}>
                              <Text style={[s.metricLabel, { color: colors.vjText }]}>Feedstock Count</Text>
                              <Text style={[s.metricVal, { color: colors.vjText }]}>
                                {inputSummary?.count || 0} Scrap {inputSummary?.count === 1 ? 'Lot' : 'Lots'}
                              </Text>
                            </View>
                            <View style={s.metricCol}>
                              <Text style={[s.metricLabel, { color: colors.vjText }]}>Stage</Text>
                              <Text style={[s.metricVal, { color: '#EA580C' }]}>In Furnace</Text>
                            </View>
                          </View>

                          {/* Feedstock Lots inside furnace */}
                          {inputSummary && inputSummary.lots.length > 0 && (
                            <View style={[s.feedstockBox, { marginTop: 10, borderColor: 'rgba(234, 88, 12, 0.25)', backgroundColor: 'rgba(234, 88, 12, 0.04)' }]}>
                              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#EA580C', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
                                Scrap Feedstock in Melt:
                              </Text>
                              {inputSummary.lots.map((item, idx) => (
                                <View key={`${item.lotId}-${idx}`} style={[s.feedstockRow, idx > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(234, 88, 12, 0.12)' }]}>
                                  <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={[s.feedstockCustomer, { color: colors.vjText }]} numberOfLines={1}>{item.customerName}</Text>
                                    <Text style={{ fontSize: 10.5, color: `${colors.vjText}80`, fontWeight: '600' }}>
                                      {formatKaratBadge(item.purityPercent, item.metal)} · Gross: {formatWeightMg(item.grossWeightMg)}
                                    </Text>
                                  </View>
                                  <Text style={[s.feedstockFine, { color: colors.vjAccent }]}>
                                    {formatWeightMg(item.inputFineMg)} Fine
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                            <TouchableOpacity
                              testID={`complete-melt-btn-${batch.id}`}
                              onPress={() => openCloseModal(batch)}
                              style={[s.completeBtn, { backgroundColor: colors.vjAccent }]}
                            >
                              <Sparkles size={14} color={colors.vjBg} />
                              <Text style={[s.completeBtnText, { color: colors.vjBg }]}>Complete & Assay Bar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                </GlassCard>
              );
            })
          )}
        </ScrollView>

        {/* MODAL: START NEW MELT RUN */}
        <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { backgroundColor: isDark ? '#1C1418' : '#FFFFFF' }]}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Flame size={20} color="#EA580C" />
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Select Scrap Lots to Melt</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <X size={20} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalHint, { color: colors.vjText }]}>
                Only received raw customer scrap lots are eligible. Melts consolidate into an assayed ingot.
              </Text>

              {availableLots.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.vjText, opacity: 0.6 }}>No eligible scrap lots in vault.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 300, marginVertical: 12 }}>
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

              {/* Total fine weight summary */}
              <View style={[s.summaryBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[s.summaryLabel, { color: colors.vjText }]}>
                  Selected: {selectedLotIds.length} Lots
                </Text>
                <Text style={[s.summaryValue, { color: colors.vjAccent }]}>
                  Fine: {formatWeightMg(totalInputFineSelected)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCreateBatch}
                disabled={isSubmitting || selectedLotIds.length === 0}
                style={[
                  s.submitBtn,
                  {
                    backgroundColor: colors.vjAccent,
                    opacity: isSubmitting || selectedLotIds.length === 0 ? 0.5 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.vjBg} />
                ) : (
                  <Text style={[s.submitBtnText, { color: colors.vjBg }]}>Initiate Melt Run</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: COMPLETE & ASSAY BATCH */}
        <Modal visible={showCloseModal} animationType="slide" transparent onRequestClose={() => setShowCloseModal(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { backgroundColor: isDark ? '#1C1418' : '#FFFFFF' }]}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color="#10B981" />
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Complete & Assay Ingot</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                  <X size={20} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalHint, { color: colors.vjText }]}>
                Record the physical weight of the melted bar and assayed purity test. This generates a pure MELT_OUTPUT lot.
              </Text>

              <View style={{ marginVertical: 14, gap: 12 }}>
                <View>
                  <Text style={[s.inputLabel, { color: colors.vjText }]}>Output Bar Weight (Grams)</Text>
                  <TextInput
                    value={outputWeightGrams}
                    onChangeText={setOutputWeightGrams}
                    placeholder="e.g. 50.420"
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
                    placeholder="e.g. 99.50"
                    placeholderTextColor="rgba(150, 150, 150, 0.6)"
                    keyboardType="decimal-pad"
                    style={[s.textInput, { color: colors.vjText, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleCloseBatch}
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
                  <Text style={[s.submitBtnText, { color: colors.vjBg }]}>Complete Melt & Store Bar</Text>
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
  activeActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  completeBtnText: {
    fontSize: 12,
    fontWeight: '900',
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
