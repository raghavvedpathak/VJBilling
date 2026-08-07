// app/settings/audit-logs.tsx
import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Share, ScrollView, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { auditRepository } from '../../repositories/auditRepository';
import { useFirmStore } from '../../store/firmStore';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { getDeviceId } from '../../utils/deviceId';
import { 
  FileText, Smartphone, Calendar, ChevronDown, ChevronUp, Share2, Filter, 
  CalendarClock, ShieldCheck, HardDriveUpload, ShieldAlert, Building2, 
  Package, Settings, KeyRound, ShoppingBag, Tag, AlertTriangle, CheckCircle2,
  RefreshCw, Layers
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { COLORS } from '../../constants/theme';
import { HeaderPill, GlassCard } from '../../components/ui/Glass';

const ToggleHandlerRef = React.createContext<React.MutableRefObject<(id: string) => void> | null>(null);

// Canonical Plain English Event Title Mapping
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
  if (paise === undefined || paise === null || isNaN(paise)) return '₹0.00';
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
function getEventMeta(type: string) {
  if (type.includes('BACKUP') || type.includes('RESTORE')) {
    return {
      category: 'Backup & Recovery',
      icon: <HardDriveUpload size={18} color="#B45309" />,
      iconBg: 'rgba(245, 158, 11, 0.15)',
      badgeBg: 'bg-amber-500/10 border-amber-500/20',
      badgeText: 'text-amber-800'
    };
  }
  if (type.includes('PIN') || type.includes('SECURITY')) {
    return {
      category: 'Store Security',
      icon: <KeyRound size={18} color="#2563EB" />,
      iconBg: 'rgba(37, 99, 235, 0.15)',
      badgeBg: 'bg-blue-500/10 border-blue-500/20',
      badgeText: 'text-blue-800'
    };
  }
  if (type.includes('SAFE_MODE') || type.includes('FAILED') || type.includes('RESET')) {
    return {
      category: 'System Alert',
      icon: <ShieldAlert size={18} color="#DC2626" />,
      iconBg: 'rgba(220, 38, 38, 0.15)',
      badgeBg: 'bg-red-500/10 border-red-500/20',
      badgeText: 'text-red-800'
    };
  }
  if (type.includes('FIRM')) {
    return {
      category: 'Firm Profile',
      icon: <Building2 size={18} color="#5C1623" />,
      iconBg: 'rgba(92, 22, 35, 0.12)',
      badgeBg: 'bg-rose-950/10 border-rose-950/20',
      badgeText: 'text-rose-950'
    };
  }
  if (type.includes('FY')) {
    return {
      category: 'Financial Year',
      icon: <CalendarClock size={18} color="#059669" />,
      iconBg: 'rgba(5, 150, 105, 0.15)',
      badgeBg: 'bg-emerald-500/10 border-emerald-500/20',
      badgeText: 'text-emerald-800'
    };
  }
  if (type.includes('ITEM') || type.includes('URD') || type.includes('CATEGORY') || type.includes('DESIGN') || type.includes('KARIGAR') || type.includes('GOLD') || type.includes('GEMSTONE') || type.includes('WEIGHT') || type.includes('HUID')) {
    return {
      category: 'Stock & Inventory',
      icon: <Package size={18} color="#7C3AED" />,
      iconBg: 'rgba(124, 58, 237, 0.15)',
      badgeBg: 'bg-purple-500/10 border-purple-500/20',
      badgeText: 'text-purple-800'
    };
  }
  return {
    category: 'System Event',
    icon: <FileText size={18} color="#4B5563" />,
    iconBg: 'rgba(75, 85, 99, 0.12)',
    badgeBg: 'bg-gray-500/10 border-gray-500/20',
    badgeText: 'text-gray-800'
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

// Internal keys to filter out from user view
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

  const meta = getEventMeta(itemEventType);
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
    <GlassCard style={isExpanded ? { borderColor: 'rgba(92, 22, 35, 0.25)', marginBottom: 12 } : { marginBottom: 12 }}>
      <TouchableOpacity
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
          toggleRef?.current?.(itemId);
        }}
        activeOpacity={0.7}
      >
        {/* === CARD HEADER === */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            {/* Category Icon Badge */}
            <View 
              className="p-3 rounded-2xl mr-3 border border-black/5 items-center justify-center"
              style={{ backgroundColor: meta.iconBg }}
            >
              {meta.icon}
            </View>

            <View className="flex-1">
              {/* Category Pill */}
              <View className="flex-row items-center mb-1">
                <View className={`px-2 py-0.5 rounded-full border ${meta.badgeBg}`}>
                  <Text className={`font-bold text-[9px] uppercase tracking-wider ${meta.badgeText}`}>
                    {meta.category}
                  </Text>
                </View>
              </View>

              {/* Event Title */}
              <Text className="text-vj-text font-extrabold text-base tracking-tight" numberOfLines={1}>
                {humanTitle}
              </Text>

              {/* Date & Time */}
              <View className="flex-row items-center gap-1.5 mt-1">
                <Calendar size={12} color="rgba(42, 18, 8, 0.4)" />
                <Text className="text-vj-text/50 text-xs font-semibold">
                  {dateStr} • {timeStr}
                </Text>
              </View>
            </View>
          </View>

          <View className="p-2 bg-black/5 rounded-full">
            {isExpanded
              ? <ChevronUp size={18} color={COLORS.vjText} />
              : <ChevronDown size={18} color="rgba(42, 18, 8, 0.5)" />
            }
          </View>
        </View>

        {/* === EXPANDED DETAILS DRAWER === */}
        {isExpanded && (
          <View className="mt-4 pt-4 border-t border-vj-text/10">
            
            {/* Plain English Narrative Summary Box */}
            <View className="bg-white/80 p-3.5 rounded-2xl border border-vj-text/10 mb-3 shadow-xs">
              <Text className="text-vj-text/40 font-bold text-[10px] uppercase tracking-widest mb-1">
                Summary Description
              </Text>
              <Text className="text-vj-text font-semibold text-sm leading-relaxed">
                {humanSummary}
              </Text>
            </View>

            {/* Key-Value Details */}
            {detailEntries.length > 0 && (
              <View className="bg-white/60 p-3 rounded-2xl border border-white/80 mb-3">
                <Text className="text-vj-text/40 font-bold text-[10px] uppercase tracking-widest mb-2 px-1">
                  Recorded Particulars
                </Text>
                {detailEntries.map((entry, idx) => (
                  <View 
                    key={idx} 
                    className="flex-row items-center justify-between py-2 border-b border-black/5 last:border-b-0 px-1"
                  >
                    <Text className="text-vj-text/60 font-semibold text-xs flex-1 mr-2">
                      {entry.key}
                    </Text>
                    <Text className="text-vj-text font-bold text-xs text-right flex-1">
                      {entry.val}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Device Identity Badge */}
            <View className="flex-row items-center justify-between bg-white/40 px-3 py-2 rounded-xl border border-white/60">
              <View className="flex-row items-center gap-1.5">
                <Smartphone size={13} color="rgba(42, 18, 8, 0.6)" />
                <Text className="text-vj-text/70 font-semibold text-xs">
                  {displayDeviceName}
                </Text>
              </View>
              <Text className="text-vj-text/30 font-bold text-[10px] tracking-widest uppercase">
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
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const { activeFirmId } = useFirmStore();
  const dateFormatToken = useStore(appSettingsStore, (s: any) => s.dateFormatToken);

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
    const firmLogs = await auditRepository.getByFirmId(activeFirmId);
    const systemLogs = await auditRepository.getSystemLogs();
    const combined = [...firmLogs, ...systemLogs].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setLogs(combined);
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();
    return logs.filter(log => {
      if (categoryFilter !== 'ALL') {
        const meta = getEventMeta(log.eventType);
        if (meta.category !== categoryFilter) return false;
      }
      const logDate = new Date(log.createdAt);
      if (dateFilter === 'TODAY') return logDate.toDateString() === now.toDateString();
      if (dateFilter === 'LAST_7') return logDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'LAST_30') return logDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  }, [logs, dateFilter, categoryFilter]);

  const uniqueCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    logs.forEach(l => {
      categoriesSet.add(getEventMeta(l.eventType).category);
    });
    return Array.from(categoriesSet);
  }, [logs]);

  const handleExport = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
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
      console.error(e);
    }
  };

  const auditHeaderPills = (
    <View className="flex-row items-center gap-2 flex-wrap mt-1">
      <HeaderPill icon={<FileText size={12} color={COLORS.vjBg} />} label={`${filteredLogs.length} Records`} />
      <HeaderPill icon={<CalendarClock size={12} color="#4ADE80" />} label="30-Day Retention" variant="success" />
    </View>
  );

  return (
    <ToggleHandlerRef.Provider value={toggleHandlerRef}>
      <TwoToneWrapper 
        title="Audit Trail" 
        showBack 
        actionIcon={<Share2 size={20} color={COLORS.vjBg} />} 
        onAction={handleExport} 
        headerContent={auditHeaderPills}
      >
        <View className="flex-1 mt-2">
          
          {/* === FILTER BAR === */}
          <View className="px-2 py-2 mb-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              <View className="flex-row items-center gap-2 mr-4">
                <View className="mr-1"><Filter size={15} color="rgba(42, 18, 8, 0.4)" /></View>
                <FilterChip label="All Time" active={dateFilter === 'ALL'} onPress={() => setDateFilter('ALL')} />
                <FilterChip label="Today" active={dateFilter === 'TODAY'} onPress={() => setDateFilter('TODAY')} />
                <FilterChip label="Last 7 Days" active={dateFilter === 'LAST_7'} onPress={() => setDateFilter('LAST_7')} />
                <FilterChip label="Last 30 Days" active={dateFilter === 'LAST_30'} onPress={() => setDateFilter('LAST_30')} />
              </View>
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2">
                <FilterChip label="All Categories" active={categoryFilter === 'ALL'} onPress={() => setCategoryFilter('ALL')} />
                {uniqueCategories.map(cat => (
                  <FilterChip
                    key={cat}
                    label={cat}
                    active={categoryFilter === cat}
                    onPress={() => setCategoryFilter(cat)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* === AUDIT LOG LIST === */}
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
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 100, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="items-center mt-12 bg-white/40 p-8 rounded-3xl border border-white/50">
                <View className="mb-4 opacity-50"><FileText size={48} color="rgba(42, 18, 8, 0.4)" /></View>
                <Text className="text-center text-vj-text/60 font-extrabold text-lg">No audit records found</Text>
                <Text className="text-center text-vj-text/40 text-sm mt-1">Try adjusting your filters or date range.</Text>
              </View>
            }
          />
        </View>
      </TwoToneWrapper>
    </ToggleHandlerRef.Provider>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
        active 
          ? { backgroundColor: COLORS.vjText, borderColor: COLORS.vjText } 
          : { backgroundColor: 'rgba(255, 255, 255, 0.8)', borderColor: COLORS.border }
      ]}
    >
      <Text style={[
        { fontSize: 12, fontWeight: '700' },
        active ? { color: COLORS.vjBg } : { color: COLORS.vjText }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}