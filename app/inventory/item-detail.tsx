// app/inventory/item-detail.tsx — Phase 2 v2.14 Canonical Screen with Full High-Performance Inline Editing, Inline HUID & Fixed Bottom Action Bar

import React, { useState, useCallback, memo, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
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
import { BlurView } from 'expo-blur';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { itemService } from '@/services/phase2/itemService';
import { COLORS, getThemeColors } from '@/constants/theme';
import {
  getDisplayPurity,
  percentToKarat,
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
} from '@/utils/calculations';
import { format, parseISO } from 'date-fns';
import { formatDate } from '@/utils/formatDate';
import {
  Package, Tag, Scale, Gem, FileText,
  Clock, AlertTriangle, Info, AlertCircle,
  Shield, MapPin, Calculator, Tag as TagIcon,
  Trash2, Coins, Percent, Crown, Award, Edit3, Check, X,
  ChevronUp, ChevronDown, Calendar
} from 'lucide-react-native';
import type { ItemDetail, ItemTimelineEvent, UpdateableItemDraftFields, MetalSource } from '@/types/phase2/phase2.types';
import { TERMINAL_ITEM_STATUSES } from '@/types/phase2/phase2.types';

const formatCurrency = (paise: number | null): string => {
  if (paise === null || paise === undefined) return '—';
  return getCurrencySymbol() + (Math.round(paise) / 100).toFixed(2);
};

// EVENT LABEL MAPPING (mandatory)
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
    default: return event.eventType.replace(/_/g, ' ');
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

// ======== TIMELINE ROW (React.memo) ========
const TimelineRow = memo(({ event, isLast }: { event: ItemTimelineEvent; isLast: boolean }) => {
  const severityColor = getSeverityColor(event.severity);
  let dateStr = '';
  let timeStr = '';
  try {
    const d = parseISO(event.timestamp);
    dateStr = format(d, 'dd MMM yyyy');
    timeStr = format(d, 'hh:mm a');
  } catch { /* fallback */ }

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

// ======== DETAIL ROW ========
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

// ======== MAIN SCREEN ========
export default function ItemDetailScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { activeFirmId } = useFirmStore();
  const activeTheme = useStore(appSettingsStore, (st) => st.theme);

  const [item, setItem] = useState<ItemDetail | null>(() => {
    if (activeFirmId && itemId) {
      try {
        return inventoryDrillDownService.getItemDetailSync(activeFirmId, itemId);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // --- Inline Editing State (Covers ALL fields including Purity & HUID) ---
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

  // Add / Correct HUID State (kept as Modal for standalone access)
  const [isHuidModalVisible, setHuidModalVisible] = useState(false);
  const [huidInput, setHuidInput] = useState('');
  const [huidReason, setHuidReason] = useState('');
  const [submittingHuid, setSubmittingHuid] = useState(false);

  // Delete Item State (kept as Modal for safety & typing confirm)
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const { dateFormatToken } = appSettingsStore.getState();

  // --- Start Inline Editing ---
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
    setEditSizeValue(item.sizeValue !== null ? item.sizeValue.toString() : '');
    setEditSizeUnit(item.sizeUnit || '');
    setEditHuid(item.huid || '');
    setEditDateIso(item.createdAt ? item.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditReason('');
    setIsEditing(true);
  }, [item]);

  const handleCancelEditing = useCallback(() => {
    try { Haptics.selectionAsync(); } catch {}
    setIsEditing(false);
  }, []);

  // --- Save All Inline Changes ---
  const handleSaveInlineEditing = async () => {
    if (!item || !activeFirmId) return;

    // Validate Size Pairing
    const hasSizeValue = editSizeValue.trim() !== '';
    const hasSizeUnit = editSizeUnit !== '';
    if (hasSizeValue !== hasSizeUnit) {
      Alert.alert('Invalid Size', 'Size value and Size unit must either both be provided or both left blank.');
      return;
    }

    // Validate Purity %
    const purPct = Number(editPurityPercent);
    if (isNaN(purPct) || purPct <= 0 || purPct > 100) {
      Alert.alert('Invalid Purity', 'Purity percent must be greater than 0 and up to 100%.');
      return;
    }

    // Validate Weights
    const grossG = Number(editGrossGrams);
    const stoneG = editStoneGrams.trim() !== '' ? Number(editStoneGrams) : 0;
    const beadsG = editBeadsGrams.trim() !== '' ? Number(editBeadsGrams) : 0;
    if (isNaN(grossG) || grossG <= 0) {
      Alert.alert('Invalid Weight', 'Gross weight must be greater than 0.');
      return;
    }
    const netG = grossG - stoneG - beadsG;
    if (netG <= 0) {
      Alert.alert('Invalid Net Weight', 'Net weight (Gross - Stone - Beads) must be greater than 0.');
      return;
    }

    // Validate HUID
    const trimmedHuid = editHuid.trim().toUpperCase();
    if (trimmedHuid !== '' && !/^[A-Z0-9]{6}$/.test(trimmedHuid)) {
      Alert.alert('Invalid HUID', 'HUID must be exactly 6 uppercase alphanumeric characters (or left blank).');
      return;
    }

    const newGrossMg = Math.round(grossG * 1000);
    const newStoneMg = Math.round(stoneG * 1000);
    const newBeadsMg = Math.round(beadsG * 1000);
    const newWastage = editWastagePercent.trim() !== '' ? Number(editWastagePercent) : 0;

    const weightsChanged =
      newGrossMg !== item.grossWeightMg ||
      newStoneMg !== item.stoneWeightMg ||
      newBeadsMg !== item.beadsWeightMg ||
      newWastage !== (item.wastagePercent || 0);

    const metalSourceChanged = editMetalSource !== item.metalSource;
    const huidChanged = (item.huid || '') !== trimmedHuid;

    const oldDateIso = item.createdAt.slice(0, 10);
    const dateChanged = oldDateIso !== editDateIso;

    const criticalChanged = weightsChanged || metalSourceChanged || (huidChanged && item.huid !== null);
    if (criticalChanged && !editReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for adjusting weights, metal source, or HUID.');
      return;
    }

    setSavingInline(true);
    try {
      const reasonText = editReason.trim() || 'Inline editing update';

      // 1. Adjust Weights if changed
      if (weightsChanged) {
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

      // 2. Correct Metal Source if changed
      if (metalSourceChanged) {
        await itemService.correctMetalSource(item.id, activeFirmId, editMetalSource, reasonText);
      }

      // 3. Update HUID if changed
      if (huidChanged) {
        if (item.huid === null && trimmedHuid) {
          await itemService.addHUID(item.id, activeFirmId, trimmedHuid);
        } else if (item.huid !== null && trimmedHuid) {
          await itemService.correctHUID(item.id, activeFirmId, trimmedHuid, reasonText);
        }
      }

      // 4. Correct Entry Date if changed
      if (dateChanged) {
        await itemService.correctItemEntryDate(item.id, editDateIso, activeFirmId);
      }

      // 5. Update General Fields (Location, Size, Charges, Purchase Rate, Purity)
      const payload: UpdateableItemDraftFields = {
        purityPercent: purPct,
        ...(editPurityKarat !== null ? { purityKarat: editPurityKarat } : {}),
        location: editLocation.trim() || null,
        makingChargePaise: editMakingChargeRupees.trim() !== '' ? Math.round(Number(editMakingChargeRupees) * 100) : null,
        stoneCostPaise: editStoneCostRupees.trim() !== '' ? Math.round(Number(editStoneCostRupees) * 100) : null,
        purchaseRatePaise: editPurchaseRateRupees.trim() !== '' ? Math.round(Number(editPurchaseRateRupees) * 100) : null,
        sizeValue: hasSizeValue ? Number(editSizeValue) : null,
        sizeUnit: hasSizeUnit ? (editSizeUnit as any) : null,
      };

      await itemService.updateItem(item.id, activeFirmId, payload, reasonText);

      // Re-fetch detail
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

  // --- HUID & Delete Handlers ---
  const handleOpenHuidModal = useCallback(() => {
    setHuidInput(item?.huid || '');
    setHuidReason('');
    setHuidModalVisible(true);
  }, [item]);

  const handleSaveHuid = async () => {
    if (!activeFirmId || !itemId || !item) return;
    const huidUpper = huidInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
      Alert.alert('Invalid HUID', 'HUID must be exactly 6 uppercase alphanumeric characters.');
      return;
    }

    setSubmittingHuid(true);
    try {
      if (item.huid === null) {
        await itemService.addHUID(itemId, activeFirmId, huidUpper);
        Alert.alert('Success', 'HUID assigned successfully.');
      } else {
        if (!huidReason.trim()) {
          Alert.alert('Reason Required', 'Please enter a reason for correcting the HUID.');
          setSubmittingHuid(false);
          return;
        }
        await itemService.correctHUID(itemId, activeFirmId, huidUpper, huidReason.trim());
        Alert.alert('Success', 'HUID corrected successfully.');
      }
      setHuidModalVisible(false);
      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, itemId);
      setItem(detail);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update HUID');
    } finally {
      setSubmittingHuid(false);
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

  // --- Real-time Reactive Derived Calculations ---
  const liveCalculations = useMemo(() => {
    if (!item) return null;

    const gGrams = isEditing
      ? (editGrossGrams.trim() !== '' ? Number(editGrossGrams) : 0)
      : item.grossWeightMg / 1000;

    const sGrams = isEditing
      ? (editStoneGrams.trim() !== '' ? Number(editStoneGrams) : 0)
      : (item.stoneWeightMg ? item.stoneWeightMg / 1000 : 0);

    const bGrams = isEditing
      ? (editBeadsGrams.trim() !== '' ? Number(editBeadsGrams) : 0)
      : (item.beadsWeightMg ? item.beadsWeightMg / 1000 : 0);

    const netWeightMg = Math.max(0, Math.round((gGrams - sGrams - bGrams) * 1000));

    const livePurityPercent = isEditing
      ? (editPurityPercent.trim() !== '' ? Number(editPurityPercent) : item.purityPercent)
      : item.purityPercent;

    const livePurityKarat = isEditing
      ? editPurityKarat
      : item.purityKarat;

    const wastagePercent = isEditing
      ? (editWastagePercent.trim() !== '' ? Number(editWastagePercent) : 0)
      : (item.wastagePercent || 0);

    const { fineWeightMg } = resolveFineWeightMg(netWeightMg, livePurityPercent, item.metal);
    const fineGoldChargedMg = computeFineGoldChargedMg(netWeightMg, livePurityPercent, wastagePercent);

    const vaultTruth = computeVaultTruthGrams(fineWeightMg);
    const costTruth = computeCostTruthGrams(fineGoldChargedMg, fineWeightMg);
    const wastageGold = computeWastageGoldGrams(costTruth, vaultTruth);

    const rate = isEditing
      ? (editPurchaseRateRupees.trim() !== '' ? Number(editPurchaseRateRupees) : 0)
      : (item.purchaseRatePaise ? item.purchaseRatePaise / 100 : 0);

    const making = isEditing
      ? (editMakingChargeRupees.trim() !== '' ? Number(editMakingChargeRupees) : 0)
      : (item.makingChargePaise ? item.makingChargePaise / 100 : 0);

    const stoneC = isEditing
      ? (editStoneCostRupees.trim() !== '' ? Number(editStoneCostRupees) : 0)
      : (item.stoneCostPaise ? item.stoneCostPaise / 100 : 0);

    const effectivePricePerGram = computeEffectivePricePerGram(rate, livePurityPercent, wastagePercent);
    const hasCostData = rate > 0 || making > 0 || stoneC > 0;
    const totalAmount = computeAbsoluteTotalCostRupees(costTruth, rate, making, stoneC);

    const purityDisplayStr = getDisplayPurity(livePurityPercent, livePurityKarat, item.metal);

    return {
      grossMg: Math.round(gGrams * 1000),
      stoneMg: Math.round(sGrams * 1000),
      beadsMg: Math.round(bGrams * 1000),
      netMg: netWeightMg,
      fineMg: fineWeightMg,
      purityPercent: livePurityPercent,
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
      totalAmount,
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
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
          <Text style={s.loadingText}>Loading item details...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;

  const dateToken = dateFormatToken || 'dd/MM/yyyy';
  let createdAtFormatted = item.createdAt;
  try {
    const parsedDate = parseISO(item.createdAt);
    if (!isNaN(parsedDate.getTime())) {
      createdAtFormatted = format(parsedDate, `${dateToken} hh:mm a`);
    }
  } catch {
    try {
      createdAtFormatted = format(parseISO(item.createdAt), 'dd/MM/yyyy hh:mm a');
    } catch {}
  }

  const isEditable = !TERMINAL_ITEM_STATUSES.includes(item.status);
  const colors = getThemeColors(activeTheme);

  const detailHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
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
          {/* === TOP BANNER (WHEN EDITING IS ACTIVE) === */}
          {isEditable && isEditing && (
            <GlassCard style={s.topEditingBannerCard}>
              <View style={s.topEditingBannerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Edit3 size={16} color={COLORS.vjAccent} />
                  <Text style={s.topEditingTitle}>Editing All Fields & HUID</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>
                  Tap Save at the bottom
                </Text>
              </View>
            </GlassCard>
          )}

          {/* === DETAILS CARD === */}
          <View style={s.section}>
            <View style={s.sectionCard}>
              <DetailRow label="Design" value={item.designName} icon={<Crown size={14} color={COLORS.vjAccent} />} />
              <DetailRow label="Category" value={item.categoryName} icon={<Tag size={14} color={COLORS.vjAccent} />} />
              <DetailRow label="Metal" value={item.metal.charAt(0) + item.metal.slice(1).toLowerCase()} valueColor={metalColor} icon={<Coins size={14} color={metalColor} />} />
              
              <View style={s.divider} />
              <Text style={[s.sectionTitle, { marginTop: 8, marginLeft: 14 }]}>Weight & Purity</Text>
              
              {/* GROSS WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Scale size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Gross Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editGrossGrams}
                    onChangeText={setEditGrossGrams}
                    placeholder="e.g. 12.500"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatWeight(liveCalculations.grossMg)}</Text>
                )}
              </View>

              {/* STONE WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Gem size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Stone Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editStoneGrams}
                    onChangeText={setEditStoneGrams}
                    placeholder="e.g. 0.500"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatWeight(liveCalculations.stoneMg)}</Text>
                )}
              </View>

              {/* BEADS WEIGHT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Package size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Beads Weight (g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editBeadsGrams}
                    onChangeText={setEditBeadsGrams}
                    placeholder="e.g. 0.200"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatWeight(liveCalculations.beadsMg)}</Text>
                )}
              </View>

              {/* LIVE COMPUTED NET WEIGHT */}
              <DetailRow label="Net Weight" value={formatWeight(liveCalculations.netMg)} icon={<Scale size={14} color={COLORS.vjAccent} />} />
              
              {/* EDITABLE PURITY ROW */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <Percent size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Purity Grade</Text>
                  {isEditing && item.metal === 'GOLD' && editPurityKarat ? (
                    <View style={{ backgroundColor: 'rgba(212,175,55,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#D4AF37' }}>
                        {editPurityKarat}K
                      </Text>
                    </View>
                  ) : null}
                </View>
                {isEditing ? (
                  <View style={{ width: '100%', gap: 8 }}>
                    <TextInput
                      style={s.inlineInputFull}
                      value={editPurityPercent}
                      onChangeText={(val) => {
                        setEditPurityPercent(val);
                        const num = Number(val);
                        if (!isNaN(num) && num > 0) {
                          setEditPurityKarat(percentToKarat(num));
                        }
                      }}
                      placeholder="Purity % (e.g. 91.6, 75.0, 92.5)"
                      keyboardType="numeric"
                      placeholderTextColor="rgba(92,22,35,0.35)"
                    />
                    <View style={s.unitSelectorRow}>
                      {getPurityPresets(item.metal || 'GOLD').map((preset) => (
                        <TouchableOpacity
                          key={preset.id}
                          style={[
                            s.unitChip,
                            editPurityPercent === preset.val && s.unitChipSelected,
                          ]}
                          onPress={() => {
                            setEditPurityPercent(preset.val);
                            setEditPurityKarat(preset.karat);
                          }}
                        >
                          <Text
                            style={[
                              s.unitChipText,
                              editPurityPercent === preset.val && s.unitChipTextSelected,
                            ]}
                          >
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={s.detailValue}>{liveCalculations.purityDisplay}</Text>
                )}
              </View>

              {/* LIVE COMPUTED FINE WEIGHT */}
              <DetailRow label="Vault Truth (Fine Weight)" value={liveCalculations.vaultTruth.toFixed(3) + ' g'} valueColor="#047857" style={s.highlightGreenRow} icon={<Award size={14} color="#047857" />} />
              
              {/* WASTAGE PERCENT */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Percent size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Wastage %</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editWastagePercent}
                    onChangeText={setEditWastagePercent}
                    placeholder="e.g. 5.0"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{liveCalculations.wastagePercent.toFixed(2) + '%'}</Text>
                )}
              </View>

              <DetailRow label={item.metal === 'GOLD' ? 'Wastage Gold' : 'Wastage Silver'} subLabel={`= ${(liveCalculations.netMg / 1000).toFixed(3)} g × ${liveCalculations.wastagePercent.toFixed(2)}%`} value={liveCalculations.wastageGold.toFixed(3) + ' g'} valueColor="#B91C1C" style={s.highlightRedRow} icon={<Coins size={14} color="#B91C1C" />} />
              <DetailRow label="Cost Truth (Fine)" subLabel={`= ${(liveCalculations.netMg / 1000).toFixed(3)} g × ${(liveCalculations.purityPercent + liveCalculations.wastagePercent).toFixed(2)}%`} value={liveCalculations.costTruth.toFixed(3) + ' g'} valueColor="#B45309" style={s.highlightOrangeRow} icon={<Calculator size={14} color="#B45309" />} />
              
              <View style={s.divider} />
              <Text style={[s.sectionTitle, { marginTop: 8, marginLeft: 14 }]}>Item Identity & Attributes</Text>

              {/* SIZE & UNIT */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <TagIcon size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Size & Unit</Text>
                </View>
                {isEditing ? (
                  <View style={{ width: '100%', gap: 8 }}>
                    <TextInput
                      style={s.inlineInputFull}
                      value={editSizeValue}
                      onChangeText={setEditSizeValue}
                      placeholder="Size Value (e.g. 2.4, 12, 18)"
                      keyboardType="numeric"
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
                  <Text style={s.detailValue}>{item.sizeValue !== null ? `${item.sizeValue} ${item.sizeUnit}` : '—'}</Text>
                )}
              </View>

              {/* HUID (EDITABLE INLINE) */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <View style={s.detailIcon}><Shield size={14} color={COLORS.vjAccent} /></View>
                  <Text style={s.detailLabel}>HUID Tag</Text>
                </View>
                {isEditing ? (
                  <View style={{ width: '100%' }}>
                    <TextInput
                      style={s.inlineInputFull}
                      value={editHuid}
                      onChangeText={(val) => setEditHuid(val.toUpperCase())}
                      placeholder="6-character HUID (e.g. AB1234)"
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholderTextColor="rgba(92,22,35,0.35)"
                    />
                  </View>
                ) : (
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Text style={s.detailValue}>{item.huid || '—'}</Text>
                    {isEditable && (
                      <TouchableOpacity activeOpacity={0.7} onPress={handleOpenHuidModal}>
                        <Text style={{color: COLORS.vjAccent, fontSize: 13, fontWeight: '700'}}>
                          {item.huid === null ? '✎ Add HUID' : '✎ Correct HUID'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* METAL SOURCE */}
              <View style={[s.detailRow, isEditing && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <View style={s.detailLabelRow}>
                  <Shield size={14} color={COLORS.vjAccent} />
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
                  <Text style={s.detailValue}>
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
                  <MapPin size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Storage Location</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="e.g. Tray 4 / Safe 2"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{item.location || '—'}</Text>
                )}
              </View>

              {/* CREATION DATE (MODERN GLASS DATE PICKER) */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Clock size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Entry Date</Text>
                </View>
                {isEditing ? (
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={s.inlineDateBtn}
                    activeOpacity={0.75}
                  >
                    <Calendar size={15} color={COLORS.vjAccent} />
                    <Text style={s.inlineDateBtnText}>
                      {formatDate(editDateIso)}
                    </Text>
                    <ChevronDown size={14} color={COLORS.vjText} style={{ opacity: 0.6 }} />
                  </TouchableOpacity>
                ) : (
                  <Text style={s.detailValue}>{createdAtFormatted}</Text>
                )}
              </View>

              {/* INLINE REASON INPUT (SHOWN WHEN IN EDIT MODE) */}
              {isEditing && (
                <View style={s.inlineReasonContainer}>
                  <Text style={s.inlineReasonLabel}>Audit Reason for Edit (Optional)</Text>
                  <TextInput
                    style={s.inlineReasonInput}
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="e.g. Weighing correction / Tag assigned"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                </View>
              )}

            </View>
          </View>

          {/* === PRICING & COST BREAKDOWN CARD === */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Pricing & Cost Breakdown</Text>
            <View style={s.sectionCard}>
              
              {/* PURCHASE RATE */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Coins size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Purchase Rate (₹/g)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editPurchaseRateRupees}
                    onChangeText={setEditPurchaseRateRupees}
                    placeholder="e.g. 6500.00"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatCurrency(item.purchaseRatePaise)}/g</Text>
                )}
              </View>

              {/* MAKING CHARGES */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Coins size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Making Charges (₹)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editMakingChargeRupees}
                    onChangeText={setEditMakingChargeRupees}
                    placeholder="e.g. 1500.00"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatCurrency(item.makingChargePaise)}</Text>
                )}
              </View>

              {/* STONE COST */}
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Gem size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Stone Cost (₹)</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={s.inlineInput}
                    value={editStoneCostRupees}
                    onChangeText={setEditStoneCostRupees}
                    placeholder="e.g. 800.00"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(92,22,35,0.35)"
                  />
                ) : (
                  <Text style={s.detailValue}>{formatCurrency(item.stoneCostPaise)}</Text>
                )}
              </View>

              <View style={s.divider} />
              
              {/* LIVE COMPUTED EFFECTIVE PRICE */}
              <DetailRow
                label="Effective Rate / Gram"
                subLabel="= Rate ÷ ((Purity + Wastage) ÷ 100)"
                value={liveCalculations.effectivePricePerGram > 0 ? getCurrencySymbol() + liveCalculations.effectivePricePerGram.toFixed(2) + '/g' : '—'}
                valueColor="#047857"
                style={s.highlightGreenRow}
                icon={<Coins size={14} color="#047857" />}
              />

              {/* LIVE COMPUTED TOTAL AMOUNT */}
              <DetailRow
                label="Total Computed Cost"
                subLabel="= (Cost Truth × Rate) + Making + Stone"
                value={liveCalculations.hasCostData ? getCurrencySymbol() + liveCalculations.totalAmount.toFixed(2) : '—'}
                valueColor={COLORS.vjAccent}
                style={s.highlightGoldRow}
                icon={<Calculator size={14} color={COLORS.vjAccent} />}
              />

            </View>
          </View>

          {/* === STONES BREAKDOWN (IF ANY) === */}
          {(item as any).stones && (item as any).stones.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Attached Gemstones ({((item as any).stones).length})</Text>
              <View style={s.sectionCard}>
                {((item as any).stones).map((st: any, i: number) => (
                  <React.Fragment key={st.id || i}>
                    <View style={s.detailRow}>
                      <View style={s.detailLabelRow}>
                        <Gem size={14} color={COLORS.vjAccent} />
                        <Text style={s.detailLabel}>{st.stoneName || 'Stone'}</Text>
                      </View>
                      <Text style={s.detailValue}>
                        {st.stoneWeightMg ? `${(st.stoneWeightMg / 1000).toFixed(3)} g` : '—'}
                        {st.stoneCostPaise ? ` · ${formatCurrency(st.stoneCostPaise)}` : ''}
                      </Text>
                    </View>
                    {i < ((item as any).stones).length - 1 && <View style={s.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* === TIMELINE AUDIT TRAIL === */}
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
                  />
                ))}
              </View>
            )}
          </View>

        </KeyboardAwareScrollView>

        {/* === FIXED STICKY PILL-SHAPED GLASS ACTION BAR (PERMANENTLY PINNED) === */}
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
                  <X size={18} color={COLORS.vjText} />
                  <Text style={s.bottomCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
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
                  style={s.bottomEditBtn}
                  onPress={handleStartEditing}
                  activeOpacity={0.8}
                >
                  <Edit3 size={18} color="#ffffff" />
                  <Text style={s.bottomEditText}>Edit Item Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
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

      {/* Add / Correct HUID Modal */}
      <Modal visible={isHuidModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>{item.huid === null ? 'Add HUID' : 'Correct HUID'}</Text>
              
              <Text style={s.modalLabel}>HUID (6 uppercase chars) *</Text>
              <TextInput 
                style={s.modalInput}
                value={huidInput}
                onChangeText={setHuidInput}
                placeholder="e.g. A1B2C3"
                autoCapitalize="characters"
                maxLength={6}
                editable={!submittingHuid}
              />

              {item.huid !== null && (
                <>
                  <Text style={s.modalLabel}>Reason for Correction *</Text>
                  <TextInput 
                    style={s.modalInput}
                    value={huidReason}
                    onChangeText={setHuidReason}
                    placeholder="e.g. Transposition typo on initial entry"
                    editable={!submittingHuid}
                  />
                </>
              )}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setHuidModalVisible(false)} disabled={submittingHuid}>
                  <Text style={s.modalBtnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalBtnPrimary} onPress={handleSaveHuid} disabled={submittingHuid}>
                  {submittingHuid ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
                placeholder="e.g. Duplicate entry / Incorrect data"
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
  // --- Loading / Empty ---
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },

  // --- Top Editing Banner ---
  topEditingBannerCard: {
    backgroundColor: 'rgba(255, 253, 249, 0.98)',
    borderColor: COLORS.vjAccent,
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
    color: COLORS.vjText,
  },
  bottomEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.vjAccent,
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
    color: COLORS.vjText,
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

  // --- Inline Inputs ---
  inlineInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.vjText,
    minWidth: 120,
    textAlign: 'right',
  },
  inlineInputFull: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.vjText,
    width: '100%',
  },

  // --- Inline Date Button ---
  inlineDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
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
    color: COLORS.vjText,
  },

  // --- Inline Reason Input ---
  inlineReasonContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(212,175,55,0.05)',
    borderRadius: 10,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  inlineReasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.vjText,
    marginBottom: 4,
  },
  inlineReasonInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: COLORS.vjText,
  },

  // --- Sections ---
  section: { marginBottom: 24 },
  sectionTitle: {
    color: 'rgba(92,22,35,0.45)', fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)',
  },

  // --- Detail Rows ---
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: 'rgba(92,22,35,0.04)', marginHorizontal: 14 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailIcon: { opacity: 0.7 },
  detailLabel: { color: 'rgba(92,22,35,0.5)', fontSize: 13, fontWeight: '600' },
  detailValue: { color: COLORS.vjText, fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  detailSubLabel: {
    color: 'rgba(92,22,35,0.4)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  highlightGreenRow: {
    backgroundColor: 'rgba(4,120,87,0.03)',
    borderLeftWidth: 3,
    borderLeftColor: '#047857',
    paddingLeft: 11,
  },
  highlightRedRow: {
    backgroundColor: 'rgba(185,28,28,0.03)',
    borderLeftWidth: 3,
    borderLeftColor: '#B91C1C',
    paddingLeft: 11,
  },
  highlightOrangeRow: {
    backgroundColor: 'rgba(180,83,9,0.03)',
    borderLeftWidth: 3,
    borderLeftColor: '#B45309',
    paddingLeft: 11,
  },
  highlightGoldRow: {
    backgroundColor: 'rgba(212,175,55,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.vjAccent,
    paddingLeft: 11,
  },

  // --- Timeline ---
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

  // --- Modal ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, width: '100%' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.vjText, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(92,22,35,0.6)', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 15, color: '#1f2937' },
  unitSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  unitChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  unitChipSelected: { backgroundColor: COLORS.vjAccent, borderColor: COLORS.vjAccent },
  unitChipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  unitChipTextSelected: { color: '#ffffff', fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtnSecondary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f3f4f6' },
  modalBtnTextSecondary: { color: '#4b5563', fontWeight: '600' },
  modalBtnPrimary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: COLORS.vjAccent, minWidth: 80, alignItems: 'center' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '600' },
});