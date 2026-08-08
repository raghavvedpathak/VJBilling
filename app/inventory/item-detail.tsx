import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from 'zustand';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { appSettingsStore } from '../../store/appSettingsStore';
import { HeaderPill, GlassCard } from '../../components/ui/Glass';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { itemService } from '../../services/itemService';
import { COLORS, getThemeColors } from '../../constants/theme';
import {
  getDisplayPurity,
  computeEffectivePricePerGram,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeWastageGoldGrams,
  computeAbsoluteTotalCostRupees,
  getCurrencySymbol,
  formatSKUDisplay,
  formatWeightMg as formatWeight
} from '../../utils/calculations';
import { format, parseISO } from 'date-fns';
import {
  Package, Tag, Scale, Gem, FileText,
  Clock, AlertTriangle, Info, AlertCircle,
  Shield, MapPin, Calculator, Tag as TagIcon,
  Trash2, Sparkles, Coins, Percent, Crown, Award, Edit3,
  ChevronUp, ChevronDown
} from 'lucide-react-native';
import type { ItemDetail, ItemTimelineEvent, UpdateableItemDraftFields, MetalSource } from '../../types/phase2.types';
import { TERMINAL_ITEM_STATUSES } from '../../types/phase2.types';
import { getJewelryCategoryIcon } from '../../utils/jewelryIcons';

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
    // Phase 3 touch point:
    case 'ITEM_SOLD' as any: return `Sold · Invoice #${event.newValue || 'Unknown'}`;
    // Fallbacks
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
    default: return COLORS.info; // neutral
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

  const label = getEventLabel(event);

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
            {label}
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
        {icon && <View style={s.detailIcon}>{icon}</View>}
        <View>
          <Text style={s.detailLabel}>{label}</Text>
          {subLabel && <Text style={s.detailSubLabel}>{subLabel}</Text>}
        </View>
      </View>
      <Text style={[s.detailValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ======== MAIN SCREEN ========
export default function ItemDetailScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { activeFirmId } = useFirmStore();
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
  const [loading, setLoading] = useState(false);

  // Date Correction State
  const [isDateModalVisible, setDateModalVisible] = useState(false);
  const [dateReason, setDateReason] = useState('');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [correctingDate, setCorrectingDate] = useState(false);
  const { dateFormatToken } = appSettingsStore.getState();

  // Add / Correct HUID State
  const [isHuidModalVisible, setHuidModalVisible] = useState(false);
  const [huidInput, setHuidInput] = useState('');
  const [huidReason, setHuidReason] = useState('');
  const [submittingHuid, setSubmittingHuid] = useState(false);

  // Metal Source Correction State
  const [isMetalSourceModalVisible, setMetalSourceModalVisible] = useState(false);
  const [selectedMetalSource, setSelectedMetalSource] = useState<MetalSource>('SUPPLIER_PURCHASE');
  const [metalSourceReason, setMetalSourceReason] = useState('');
  const [correctingMetalSource, setCorrectingMetalSource] = useState(false);

  // Delete Item State
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Edit Details Modal State (itemService.updateItem)
  const [isEditDetailsModalVisible, setEditDetailsModalVisible] = useState(false);
  const [editLocation, setEditLocation] = useState('');
  const [editMakingChargeRupees, setEditMakingChargeRupees] = useState('');
  const [editStoneCostRupees, setEditStoneCostRupees] = useState('');
  const [editPurchaseRateRupees, setEditPurchaseRateRupees] = useState('');
  const [editSizeValue, setEditSizeValue] = useState('');
  const [editSizeUnit, setEditSizeUnit] = useState<'INCH' | 'MM' | 'CM' | 'RING_SIZE' | ''>('');
  const [updatingDetails, setUpdatingDetails] = useState(false);

  // Adjust Weight Modal State (itemService.adjustWeight)
  const [isAdjustWeightModalVisible, setAdjustWeightModalVisible] = useState(false);
  const [adjustGrossGrams, setAdjustGrossGrams] = useState('');
  const [adjustStoneGrams, setAdjustStoneGrams] = useState('');
  const [adjustBeadsGrams, setAdjustBeadsGrams] = useState('');
  const [adjustWastagePercent, setAdjustWastagePercent] = useState('');
  const [adjustWeightReason, setAdjustWeightReason] = useState('');
  const [adjustingWeight, setAdjustingWeight] = useState(false);

  // --- Handlers ---
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

  const handleOpenDateModal = () => {
    const currentDate = item?.createdAt ? parseISO(item.createdAt) : new Date();
    setSelectedCalendarDate(currentDate);
    setCalendarYear(currentDate.getFullYear());
    setCalendarMonth(currentDate.getMonth());
    setDateReason('');
    setDateModalVisible(true);
  };

  const getMaxDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const handleDayStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    const currentDay = selectedCalendarDate.getDate();
    const maxDays = getMaxDaysInMonth(calendarYear, calendarMonth);
    let newDay = currentDay + delta;
    if (newDay < 1) newDay = maxDays;
    if (newDay > maxDays) newDay = 1;
    setSelectedCalendarDate(new Date(calendarYear, calendarMonth, newDay));
  };

  const handleMonthStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    let newMonth = calendarMonth + delta;
    let newYear = calendarYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    const maxDays = getMaxDaysInMonth(newYear, newMonth);
    const clampedDay = Math.min(selectedCalendarDate.getDate(), maxDays);
    setSelectedCalendarDate(new Date(newYear, newMonth, clampedDay));
  };

  const handleYearStep = (delta: number) => {
    try { Haptics.selectionAsync(); } catch {}
    const newYear = calendarYear + delta;
    setCalendarYear(newYear);
    const maxDays = getMaxDaysInMonth(newYear, calendarMonth);
    const clampedDay = Math.min(selectedCalendarDate.getDate(), maxDays);
    setSelectedCalendarDate(new Date(newYear, calendarMonth, clampedDay));
  };

  const handleCorrectDate = async () => {
    if (!item || !activeFirmId) return;
    try {
      if (!dateReason.trim()) {
        Alert.alert('Error', 'Reason is required');
        return;
      }
      
      const parsed = selectedCalendarDate;
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      const newIso = `${y}-${m}-${d}`;
      const oldDate = item.createdAt;
      const oldMonth = format(new Date(oldDate), 'MMyy');
      const newMonth = format(parsed, 'MMyy');

      const performCorrection = async () => {
        setCorrectingDate(true);
        try {
          const oldSku = item.sku;
          const updatedItem = await itemService.correctItemEntryDate(item.id, newIso, activeFirmId);
          const newSku = updatedItem.sku;
          const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, item.id);
          setItem(detail);
          setDateModalVisible(false);
          Alert.alert('Success', `Date corrected.${newSku !== oldSku ? `\nNew SKU: ${newSku}` : ''}`);
        } catch (e: any) {
          Alert.alert('Error', e.message);
        } finally {
          setCorrectingDate(false);
        }
      };

      if (oldMonth !== newMonth) {
        Alert.alert(
          'Confirm SKU Change',
          `This will change the item's SKU to match ${format(parsed, 'MMM yyyy')}. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm', style: 'destructive', onPress: performCorrection }
          ]
        );
      } else {
        performCorrection();
      }
    } catch (e) {
      Alert.alert('Error', 'Invalid date input');
    }
  };

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

  const handleOpenMetalSourceModal = useCallback(() => {
    if (!item) return;
    setSelectedMetalSource(item.metalSource as MetalSource);
    setMetalSourceReason('');
    setMetalSourceModalVisible(true);
  }, [item]);

  const handleCorrectMetalSource = async () => {
    if (!item || !activeFirmId) return;
    if (!metalSourceReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for correcting the metal source.');
      return;
    }

    setCorrectingMetalSource(true);
    try {
      await itemService.correctMetalSource(item.id, activeFirmId, selectedMetalSource, metalSourceReason.trim());
      setMetalSourceModalVisible(false);
      Alert.alert('Success', 'Metal source corrected successfully.');
      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, item.id);
      setItem(detail);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to correct metal source');
    } finally {
      setCorrectingMetalSource(false);
    }
  };

  // --- Handle updateItem() ---
  const handleOpenEditDetailsModal = useCallback(() => {
    if (!item) return;
    setEditLocation(item.location || '');
    setEditMakingChargeRupees(item.makingChargePaise !== null ? (item.makingChargePaise / 100).toString() : '');
    setEditStoneCostRupees(item.stoneCostPaise !== null ? (item.stoneCostPaise / 100).toString() : '');
    setEditPurchaseRateRupees(item.purchaseRatePaise !== null ? (item.purchaseRatePaise / 100).toString() : '');
    setEditSizeValue(item.sizeValue !== null ? item.sizeValue.toString() : '');
    setEditSizeUnit(item.sizeUnit || '');
    setEditDetailsModalVisible(true);
  }, [item]);

  const handleSaveDetails = async () => {
    if (!item || !activeFirmId) return;

    const hasSizeValue = editSizeValue.trim() !== '';
    const hasSizeUnit = editSizeUnit !== '';
    if (hasSizeValue !== hasSizeUnit) {
      Alert.alert('Invalid Size', 'Size value and Size unit must either both be provided or both left blank.');
      return;
    }

    setUpdatingDetails(true);
    try {
      const payload: UpdateableItemDraftFields = {
        location: editLocation.trim() || null,
        makingChargePaise: editMakingChargeRupees.trim() !== '' ? Math.round(Number(editMakingChargeRupees) * 100) : null,
        stoneCostPaise: editStoneCostRupees.trim() !== '' ? Math.round(Number(editStoneCostRupees) * 100) : null,
        purchaseRatePaise: editPurchaseRateRupees.trim() !== '' ? Math.round(Number(editPurchaseRateRupees) * 100) : null,
        sizeValue: hasSizeValue ? Number(editSizeValue) : null,
        sizeUnit: hasSizeUnit ? (editSizeUnit as any) : null,
      };

      await itemService.updateItem(item.id, activeFirmId, payload);
      setEditDetailsModalVisible(false);

      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, item.id);
      setItem(detail);
      Alert.alert('Success', 'Item details updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update details');
    } finally {
      setUpdatingDetails(false);
    }
  };

  // --- Handle adjustWeight() ---
  const handleOpenAdjustWeightModal = useCallback(() => {
    if (!item) return;
    setAdjustGrossGrams((item.grossWeightMg / 1000).toString());
    setAdjustStoneGrams((item.stoneWeightMg / 1000).toString());
    setAdjustBeadsGrams((item.beadsWeightMg / 1000).toString());
    setAdjustWastagePercent(item.wastagePercent ? item.wastagePercent.toString() : '');
    setAdjustWeightReason('');
    setAdjustWeightModalVisible(true);
  }, [item]);

  const handleSaveWeightAdjustment = async () => {
    if (!item || !activeFirmId) return;

    const grossGrams = Number(adjustGrossGrams);
    const stoneGrams = adjustStoneGrams ? Number(adjustStoneGrams) : 0;
    const beadsGrams = adjustBeadsGrams ? Number(adjustBeadsGrams) : 0;

    if (isNaN(grossGrams) || grossGrams <= 0) {
      Alert.alert('Invalid Weight', 'Gross weight must be greater than 0.');
      return;
    }

    const newGrossMg = Math.round(grossGrams * 1000);
    const newStoneMg = Math.round(stoneGrams * 1000);
    const newBeadsMg = Math.round(beadsGrams * 1000);
    const newNetMg = newGrossMg - newStoneMg - newBeadsMg;

    if (newNetMg <= 0) {
      Alert.alert('Invalid Net Weight', 'Net weight (Gross - Stone - Beads) must be greater than 0.');
      return;
    }

    if (!adjustWeightReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for adjusting the weight.');
      return;
    }

    setAdjustingWeight(true);
    try {
      const newWastage = adjustWastagePercent.trim() !== '' ? Number(adjustWastagePercent) : undefined;
      await itemService.adjustWeight(
        item.id,
        activeFirmId,
        newGrossMg,
        newStoneMg,
        newBeadsMg,
        adjustWeightReason.trim(),
        newWastage
      );

      setAdjustWeightModalVisible(false);

      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, item.id);
      setItem(detail);
      Alert.alert('Success', 'Weights adjusted successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to adjust weights');
    } finally {
      setAdjustingWeight(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !itemId) return;
        try {
          const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, itemId);
          if (active) setItem(detail);
        } catch (e) {
          console.error('[ItemDetail] load failed:', e);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, itemId])
  );

  if (!item) {
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
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal);

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

  let selectedCalendarDateFormatted = '';
  try {
    if (selectedCalendarDate && !isNaN(selectedCalendarDate.getTime())) {
      selectedCalendarDateFormatted = format(selectedCalendarDate, dateToken);
    } else {
      selectedCalendarDateFormatted = format(new Date(), dateToken);
    }
  } catch {
    try {
      selectedCalendarDateFormatted = format(new Date(), 'dd/MM/yyyy');
    } catch {}
  }

  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
  
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const vaultTruth = computeVaultTruthGrams(item.fineWeightMg);
  const costTruth = computeCostTruthGrams(item.fineGoldChargedMg, item.fineWeightMg);
  const wastageGold = computeWastageGoldGrams(costTruth, vaultTruth);

  const rate = item.purchaseRatePaise ? item.purchaseRatePaise / 100 : 0;
  const making = item.makingChargePaise ? item.makingChargePaise / 100 : 0;
  const stoneC = item.stoneCostPaise ? item.stoneCostPaise / 100 : 0;

  const effectivePricePerGram = computeEffectivePricePerGram(rate, item.purityPercent, item.wastagePercent || 0, item.metal);
  const hasCostData = rate > 0 || making > 0 || stoneC > 0;
  const totalAmount = computeAbsoluteTotalCostRupees(costTruth, rate, making, stoneC);

  const isEditable = !TERMINAL_ITEM_STATUSES.includes(item.status);
  const isDraft = item.status === 'DRAFT';
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const detailHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={formatSKUDisplay(item.sku)} />
      <HeaderPill icon={<Shield size={12} color="#4ADE80" />} label={item.status} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Item Detail" showBack headerContent={detailHeaderPills}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 350 }}>

        {/* === DETAILS CARD === */}
        <View style={s.section}>
          <View style={s.sectionCard}>
            <DetailRow label="Design" value={item.designName} icon={<Crown size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Category" value={item.categoryName} icon={<Tag size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Metal" value={item.metal.charAt(0) + item.metal.slice(1).toLowerCase()} valueColor={metalColor} icon={<Coins size={14} color={metalColor} />} />
            
            <View style={s.divider} />
            
            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Scale size={14} color={COLORS.vjAccent} />
                <Text style={s.detailLabel}>Gross Weight</Text>
                {isEditable && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenAdjustWeightModal} style={{ marginLeft: 6 }}>
                    <Text style={{ color: COLORS.vjAccent, fontSize: 13, fontWeight: '700' }}>✎ Adjust</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.detailValue}>{formatWeight(item.grossWeightMg)}</Text>
            </View>

            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Gem size={14} color={COLORS.vjAccent} />
                <Text style={s.detailLabel}>Stone Weight</Text>
                {isEditable && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenAdjustWeightModal} style={{ marginLeft: 6 }}>
                    <Text style={{ color: COLORS.vjAccent, fontSize: 13, fontWeight: '700' }}>✎ Adjust</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.detailValue}>{formatWeight(item.stoneWeightMg)}</Text>
            </View>

            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Package size={14} color={COLORS.vjAccent} />
                <Text style={s.detailLabel}>Beads Weight</Text>
                {isEditable && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenAdjustWeightModal} style={{ marginLeft: 6 }}>
                    <Text style={{ color: COLORS.vjAccent, fontSize: 13, fontWeight: '700' }}>✎ Adjust</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.detailValue}>{formatWeight(item.beadsWeightMg)}</Text>
            </View>

            <DetailRow label="Net Weight" value={formatWeight(item.netWeightMg)} icon={<Scale size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Purity" value={purityDisplay} icon={<Percent size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Fine Weight" value={formatWeight(item.fineWeightMg)} icon={<Award size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Vault Truth (Fine)" subLabel={`= ${(item.netWeightMg / 1000).toFixed(3)} g × ${item.purityPercent.toFixed(2)}%`} value={vaultTruth.toFixed(3) + ' g'} valueColor="#047857" style={s.highlightGreenRow} icon={<Shield size={14} color="#047857" />} />
            <DetailRow label="Wastage %" value={item.wastagePercent ? item.wastagePercent.toFixed(2) + '%' : '0.00%'} icon={<Percent size={14} color={COLORS.vjAccent} />} />
            <DetailRow label={item.metal === 'GOLD' ? 'Wastage Gold' : 'Wastage Silver'} subLabel={`= ${(item.netWeightMg / 1000).toFixed(3)} g × ${(item.wastagePercent || 0).toFixed(2)}%`} value={wastageGold.toFixed(3) + ' g'} valueColor="#B91C1C" style={s.highlightRedRow} icon={<Coins size={14} color="#B91C1C" />} />
            <DetailRow label="Cost Truth (Fine)" subLabel={`= ${(item.netWeightMg / 1000).toFixed(3)} g × ${(item.purityPercent + (item.wastagePercent || 0)).toFixed(2)}%`} value={costTruth.toFixed(3) + ' g'} valueColor="#B45309" style={s.highlightOrangeRow} icon={<Calculator size={14} color="#B45309" />} />
            
            <View style={s.divider} />
            
            <DetailRow label="Size" value={item.sizeValue !== null ? `${item.sizeValue} ${item.sizeUnit}` : '—'} icon={<TagIcon size={14} color={COLORS.vjAccent} />} />

            <View style={s.divider} />

            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <View style={s.detailIcon}><Shield size={14} color={COLORS.vjAccent} /></View>
                <Text style={s.detailLabel}>HUID</Text>
              </View>
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
            </View>
            
            <DetailRow label="Barcode" value={formatSKUDisplay(item.barcode)} icon={<TagIcon size={14} color={COLORS.vjAccent} />} />
            
            <View style={s.divider} />

            <DetailRow 
              label="Location" 
              value={item.location || '—'} 
              icon={<MapPin size={14} color={COLORS.vjAccent} />} 
            />
            <DetailRow label="Status" value={item.status.replace(/_/g, ' ')} icon={<Info size={14} color={COLORS.vjAccent} />} />
            
            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Package size={14} color={COLORS.vjAccent} />
                <Text style={s.detailLabel}>Metal Source</Text>
                {isEditable && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenMetalSourceModal} style={{ marginLeft: 6 }}>
                    <Text style={{ color: COLORS.vjAccent, fontSize: 13, fontWeight: '700' }}>✎ Correct</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.detailValue}>{item.metalSource.replace(/_/g, ' ')}</Text>
            </View>

            <DetailRow label="HSN Code" value={item.hsnCode} icon={<FileText size={14} color={COLORS.vjAccent} />} />
            
            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <View style={s.detailIcon}><Clock size={14} color={COLORS.vjAccent} /></View>
                <Text style={s.detailLabel}>Added On</Text>
                {isEditable && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenDateModal} style={{ marginLeft: 6 }}>
                     <Text style={{color: COLORS.vjAccent, fontSize: 13, fontWeight: 'bold'}}>✎ Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.detailValue}>{createdAtFormatted}</Text>
            </View>

            {/* === COST FIELDS === */}
            {(item.purchaseRatePaise !== null || item.makingChargePaise !== null || item.stoneCostPaise !== null) && (
              <>
                <View style={s.divider} />
                {item.purchaseRatePaise !== null && (
                  <DetailRow label="Purchase Rate" value={formatCurrency(item.purchaseRatePaise) + ' /g'} icon={<Calculator size={14} color={COLORS.vjAccent} />} />
                )}
                {item.makingChargePaise !== null && (
                  <DetailRow label="Making Charge" value={formatCurrency(item.makingChargePaise)} icon={<Calculator size={14} color={COLORS.vjAccent} />} />
                )}
                {item.stoneCostPaise !== null && (
                  <DetailRow label="Stone Cost" value={formatCurrency(item.stoneCostPaise)} icon={<Gem size={14} color={COLORS.vjAccent} />} />
                )}
                {hasCostData && (
                  <>
                    <DetailRow label="Effective Price/g" subLabel={`= ${getCurrencySymbol()}${rate.toFixed(2)} × ${(item.purityPercent + (item.wastagePercent || 0)).toFixed(2)}%`} value={getCurrencySymbol() + ' ' + effectivePricePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })} style={s.highlightGoldRow} icon={<Calculator size={14} color={COLORS.vjAccent} />} />
                    <DetailRow label="Est. Total Cost" subLabel={`= ${(item.netWeightMg / 1000).toFixed(3)} g × ${getCurrencySymbol()}${effectivePricePerGram.toFixed(2)}${making > 0 ? ' + ' + getCurrencySymbol() + making.toFixed(2) : ''}${stoneC > 0 ? ' + ' + getCurrencySymbol() + stoneC.toFixed(2) : ''}`} value={getCurrencySymbol() + ' ' + totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} valueColor="#78350F" style={s.highlightGoldRow} icon={<Calculator size={14} color="#78350F" />} />
                  </>
                )}
              </>
            )}

            <View style={s.divider} />
            
            {/* === INVOICE SLOT === */}
            {item.invoiceId ? (
              <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => {/* Phase 3 navigation */}}>
                <View style={s.detailLabelRow}>
                  <FileText size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Sale Invoice</Text>
                </View>
                <Text style={[s.detailValue, { color: COLORS.info, textDecorationLine: 'underline' }]}>{item.invoiceId}</Text>
              </TouchableOpacity>
            ) : (
              <DetailRow label="Sale Invoice" value="—" icon={<FileText size={14} color={COLORS.vjAccent} />} />
            )}

            {/* EDIT & DELETE ACTION BUTTONS */}
            {isEditable && (
              <View style={s.cardActionRow}>
                <TouchableOpacity
                  style={s.editActionBtn}
                  activeOpacity={0.7}
                  onPress={handleOpenEditDetailsModal}
                >
                  <Edit3 size={15} color={COLORS.vjAccent} />
                  <Text style={s.editActionBtnText}>Edit Location, Size & Charges</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.deleteCardBtn}
                  activeOpacity={0.7}
                  onPress={handleOpenDeleteModal}
                >
                  <Trash2 size={15} color={COLORS.error} />
                  <Text style={s.deleteCardBtnText}>Delete Item</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>

        {/* === TIMELINE SECTION === */}
        <View style={s.section}>
          <View style={s.timelineTitleRow}>
            <Clock size={16} color={COLORS.vjAccent} />
            <Text style={s.sectionTitle}>Item Timeline</Text>
            <View style={s.timelineCountBadge}>
              <Text style={s.timelineCountText}>{item.timeline.length}</Text>
            </View>
          </View>

          {item.timeline.length === 0 ? (
            <View style={s.timelineEmpty}>
              <Shield size={32} color="rgba(92,22,35,0.15)" />
              <Text style={s.timelineEmptyText}>No events recorded</Text>
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

      </ScrollView>

      {/* Edit Details Modal (updateItem) */}
      <Modal visible={isEditDetailsModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalScrollContent}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Edit Item Details</Text>
              
              <Text style={s.modalLabel}>Location</Text>
              <TextInput 
                style={s.modalInput}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="e.g. SHOP, LOCKER, KARIGAR"
                editable={!updatingDetails}
              />

              <Text style={s.modalLabel}>Size Value</Text>
              <TextInput 
                style={s.modalInput}
                value={editSizeValue}
                onChangeText={setEditSizeValue}
                placeholder="e.g. 2.4, 12, 18"
                keyboardType="numeric"
                editable={!updatingDetails}
              />

              <Text style={s.modalLabel}>Size Unit</Text>
              <View style={s.unitSelectorRow}>
                {(['INCH', 'MM', 'CM', 'RING_SIZE', ''] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[s.unitChip, editSizeUnit === unit && s.unitChipSelected]}
                    onPress={() => setEditSizeUnit(unit)}
                    disabled={updatingDetails}
                  >
                    <Text style={[s.unitChipText, editSizeUnit === unit && s.unitChipTextSelected]}>
                      {unit === '' ? 'None' : unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.modalLabel}>Purchase Rate (₹ / gram)</Text>
              <TextInput 
                style={s.modalInput}
                value={editPurchaseRateRupees}
                onChangeText={setEditPurchaseRateRupees}
                placeholder="e.g. 6250.50"
                keyboardType="numeric"
                editable={!updatingDetails}
              />

              <Text style={s.modalLabel}>Making Charge (₹)</Text>
              <TextInput 
                style={s.modalInput}
                value={editMakingChargeRupees}
                onChangeText={setEditMakingChargeRupees}
                placeholder="e.g. 500"
                keyboardType="numeric"
                editable={!updatingDetails}
              />

              <Text style={s.modalLabel}>Stone Cost (₹)</Text>
              <TextInput 
                style={s.modalInput}
                value={editStoneCostRupees}
                onChangeText={setEditStoneCostRupees}
                placeholder="e.g. 1200"
                keyboardType="numeric"
                editable={!updatingDetails}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setEditDetailsModalVisible(false)} disabled={updatingDetails}>
                  <Text style={s.modalBtnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalBtnPrimary} onPress={handleSaveDetails} disabled={updatingDetails}>
                  {updatingDetails ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Adjust Weight Modal (adjustWeight) */}
      <Modal visible={isAdjustWeightModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalScrollContent}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Adjust Item Weights</Text>
              
              <Text style={s.modalLabel}>Gross Weight (grams) *</Text>
              <TextInput 
                style={s.modalInput}
                value={adjustGrossGrams}
                onChangeText={setAdjustGrossGrams}
                placeholder="e.g. 12.500"
                keyboardType="numeric"
                editable={!adjustingWeight}
              />

              <Text style={s.modalLabel}>Stone Weight (grams)</Text>
              <TextInput 
                style={s.modalInput}
                value={adjustStoneGrams}
                onChangeText={setAdjustStoneGrams}
                placeholder="e.g. 0.500"
                keyboardType="numeric"
                editable={!adjustingWeight}
              />

              <Text style={s.modalLabel}>Beads Weight (grams)</Text>
              <TextInput 
                style={s.modalInput}
                value={adjustBeadsGrams}
                onChangeText={setAdjustBeadsGrams}
                placeholder="e.g. 0.200"
                keyboardType="numeric"
                editable={!adjustingWeight}
              />

              <Text style={s.modalLabel}>Supplier Wastage %</Text>
              <TextInput 
                style={s.modalInput}
                value={adjustWastagePercent}
                onChangeText={setAdjustWastagePercent}
                placeholder="e.g. 5.0"
                keyboardType="numeric"
                editable={!adjustingWeight}
              />

              <Text style={s.modalLabel}>Reason for Adjustment *</Text>
              <TextInput 
                style={s.modalInput}
                value={adjustWeightReason}
                onChangeText={setAdjustWeightReason}
                placeholder="e.g. Re-weighed after polishing"
                editable={!adjustingWeight}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setAdjustWeightModalVisible(false)} disabled={adjustingWeight}>
                  <Text style={s.modalBtnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalBtnPrimary} onPress={handleSaveWeightAdjustment} disabled={adjustingWeight}>
                  {adjustingWeight ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Adjust Weight</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Add / Correct HUID Modal */}
      <Modal visible={isHuidModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
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
        </View>
      </Modal>

      {/* Correct Metal Source Modal */}
      <Modal visible={isMetalSourceModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Correct Metal Source</Text>
            
            <Text style={s.modalLabel}>Select Source *</Text>
            <View style={s.unitSelectorRow}>
              {(['SUPPLIER_PURCHASE', 'CUSTOMER_OLD_GOLD', 'EXCHANGE', 'KARIGAR', 'MELT_OUTPUT', 'OPENING_BALANCE'] as MetalSource[]).map((src) => (
                <TouchableOpacity
                  key={src}
                  style={[s.unitChip, selectedMetalSource === src && s.unitChipSelected]}
                  onPress={() => setSelectedMetalSource(src)}
                  disabled={correctingMetalSource}
                >
                  <Text style={[s.unitChipText, selectedMetalSource === src && s.unitChipTextSelected]}>
                    {src.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>Reason for Correction *</Text>
            <TextInput 
              style={s.modalInput}
              value={metalSourceReason}
              onChangeText={setMetalSourceReason}
              placeholder="e.g. Mistakenly entered as supplier purchase"
              editable={!correctingMetalSource}
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setMetalSourceModalVisible(false)} disabled={correctingMetalSource}>
                <Text style={s.modalBtnTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={handleCorrectMetalSource} disabled={correctingMetalSource}>
                {correctingMetalSource ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Correction Modal */}
      <Modal visible={isDateModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalScrollContent}>
            <View style={[s.modalContent, { borderRadius: 20, borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Clock size={20} color={COLORS.vjAccent} />
                <Text style={[s.modalTitle, { marginBottom: 0 }]}>Correct Added Date</Text>
              </View>

              <Text style={s.modalLabel}>Select Date (Day / Month / Year)</Text>
              
              {/* 3-Column Spacious Glass Wheel Spinner */}
              <View style={s.picker3ColumnRow}>
                
                {/* Column 1: DAY */}
                <View style={s.pickerColumnCard}>
                  <Text style={s.pickerColumnLabel}>DAY</Text>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleDayStep(1)}>
                    <ChevronUp size={20} color="#5C1623" />
                  </TouchableOpacity>
                  <View style={s.pickerValueCapsule}>
                    <Text style={s.pickerValueText}>{String(selectedCalendarDate.getDate()).padStart(2, '0')}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleDayStep(-1)}>
                    <ChevronDown size={20} color="#5C1623" />
                  </TouchableOpacity>
                </View>

                {/* Column 2: MONTH */}
                <View style={[s.pickerColumnCard, { flex: 1.3 }]}>
                  <Text style={s.pickerColumnLabel}>MONTH</Text>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleMonthStep(1)}>
                    <ChevronUp size={20} color="#5C1623" />
                  </TouchableOpacity>
                  <View style={s.pickerValueCapsule}>
                    <Text style={s.pickerValueText}>{MONTH_NAMES[calendarMonth].substring(0, 3)}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleMonthStep(-1)}>
                    <ChevronDown size={20} color="#5C1623" />
                  </TouchableOpacity>
                </View>

                {/* Column 3: YEAR */}
                <View style={s.pickerColumnCard}>
                  <Text style={s.pickerColumnLabel}>YEAR</Text>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleYearStep(1)}>
                    <ChevronUp size={20} color="#5C1623" />
                  </TouchableOpacity>
                  <View style={s.pickerValueCapsule}>
                    <Text style={s.pickerValueText}>{calendarYear}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} style={s.pickerStepBtnVertical} onPress={() => handleYearStep(-1)}>
                    <ChevronDown size={20} color="#5C1623" />
                  </TouchableOpacity>
                </View>

              </View>

              {/* Selected Date Capsule */}
              <View style={s.selectedDateBadgeCapsule}>
                <Text style={s.selectedDateLabel}>
                  📅 Selected Date: {selectedCalendarDateFormatted}
                </Text>
              </View>

              <Text style={s.modalLabel}>Reason for Correction *</Text>
              <TextInput 
                style={s.modalInput}
                value={dateReason}
                onChangeText={setDateReason}
                placeholder="e.g. Typo in entry date"
                editable={!correctingDate}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setDateModalVisible(false)} disabled={correctingDate}>
                  <Text style={s.modalBtnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalBtnPrimary} onPress={handleCorrectDate} disabled={correctingDate}>
                  {correctingDate ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Save Date</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Delete Item Modal */}
      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
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
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  // --- Loading / Empty ---
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(92,22,35,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },

  // --- Header ---
  headerContainer: { width: '100%' },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  deleteHeaderBtn: {
    padding: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  headerMetalBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5,
  },
  headerPhantomBadge: {
    backgroundColor: 'rgba(124,58,237,0.2)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  headerPhantomText: { color: '#C4B5FD', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerSku: { color: COLORS.vjBg, fontSize: 24, fontWeight: '800', letterSpacing: 0.5, fontFamily: 'monospace', marginBottom: 4 },

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

  // --- Card Action Buttons ---
  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editActionBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(184,115,51,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(184,115,51,0.25)',
  },
  editActionBtnText: {
    color: COLORS.vjAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteCardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  deleteCardBtnText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '700',
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
  unitSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  unitChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  unitChipSelected: { backgroundColor: COLORS.vjAccent, borderColor: COLORS.vjAccent },
  unitChipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  unitChipTextSelected: { color: '#ffffff', fontWeight: '700' },
  presetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#78350F',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtnSecondary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f3f4f6' },
  modalBtnTextSecondary: { color: '#4b5563', fontWeight: '600' },
  modalBtnPrimary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: COLORS.vjAccent, minWidth: 80, alignItems: 'center' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '600' },

  // --- Live Cost Breakdown ---
  costItemRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', paddingVertical: 8 },
  costItemRowComplex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', paddingVertical: 8 },
  costItemLabel: { fontSize: 12, color: 'rgba(92,22,35,0.6)', fontWeight: '600' },
  costItemValue: { fontSize: 12, color: COLORS.vjText, fontWeight: '700', fontFamily: 'monospace' },
  costItemValueLarge: { fontSize: 14, color: COLORS.vjText, fontWeight: '900', fontFamily: 'monospace' },
  costPillContainer: { backgroundColor: 'rgba(212,175,55,0.1)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  costPillText: { fontSize: 10, color: COLORS.vjAccent, fontWeight: '700' },
  costTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4 },
  costBreakdownTotalLabel: { fontSize: 14, color: COLORS.vjText, fontWeight: '900' },
  costBreakdownTotalValue: { fontSize: 14, color: '#78350F', fontWeight: '900', fontFamily: 'monospace' },

  // --- 3-Column Spacious Glass Wheel Spinner ---
  picker3ColumnRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  pickerColumnCard: {
    flex: 1,
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#5C1623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  pickerColumnLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pickerStepBtnVertical: {
    width: '100%',
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(92,22,35,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerValueCapsule: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pickerValueText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#5C1623',
    textAlign: 'center',
  },
  selectedDateBadgeCapsule: {
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 14,
  },
  selectedDateLabel: {
    fontSize: 12,
    color: '#78350F',
    fontWeight: '800',
    textAlign: 'center',
  },
});