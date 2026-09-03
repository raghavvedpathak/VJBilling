// app/inventory/item-detail.tsx — Phase 2 v2.24 Canonical Screen with Full Inline Editing, HUID Correction & Live Pricing

import React, { useState, useCallback, memo, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from 'zustand';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { HeaderPill, GlassCard, FixedGlassBar } from '@/components/ui/Glass';
import { GlassDatePickerModal } from '@/components/ui/GlassDatePickerModal';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { itemService } from '@/services/phase2/itemService';
import { COLORS, getThemeColors } from '@/constants/theme';
import {
  getDisplayPurity,
  percentToKarat,
  formatKaratBadge,
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeWastageGoldGrams,
  computeAbsoluteTotalCostRupees,
  getCurrencySymbol,
  formatSKUDisplay,
  formatWeightMg as formatWeight,
  resolveFineWeightMg,
  computeFineGoldChargedMg,
  getPurityPresets,
  isPresetMatchingPurity,
  parseCleanFloat,
  rupeesToPaise,
} from '@/utils/calculations';
import { format, parseISO } from 'date-fns';
import { formatDate } from '@/utils/formatDate';
import {
  Tag, Scale, Gem, Clock, AlertTriangle, Info, AlertCircle,
  Shield, MapPin, Calculator, Tag as TagIcon,
  Trash2, Coins, Percent, Crown, Edit3, Check, X,
  ChevronDown, Calendar, Package
} from 'lucide-react-native';
import type { ItemDetail, ItemTimelineEvent, UpdateableItemDraftFields, MetalSource } from '@/types/phase2/phase2.types';
import { TERMINAL_ITEM_STATUSES } from '@/types/phase2/phase2.types';

const formatCurrency = (paise: number | null): string => {
  if (paise === null || paise === undefined) return '—';
  return getCurrencySymbol() + (Math.round(paise) / 100).toFixed(2);
};

const getEventLabel = (event: ItemTimelineEvent): string => {
  switch (event.eventType) {
    case 'CREATED': return 'Item Created';
    case 'ITEM_STATUS_CHANGED': return `Status Changed → ${event.newValue || 'Unknown'}`;
    case 'ITEM_EDITED': return 'Details Updated';
    case 'WEIGHT_ADJUSTED': return 'Weight Adjusted';
    case 'HUID_ADDED': return 'HUID Assigned';
    case 'HUID_CORRECTED': return 'HUID Corrected';
    case 'METAL_SOURCE_CORRECTED': return 'Metal Source Corrected';
    case 'BARCODE_REPRINTED': return 'Barcode Reprinted';
    case 'ITEM_RETURNED': return 'Returned to Stock';
    case 'ITEM_SENT_TO_KARIGAR': return `Sent to Karigar · ${event.karigarName || 'Unknown'}`;
    case 'ITEM_RETURNED_FROM_KARIGAR': {
      let out = event.outcome || 'Unknown';
      if (out === 'REPAIRED') out = 'Repaired';
      else if (out === 'UNREPAIRABLE') out = 'Unrepairable';
      else if (out === 'PARTIALLY_REPAIRED') out = 'Partially Repaired';
      return `Returned from Karigar · ${out}`;
    }
    case 'ITEM_SOLD' as any: return `Sold · Invoice #${event.newValue || 'Unknown'}`;
    case 'PHANTOM_CREATED': return 'Phantom Created';
    case 'PHANTOM_RECONCILED': return 'Phantom Reconciled';
    case 'SKU_CHANGED': return 'SKU Regenerated';
    case 'ITEM_ENTRY_DATE_CORRECTED': return 'Entry Date Corrected';
    default: return String(event.eventType).replace(/_/g, ' ');
  }
};

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'WARNING': return <AlertTriangle size={14} color={COLORS.warning} />;
    case 'ERROR': return <AlertCircle size={14} color={COLORS.error} />;
    default: return <Info size={14} color={COLORS.info} />;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'WARNING': return COLORS.warning;
    case 'ERROR': return COLORS.error;
    default: return COLORS.info;
  }
}

const TimelineRow = memo(({ event, isLast, dateFormatToken }: { event: ItemTimelineEvent; isLast: boolean; dateFormatToken: string }) => {
  const severityColor = getSeverityColor(event.severity);
  let dateStr = '';
  let timeStr = '';
  try {
    const d = parseISO(event.timestamp);
    dateStr = format(d, dateFormatToken || 'dd/MM/yyyy');
    timeStr = format(d, 'hh:mm a');
  } catch {
    dateStr = formatDate(event.timestamp);
  }

  return (
    <View style={s.timelineRow}>
      <View style={s.timelineLine}>
        <View style={[s.timelineDot, { backgroundColor: severityColor }]} />
        {!isLast && <View style={s.timelineConnector} />}
      </View>

      <View style={s.timelineCard}>
        <View style={s.timelineHeader}>
          {getSeverityIcon(event.severity)}
          <Text style={[s.timelineEventType, { color: severityColor }]}>
            {getEventLabel(event)}
          </Text>
        </View>

        {event.reason && (
          <Text style={s.timelineReason} numberOfLines={2}>{event.reason}</Text>
        )}

        <Text style={s.timelineDate}>{dateStr}{'\n'}{timeStr}</Text>
      </View>
    </View>
  );
});

function DetailRow({ label, subLabel, value, icon, valueColor, style }: { label: string; subLabel?: string; value: string; icon?: React.ReactNode; valueColor?: string; style?: any }) {
  return (
    <View style={[s.detailRow, style]}>
      <View style={s.detailLabelRow}>
        {icon ? <View style={s.detailIcon}>{icon}</View> : null}
        <View>
          <Text style={s.detailLabel}>{label}</Text>
          {Boolean(subLabel) ? <Text style={s.detailSubLabel}>{subLabel}</Text> : null}
        </View>
      </View>
      <Text style={[s.detailValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ItemDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId: string }>();
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;

  const { activeFirmId } = useFirmStore();
  const activeTheme = useStore(appSettingsStore, (st) => st.theme);
  const dateFormatToken = useStore(appSettingsStore, (st) => st.dateFormatToken) || 'dd/MM/yyyy';
  const colors = getThemeColors(activeTheme);

  const [item, setItem] = useState<ItemDetail | null>(() => {
    if (activeFirmId && itemId) {
      try {
        return inventoryDrillDownService.getItemDetailSync(activeFirmId, itemId);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editGrossGrams, setEditGrossGrams] = useState('');
  const [editStoneGrams, setEditStoneGrams] = useState('');
  const [editBeadsGrams, setEditBeadsGrams] = useState('');
  const [editPurityPercent, setEditPurityPercent] = useState('');
  const [editPurityKarat, setEditPurityKarat] = useState<number | null>(null);
  const [editWastagePercent, setEditWastagePercent] = useState('');
  const [editMetalSource, setEditMetalSource] = useState<MetalSource>('SUPPLIER_PURCHASE');
  const [editLocation, setEditLocation] = useState('');
  const [editMakingChargeRupees, setEditMakingChargeRupees] = useState('');
  const [editStoneCostRupees, setEditStoneCostRupees] = useState('');
  const [editPurchaseRateRupees, setEditPurchaseRateRupees] = useState('');
  const [editSizeValue, setEditSizeValue] = useState('');
  const [editSizeUnit, setEditSizeUnit] = useState<'INCH' | 'MM' | 'CM' | 'RING_SIZE' | ''>('');
  const [editDateIso, setEditDateIso] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editHuid, setEditHuid] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingInline, setSavingInline] = useState(false);

  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleStartEditing = useCallback(() => {
    if (!item) return;
    try { Haptics.selectionAsync(); } catch {}
    setEditGrossGrams((item.grossWeightMg / 1000).toString());
    setEditStoneGrams(item.stoneWeightMg ? (item.stoneWeightMg / 1000).toString() : '');
    setEditBeadsGrams(item.beadsWeightMg ? (item.beadsWeightMg / 1000).toString() : '');
    setEditPurityPercent(item.purityPercent ? item.purityPercent.toString() : '');
    setEditPurityKarat(item.purityKarat ?? null);
    setEditWastagePercent(item.wastagePercent ? item.wastagePercent.toString() : '');
    setEditMetalSource(item.metalSource as MetalSource);
    setEditLocation(item.location || '');
    setEditMakingChargeRupees(item.makingChargePaise !== null ? (item.makingChargePaise / 100).toString() : '');
    setEditStoneCostRupees(item.stoneCostPaise !== null ? (item.stoneCostPaise / 100).toString() : '');
    setEditPurchaseRateRupees(item.purchaseRatePaise !== null ? (item.purchaseRatePaise / 100).toString() : '');
    setEditSizeValue(item.sizeValue !== null && item.sizeValue !== undefined ? item.sizeValue.toString() : '');
    setEditSizeUnit((item.sizeUnit as 'INCH' | 'MM' | 'CM' | 'RING_SIZE') || '');
    setEditHuid(item.huid || '');
    setEditDateIso(item.createdAt ? item.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditReason('');
    setIsEditing(true);
  }, [item]);

  const handleCancelEditing = useCallback(() => {
    try { Haptics.selectionAsync(); } catch {}
    setIsEditing(false);
  }, []);

  const handleSaveInlineEditing = async () => {
    if (!item || !activeFirmId) return;

    const hasSizeValue = editSizeValue.trim() !== '';
    const hasSizeUnit = editSizeUnit !== '';
    if (hasSizeValue !== hasSizeUnit) {
      Alert.alert('Invalid Size', 'Size value and Size unit must either both be provided or both left blank.');
      return;
    }

    const purPct = parseCleanFloat(editPurityPercent);
    if (isNaN(purPct) || purPct <= 0 || purPct > 100) {
      Alert.alert('Invalid Purity', 'Purity percent must be greater than 0 and up to 100%.');
      return;
    }

    const grossG = parseCleanFloat(editGrossGrams);
    const stoneG = editStoneGrams.trim() !== '' ? parseCleanFloat(editStoneGrams) : 0;
    const beadsG = editBeadsGrams.trim() !== '' ? parseCleanFloat(editBeadsGrams) : 0;
    if (isNaN(grossG) || grossG <= 0) {
      Alert.alert('Invalid Weight', 'Gross weight must be greater than 0.');
      return;
    }
    const netG = grossG - stoneG - beadsG;
    if (netG <= 0) {
      Alert.alert('Invalid Net Weight', 'Net weight (Gross - Stone - Beads) must be greater than 0.');
      return;
    }

    const trimmedHuid = editHuid.trim().toUpperCase();
    if (trimmedHuid !== '' && !/^[A-Z0-9]{6}$/.test(trimmedHuid)) {
      Alert.alert('Invalid HUID', 'HUID must be exactly 6 uppercase alphanumeric characters (or left blank).');
      return;
    }

    const newGrossMg = Math.round(grossG * 1000);
    const newStoneMg = Math.round(stoneG * 1000);
    const newBeadsMg = Math.round(beadsG * 1000);
    const newWastage = editWastagePercent.trim() !== '' ? parseCleanFloat(editWastagePercent) : 0;

    const weightsChanged =
      newGrossMg !== item.grossWeightMg ||
      newStoneMg !== item.stoneWeightMg ||
      newBeadsMg !== item.beadsWeightMg ||
      newWastage !== (item.wastagePercent || 0);

    const purityChanged = purPct !== item.purityPercent;
    const metalSourceChanged = editMetalSource !== item.metalSource;
    const huidChanged = (item.huid || '') !== trimmedHuid;

    const oldDateIso = item.createdAt.slice(0, 10);
    const dateChanged = oldDateIso !== editDateIso;

    const criticalChanged = weightsChanged || purityChanged || metalSourceChanged || (huidChanged && item.huid !== null);
    if (criticalChanged && !editReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for adjusting weights, purity, metal source, or HUID.');
      return;
    }

    setSavingInline(true);
    try {
      const reasonText = editReason.trim() || 'Inline editing update';
      const parsedSizeVal = hasSizeValue ? parseCleanFloat(editSizeValue) : null;
      const parsedSizeUnit: 'INCH' | 'MM' | 'CM' | 'RING_SIZE' | null = editSizeUnit ? editSizeUnit : null;
      const newPurityKarat = item.metal === 'GOLD' ? (percentToKarat(purPct) || 0) : 0;

      // 1. Update non-weight & classification fields first so updated purity is persisted
      const payload: UpdateableItemDraftFields = {
        purityPercent: purPct,
        purityKarat: newPurityKarat,
        location: editLocation.trim() || null,
        makingChargePaise: editMakingChargeRupees.trim() !== '' ? rupeesToPaise(parseCleanFloat(editMakingChargeRupees)) : null,
        stoneCostPaise: editStoneCostRupees.trim() !== '' ? rupeesToPaise(parseCleanFloat(editStoneCostRupees)) : null,
        purchaseRatePaise: editPurchaseRateRupees.trim() !== '' ? rupeesToPaise(parseCleanFloat(editPurchaseRateRupees)) : null,
        sizeValue: parsedSizeVal,
        sizeUnit: parsedSizeUnit,
      };

      await itemService.updateItem(item.id, activeFirmId, payload, reasonText);

      // 2. Adjust Weights if physical weights or purity changed (fineWeightMg recalculated against new purity)
      if (weightsChanged || purityChanged) {
        await itemService.adjustWeight(
          item.id,
          activeFirmId,
          newGrossMg,
          newStoneMg,
          newBeadsMg,
          reasonText,
          newWastage
        );
      }

      // 3. Correct Metal Source if changed
      if (metalSourceChanged) {
        await itemService.correctMetalSource(item.id, activeFirmId, editMetalSource, reasonText);
      }

      // 4. Update HUID if changed
      if (huidChanged) {
        if (item.huid === null && trimmedHuid) {
          await itemService.addHUID(item.id, activeFirmId, trimmedHuid);
        } else if (item.huid !== null && trimmedHuid) {
          await itemService.correctHUID(item.id, activeFirmId, trimmedHuid, reasonText);
        }
      }

      // 5. Correct Entry Date if changed
      if (dateChanged) {
        await itemService.correctItemEntryDate(item.id, editDateIso, activeFirmId);
      }

      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, item.id);
      setItem(detail);
      setIsEditing(false);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert('Success', 'Item details updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save item updates');
    } finally {
      setSavingInline(false);
    }
  };

  const handleOpenDeleteModal = useCallback(() => {
    setDeleteReason('');
    setDeleteModalVisible(true);
  }, []);

  const handleDeleteItem = async () => {
    if (!item || !activeFirmId) return;
    const reasonTrimmed = deleteReason.trim();
    if (!reasonTrimmed) {
      Alert.alert('Reason Required', 'Please enter a reason for deleting this item.');
      return;
    }
    setDeleting(true);
    try {
      await itemService.deleteItem(item.id, activeFirmId, reasonTrimmed);
      setDeleteModalVisible(false);
      Alert.alert('Success', 'Item deleted successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      if (activeFirmId && itemId) {
        inventoryDrillDownService.getItemDetail(activeFirmId, itemId)
          .then((data) => {
            if (isMounted) setItem(data);
          })
          .catch((err) => {
            console.error('[ItemDetail] fetch failed:', err);
          });
      }
      return () => {
        isMounted = false;
      };
    }, [activeFirmId, itemId])
  );

  const liveCalculations = useMemo(() => {
    if (!item) return null;

    const gGrams = isEditing
      ? (editGrossGrams.trim() !== '' ? parseCleanFloat(editGrossGrams) : 0)
      : item.grossWeightMg / 1000;

    const sGrams = isEditing
      ? (editStoneGrams.trim() !== '' ? parseCleanFloat(editStoneGrams) : 0)
      : (item.stoneWeightMg ? item.stoneWeightMg / 1000 : 0);

    const bGrams = isEditing
      ? (editBeadsGrams.trim() !== '' ? parseCleanFloat(editBeadsGrams) : 0)
      : (item.beadsWeightMg ? item.beadsWeightMg / 1000 : 0);

    const netWeightMg = Math.max(0, Math.round((gGrams - sGrams - bGrams) * 1000));

    const livePurityPercent = isEditing
      ? (editPurityPercent.trim() !== '' ? parseCleanFloat(editPurityPercent) : item.purityPercent)
      : item.purityPercent;

    const livePurityKarat = isEditing
      ? editPurityKarat
      : item.purityKarat;

    const wastagePercent = isEditing
      ? (editWastagePercent.trim() !== '' ? parseCleanFloat(editWastagePercent) : 0)
      : (item.wastagePercent || 0);

    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, livePurityPercent, item.metal);
    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, livePurityPercent, wastagePercent);

    const vaultTruth = computeVaultTruthGrams(fineWeightMg);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    const wastageGold = computeWastageGoldGrams(costTruth, vaultTruth);

    const rate = isEditing
      ? (editPurchaseRateRupees.trim() !== '' ? parseCleanFloat(editPurchaseRateRupees) : 0)
      : (item.purchaseRatePaise ? item.purchaseRatePaise / 100 : 0);

    const making = isEditing
      ? (editMakingChargeRupees.trim() !== '' ? parseCleanFloat(editMakingChargeRupees) : 0)
      : (item.makingChargePaise ? item.makingChargePaise / 100 : 0);

    const stoneC = isEditing
      ? (editStoneCostRupees.trim() !== '' ? parseCleanFloat(editStoneCostRupees) : 0)
      : (item.stoneCostPaise ? item.stoneCostPaise / 100 : 0);

    const effectivePricePerGram = computeEffectivePricePerGram(rate, livePurityPercent, wastagePercent, item.metal);
    const hasCostData = (rate > 0 || making > 0 || stoneC > 0) && netWeightMg > 0;
    const netWeightG = netWeightMg / 1000;
    const totalAmount = computeAbsoluteTotalCostRupees(netWeightG, effectivePricePerGram, making, stoneC);
    const metalCostRupees = netWeightG * effectivePricePerGram;

    const karatBadge = formatKaratBadge(livePurityPercent, item.metal);
    const purityDisplayStr = (item.metal === 'GOLD' && karatBadge)
      ? `${karatBadge} · ${livePurityPercent.toFixed(1)}%`
      : getDisplayPurity(livePurityPercent, livePurityKarat, item.metal);

    const finParts: string[] = [];
    if (rate > 0) finParts.push(`Metal: ${getCurrencySymbol()}${metalCostRupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
    if (making > 0) finParts.push(`Labour: ${getCurrencySymbol()}${making.toLocaleString('en-IN')}`);
    if (stoneC > 0) finParts.push(`Stone: ${getCurrencySymbol()}${stoneC.toLocaleString('en-IN')}`);
    const financialBreakdownText = finParts.length > 0 ? finParts.join(' + ') : 'Base Metal Cost';

    let weightBreakdownText = `Gross: ${gGrams.toFixed(3)}g`;
    if (sGrams > 0 || bGrams > 0) {
      const deductions: string[] = [];
      if (sGrams > 0) deductions.push(`Stone: ${sGrams.toFixed(3)}g`);
      if (bGrams > 0) deductions.push(`Beads: ${bGrams.toFixed(3)}g`);
      weightBreakdownText = `Gross: ${gGrams.toFixed(3)}g - ${deductions.join(' - ')}`;
    }

    return {
      grossMg: Math.round(gGrams * 1000),
      grossGrams: gGrams,
      stoneMg: Math.round(sGrams * 1000),
      stoneGrams: sGrams,
      beadsMg: Math.round(bGrams * 1000),
      beadsGrams: bGrams,
      netMg: netWeightMg,
      netGrams: netWeightG,
      fineMg: fineWeightMg,
      weightBreakdown: weightBreakdownText,
      purityPercent: livePurityPercent,
      purityRaw: livePurityPercent,
      wastageRaw: wastagePercent,
      totalTouch: (livePurityPercent + wastagePercent).toFixed(2) + '%',
      purityKarat: livePurityKarat,
      purityDisplay: purityDisplayStr,
      wastagePercent,
      vaultTruth,
      costTruth,
      wastageGold,
      rate,
      making,
      stoneC,
      effectivePricePerGram,
      hasCostData,
      financialBreakdown: financialBreakdownText,
      totalAmount,
      isValid: netWeightG > 0 && livePurityPercent > 0,
    };
  }, [
    item, isEditing,
    editGrossGrams, editStoneGrams, editBeadsGrams, editPurityPercent, editPurityKarat, editWastagePercent,
    editPurchaseRateRupees, editMakingChargeRupees, editStoneCostRupees
  ]);

  if (!item || !liveCalculations) {
    return (
      <TwoToneWrapper title="" showBack>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.vjAccent} />
          <Text style={[s.loadingText, { color: colors.vjText }]}>Loading item details...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;
  const isEditable = !TERMINAL_ITEM_STATUSES.includes(item.status);

  const detailHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Crown size={12} color={colors.vjBg} />} label={item.designName} />
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={formatSKUDisplay(item.sku)} />
      <HeaderPill icon={<Shield size={12} color="#4ADE80" />} label={item.status} variant="success" />
      {isEditing && (
        <HeaderPill icon={<Edit3 size={12} color="#D97706" />} label="Edit Mode Active" variant="warning" />
      )}
    </View>
  );

  return (
    <TwoToneWrapper title="Item Detail" showBack headerContent={detailHeaderPills}>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 190 }}
        >
          {isEditable && isEditing && (
            <GlassCard style={s.topEditingBannerCard}>
              <View style={s.topEditingBannerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Edit3 size={16} color={colors.vjAccent} />
                  <Text style={[s.topEditingTitle, { color: colors.vjText }]}>Editing All Fields & HUID</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>
                  Tap Save at the bottom
                </Text>
              </View>
            </GlassCard>
          )}

          {/* DETAILS CARD */}
          <View style={s.section}>
            <View style={[s.sectionCard, { borderColor: `${colors.vjAccent}25` }]}>
              <DetailRow label="Design" value={item.designName} icon={<Crown size={14} color={colors.vjAccent} />} />
              <DetailRow label="Category" value={item.categoryName} icon={<Tag size={14} color={colors.vjAccent} />} />
              <DetailRow label="Metal" value={item.metal.charAt(0) + item.metal.slice(1).toLowerCase()} valueColor={metalColor} icon={<Coins size={14} color={metalColor} />} />
              
              <View style={s.divider} />
              <Text style={[s.sectionTitle, { marginTop: 8, marginLeft: 14 }]}>Weight & Purity</Text>
              
              {/* GROSS WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Scale size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Gross Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editGrossGrams}
                    onChangeText={setEditGrossGrams}
                    placeholder="0.000"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(liveCalculations.grossMg)}</Text>
                )}
              </View>

              {/* STONE WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Gem size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Stone Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editStoneGrams}
                    onChangeText={setEditStoneGrams}
                    placeholder="0.000"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(liveCalculations.stoneMg)}</Text>
                )}
              </View>

              {/* BEADS WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Package size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Beads Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editBeadsGrams}
                    onChangeText={setEditBeadsGrams}
                    placeholder="0.000"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatWeight(liveCalculations.beadsMg)}</Text>
                )}
              </View>

              {/* LIVE COMPUTED NET WEIGHT */}
              <DetailRow label="Net Weight" value={formatWeight(liveCalculations.netMg)} icon={<Scale size={14} color={colors.vjAccent} />} />
              
              {/* EDITABLE PURITY ROW */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <Percent size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Purity Grade</Text>
                  {isEditing && formatKaratBadge(editPurityPercent, item.metal) ? (
                    <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>
                        {formatKaratBadge(editPurityPercent, item.metal)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {isEditing ? (
                  <View style={{ width: '100%', gap: 8 }}>
                    <TextInput
                      style={[s.inlineInputFull, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                      value={editPurityPercent}
                      onChangeText={(val) => {
                        setEditPurityPercent(val);
                        const num = parseCleanFloat(val);
                        if (!isNaN(num) && num > 0) {
                          setEditPurityKarat(item.metal === 'GOLD' ? (percentToKarat(num) || 0) : null);
                        }
                      }}
                      placeholder="Purity %"
                      keyboardType="decimal-pad"
                      placeholderTextColor="rgba(92,22,35,0.35)"
                    />
                    <View style={s.unitSelectorRow}>
                      {getPurityPresets(item.metal || 'GOLD').map((preset) => {
                        const isSelected = isPresetMatchingPurity(editPurityPercent, preset.val);
                        return (
                          <TouchableOpacity
                            key={preset.id}
                            style={[
                              s.unitChip,
                              isSelected && s.unitChipSelected,
                            ]}
                            onPress={() => {
                              setEditPurityPercent(preset.val);
                              setEditPurityKarat(item.metal === 'GOLD' ? preset.karat : null);
                            }}
                          >
                            <Text
                              style={[
                                s.unitChipText,
                                isSelected && s.unitChipTextSelected,
                              ]}
                            >
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{liveCalculations.purityDisplay}</Text>
                )}
              </View>

              {/* WASTAGE PERCENT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Percent size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Wastage %</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editWastagePercent}
                    onChangeText={setEditWastagePercent}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{liveCalculations.wastagePercent.toFixed(2) + '%'}</Text>
                )}
              </View>

            </View>
          </View>

          {/* LIVE COST BREAKDOWN */}
          {liveCalculations.isValid && (
            <View className="px-4 mb-4 mt-1" style={{ zIndex: 10 }}>
              <GlassCard style={{ backgroundColor: 'rgba(252,251,248, 0.98)', borderColor: '#D4AF37', borderWidth: 1.5, padding: 16 }}>
                <View className="flex-row items-center justify-between mb-3 pb-2.5 border-b border-black/5">
                  <View className="flex-row items-center gap-2">
                    <View className="w-7 h-7 rounded-lg items-center justify-center bg-amber-500/15 border border-amber-500/30">
                      <Calculator size={16} color="#D4AF37" />
                    </View>
                    <View>
                      <Text className="text-xs font-black uppercase tracking-wider text-vj-accent">Live Cost Breakdown</Text>
                      <Text className="text-[10px] text-vj-text/50 font-semibold">Real-Time Inventory Accounting</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <Text className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">LIVE</Text>
                  </View>
                </View>

                <View className="flex-row gap-2.5 mb-3">
                  <View className="flex-1 p-2.5 rounded-xl bg-black/[0.02] border border-black/5">
                    <Text className="text-[10px] font-bold text-vj-text/50 uppercase tracking-wider">Net Weight</Text>
                    <Text className="text-base font-black text-vj-text font-mono mt-0.5">{formatWeight(liveCalculations.netMg)}</Text>
                    <Text className="text-[9px] text-vj-text/55 font-semibold mt-0.5" numberOfLines={1}>
                      {liveCalculations.weightBreakdown}
                    </Text>
                  </View>

                  <View className="flex-1 p-2.5 rounded-xl bg-black/[0.02] border border-black/5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[10px] font-bold text-vj-text/50 uppercase tracking-wider">Total Touch</Text>
                      <Text className="text-xs font-black text-vj-accent font-mono">{liveCalculations.totalTouch}</Text>
                    </View>
                    <View className="mt-1 bg-vj-accent/10 px-1.5 py-0.5 rounded self-start">
                      <Text className="text-[9px] font-black text-vj-accent font-mono">
                        {liveCalculations.purityRaw}% Purity + {liveCalculations.wastageRaw}% Wastage
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="mb-3 p-3 rounded-2xl bg-black/[0.02] border border-black/5">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-vj-text/60 mb-2">
                    Fine Metal Accounting ({item.metal || 'GOLD'})
                  </Text>
                  
                  <View className="flex-row items-center justify-between gap-1">
                    <View className="flex-1 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center">
                      <Text className="text-[9px] font-black text-emerald-800 uppercase tracking-tight">Vault Fine</Text>
                      <Text className="text-xs font-black text-emerald-700 font-mono mt-0.5">{liveCalculations.vaultTruth.toFixed(3)} g</Text>
                      <Text className="text-[8px] font-semibold text-emerald-800/70 mt-0.5">Physical</Text>
                    </View>

                    <Text className="text-xs font-black text-vj-text/40">+</Text>

                    <View className="flex-1 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 items-center">
                      <Text className="text-[9px] font-black text-rose-800 uppercase tracking-tight">
                        Wastage
                      </Text>
                      <Text className="text-xs font-black text-rose-700 font-mono mt-0.5">{liveCalculations.wastageGold.toFixed(3)} g</Text>
                      <Text className="text-[8px] font-semibold text-rose-800/70 mt-0.5">Supplier</Text>
                    </View>

                    <Text className="text-xs font-black text-vj-text/40">=</Text>

                    <View className="flex-1 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center">
                      <Text className="text-[9px] font-black text-amber-900 uppercase tracking-tight">Billed Fine</Text>
                      <Text className="text-xs font-black text-amber-800 font-mono mt-0.5">{liveCalculations.costTruth.toFixed(3)} g</Text>
                      <Text className="text-[8px] font-semibold text-amber-800/70 mt-0.5">Cost Truth</Text>
                    </View>
                  </View>
                </View>

                {liveCalculations.hasCostData && (
                  <View className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <View className="flex-row justify-between items-center pb-1.5 border-b border-amber-500/15">
                      <Text className="text-[11px] text-vj-text/70 font-bold">Effective Price / g:</Text>
                      <Text className="text-xs font-black text-vj-text font-mono">
                        {getCurrencySymbol()} {liveCalculations.effectivePricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center pt-2">
                      <View className="flex-1 pr-2">
                        <Text className="text-xs font-black text-vj-text uppercase tracking-wider">EST. Total</Text>
                        <Text className="text-[10px] text-vj-text/60 font-semibold mt-0.5">
                          {liveCalculations.financialBreakdown}
                        </Text>
                      </View>
                      <Text className="text-base font-black font-mono text-amber-950">
                        {getCurrencySymbol()} {liveCalculations.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>
                )}
              </GlassCard>
            </View>
          )}

          {/* ITEM IDENTITY & ATTRIBUTES CARD */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Item Identity & Attributes</Text>
            <View style={[s.sectionCard, { borderColor: `${colors.vjAccent}25` }]}>

              {/* SIZE & UNIT */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <TagIcon size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Size & Unit</Text>
                </View>
                {isEditing ? (
                  <View style={{ width: '100%', gap: 8 }}>
                    <TextInput
                      style={[s.inlineInputFull, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                      value={editSizeValue}
                      onChangeText={setEditSizeValue}
                      placeholder="Size"
                      keyboardType="decimal-pad"
                      placeholderTextColor="rgba(92,22,35,0.35)"
                    />
                    <View style={s.unitSelectorRow}>
                      {(['INCH', 'MM', 'CM', 'RING_SIZE', ''] as const).map((unit) => (
                        <TouchableOpacity
                          key={unit}
                          style={[s.unitChip, editSizeUnit === unit && s.unitChipSelected]}
                          onPress={() => setEditSizeUnit(unit)}
                        >
                          <Text style={[s.unitChipText, editSizeUnit === unit && s.unitChipTextSelected]}>
                            {unit === '' ? 'None' : unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>
                    {item.sizeValue !== null && item.sizeValue !== undefined ? `${item.sizeValue} ${item.sizeUnit || ''}` : '—'}
                  </Text>
                )}
              </View>

              {/* HUID */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <View style={s.detailIcon}><Shield size={14} color={colors.vjAccent} /></View>
                  <Text style={s.detailLabel}>HUID Tag</Text>
                </View>
                {isEditing ? (
                  <View style={{ width: '100%' }}>
                    <TextInput
                      style={[s.inlineInputFull, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                      value={editHuid}
                      onChangeText={(val) => setEditHuid(val.toUpperCase())}
                      placeholder="6-char HUID"
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholderTextColor="rgba(92,22,35,0.35)"
                    />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {item.huid ? (
                      <View style={{ backgroundColor: 'rgba(212, 175, 55, 0.12)', borderColor: 'rgba(212, 175, 55, 0.3)', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.vjAccent, letterSpacing: 0.5 }}>
                          {item.huid}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[s.detailValue, { color: 'rgba(92,22,35,0.4)' }]}>Not Assigned</Text>
                    )}
                  </View>
                )}
              </View>

              {/* METAL SOURCE */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <Shield size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Metal Source</Text>
                </View>
                {isEditing ? (
                  <View style={s.unitSelectorRow}>
                    {(['SUPPLIER_PURCHASE', 'CUSTOMER_OLD_GOLD', 'CUSTOMER', 'KARIGAR', 'EXCHANGE', 'OPENING_BALANCE'] as const).map((source) => (
                      <TouchableOpacity
                        key={source}
                        style={[s.unitChip, editMetalSource === source && s.unitChipSelected]}
                        onPress={() => setEditMetalSource(source)}
                      >
                        <Text style={[s.unitChipText, editMetalSource === source && s.unitChipTextSelected]}>
                          {source === 'SUPPLIER_PURCHASE' ? 'Supplier' : source === 'CUSTOMER_OLD_GOLD' ? 'Old Gold' : source === 'CUSTOMER' ? 'Customer' : source === 'KARIGAR' ? 'Karigar' : source === 'EXCHANGE' ? 'Exchange' : 'Opening Bal'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>
                    {item.metalSource === 'SUPPLIER_PURCHASE'
                      ? 'Supplier Purchase'
                      : item.metalSource === 'CUSTOMER_OLD_GOLD'
                      ? 'Old Gold'
                      : item.metalSource === 'CUSTOMER'
                      ? 'Customer Scrap'
                      : item.metalSource === 'KARIGAR'
                      ? 'Karigar'
                      : item.metalSource === 'EXCHANGE'
                      ? 'Exchange'
                      : item.metalSource === 'OPENING_BALANCE'
                      ? 'Opening Balance'
                      : String(item.metalSource || '—')}
                  </Text>
                )}
              </View>

              {/* LOCATION */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <MapPin size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Storage Location</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="Location / Tray"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{item.location || '—'}</Text>
                )}
              </View>

              {/* ENTRY DATE */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Clock size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>Entry Date</Text>
                </View>
                {isEditing ? (
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={[s.inlineDateBtn, { borderColor: `${colors.vjAccent}50` }]}
                    activeOpacity={0.75}
                  >
                    <Calendar size={15} color={colors.vjAccent} />
                    <Text style={[s.inlineDateBtnText, { color: colors.vjText }]}>
                      {formatDate(editDateIso)}
                    </Text>
                    <ChevronDown size={14} color={colors.vjText} style={{ opacity: 0.6 }} />
                  </TouchableOpacity>
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatDate(item.createdAt)}</Text>
                )}
              </View>

              {isEditing && (
                <View style={[s.inlineReasonContainer, { borderColor: `${colors.vjAccent}35` }]}>
                  <Text style={[s.inlineReasonLabel, { color: colors.vjText }]}>Audit Reason for Edit (Optional)</Text>
                  <TextInput
                    style={[s.inlineReasonInput, { color: colors.vjText, borderColor: `${colors.vjAccent}40` }]}
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="Reason for change..."
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                </View>
              )}

            </View>
          </View>

          {/* PRICING & COST BREAKDOWN CARD */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Pricing & Cost Breakdown</Text>
            <View style={[s.sectionCard, { borderColor: `${colors.vjAccent}25` }]}>
              
              {/* PURCHASE RATE */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Coins size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>{`Purchase Rate (${getCurrencySymbol()}/g)`}</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editPurchaseRateRupees}
                    onChangeText={setEditPurchaseRateRupees}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatCurrency(item.purchaseRatePaise)}/g</Text>
                )}
              </View>

              {/* MAKING CHARGES */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Coins size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>{`Making Charges (${getCurrencySymbol()})`}</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editMakingChargeRupees}
                    onChangeText={setEditMakingChargeRupees}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatCurrency(item.makingChargePaise)}</Text>
                )}
              </View>

              {/* STONE COST */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Gem size={14} color={colors.vjAccent} />
                  <Text style={s.detailLabel}>{`Stone Cost (${getCurrencySymbol()})`}</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[s.inlineInput, { color: colors.vjText, borderColor: `${colors.vjAccent}50` }]}
                    value={editStoneCostRupees}
                    onChangeText={setEditStoneCostRupees}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={[s.detailValue, { color: colors.vjText }]}>{formatCurrency(item.stoneCostPaise)}</Text>
                )}
              </View>

            </View>
          </View>

          {/* TIMELINE AUDIT TRAIL */}
          <View style={s.section}>
            <View style={s.timelineTitleRow}>
              <Text style={s.sectionTitle}>Audit Event Timeline</Text>
              <View style={s.timelineCountBadge}>
                <Text style={s.timelineCountText}>{item.timeline?.length || 0}</Text>
              </View>
            </View>

            {(!item.timeline || item.timeline.length === 0) ? (
              <View style={s.timelineEmpty}>
                <Clock size={24} color="rgba(92,22,35,0.2)" />
                <Text style={s.timelineEmptyText}>No timeline events recorded yet</Text>
              </View>
            ) : (
              <View>
                {item.timeline.map((event, index) => (
                  <TimelineRow 
                    key={event.id} 
                    event={event} 
                    isLast={index === item.timeline.length - 1} 
                    dateFormatToken={dateFormatToken}
                  />
                ))}
              </View>
            )}
          </View>

        </KeyboardAwareScrollView>

        {/* FIXED STICKY ACTION BAR */}
        {isEditable && (
          <FixedGlassBar>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={s.bottomCancelBtn}
                  onPress={handleCancelEditing}
                  disabled={savingInline}
                  activeOpacity={0.7}
                >
                  <X size={18} color={colors.vjText} />
                  <Text style={[s.bottomCancelText, { color: colors.vjText }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="save-inline-item-btn"
                  style={s.bottomSaveBtn}
                  onPress={handleSaveInlineEditing}
                  disabled={savingInline}
                  activeOpacity={0.8}
                >
                  {savingInline ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Check size={18} color="#fff" />
                      <Text style={s.bottomSaveText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  testID="edit-item-details-btn"
                  style={[s.bottomEditBtn, { backgroundColor: colors.vjAccent }]}
                  onPress={handleStartEditing}
                  activeOpacity={0.8}
                >
                  <Edit3 size={18} color="#ffffff" />
                  <Text style={s.bottomEditText}>Edit Item Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="delete-item-btn"
                  style={s.bottomDeleteBtn}
                  onPress={handleOpenDeleteModal}
                  activeOpacity={0.7}
                >
                  <Trash2 size={18} color={COLORS.error} />
                </TouchableOpacity>
              </>
            )}
          </FixedGlassBar>
        )}
      </View>

      {/* Delete Item Modal */}
      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalContent}>
              <Text style={[s.modalTitle, { color: COLORS.error }]}>Delete Item</Text>
              
              <Text style={{ fontSize: 13, color: '#4B5563', marginBottom: 16 }}>
                Are you sure you want to delete SKU <Text style={{ fontWeight: 'bold' }}>{formatSKUDisplay(item.sku)}</Text>? This action is permanent and will remove the item from inventory.
              </Text>

              <Text style={s.modalLabel}>Reason for Deletion *</Text>
              <TextInput 
                style={s.modalInput}
                value={deleteReason}
                onChangeText={setDeleteReason}
                placeholder="Reason for deletion..."
                editable={!deleting}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setDeleteModalVisible(false)} disabled={deleting}>
                  <Text style={s.modalBtnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modalBtnPrimary, { backgroundColor: COLORS.error }]} onPress={handleDeleteItem} disabled={deleting}>
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <GlassDatePickerModal
        visible={showDatePicker}
        title="Correct Entry Date"
        value={editDateIso}
        onClose={() => setShowDatePicker(false)}
        onSelect={(d) => setEditDateIso(d)}
      />
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },

  topEditingBannerCard: {
    backgroundColor: 'rgba(255, 253, 249, 0.98)',
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  topEditingBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topEditingTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bottomEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 28,
  },
  bottomEditText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  bottomDeleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.15)',
    paddingVertical: 14,
    borderRadius: 28,
  },
  bottomCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 28,
  },
  bottomSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  inlineInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 120,
    textAlign: 'right',
  },
  inlineInputFull: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    width: '100%',
  },
  inlineDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inlineDateBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inlineReasonContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(212,175,55,0.05)',
    borderRadius: 10,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
  },
  inlineReasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  inlineReasonInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    color: 'rgba(92,22,35,0.45)', fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, padding: 4,
    borderWidth: 1,
  },

  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: 'rgba(92,22,35,0.04)', marginHorizontal: 14 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailIcon: { opacity: 0.7 },
  detailLabel: { color: 'rgba(92,22,35,0.5)', fontSize: 13, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  detailSubLabel: {
    color: 'rgba(92,22,35,0.4)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },

  unitSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  unitChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(92,22,35,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.1)',
  },
  unitChipSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  unitChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unitChipTextSelected: {
    color: '#ffffff',
  },

  timelineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginLeft: 2 },
  timelineCountBadge: { backgroundColor: 'rgba(92,22,35,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  timelineCountText: { color: 'rgba(92,22,35,0.5)', fontSize: 11, fontWeight: '800' },
  timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLine: { width: 24, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineConnector: { width: 2, flex: 1, backgroundColor: 'rgba(92,22,35,0.08)', marginTop: 4 },
  timelineCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', marginBottom: 8,
  },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  timelineEventType: { fontSize: 13, fontWeight: '700' },
  timelineReason: { color: 'rgba(92,22,35,0.6)', fontSize: 12, marginBottom: 4 },
  timelineDate: { color: 'rgba(92,22,35,0.35)', fontSize: 10, fontWeight: '600', marginTop: 4 },
  timelineEmpty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  timelineEmptyText: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, width: '100%' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.vjText, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(92,22,35,0.6)', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 15, color: '#1f2937' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtnSecondary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f3f4f6' },
  modalBtnTextSecondary: { color: '#4b5563', fontWeight: '600' },
  modalBtnPrimary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '600' },
});