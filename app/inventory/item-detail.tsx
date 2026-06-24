// app/inventory/item-detail.tsx
// FEAT-DRILL-DOWN-1 (v1.65) — Screen D: Item Detail + Timeline (STEP 16.4)
// READ-ONLY | NO dual guards | NO audit write | NO lease acquisition

import React, { useState, useCallback, memo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { getDisplayPurity } from '../../utils/purity.constants';
import { getCurrencySymbol } from '../../utils/currency';
import { format, parseISO } from 'date-fns';
import {
  Package, Tag, Scale, Gem, FileText,
  Clock, AlertTriangle, Info, AlertCircle,
  Shield, MapPin
} from 'lucide-react-native';
import type { ItemDetail, ItemTimelineEvent } from '../../types/phase2.types';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';
const formatCurrency = (paise: number | null): string => {
  if (paise === null || paise === undefined) return '—';
  return getCurrencySymbol() + (Math.round(paise) / 100).toFixed(2);
};

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
  gold: '#C8860A',
  silver: '#6B7280',
  info: '#3B82F6',
  warning: '#F59E0B',
  error: '#EF4444',
  phantom: '#7C3AED',
};

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
function DetailRow({ label, value, icon, valueColor }: { label: string; value: string; icon?: React.ReactNode; valueColor?: string }) {
  return (
    <View style={s.detailRow}>
      <View style={s.detailLabelRow}>
        {icon && <View style={s.detailIcon}>{icon}</View>}
        <Text style={s.detailLabel}>{label}</Text>
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
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        if (!activeFirmId || !itemId) return;
        setLoading(true);
        try {
          const detail = await inventoryDrillDownService.getItemDetail(activeFirmId, itemId);
          if (active) setItem(detail);
        } catch (e) {
          console.error('[ItemDetail] load failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [activeFirmId, itemId])
  );

  if (loading) {
    return (
      <TwoToneWrapper title="" showBack>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
          <Text style={s.loadingText}>Loading item...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  if (!item) {
    return (
      <TwoToneWrapper title="" showBack>
        <View style={s.emptyContainer}>
          <Package size={48} color="rgba(46,29,0,0.2)" />
          <Text style={s.emptyTitle}>Item Not Found</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const isPhantom = item.status === 'PHANTOM_AVAILABLE' || item.status === 'PHANTOM_SOLD';
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat, item.metal);

  let createdAtFormatted = item.createdAt;
  try {
    createdAtFormatted = format(parseISO(item.createdAt), 'dd MMM yyyy hh:mm a');
  } catch {}

  // --- Calculate Total Amount (Paise) ---
  let totalCostPaise: number | null = null;
  if (item.purchaseRatePaise !== null || item.makingChargePaise !== null || item.stoneCostPaise !== null) {
    totalCostPaise = 0;
    if (item.purchaseRatePaise !== null) {
      // Calculate gold cost based on Fine Gold Charged (or fallback to Fine Weight + Wastage)
      const billedGrams = item.fineGoldChargedMg != null 
        ? (item.fineGoldChargedMg / 1000) 
        : ((item.fineWeightMg / 1000) * (1 + (item.wastagePercent || 0) / 100));
      totalCostPaise += billedGrams * item.purchaseRatePaise;
    }
    if (item.makingChargePaise !== null) totalCostPaise += item.makingChargePaise;
    if (item.stoneCostPaise !== null) totalCostPaise += item.stoneCostPaise;
  }

  const headerContent = (
    <View>
      <View style={s.headerTopRow}>
        <View style={[s.headerMetalBadge, { borderColor: metalColor }]}>
          <Gem size={22} color={metalColor} />
        </View>
        {isPhantom && (
          <View style={s.headerPhantomBadge}>
            <Text style={s.headerPhantomText}>PHANTOM</Text>
          </View>
        )}
      </View>
      <Text style={s.headerSku} selectable>{item.sku}</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* === DETAILS CARD === */}
        <View style={s.section}>
          <View style={s.sectionCard}>
            <DetailRow label="Design" value={item.designName} />
            <DetailRow label="Category" value={item.categoryName} />
            <DetailRow label="Metal" value={`${item.metal.charAt(0) + item.metal.slice(1).toLowerCase()} · ${purityDisplay}`} valueColor={metalColor} />
            
            <View style={s.divider} />
            
            <DetailRow label="Gross Weight" value={formatWeight(item.grossWeightMg)} icon={<Scale size={14} color={COLORS.vjAccent} />} />
            <DetailRow label="Stone Weight" value={formatWeight(item.stoneWeightMg)} />
            <DetailRow label="Beads Weight" value={formatWeight(item.beadsWeightMg)} />
            <DetailRow label="Net Weight" value={formatWeight(item.netWeightMg)} />
            <DetailRow label="Fine Weight" value={formatWeight(item.fineWeightMg)} />
            
            <View style={s.divider} />

            <DetailRow label="Wastage" value={item.wastagePercent ? `${item.wastagePercent.toFixed(2)}%` : '0.00%'} />
            <DetailRow label="HUID" value={item.huid || 'Not Set'} />
            
            {/* BARCODE REMAINS HERE */}
            <DetailRow label="Barcode" value={item.barcode} />
            
            <View style={s.divider} />

            <DetailRow 
              label="Location" 
              value={item.location || '—'} 
              icon={<MapPin size={14} color={COLORS.vjAccent} />} 
            />
            <DetailRow label="Status" value={item.status.replace(/_/g, ' ')} />
            <DetailRow label="Metal Source" value={item.metalSource.replace(/_/g, ' ')} />
            <DetailRow label="HSN Code" value={item.hsnCode} />
            <DetailRow label="Added On" value={createdAtFormatted} />

            {/* === COST FIELDS === */}
            {totalCostPaise !== null && (
              <>
                <View style={s.divider} />
                <View style={s.costHeaderRow}>
                  <Text style={s.costHeaderTitle}>Purchase Costs</Text>
                </View>

                {item.purchaseRatePaise !== null && (
                  <DetailRow label="Purchase Rate" value={formatCurrency(item.purchaseRatePaise) + ' /g'} />
                )}
                {item.makingChargePaise !== null && (
                  <DetailRow label="Making Charge" value={formatCurrency(item.makingChargePaise)} />
                )}
                {item.stoneCostPaise !== null && (
                  <DetailRow label="Stone Cost" value={formatCurrency(item.stoneCostPaise)} />
                )}
                
                <View style={s.costTotalBox}>
                  <Text style={s.costTotalLabel}>Total Est. Cost</Text>
                  <Text style={s.costTotalValue}>{formatCurrency(totalCostPaise)}</Text>
                </View>
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
              <Shield size={32} color="rgba(46,29,0,0.15)" />
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
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  // --- Loading / Empty ---
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(46,29,0,0.4)', fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { color: 'rgba(46,29,0,0.5)', fontSize: 18, fontWeight: '700' },

  // --- Header ---
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headerMetalBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: 'rgba(46,29,0,0.45)', fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: 'rgba(46,29,0,0.06)',
  },

  // --- Detail Rows ---
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: 'rgba(46,29,0,0.04)', marginHorizontal: 14 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailIcon: { opacity: 0.7 },
  detailLabel: { color: 'rgba(46,29,0,0.5)', fontSize: 13, fontWeight: '600' },
  detailValue: { color: COLORS.vjText, fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },

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
  timelineCountBadge: { backgroundColor: 'rgba(46,29,0,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  timelineCountText: { color: 'rgba(46,29,0,0.5)', fontSize: 11, fontWeight: '800' },
  timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLine: { width: 24, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineConnector: { width: 2, flex: 1, backgroundColor: 'rgba(46,29,0,0.08)', marginTop: 4 },
  timelineCard: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(46,29,0,0.06)', marginBottom: 8,
  },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  timelineEventType: { fontSize: 13, fontWeight: '700' },
  timelineReason: { color: 'rgba(46,29,0,0.6)', fontSize: 12, marginBottom: 4 },
  timelineDate: { color: 'rgba(46,29,0,0.35)', fontSize: 10, fontWeight: '600', marginTop: 4 },
  timelineEmpty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  timelineEmptyText: { color: 'rgba(46,29,0,0.35)', fontSize: 13 },
});