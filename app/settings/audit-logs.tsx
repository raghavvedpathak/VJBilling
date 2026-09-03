// app/settings/audit-logs.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Share, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getDeviceId } from '@/utils/deviceId';
import { formatRupees } from '@/utils/currency';
import { 
  FileText, Smartphone, Calendar, ChevronDown, ChevronUp, Share2, Filter, 
  CalendarClock, ShieldAlert, Building2, 
  Package, KeyRound, HardDriveUpload
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { COLORS, getThemeColors } from '@/constants/theme';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';

const ToggleHandlerRef = React.createContext<React.MutableRefObject<(id: string) => void> | null>(null);

// Canonical Plain English Event Title Mapping (Phase 1 + Phase 2)
const EVENT_MAPPING: Record<string, string> = {
  'FIRM_CREATED': 'New Firm Profile Created',
  'FIRM_UPDATED': 'Firm Profile Details Updated',
  'FIRM_SWITCHED': 'Switched Active Firm',
  'FIRM_ARCHIVED': 'Firm Profile Archived',
  'FIRM_UNARCHIVED': 'Firm Profile Reactivated',
  'FIRM_CODE_SET': 'Firm Code Assigned',
  'SAFE_MODE_ACTIVATED': 'Safe Mode Activated',
  'SAFE_MODE_CLEARED': 'Safe Mode Cleared',
  'BACKUP_CREATED': 'Database Backup Created',
  'RESTORE_COMPLETED': 'Database Successfully Restored',
  'RESTORE_FAILED': 'Database Restore Failed',
  'RESTORE_OLD_SCHEMA': 'Older Backup Restored',
  'FY_CREATED': 'New Financial Year Created',
  'FY_CLOSED': 'Financial Year Closed',
  'FY_CLOCK_SKEW': 'System Clock Skew Detected',
  'SETTINGS_CHANGED': 'System Preferences Modified',
  'DEVICE_ID_GENERATED': 'New Device Identity Registered',
  'BIS_LOGO_ARCHIVED': 'BIS Logo Removed',
  'PRE_MIGRATION_SNAPSHOT_CREATED': 'Pre-Migration Snapshot Secured',
  'PRE_MIGRATION_SNAPSHOT_PURGED': 'Pre-Migration Snapshot Cleaned Up',
  'PRE_MIGRATION_SNAPSHOT_FAILED': 'Pre-Migration Snapshot Failed',
  'AUDIT_RETENTION_PURGE_EXECUTED': 'Audit Log Auto-Cleanup Ran',
  'DEVICE_ID_CHANGED': 'Device Reinstall / Identity Updated',
  'FACTORY_RESET_EXECUTED': 'Factory Reset Executed',
  
  // Security
  'PIN_SET': 'Security PIN Created',
  'PIN_CHANGED': 'Security PIN Updated',
  'PIN_SKIPPED': 'Security PIN Deferred',

  // Phase 2 Stock & Transactions
  'URD_PURCHASE_CREATED': 'Unregistered Purchase Logged',
  'URD_PURCHASE_CONFIRMED': 'Unregistered Purchase Confirmed',
  'CATEGORY_CREATED': 'New Category Added',
  'CATEGORY_UPDATED': 'Category Details Updated',
  'CATEGORY_SOFT_DELETED': 'Category Removed',
  'DESIGN_CREATED': 'New Design Added',
  'DESIGN_UPDATED': 'Design Details Updated',
  'DESIGN_SOFT_DELETED': 'Design Removed',
  'STONE_CREATED': 'Stone Master Added',
  'ITEM_CREATED': 'New Stock Item Added',
  'HUID_ADDED': 'HUID Tag Assigned',
  'ITEM_STATUS_CHANGED': 'Stock Item Status Updated',
  'WEIGHT_ADJUSTED': 'Stock Weight Adjusted',
  'BARCODE_REPRINTED': 'Barcode Label Reprinted',
  'OLD_GOLD_LOT_CREATED': 'Old Gold Lot Added',
  'OLD_GOLD_LOT_STATUS_CHANGED': 'Old Gold Lot Status Updated',
  'FY_CLOSE_FINE_BALANCE': 'Fine Gold Balance Closed',
  'FY_ARCHIVE_INDEXED': 'Financial Year Archived',
  'ITEM_DELETED': 'Stock Item Deleted',
  'METAL_SOURCE_CORRECTED': 'Metal Source Corrected',
  'HUID_CORRECTED': 'HUID Tag Corrected',
  'GEMSTONE_LOT_CREATED': 'Gemstone Lot Added',
  'GEMSTONE_LOT_STATUS_CHANGED': 'Gemstone Lot Status Updated',
  'ITEM_EDITED': 'Stock Item Details Edited',
  'ITEM_SENT_TO_KARIGAR': 'Item Issued to Karigar',
  'ITEM_RETURNED_FROM_KARIGAR': 'Item Received from Karigar'
};

// Plain English Unit & Currency Formatters
const formatBytes = (bytes?: number): string => {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatWeightMg = (mg?: number): string => {
  if (mg === undefined || mg === null || isNaN(mg)) return '0.000 g';
  return `${(mg / 1000).toFixed(3)} g`;
};

const formatCurrencyPaise = (paise?: number): string => {
  if (paise === undefined || paise === null || isNaN(paise)) return formatRupees(0);
  return formatRupees(paise);
};

const formatIsoDateTime = (isoStr?: string): string => {
  if (!isoStr) return 'N/A';
  try {
    const d = parseISO(isoStr);
    return format(d, 'dd/MM/yyyy, hh:mm a');
  } catch {
    return String(isoStr);
  }
};

// Event Visual Metadata & Category Classifier
function getEventMeta(type: string, colors: ReturnType<typeof getThemeColors>) {
  if (type.includes('BACKUP') || type.includes('RESTORE')) {
    return {
      category: 'Backup & Recovery',
      icon: <HardDriveUpload size={18} color="#B45309" />,
      iconBg: 'rgba(245, 158, 11, 0.15)',
      badgeBg: 'rgba(245, 158, 11, 0.12)',
      badgeBorder: 'rgba(245, 158, 11, 0.25)',
      badgeTextColor: '#B45309'
    };
  }
  if (type.includes('PIN') || type.includes('SECURITY')) {
    return {
      category: 'Store Security',
      icon: <KeyRound size={18} color="#2563EB" />,
      iconBg: 'rgba(37, 99, 235, 0.15)',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeBorder: 'rgba(37, 99, 235, 0.25)',
      badgeTextColor: '#2563EB'
    };
  }
  if (type.includes('SAFE_MODE') || type.includes('FAILED') || type.includes('RESET')) {
    return {
      category: 'System Alert',
      icon: <ShieldAlert size={18} color="#DC2626" />,
      iconBg: 'rgba(220, 38, 38, 0.15)',
      badgeBg: 'rgba(220, 38, 38, 0.12)',
      badgeBorder: 'rgba(220, 38, 38, 0.25)',
      badgeTextColor: '#DC2626'
    };
  }
  if (type.includes('FIRM')) {
    return {
      category: 'Firm Profile',
      icon: <Building2 size={18} color={colors.vjAccent} />,
      iconBg: `${colors.vjAccent}18`,
      badgeBg: `${colors.vjAccent}12`,
      badgeBorder: `${colors.vjAccent}25`,
      badgeTextColor: colors.vjAccent
    };
  }
  if (type.includes('FY')) {
    return {
      category: 'Financial Year',
      icon: <CalendarClock size={18} color="#059669" />,
      iconBg: 'rgba(5, 150, 105, 0.15)',
      badgeBg: 'rgba(5, 150, 105, 0.12)',
      badgeBorder: 'rgba(5, 150, 105, 0.25)',
      badgeTextColor: '#059669'
    };
  }
  if (type.includes('ITEM') || type.includes('URD') || type.includes('CATEGORY') || type.includes('DESIGN') || type.includes('KARIGAR') || type.includes('GOLD') || type.includes('GEMSTONE') || type.includes('WEIGHT') || type.includes('HUID')) {
    return {
      category: 'Stock & Inventory',
      icon: <Package size={18} color="#7C3AED" />,
      iconBg: 'rgba(124, 58, 237, 0.15)',
      badgeBg: 'rgba(124, 58, 237, 0.12)',
      badgeBorder: 'rgba(124, 58, 237, 0.25)',
      badgeTextColor: '#7C3AED'
    };
  }
  return {
    category: 'System Event',
    icon: <FileText size={18} color={colors.vjText} />,
    iconBg: `${colors.vjAccent}12`,
    badgeBg: `${colors.vjAccent}10`,
    badgeBorder: `${colors.vjAccent}20`,
    badgeTextColor: colors.vjText
  };
}

// Plain English Sentence Summary Generator
function getHumanSummary(eventType: string, payload: Record<string, any>): string {
  switch (eventType) {
    case 'BACKUP_CREATED':
      return `Backup file "${payload.fileName || 'vjbilling_backup.vjb'}" (${formatBytes(payload.fileSizeBytes)}) was created successfully.`;
    case 'RESTORE_COMPLETED':
      return `Database was successfully restored from backup (contains ${payload.firmCount || 1} firm profile(s)).`;
    case 'RESTORE_FAILED':
      return `Database restore failed. Reason: ${payload.reason || 'Decryption error or corrupted file'}.`;
    case 'FIRM_CREATED':
      return `Established new firm "${payload.name || 'Firm'}" with code ${payload.firmCode || 'N/A'}.`;
    case 'FIRM_UPDATED':
      return `Updated store profile details for ${payload.name || 'active firm'}.`;
    case 'FIRM_SWITCHED':
      return `Switched active store workspace.`;
    case 'SAFE_MODE_ACTIVATED':
      return `Safe Mode safety guard was activated. Reason: ${payload.reason || 'System integrity check'}.`;
    case 'SAFE_MODE_CLEARED':
      return `Safe Mode cleared — store database verified healthy.`;
    case 'PRE_MIGRATION_SNAPSHOT_CREATED':
      return `Encrypted local snapshot secured safely prior to schema migration.`;
    case 'PRE_MIGRATION_SNAPSHOT_PURGED':
      return `Temporary pre-migration snapshot purged after database verification passed.`;
    case 'PRE_MIGRATION_SNAPSHOT_FAILED':
      return `Failed to capture pre-migration snapshot: ${payload.error || 'Unknown error'}.`;
    case 'SETTINGS_CHANGED':
      return `Updated system settings (${payload.setting || 'Preferences'}).`;
    case 'PIN_SET':
      return `Created a ${payload.pinLength || 4}-digit security PIN for app access.`;
    case 'PIN_CHANGED':
      return `Updated store security PIN.`;
    case 'PIN_SKIPPED':
      return `PIN setup deferred during initial boot.`;
    case 'URD_PURCHASE_CREATED':
      return `Logged unregistered purchase for customer ${payload.customerName || 'Customer'} (${formatCurrencyPaise(payload.totalValuePaise)}).`;
    case 'URD_PURCHASE_CONFIRMED':
      return `Confirmed URD purchase voucher for customer ${payload.customerName || 'Customer'}.`;
    case 'CATEGORY_CREATED':
      return `Added new product category "${payload.name || 'Category'}" to store master.`;
    case 'DESIGN_CREATED':
      return `Added new design "${payload.name || 'Design'}" (Code: ${payload.code || 'N/A'}) to store master.`;
    case 'ITEM_CREATED':
      return `Added new stock item (SKU: ${payload.sku || 'N/A'}, Gross: ${formatWeightMg(payload.grossWeightMg)}) to inventory.`;
    case 'HUID_ADDED':
      return `Assigned HUID tag "${payload.huid || 'N/A'}" to stock item ${payload.sku || ''}.`;
    case 'ITEM_STATUS_CHANGED':
      return `Item status for ${payload.sku || 'stock item'} updated to ${payload.status || 'NEW'}.`;
    case 'ITEM_SENT_TO_KARIGAR':
      return `Issued stock item ${payload.sku || 'item'} to karigar for manufacturing/polishing.`;
    case 'ITEM_RETURNED_FROM_KARIGAR':
      return `Received stock item ${payload.sku || 'item'} back from karigar.`;
    case 'AUDIT_RETENTION_PURGE_EXECUTED':
      return `Auto-cleanup purged ${payload.deletedCount || 0} expired log record(s) older than ${payload.auditRetentionDays || 30} days.`;
    case 'DEVICE_ID_GENERATED':
      return `Registered new device identity for secure transactions.`;
    default:
      return `${EVENT_MAPPING[eventType] || eventType.replace(/_/g, ' ')} recorded in system log.`;
  }
}

// Plain English Key Label Mapping
const KEY_LABEL_MAPPING: Record<string, string> = {
  fileName: 'Backup File Name',
  fileSizeBytes: 'Backup File Size',
  exportedAt: 'Exported Date & Time',
  restoredAt: 'Restored Date & Time',
  backupDate: 'Backup Date',
  firmCount: 'Firms in Backup',
  firmCode: 'Firm Code',
  name: 'Name / Title',
  proprietor: 'Proprietor Name',
  gstin: 'GSTIN Tax Number',
  phone1: 'Primary Phone',
  phone2: 'Secondary Phone',
  city: 'City',
  stateName: 'State',
  pincode: 'Pincode',
  setting: 'Preference Key',
  value: 'New Setting Value',
  reason: 'Reason / Notes',
  pinLength: 'PIN Length',
  setAt: 'Setup Timestamp',
  changedAt: 'Change Timestamp',
  skippedAt: 'Skipped Timestamp',
  customerName: 'Customer Name',
  customerMobile: 'Customer Phone',
  grossWeightMg: 'Gross Weight',
  netWeightMg: 'Net Weight',
  fineWeightMg: 'Fine Weight',
  stoneWeightMg: 'Stone Weight',
  ratePerGramPaise: 'Rate / Gram',
  purchaseRatePaise: 'Purchase Rate',
  totalValuePaise: 'Total Amount',
  makingChargePaise: 'Making Charges',
  purityPercent: 'Purity Percentage',
  purityKarat: 'Purity Karat',
  sku: 'SKU / Barcode',
  huid: 'HUID Tag',
  metalType: 'Metal Category',
  metal: 'Metal Category',
  status: 'Current Status',
  deletedCount: 'Records Cleaned',
  auditRetentionDays: 'Retention Window',
  executedAt: 'Execution Time',
  generatedAt: 'Registration Time',
  deviceName: 'Device Model',
  os: 'Operating System'
};

// Internal keys to filter out from end-user display
const INTERNAL_KEYS_TO_HIDE = new Set([
  'id', 'firmId', 'fyId', 'entityId', 'oldGoldLotId', 'designId', 'categoryId', 'stoneId',
  'createdAt', 'updatedAt', 'isArchived', 'isActive', 'phantomStockId'
]);

type AuditLogItemProps = {
  itemId: string;
  itemCreatedAt: string;
  itemEventType: string;
  itemDeviceId: string;
  itemPayload: string;
  isExpanded: boolean;
  currentDeviceId: string;
  dateFormatToken: string;
  colors: ReturnType<typeof getThemeColors>;
};

const AuditLogItem = memo(({
  itemId,
  itemCreatedAt,
  itemEventType,
  itemDeviceId,
  itemPayload,
  isExpanded,
  currentDeviceId,
  dateFormatToken,
  colors,
}: AuditLogItemProps) => {
  const toggleRef = React.useContext(ToggleHandlerRef);

  let dateStr = 'Unknown Date';
  let timeStr = 'Unknown Time';
  try {
    const parsedDate = parseISO(itemCreatedAt);
    dateStr = format(parsedDate, dateFormatToken);
    timeStr = format(parsedDate, 'hh:mm a');
  } catch (e) {
    console.error('Date formatting failed:', itemCreatedAt);
  }

  let parsedPayload: Record<string, any> = {};
  if (itemPayload) {
    try {
      parsedPayload = JSON.parse(itemPayload);
    } catch {
      parsedPayload = { note: itemPayload };
    }
  }

  const meta = getEventMeta(itemEventType, colors);
  const humanTitle = EVENT_MAPPING[itemEventType] || itemEventType.replace(/_/g, ' ');
  const humanSummary = getHumanSummary(itemEventType, parsedPayload);

  const displayDeviceName = itemDeviceId === currentDeviceId
    ? (Device.modelName ? `${Device.modelName} (This Device)` : 'This Device')
    : `Other Registered Device (${String(itemDeviceId).slice(-8)})`;

  // Filter & Format Key-Value entries for expanded details drawer
  const detailEntries = useMemo(() => {
    return Object.entries(parsedPayload)
      .filter(([k]) => !INTERNAL_KEYS_TO_HIDE.has(k))
      .map(([k, v]) => {
        const humanKey = KEY_LABEL_MAPPING[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        let formattedVal = 'None';

        if (v !== null && v !== undefined && v !== '') {
          if (k === 'fileSizeBytes') formattedVal = formatBytes(Number(v));
          else if (k.endsWith('Mg') || k.includes('Weight')) formattedVal = formatWeightMg(Number(v));
          else if (k.endsWith('Paise') || k.includes('Value') || k.includes('Amount')) formattedVal = formatCurrencyPaise(Number(v));
          else if (k.endsWith('At') || k.endsWith('Date')) formattedVal = formatIsoDateTime(String(v));
          else if (typeof v === 'boolean') formattedVal = v ? 'Enabled / Yes' : 'Disabled / No';
          else if (typeof v === 'object') {
            try { formattedVal = JSON.stringify(v).replace(/[{}"]/g, ' ').replace(/:/g, ': '); }
            catch { formattedVal = 'Details recorded'; }
          } else {
            formattedVal = String(v);
          }
        }
        return { key: humanKey, val: formattedVal };
      });
  }, [parsedPayload]);

  return (
    <GlassCard 
      style={[
        s.cardContainer, 
        { borderColor: isExpanded ? `${colors.vjAccent}40` : `${colors.vjAccent}20` }
      ]}
    >
      <TouchableOpacity
        testID={`audit-log-item-${itemId}`}
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          toggleRef?.current?.(itemId);
        }}
        activeOpacity={0.7}
      >
        {/* CARD HEADER */}
        <View style={s.cardHeaderRow}>
          <View style={s.cardHeaderLeft}>
            {/* Category Icon Badge */}
            <View 
              style={[s.eventIconBox, { backgroundColor: meta.iconBg }]}
            >
              {meta.icon}
            </View>

            <View style={{ flex: 1 }}>
              {/* Category Pill */}
              <View style={s.categoryPillRow}>
                <View 
                  style={[
                    s.categoryPill, 
                    { backgroundColor: meta.badgeBg, borderColor: meta.badgeBorder }
                  ]}
                >
                  <Text style={[s.categoryPillText, { color: meta.badgeTextColor }]}>
                    {meta.category}
                  </Text>
                </View>
              </View>

              {/* Event Title */}
              <Text style={[s.eventTitle, { color: colors.vjText }]} numberOfLines={1}>
                {humanTitle}
              </Text>

              {/* Date & Time */}
              <View style={s.timestampRow}>
                <Calendar size={12} color={colors.vjText} style={{ opacity: 0.5 }} />
                <Text style={[s.timestampText, { color: colors.vjText }]}>
                  {dateStr} • {timeStr}
                </Text>
              </View>
            </View>
          </View>

          <View style={[s.chevronBox, { backgroundColor: `${colors.vjAccent}12` }]}>
            {isExpanded
              ? <ChevronUp size={18} color={colors.vjText} />
              : <ChevronDown size={18} color={colors.vjText} style={{ opacity: 0.6 }} />
            }
          </View>
        </View>

        {/* EXPANDED DETAILS DRAWER */}
        {isExpanded && (
          <View style={[s.drawerContainer, { borderTopColor: `${colors.vjAccent}18` }]}>
            
            {/* Narrative Summary Box */}
            <View style={[s.summaryBox, { borderColor: `${colors.vjAccent}15` }]}>
              <Text style={[s.summaryLabel, { color: colors.vjText }]}>
                Summary Description
              </Text>
              <Text style={[s.summaryText, { color: colors.vjText }]}>
                {humanSummary}
              </Text>
            </View>

            {detailEntries.length > 0 && (
              <View style={[s.particularsBox, { borderColor: `${colors.vjAccent}15` }]}>
                <Text style={[s.particularsLabel, { color: colors.vjText }]}>
                  Recorded Particulars
                </Text>
                {detailEntries.map((entry, idx) => (
                  <View 
                    key={`${entry.key}-${idx}`} 
                    style={[s.particularRow, { borderBottomColor: `${colors.vjAccent}10` }]}
                  >
                    <Text style={[s.particularKey, { color: colors.vjText }]}>
                      {entry.key}
                    </Text>
                    <Text style={[s.particularVal, { color: colors.vjText }]}>
                      {entry.val}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Device Identity Badge */}
            <View style={[s.deviceBadgeBox, { borderColor: `${colors.vjAccent}20` }]}>
              <View style={s.deviceBadgeLeft}>
                <Smartphone size={13} color={colors.vjText} style={{ opacity: 0.6 }} />
                <Text style={[s.deviceText, { color: colors.vjText }]}>
                  {displayDeviceName}
                </Text>
              </View>
              <Text style={[s.refNumber, { color: colors.vjText }]}>
                REF #{itemId.slice(0, 8)}
              </Text>
            </View>

          </View>
        )}
      </TouchableOpacity>
    </GlassCard>
  );
});

export default function AuditLogScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const { activeFirmId } = useFirmStore();
  const dateFormatToken = appSettingsStore((s: any) => s.dateFormatToken);
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const toggleHandlerRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    toggleHandlerRef.current = (id: string) => {
      setExpandedId(prev => prev === id ? null : id);
    };
  });

  useEffect(() => {
    loadInitialData();
  }, [activeFirmId]);

  const loadInitialData = async () => {
    const id = await getDeviceId();
    setCurrentDeviceId(id);
    if (!activeFirmId) return;
    const firmLogs = auditRepository.getByFirmId(activeFirmId) || [];
    const systemLogs = auditRepository.getSystemLogs() || [];
    const combined = [...firmLogs, ...systemLogs].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setLogs(combined);
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();
    return logs.filter(log => {
      if (categoryFilter !== 'ALL') {
        const meta = getEventMeta(log.eventType, colors);
        if (meta.category !== categoryFilter) return false;
      }
      const logDate = new Date(log.createdAt);
      if (dateFilter === 'TODAY') return logDate.toDateString() === now.toDateString();
      if (dateFilter === 'LAST_7') return logDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'LAST_30') return logDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  }, [logs, dateFilter, categoryFilter, colors]);

  const uniqueCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    logs.forEach(l => {
      categoriesSet.add(getEventMeta(l.eventType, colors).category);
    });
    return Array.from(categoriesSet);
  }, [logs, colors]);

  const handleExport = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    try {
      const csvContent = filteredLogs.map(l => {
        const payloadStr = typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload || {});
        return `"${l.createdAt}","${EVENT_MAPPING[l.eventType] || l.eventType}","${l.deviceId}","${l.firmId || 'SYSTEM'}","${payloadStr.replace(/"/g, '""')}"`;
      }).join('\n');
      
      await Share.share({
        message: `Date & Time,Event Description,Device ID,Firm ID,Details\n${csvContent}`,
        title: 'VJBilling_Audit_Log.csv'
      });
    } catch (e) {
      console.error('[AuditLogScreen] Export failed:', e);
    }
  };

  const auditHeaderPills = (
    <View style={s.headerPillRow}>
      <HeaderPill icon={<FileText size={12} color={colors.vjBg} />} label={`${filteredLogs.length} Records`} />
      <HeaderPill icon={<CalendarClock size={12} color="#4ADE80" />} label="30-Day Retention" variant="success" />
    </View>
  );

  return (
    <ToggleHandlerRef.Provider value={toggleHandlerRef}>
      <TwoToneWrapper 
        title="Audit Trail" 
        showBack 
        actionIcon={<Share2 size={20} color={colors.vjBg} />} 
        onAction={handleExport} 
        headerContent={auditHeaderPills}
      >
        <View style={s.container}>
          
          {/* FILTER BAR */}
          <View style={s.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={s.filterRow}>
                <View style={{ marginRight: 4 }}>
                  <Filter size={15} color={colors.vjText} style={{ opacity: 0.5 }} />
                </View>
                <FilterChip testID="audit-filter-date-all" label="All Time" active={dateFilter === 'ALL'} onPress={() => setDateFilter('ALL')} colors={colors} />
                <FilterChip testID="audit-filter-date-today" label="Today" active={dateFilter === 'TODAY'} onPress={() => setDateFilter('TODAY')} colors={colors} />
                <FilterChip testID="audit-filter-date-7d" label="Last 7 Days" active={dateFilter === 'LAST_7'} onPress={() => setDateFilter('LAST_7')} colors={colors} />
                <FilterChip testID="audit-filter-date-30d" label="Last 30 Days" active={dateFilter === 'LAST_30'} onPress={() => setDateFilter('LAST_30')} colors={colors} />
              </View>
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.filterRow}>
                <FilterChip testID="audit-filter-cat-all" label="All Categories" active={categoryFilter === 'ALL'} onPress={() => setCategoryFilter('ALL')} colors={colors} />
                {uniqueCategories.map(cat => (
                  <FilterChip
                    testID={`audit-filter-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    key={cat}
                    label={cat}
                    active={categoryFilter === cat}
                    onPress={() => setCategoryFilter(cat)}
                    colors={colors}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* AUDIT LOG LIST */}
          <FlatList
            data={filteredLogs}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <AuditLogItem
                itemId={String(item.id)}
                itemCreatedAt={String(item.createdAt)}
                itemEventType={String(item.eventType)}
                itemDeviceId={String(item.deviceId)}
                itemPayload={
                  item.payload
                    ? (typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload))
                    : ''
                }
                isExpanded={expandedId === item.id}
                currentDeviceId={currentDeviceId}
                dateFormatToken={dateFormatToken}
                colors={colors}
              />
            )}
            contentContainerStyle={{ 
              paddingHorizontal: 16, 
              paddingTop: 6,
              paddingBottom: Math.max(insets.bottom + 40, 80) 
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[s.emptyBox, { borderColor: `${colors.vjAccent}25` }]}>
                <View style={s.emptyIconCircle}>
                  <FileText size={44} color={colors.vjText} style={{ opacity: 0.35 }} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No audit records found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText }]}>
                  Try adjusting your time range or category filter criteria.
                </Text>
              </View>
            }
          />
        </View>
      </TwoToneWrapper>
    </ToggleHandlerRef.Provider>
  );
}

function FilterChip({ 
  label, 
  active, 
  onPress,
  colors,
  testID,
}: { 
  label: string; 
  active: boolean; 
  onPress: () => void; 
  colors: ReturnType<typeof getThemeColors>;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        s.chipContainer,
        active 
          ? { backgroundColor: colors.vjText, borderColor: colors.vjText } 
          : { backgroundColor: 'rgba(255, 255, 255, 0.75)', borderColor: `${colors.vjAccent}30` }
      ]}
    >
      <Text 
        style={[
          s.chipText,
          active ? { color: colors.vjBg } : { color: colors.vjText }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 4,
  },
  headerPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipContainer: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardContainer: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  eventIconBox: {
    padding: 12,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryPillText: {
    fontWeight: '800',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  eventTitle: {
    fontWeight: '800',
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  timestampText: {
    fontSize: 11.5,
    fontWeight: '600',
    opacity: 0.55,
  },
  chevronBox: {
    padding: 8,
    borderRadius: 999,
  },
  drawerContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  summaryBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  summaryLabel: {
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    opacity: 0.5,
  },
  summaryText: {
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },
  particularsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  particularsLabel: {
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    paddingHorizontal: 4,
    opacity: 0.5,
  },
  particularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  particularKey: {
    fontWeight: '600',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
    opacity: 0.65,
  },
  particularVal: {
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'right',
    flex: 1,
  },
  deviceBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  deviceBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceText: {
    fontWeight: '600',
    fontSize: 11.5,
    opacity: 0.7,
  },
  refNumber: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.4,
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
  },
  emptyIconCircle: {
    marginBottom: 12,
  },
  emptyTitle: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 17,
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.6,
  },
});