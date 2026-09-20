// app/inventory/old-metal-lots.tsx — Phase 2 v2.34 Canonical Screen
// Implements FIX-OLDMETAL-RENAME-1 (v2.32), FIX-OLDMETAL-VOID-1 (v2.33), FIX-OLDGOLD-TXNLINK-1 (v2.31)

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { oldMetalLotRepository } from '@/repositories/phase2/oldGoldLotRepository';
import { oldMetalLotService } from '@/services/phase2/oldGoldLotService';
import { formatWeightMg as formatWeight, formatKaratBadge } from '@/utils/calculations';
import { formatDate } from '@/utils/formatDate';
import { Coins, Scale, ChevronRight, Ban } from 'lucide-react-native';
import type { OldMetalLot, OldMetalLotStatus } from '@/types/phase2/phase2.types';
import { VALID_LOT_TRANSITIONS } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

const LotCard = memo(({
  lot,
  colors,
  onOpenTransition,
}: {
  lot: OldMetalLot;
  colors: ReturnType<typeof getThemeColors>;
  onOpenTransition: (lot: OldMetalLot) => void;
}) => {
  const isGold = lot.metal === 'GOLD';
  const isVoided = lot.status === 'VOIDED';
  const metalColor = isGold ? COLORS.bullionGold : COLORS.bullionSilver;
  const karatBadge = formatKaratBadge(lot.purityPercent, lot.metal);

  return (
    <TouchableOpacity
      testID={`old-metal-lot-card-${lot.id}`}
      activeOpacity={0.88}
      onPress={() => onOpenTransition(lot)}
      style={{ marginBottom: 12 }}
    >
      <GlassCard style={[s.card, { borderColor: isVoided ? 'rgba(239, 68, 68, 0.25)' : `${colors.vjAccent}25` }]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
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

          <View
            style={[
              s.statusBadge,
              {
                backgroundColor: isVoided ? 'rgba(239, 68, 68, 0.12)' : `${colors.vjAccent}12`,
                borderColor: isVoided ? 'rgba(239, 68, 68, 0.3)' : `${colors.vjAccent}30`,
              },
            ]}
          >
            {isVoided ? <Ban size={11} color="#DC2626" /> : <Coins size={11} color={colors.vjAccent} />}
            <Text style={[s.statusText, { color: isVoided ? '#DC2626' : colors.vjAccent }]}>
              {lot.status}
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
              {lot.saleInvoiceId ? 'Sale Exchange' : lot.urdPurchaseId ? 'URD Purchase' : 'Direct Inward'}
            </Text>
          </View>
        </View>

        <View style={[s.cardFooter, { borderTopColor: `${colors.vjAccent}15` }]}>
          <Text style={[s.footerHint, { color: colors.vjText, opacity: 0.55 }]}>
            {isVoided ? 'Lot marked voided · No transitions allowed' : 'Tap to manage lifecycle state & transitions'}
          </Text>
          <ChevronRight size={13} color={colors.vjAccent} style={{ opacity: 0.5 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
});

export default function OldMetalLotsScreen() {
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [lots, setLots] = useState<OldMetalLot[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLot, setSelectedLot] = useState<OldMetalLot | null>(null);
  const [updating, setUpdating] = useState(false);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await oldMetalLotRepository.findByFirmId(activeFirmId);
      setLots(results || []);
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

  const availableTransitions = useMemo(() => {
    if (!selectedLot) return [];
    return VALID_LOT_TRANSITIONS[selectedLot.status as OldMetalLotStatus] || [];
  }, [selectedLot]);

  const handleTransitionStatus = async (nextStatus: OldMetalLotStatus) => {
    if (!selectedLot || !activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setUpdating(true);
    try {
      await oldMetalLotService.updateOldMetalLotStatus(
        selectedLot.id,
        activeFirmId,
        nextStatus,
        `Status transitioned to ${nextStatus}`
      );
      setSelectedLot(null);
      await loadData();
    } catch (err: any) {
      Alert.alert('Transition Error', err.message || 'Could not transition lot status.');
    } finally {
      setUpdating(false);
    }
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
                colors={colors}
                onOpenTransition={(l) => setSelectedLot(l)}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={140}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: Math.max(insets.bottom + 60, 80),
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

      {/* Lifecycle Transition Modal */}
      <Modal visible={!!selectedLot} transparent animationType="fade">
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => !updating && setSelectedLot(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[s.modalCard, { backgroundColor: colors.vjBg, borderColor: `${colors.vjAccent}35` }]}
          >
            <Text style={[s.modalTitle, { color: colors.vjText }]}>Manage Scrap Lot</Text>
            <Text style={[s.modalSub, { color: colors.vjText, opacity: 0.7 }]}>
              Current Status: <Text style={{ fontWeight: '800' }}>{selectedLot?.status}</Text>
            </Text>

            {availableTransitions.length > 0 ? (
              <View style={{ width: '100%', gap: 8, marginTop: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.vjAccent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  Available Lifecycle Transitions:
                </Text>
                {availableTransitions.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      s.transitionBtn,
                      status === 'VOIDED'
                        ? { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)' }
                        : { backgroundColor: `${colors.vjAccent}12`, borderColor: `${colors.vjAccent}35` },
                    ]}
                    onPress={() => handleTransitionStatus(status)}
                    disabled={updating}
                  >
                    <Text
                      style={[
                        s.transitionBtnText,
                        { color: status === 'VOIDED' ? '#DC2626' : colors.vjText },
                      ]}
                    >
                      Transition → {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ textAlign: 'center', fontSize: 13, color: colors.vjText, opacity: 0.6 }}>
                  This lot is in a terminal state ({selectedLot?.status}). No further transitions allowed.
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
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 10 },
  transitionBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  transitionBtnText: { fontSize: 13.5, fontWeight: '800' },
});
