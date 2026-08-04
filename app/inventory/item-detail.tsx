// app/inventory/item-detail.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen D: Item Detail + Timeline (STEP 16.4)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition

import React, { useState, useCallback, memo, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { appSettingsStore } from '../../store/appSettingsStore';
import { GlassCard } from '../../components/ui/Glass';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { itemService } from '../../services/itemService';
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
  Trash2, Sparkles, Coins, Percent
} from 'lucide-react-native';
import type { ItemDetail, ItemTimelineEvent } from '../../types/phase2.types';
import { TERMINAL_ITEM_STATUSES } from '../../types/phase2.types';
import { getJewelryCategoryIcon } from '../../utils/jewelryIcons';
const formatCurrency = (paise: number | null): string => {
  if (paise === null || paise === undefined) return '—';
  return getCurrencySymbol() + (Math.round(paise) / 100).toFixed(2);
};

import { COLORS } from '../../constants/theme';

// EVENT LABEL MAPPING (mandatory)
const getEventLabel = (event: ItemTimelineEvent): string => {
  switch (event.eventType) {
    case 'CREATED': return 'Item Created';
    case 'ITEM_STATUS_CHANGED': return `Status Changed → ${event.newValue || 'Unknown'}`;
    case 'ITEM_EDITED': return 'Details Updated';
    case 'WEIGHT_ADJUSTED': return 'Weight Adjusted';
    case 'HUID_ADDED': return 'HUID Assigned';
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
  const [isDateModalVisible, setDateModalVisible] = useState(false);
  const [dateReason, setDateReason] = useState('');

  // Calendar States
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  
  const { dateFormatToken } = appSettingsStore.getState();

  // HUID State
  const [isHuidModalVisible, setHuidModalVisible] = useState(false);
  const [huidInput, setHuidInput] = useState('');
  const [addingHuid, setAddingHuid] = useState(false);
  const [correctingDate, setCorrectingDate] = useState(false);

  // Delete Item State
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    setSelectedCalendarDate(new Date(calendarYear, calendarMonth, day));
  };

  const handleCorrectDate = async () => {
    if (!item || !activeFirmId) return;
    try {
      if (!dateReason.trim()) {
        Alert.alert('Error', 'Reason is required');
        return;
      }
      
      const parsed = selectedCalendarDate;
      const newIso = parsed.toISOString().split('T')[0] + 'T00:00:00.000Z';
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
    setHuidInput('');
    setHuidModalVisible(true);
  }, []);

  const handleAddHuid = async () => {
    if (!activeFirmId || !itemId) return;
    const huidUpper = huidInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(huidUpper)) {
      Alert.alert('Invalid HUID', 'HUID must be exactly 6 uppercase alphanumeric characters.');
      return;
    }

    setAddingHuid(true);
    try {
      await itemService.addHUID(itemId, activeFirmId, huidUpper);
      setHuidModalVisible(false);
      Alert.alert('Success', 'HUID added successfully.');
      // Refresh item detail
      const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, itemId);
      setItem(detail);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add HUID');
    } finally {
      setAddingHuid(false);
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
  const isPhantom = item.status === 'PHANTOM_AVAILABLE' || item.status === 'PHANTOM_SOLD';
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal);

  const dateToken = dateFormatToken || 'dd/MM/yyyy';
  let createdAtFormatted = item.createdAt;
  try {
    createdAtFormatted = format(parseISO(item.createdAt), `${dateToken} hh:mm a`);
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

  // --- Calendar Date Picker Calculation ---
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
  
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(i);
  }
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  // --- Live Cost Breakdown Calculations ---
  const vaultTruth = computeVaultTruthGrams(item.fineWeightMg);
  const costTruth = computeCostTruthGrams(item.fineGoldChargedMg, item.fineWeightMg);
  const wastageGold = computeWastageGoldGrams(costTruth, vaultTruth);

  const rate = item.purchaseRatePaise ? item.purchaseRatePaise / 100 : 0;
  const making = item.makingChargePaise ? item.makingChargePaise / 100 : 0;
  const stoneC = item.stoneCostPaise ? item.stoneCostPaise / 100 : 0;

  const effectivePricePerGram = computeEffectivePricePerGram(rate, item.purityPercent, item.wastagePercent || 0, item.metal);
  const hasCostData = rate > 0 || making > 0 || stoneC > 0;
  const totalAmount = computeAbsoluteTotalCostRupees(costTruth, rate, making, stoneC);

  const canDelete = !TERMINAL_ITEM_STATUSES.includes(item.status);

  const headerContent = (
    <View style={s.headerContainer}>
      <View style={s.headerTopRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.headerMetalBadge, { borderColor: metalColor }]}>
            {getJewelryCategoryIcon(item.categoryName, item.designName, item.metal, 22, metalColor)}
          </View>
          {isPhantom && (
            <View style={s.headerPhantomBadge}>
              <Text style={s.headerPhantomText}>PHANTOM</Text>
            </View>
          )}
        </View>
        {canDelete && (
          <TouchableOpacity 
            activeOpacity={0.7} 
            onPress={handleOpenDeleteModal}
            style={s.deleteHeaderBtn}
          >
            <Trash2 size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.headerSku} selectable>{formatSKUDisplay(item.sku)}</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 350 }}>

        {/* === DETAILS CARD === */}
        <View style={s.section}>
          <View style={s.sectionCard}>
            <DetailRow label="Design" value={item.designName} icon={<Sparkles size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Category" value={item.categoryName} icon={<Tag size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Metal" value={item.metal.charAt(0) + item.metal.slice(1).toLowerCase()} valueColor={metalColor} icon={<Coins size={14} color={metalColor} />} />
            
            <View style={s.divider} />
            
            <DetailRow label="Gross Weight" value={formatWeight(item.grossWeightMg)} icon={<Scale size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Stone Weight" value={formatWeight(item.stoneWeightMg)} icon={<Gem size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Beads Weight" value={formatWeight(item.beadsWeightMg)} icon={<Package size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Net Weight" value={formatWeight(item.netWeightMg)} icon={<Scale size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Purity" value={purityDisplay} icon={<Percent size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Fine Weight" value={formatWeight(item.fineWeightMg)} icon={<Sparkles size={14} color={COLORS.vjAccent} />} />
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
                {item.huid === null && !TERMINAL_ITEM_STATUSES.includes(item.status) && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenHuidModal}>
                     <Text style={{color: COLORS.vjAccent, fontSize: 16}}>✎ Add HUID</Text>
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
            <DetailRow label="Metal Source" value={item.metalSource.replace(/_/g, ' ')} icon={<Package size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="HSN Code" value={item.hsnCode} icon={<FileText size={14} color={COLORS.vjAccent} />} />
            
            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <View style={s.detailIcon}><Clock size={14} color={COLORS.vjAccent} /></View>
                <Text style={s.detailLabel}>Added On</Text>
                {/* GAP-P2-DATE-SKU-EDIT-1 (v1.79) */}
                {(item.status !== 'SOLD' && item.status !== 'MELTED' && item.status !== 'PHANTOM_SOLD') && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenDateModal} style={{ marginLeft: 6 }}>
                     <Text style={{color: COLORS.vjAccent, fontSize: 16, fontWeight: 'bold'}}>✎</Text>
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
              <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => {/* Phase 3 navigation here */}}>
                <View style={s.detailLabelRow}>
                  <FileText size={14} color={COLORS.vjAccent} />
                  <Text style={s.detailLabel}>Sale Invoice</Text>
                </View>
                <Text style={[s.detailValue, { color: COLORS.info, textDecorationLine: 'underline' }]}>{item.invoiceId}</Text>
              </TouchableOpacity>
            ) : (
              <DetailRow label="Sale Invoice" value="—" icon={<FileText size={14} color={COLORS.vjAccent} />} />
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

      {/* Date Correction Modal */}
      <Modal visible={isDateModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Correct Added Date</Text>
            
            <Text style={s.modalLabel}>Select New Date</Text>
            
            <View style={s.calendarContainer}>
              <View style={s.calendarHeader}>
                <TouchableOpacity onPress={handlePrevMonth} style={s.arrowBtn}>
                  <Text style={s.arrowText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.calendarTitleText}>
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </Text>
                <TouchableOpacity onPress={handleNextMonth} style={s.arrowBtn}>
                  <Text style={s.arrowText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Weekdays */}
              <View style={s.weekDaysRow}>
                {WEEK_DAYS.map(day => (
                  <Text key={day} style={s.weekDayText}>{day}</Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={s.daysGrid}>
                {rows.map((row, rIdx) => (
                  <View key={rIdx} style={s.daysRow}>
                    {row.map((day, cIdx) => {
                      if (day === null) {
                        return <View key={cIdx} style={s.dayCellEmpty} />;
                      }
                      
                      const isSelected = selectedCalendarDate.getDate() === day &&
                                         selectedCalendarDate.getMonth() === calendarMonth &&
                                         selectedCalendarDate.getFullYear() === calendarYear;

                      return (
                        <TouchableOpacity
                          key={cIdx}
                          style={[s.dayCell, isSelected && s.dayCellSelected]}
                          onPress={() => handleSelectDay(day)}
                        >
                          <Text style={[s.dayText, isSelected && s.dayTextSelected]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            <Text style={s.selectedDateLabel}>
              Selected: {selectedCalendarDateFormatted}
            </Text>

            <Text style={s.modalLabel}>Reason for Correction</Text>
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
                {correctingDate ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add HUID Modal */}
      <Modal visible={isHuidModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Add HUID</Text>
            
            <Text style={s.modalLabel}>HUID (6 chars)</Text>
            <TextInput 
              style={s.modalInput}
              value={huidInput}
              onChangeText={setHuidInput}
              placeholder="e.g. A1B2C3"
              autoCapitalize="characters"
              maxLength={6}
              editable={!addingHuid}
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setHuidModalVisible(false)} disabled={addingHuid}>
                <Text style={s.modalBtnTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={handleAddHuid} disabled={addingHuid}>
                {addingHuid ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTextPrimary}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
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

  // --- Costs Highlight ---
  costHeaderRow: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  costHeaderTitle: { fontSize: 11, fontWeight: '800', color: COLORS.vjAccent, textTransform: 'uppercase', letterSpacing: 0.5 },
  costTotalBox: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 10, marginBottom: 10, marginTop: 4,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(184,115,51,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(184,115,51,0.2)'
  },
  costTotalLabel: { fontSize: 14, fontWeight: '800', color: COLORS.vjText },
  costTotalValue: { fontSize: 16, fontWeight: '900', color: '#92400E', fontFamily: 'monospace' },

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
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.vjText, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(92,22,35,0.6)', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 15, color: '#1f2937' },
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

  // --- Calendar Date Picker ---
  calendarContainer: {
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.08)',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FAF9F6',
    marginBottom: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  arrowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  arrowText: {
    fontSize: 24,
    color: COLORS.vjText,
    fontWeight: 'bold',
  },
  calendarTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.vjText,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekDayText: {
    width: 32,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(92,22,35,0.4)',
  },
  daysGrid: {
    gap: 4,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  dayCellSelected: {
    backgroundColor: COLORS.vjAccent,
  },
  dayCellEmpty: {
    width: 32,
    height: 32,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.vjText,
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  selectedDateLabel: {
    fontSize: 12,
    color: COLORS.vjText,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
});