// app/settings/audit-logs.tsx — Phase 1 v8.0 & Phase 2 Canonical Screen
// Obeys Step 1 Layer Hierarchy (UI -> auditService -> auditRepository)
// Enhanced: Modern Luxury UI, Timeline Date Grouping, Real-time Search & Multi-format Export (PDF, TXT, CSV)

import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { auditService } from '@/services/phase1/auditService';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getDeviceId } from '@/utils/deviceId';
import { formatRupees } from '@/utils/currency';
import {
  FileText,
  Smartphone,
  Calendar,
  ChevronDown,
  ChevronUp,
  Share2,
  Filter,
  CalendarClock,
  ShieldAlert,
  Building2,
  Package,
  KeyRound,
  HardDriveUpload,
  Search,
  X,
  FileSpreadsheet,
  FileType,
  Sparkles,
  CheckCircle2,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { getThemeColors, COLORS } from '@/constants/theme';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';

const ToggleHandlerRef = React.createContext<React.MutableRefObject<(id: string) => void> | null>(
  null
);

// Canonical Plain English Event Title Mapping (Phase 1 v8.0 + Phase 2)
const EVENT_MAPPING: Record<string, string> = {
  FIRM_CREATED: 'New Firm Profile Created',
  FIRM_UPDATED: 'Firm Profile Details Updated',
  FIRM_SWITCHED: 'Switched Active Firm',
  FIRM_ARCHIVED: 'Firm Profile Archived',
  FIRM_UNARCHIVED: 'Firm Profile Reactivated',
  FIRM_CODE_SET: 'Firm Code Assigned',
  SAFE_MODE_ACTIVATED: 'Safe Mode Activated',
  SAFE_MODE_CLEARED: 'Safe Mode Cleared',
  BACKUP_CREATED: 'Database Backup Created',
  AUTO_BACKUP_FAILED: 'Automatic Backup Failed',
  AUTO_BACKUP_SETTING_CHANGED: 'Automatic Backup Setting Updated',
  RESTORE_COMPLETED: 'Database Successfully Restored',
  RESTORE_FAILED: 'Database Restore Failed',
  RESTORE_OLD_SCHEMA: 'Older Backup Restored',
  FY_CREATED: 'New Financial Year Created',
  FY_CLOSED: 'Financial Year Closed',
  FY_CLOCK_SKEW: 'System Clock Skew Detected',
  SETTINGS_CHANGED: 'System Preferences Modified',
  DEVICE_ID_GENERATED: 'New Device Identity Registered',
  BIS_LOGO_ARCHIVED: 'BIS Logo Removed',
  PRE_MIGRATION_SNAPSHOT_CREATED: 'Pre-Migration Snapshot Secured',
  PRE_MIGRATION_SNAPSHOT_PURGED: 'Pre-Migration Snapshot Cleaned Up',
  PRE_MIGRATION_SNAPSHOT_FAILED: 'Pre-Migration Snapshot Failed',
  AUDIT_RETENTION_PURGE_EXECUTED: 'Audit Log Auto-Cleanup Ran',
  DEVICE_ID_CHANGED: 'Device Reinstall / Identity Updated',
  FACTORY_RESET_EXECUTED: 'Factory Reset Executed',

  // Security
  PIN_SET: 'Security PIN Created',
  PIN_CHANGED: 'Security PIN Updated',
  PIN_SKIPPED: 'Security PIN Deferred',

  // Phase 2 Stock & Transactions
  URD_PURCHASE_CREATED: 'Unregistered Purchase Logged',
  URD_PURCHASE_CONFIRMED: 'Unregistered Purchase Confirmed',
  CATEGORY_CREATED: 'New Category Added',
  CATEGORY_UPDATED: 'Category Details Updated',
  CATEGORY_SOFT_DELETED: 'Category Removed',
  DESIGN_CREATED: 'New Design Added',
  DESIGN_UPDATED: 'Design Details Updated',
  DESIGN_SOFT_DELETED: 'Design Removed',
  STONE_CREATED: 'Stone Master Added',
  ITEM_CREATED: 'New Stock Item Added',
  HUID_ADDED: 'HUID Tag Assigned',
  ITEM_STATUS_CHANGED: 'Stock Item Status Updated',
  WEIGHT_ADJUSTED: 'Stock Weight Adjusted',
  BARCODE_REPRINTED: 'Barcode Label Reprinted',
  OLD_GOLD_LOT_CREATED: 'Old Gold Lot Added',
  OLD_GOLD_LOT_STATUS_CHANGED: 'Old Gold Lot Status Updated',
  FY_CLOSE_FINE_BALANCE: 'Fine Gold Balance Closed',
  FY_ARCHIVE_INDEXED: 'Financial Year Archived',
  ITEM_DELETED: 'Stock Item Deleted',
  METAL_SOURCE_CORRECTED: 'Metal Source Corrected',
  HUID_CORRECTED: 'HUID Tag Corrected',
  GEMSTONE_LOT_CREATED: 'Gemstone Lot Added',
  GEMSTONE_LOT_STATUS_CHANGED: 'Gemstone Lot Status Updated',
  ITEM_EDITED: 'Stock Item Details Edited',
  ITEM_SENT_TO_KARIGAR: 'Item Issued to Karigar',
  ITEM_RETURNED_FROM_KARIGAR: 'Item Received from Karigar',
};

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

const formatIsoDateTime = (isoStr?: string, token = 'dd/MM/yyyy'): string => {
  if (!isoStr) return 'N/A';
  try {
    const d = parseISO(isoStr);
    return format(d, `${token}, hh:mm a`);
  } catch {
    return String(isoStr);
  }
};

function getEventMeta(type: string, colors: ReturnType<typeof getThemeColors>) {
  if (type.includes('BACKUP') || type.includes('RESTORE')) {
    return {
      category: 'Backup & Recovery',
      icon: <HardDriveUpload size={18} color="#D97706" />,
      iconBg: 'rgba(217, 119, 6, 0.14)',
      badgeBg: 'rgba(217, 119, 6, 0.12)',
      badgeBorder: 'rgba(217, 119, 6, 0.3)',
      badgeTextColor: '#B45309',
    };
  }
  if (type.includes('PIN') || type.includes('SECURITY')) {
    return {
      category: 'Store Security',
      icon: <KeyRound size={18} color="#2563EB" />,
      iconBg: 'rgba(37, 99, 235, 0.14)',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeBorder: 'rgba(37, 99, 235, 0.3)',
      badgeTextColor: '#1D4ED8',
    };
  }
  if (type.includes('SAFE_MODE') || type.includes('FAILED') || type.includes('RESET')) {
    return {
      category: 'System Alert',
      icon: <ShieldAlert size={18} color="#DC2626" />,
      iconBg: 'rgba(220, 38, 38, 0.14)',
      badgeBg: 'rgba(220, 38, 38, 0.12)',
      badgeBorder: 'rgba(220, 38, 38, 0.3)',
      badgeTextColor: '#B91C1C',
    };
  }
  if (type.includes('FIRM')) {
    return {
      category: 'Firm Profile',
      icon: <Building2 size={18} color={colors.vjAccent} />,
      iconBg: `${colors.vjAccent}18`,
      badgeBg: `${colors.vjAccent}14`,
      badgeBorder: `${colors.vjAccent}35`,
      badgeTextColor: colors.vjAccent,
    };
  }
  if (type.includes('FY')) {
    return {
      category: 'Financial Year',
      icon: <CalendarClock size={18} color="#059669" />,
      iconBg: 'rgba(5, 150, 105, 0.14)',
      badgeBg: 'rgba(5, 150, 105, 0.12)',
      badgeBorder: 'rgba(5, 150, 105, 0.3)',
      badgeTextColor: '#047857',
    };
  }
  if (
    type.includes('ITEM') ||
    type.includes('URD') ||
    type.includes('CATEGORY') ||
    type.includes('DESIGN') ||
    type.includes('KARIGAR') ||
    type.includes('GOLD') ||
    type.includes('GEMSTONE') ||
    type.includes('WEIGHT') ||
    type.includes('HUID')
  ) {
    return {
      category: 'Stock & Inventory',
      icon: <Package size={18} color="#7C3AED" />,
      iconBg: 'rgba(124, 58, 237, 0.14)',
      badgeBg: 'rgba(124, 58, 237, 0.12)',
      badgeBorder: 'rgba(124, 58, 237, 0.3)',
      badgeTextColor: '#6D28D9',
    };
  }
  return {
    category: 'System Event',
    icon: <FileText size={18} color={colors.vjText} />,
    iconBg: `${colors.vjAccent}15`,
    badgeBg: `${colors.vjAccent}12`,
    badgeBorder: `${colors.vjAccent}25`,
    badgeTextColor: colors.vjText,
  };
}

function getHumanSummary(eventType: string, payload: Record<string, any>): string {
  switch (eventType) {
    case 'BACKUP_CREATED':
      return `Backup file "${payload.fileName || 'vjbilling_backup.vjb'}" (${formatBytes(
        payload.fileSizeBytes
      )}, ${payload.kind || 'MANUAL'}, trigger: ${payload.trigger || 'NOW'}) was created successfully.`;
    case 'AUTO_BACKUP_FAILED':
      return `Automatic backup did not complete (Reason: ${
        payload.reason || 'BACKUP_ERROR'
      }, streak: ${payload.failCount || 1}).`;
    case 'AUTO_BACKUP_SETTING_CHANGED':
      return `Automatic daily backup was turned ${payload.enabled ? 'ON' : 'OFF'}.`;
    case 'RESTORE_COMPLETED':
      return `Database was successfully restored from backup (contains ${
        payload.firmCount || 1
      } firm profile(s)${payload.oldSchema ? ', migrated from older schema' : ''}).`;
    case 'RESTORE_FAILED':
      return `Database restore failed. Reason: ${
        payload.reason || 'Decryption error or corrupted file'
      }.`;
    case 'FIRM_CREATED':
      return `Established new firm "${payload.name || 'Firm'}" with code ${
        payload.firmCode || 'N/A'
      }.`;
    case 'FIRM_UPDATED':
      return `Updated store profile details for ${payload.name || 'active firm'}.`;
    case 'FIRM_SWITCHED':
      return 'Switched active store workspace.';
    case 'SAFE_MODE_ACTIVATED':
      return `Safe Mode safety guard was activated. Reason: ${
        payload.reason || 'System integrity check'
      }.`;
    case 'SAFE_MODE_CLEARED':
      return 'Safe Mode cleared — store database verified healthy.';
    case 'PRE_MIGRATION_SNAPSHOT_CREATED':
      return 'Encrypted local snapshot secured safely prior to schema migration.';
    case 'PRE_MIGRATION_SNAPSHOT_PURGED':
      return 'Temporary pre-migration snapshot purged after database verification passed.';
    case 'PRE_MIGRATION_SNAPSHOT_FAILED':
      return `Failed to capture pre-migration snapshot: ${payload.error || 'Unknown error'}.`;
    case 'SETTINGS_CHANGED':
      return `Updated system settings (${
        Array.isArray(payload.fields) ? payload.fields.join(', ') : payload.setting || 'Preferences'
      }).`;
    case 'PIN_SET':
      return `Created a ${payload.pinLength || 6}-digit security PIN for app access.`;
    case 'PIN_CHANGED':
      return 'Updated store security PIN.';
    case 'PIN_SKIPPED':
      return 'PIN setup deferred during initial boot.';
    case 'URD_PURCHASE_CREATED':
      return `Logged unregistered purchase for customer ${
        payload.customerName || 'Customer'
      } (${formatCurrencyPaise(payload.totalValuePaise)}).`;
    case 'URD_PURCHASE_CONFIRMED':
      return `Confirmed URD purchase voucher for customer ${payload.customerName || 'Customer'}.`;
    case 'CATEGORY_CREATED':
      return `Added new product category "${payload.name || 'Category'}" to store master.`;
    case 'DESIGN_CREATED':
      return `Added new design "${payload.name || 'Design'}" (Code: ${
        payload.code || 'N/A'
      }) to store master.`;
    case 'ITEM_CREATED':
      return `Added new stock item (SKU: ${payload.sku || 'N/A'}, Gross: ${formatWeightMg(
        payload.grossWeightMg
      )}) to inventory.`;
    case 'HUID_ADDED':
      return `Assigned HUID tag "${payload.huid || 'N/A'}" to stock item ${payload.sku || ''}.`;
    case 'ITEM_STATUS_CHANGED':
      return `Item status for ${payload.sku || 'stock item'} updated to ${payload.status || 'NEW'}.`;
    case 'ITEM_SENT_TO_KARIGAR':
      return `Issued stock item ${payload.sku || 'item'} to karigar for manufacturing/polishing.`;
    case 'ITEM_RETURNED_FROM_KARIGAR':
      return `Received stock item ${payload.sku || 'item'} back from karigar.`;
    case 'AUDIT_RETENTION_PURGE_EXECUTED':
      return `Auto-cleanup purged ${payload.deletedCount || 0} expired log record(s) older than ${
        payload.auditRetentionDays || 30
      } days.`;
    case 'DEVICE_ID_GENERATED':
      return 'Registered new device identity for secure transactions.';
    case 'DEVICE_ID_CHANGED':
      return 'Linked restored database to this device identity after reinstall or migration.';
    default:
      return `${EVENT_MAPPING[eventType] || eventType.replace(/_/g, ' ')} recorded in system log.`;
  }
}

const KEY_LABEL_MAPPING: Record<string, string> = {
  fileName: 'Backup File Name',
  fileSizeBytes: 'Backup File Size',
  shared: 'Exported / Shared',
  kind: 'Backup Kind',
  trigger: 'Trigger Mechanism',
  oldSchema: 'Migrated from Legacy Schema',
  failCount: 'Failure Count',
  failedAt: 'Failure Timestamp',
  enabled: 'Enabled Status',
  publicFolderGranted: 'Public Storage Granted',
  notificationsGranted: 'Notifications Granted',
  confirmedFirmCode: 'Confirmed Store Code',
  oldPinLength: 'Previous PIN Length',
  newPinLength: 'New PIN Length',
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
  os: 'Operating System',
};

const INTERNAL_KEYS_TO_HIDE = new Set([
  'id',
  'firmId',
  'fyId',
  'entityId',
  'oldGoldLotId',
  'designId',
  'categoryId',
  'stoneId',
  'createdAt',
  'updatedAt',
  'isArchived',
  'isActive',
  'phantomStockId',
]);

function getDateGroupLabel(isoStr: string, dateFormatToken: string): string {
  try {
    const d = parseISO(isoStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return format(d, dateFormatToken || 'dd/MM/yyyy');
  } catch {
    return 'Older Records';
  }
}

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateAuditPdfHtml(
  logs: any[],
  firmName: string,
  firmCode: string,
  filterInfo: string,
  dateFormatToken: string
): string {
  const rows = logs
    .map((l) => {
      let dateStr = l.createdAt;
      try {
        dateStr = format(parseISO(l.createdAt), `${dateFormatToken}, hh:mm a`);
      } catch {}
      const title = EVENT_MAPPING[l.eventType] || l.eventType.replace(/_/g, ' ');
      let payloadObj: Record<string, any> = {};
      try {
        payloadObj = typeof l.payload === 'string' ? JSON.parse(l.payload) : l.payload || {};
      } catch {
        payloadObj = { note: String(l.payload) };
      }
      const summary = getHumanSummary(l.eventType, payloadObj);
      const meta = getEventMeta(l.eventType, {
        vjText: '#1E293B',
        vjAccent: '#D97706',
        vjBg: '#FFFFFF',
      } as any);
      const refId = String(l.id).slice(0, 8);

      return `
        <tr style="page-break-inside: avoid; border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 8px; font-size: 11px; color: #475569; white-space: nowrap; vertical-align: top;">
            ${escapeHtml(dateStr)}
          </td>
          <td style="padding: 10px 8px; vertical-align: top;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${
              meta.badgeTextColor
            }; margin-bottom: 2px;">
              ${escapeHtml(meta.category)}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #0F172A;">
              ${escapeHtml(title)}
            </div>
          </td>
          <td style="padding: 10px 8px; font-size: 11px; color: #334155; line-height: 1.4; vertical-align: top;">
            ${escapeHtml(summary)}
          </td>
          <td style="padding: 10px 8px; font-size: 10px; color: #64748B; font-family: monospace; vertical-align: top; text-align: right;">
            REF #${escapeHtml(refId)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Audit Trail Report - ${escapeHtml(firmName)}</title>
        <style>
          @page { size: A4; margin: 15mm 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; }
          .header { border-bottom: 2px solid #D97706; padding-bottom: 12px; margin-bottom: 16px; }
          .store-name { font-size: 22px; font-weight: 800; color: #0F172A; }
          .report-title { font-size: 13px; font-weight: 700; color: #D97706; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
          .meta-bar { display: flex; justify-content: space-between; font-size: 10.5px; color: #64748B; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #F8FAFC; border-bottom: 2px solid #CBD5E1; padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; color: #475569; }
          .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div class="store-name">${escapeHtml(firmName)}</div>
              <div class="report-title">Official System Audit Trail Report</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #475569;">
              <div><strong>Firm Code:</strong> ${escapeHtml(firmCode || 'N/A')}</div>
              <div><strong>Generated:</strong> ${escapeHtml(
                format(new Date(), `${dateFormatToken}, hh:mm a`)
              )}</div>
            </div>
          </div>
          <div class="meta-bar">
            <span><strong>Scope:</strong> ${escapeHtml(filterInfo)}</span>
            <span><strong>Total Records:</strong> ${logs.length}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Timestamp</th>
              <th style="width: 25%;">Category & Event</th>
              <th style="width: 45%;">Summary / Action</th>
              <th style="width: 12%; text-align: right;">Reference</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="footer">
          Confidential • Generated by VJ Billing Security Subsystem • Tamper-Evident Audit Record
        </div>
      </body>
    </html>
  `;
}

function generateAuditTxt(
  logs: any[],
  firmName: string,
  firmCode: string,
  filterInfo: string,
  dateFormatToken: string
): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('                     VJ BILLING — SYSTEM AUDIT TRAIL REPORT                     ');
  lines.push('================================================================================');
  lines.push(`Store / Firm:       ${firmName} (Code: ${firmCode || 'N/A'})`);
  lines.push(`Generated At:       ${format(new Date(), `${dateFormatToken}, hh:mm a`)}`);
  lines.push(`Filter Scope:       ${filterInfo}`);
  lines.push(`Total Records:      ${logs.length}`);
  lines.push('================================================================================\n');

  logs.forEach((l, idx) => {
    let dateStr = l.createdAt;
    try {
      dateStr = format(parseISO(l.createdAt), `${dateFormatToken}, hh:mm a`);
    } catch {}
    const title = EVENT_MAPPING[l.eventType] || l.eventType.replace(/_/g, ' ');
    let payloadObj: Record<string, any> = {};
    try {
      payloadObj = typeof l.payload === 'string' ? JSON.parse(l.payload) : l.payload || {};
    } catch {
      payloadObj = { note: String(l.payload) };
    }
    const summary = getHumanSummary(l.eventType, payloadObj);
    const meta = getEventMeta(l.eventType, {
      vjText: '#1E293B',
      vjAccent: '#D97706',
      vjBg: '#FFFFFF',
    } as any);
    const refId = String(l.id).slice(0, 8);

    lines.push(`[${idx + 1}] ${dateStr} — ${title}`);
    lines.push(`    Category:     ${meta.category}`);
    lines.push(`    Summary:      ${summary}`);
    lines.push(`    Device ID:    ${l.deviceId}`);
    lines.push(`    Reference:    REF #${refId}`);

    const details = Object.entries(payloadObj).filter(([k]) => !INTERNAL_KEYS_TO_HIDE.has(k));
    if (details.length > 0) {
      lines.push('    Particulars:');
      for (const [k, v] of details) {
        const humanKey = KEY_LABEL_MAPPING[k] || k;
        lines.push(`      - ${humanKey}: ${JSON.stringify(v)}`);
      }
    }
    lines.push('--------------------------------------------------------------------------------');
  });

  return lines.join('\n');
}

function generateAuditCsv(logs: any[]): string {
  const headers = [
    'Timestamp',
    'Event Type',
    'Category',
    'Device ID',
    'Firm ID',
    'Summary',
    'Particulars',
  ];
  const rows = logs.map((l) => {
    let payloadObj: Record<string, any> = {};
    try {
      payloadObj = typeof l.payload === 'string' ? JSON.parse(l.payload) : l.payload || {};
    } catch {
      payloadObj = { note: String(l.payload) };
    }
    const title = EVENT_MAPPING[l.eventType] || l.eventType;
    const summary = getHumanSummary(l.eventType, payloadObj);
    const payloadStr = typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload || {});

    return [
      l.createdAt,
      title,
      getEventMeta(l.eventType, { vjText: '', vjAccent: '', vjBg: '' } as any).category,
      l.deviceId,
      l.firmId || 'SYSTEM',
      summary,
      payloadStr,
    ]
      .map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

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

const AuditLogItem = memo(
  ({
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
    } catch {
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

    const isCurrentDevice = itemDeviceId === currentDeviceId;
    const displayDeviceName = isCurrentDevice
      ? Device.modelName
        ? `${Device.modelName} (This Device)`
        : 'This Device'
      : `Other Registered Device (${String(itemDeviceId).slice(-8)})`;

    const detailEntries = useMemo(() => {
      return Object.entries(parsedPayload)
        .filter(([k]) => !INTERNAL_KEYS_TO_HIDE.has(k))
        .map(([k, v]) => {
          const humanKey =
            KEY_LABEL_MAPPING[k] ||
            k.replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase());
          let formattedVal = 'None';
          let isMonospace = false;
          let isHighlight = false;

          if (v !== null && v !== undefined && v !== '') {
            if (k === 'fileSizeBytes') {
              formattedVal = formatBytes(Number(v));
              isHighlight = true;
            } else if (k.endsWith('Mg') || k.includes('Weight')) {
              formattedVal = formatWeightMg(Number(v));
              isHighlight = true;
            } else if (k.endsWith('Paise') || k.includes('Value') || k.includes('Amount')) {
              formattedVal = formatCurrencyPaise(Number(v));
              isHighlight = true;
            } else if (k.endsWith('At') || k.endsWith('Date')) {
              formattedVal = formatIsoDateTime(String(v), dateFormatToken);
            } else if (k === 'sku' || k === 'huid' || k === 'firmCode' || k === 'code') {
              formattedVal = String(v);
              isMonospace = true;
            } else if (typeof v === 'boolean') {
              formattedVal = v ? 'Enabled / Yes' : 'Disabled / No';
            } else if (typeof v === 'object') {
              try {
                formattedVal = JSON.stringify(v).replace(/[{}"]/g, ' ').replace(/:/g, ': ');
              } catch {
                formattedVal = 'Details recorded';
              }
            } else {
              formattedVal = String(v);
            }
          }
          return { key: humanKey, val: formattedVal, isMonospace, isHighlight };
        });
    }, [parsedPayload, dateFormatToken]);

    return (
      <GlassCard
        style={[
          s.cardContainer,
          {
            borderColor: isExpanded ? `${colors.vjAccent}50` : `${colors.vjAccent}25`,
            backgroundColor: isExpanded ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.82)',
          },
        ]}
      >
        <TouchableOpacity
          testID={`audit-log-item-${itemId}`}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            toggleRef?.current?.(itemId);
          }}
          activeOpacity={0.7}
        >
          {/* Card Top Row */}
          <View style={s.cardHeaderRow}>
            <View style={[s.eventIconBox, { backgroundColor: meta.iconBg }]}>{meta.icon}</View>

            <View style={{ flex: 1, marginRight: 8 }}>
              {/* Category & Time Line */}
              <View style={s.metaTopRow}>
                <View
                  style={[
                    s.categoryPill,
                    { backgroundColor: meta.badgeBg, borderColor: meta.badgeBorder },
                  ]}
                >
                  <Text style={[s.categoryPillText, { color: meta.badgeTextColor }]}>
                    {meta.category}
                  </Text>
                </View>
                <Text style={[s.timeText, { color: colors.vjText }]}>{timeStr}</Text>
              </View>

              {/* Event Title */}
              <Text style={[s.eventTitle, { color: colors.vjText }]} numberOfLines={1}>
                {humanTitle}
              </Text>

              {/* 1-Line Preview Subtitle */}
              <Text style={[s.previewSubtitle, { color: colors.vjText }]} numberOfLines={1}>
                {humanSummary}
              </Text>
            </View>

            {/* Chevron Action */}
            <View
              style={[
                s.chevronBox,
                {
                  backgroundColor: isExpanded ? `${colors.vjAccent}20` : `${colors.vjAccent}10`,
                },
              ]}
            >
              {isExpanded ? (
                <ChevronUp size={18} color={colors.vjText} />
              ) : (
                <ChevronDown size={18} color={colors.vjText} style={{ opacity: 0.6 }} />
              )}
            </View>
          </View>

          {/* Expanded Drawer (Executive Dossier) */}
          {isExpanded && (
            <View style={[s.drawerContainer, { borderTopColor: `${colors.vjAccent}20` }]}>
              {/* Summary Box with Accent Left Border */}
              <View
                style={[
                  s.summaryBox,
                  {
                    borderLeftColor: meta.badgeTextColor,
                    borderColor: `${colors.vjAccent}18`,
                  },
                ]}
              >
                <View style={s.summaryLabelRow}>
                  <Sparkles size={11} color={meta.badgeTextColor} />
                  <Text style={[s.summaryLabel, { color: meta.badgeTextColor }]}>
                    EVENT SUMMARY
                  </Text>
                </View>
                <Text style={[s.summaryText, { color: colors.vjText }]}>{humanSummary}</Text>
              </View>

              {/* Recorded Particulars Grid */}
              {detailEntries.length > 0 && (
                <View style={[s.particularsBox, { borderColor: `${colors.vjAccent}18` }]}>
                  <Text style={[s.particularsLabel, { color: colors.vjText }]}>
                    RECORDED PARTICULARS
                  </Text>
                  {detailEntries.map((entry, idx) => (
                    <View
                      key={`${entry.key}-${idx}`}
                      style={[
                        s.particularRow,
                        {
                          borderBottomColor:
                            idx === detailEntries.length - 1 ? 'transparent' : `${colors.vjAccent}12`,
                        },
                      ]}
                    >
                      <Text style={[s.particularKey, { color: colors.vjText }]}>{entry.key}</Text>
                      {entry.isMonospace ? (
                        <View style={[s.monoBadge, { borderColor: `${colors.vjAccent}35` }]}>
                          <Text style={[s.monoText, { color: colors.vjText }]}>{entry.val}</Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            s.particularVal,
                            {
                              color: entry.isHighlight ? colors.vjAccent : colors.vjText,
                              fontWeight: entry.isHighlight ? '800' : '700',
                            },
                          ]}
                        >
                          {entry.val}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Device & Provenance Footer */}
              <View style={[s.deviceBadgeBox, { borderColor: `${colors.vjAccent}20` }]}>
                <View style={s.deviceBadgeLeft}>
                  <Smartphone size={13} color={colors.vjText} style={{ opacity: 0.6 }} />
                  <Text style={[s.deviceText, { color: colors.vjText }]}>{displayDeviceName}</Text>
                  {isCurrentDevice && (
                    <View style={s.deviceVerifiedBadge}>
                      <CheckCircle2 size={10} color="#16A34A" />
                      <Text style={s.deviceVerifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
                <View style={[s.refBadge, { borderColor: `${colors.vjAccent}25` }]}>
                  <Text style={[s.refNumber, { color: colors.vjText }]}>
                    REF #{itemId.slice(0, 8)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </GlassCard>
    );
  }
);

export default function AuditLogScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const { activeFirmId, firms } = useFirmStore();
  const activeFirm = useMemo(
    () => firms.find((f) => f.id === activeFirmId),
    [firms, activeFirmId]
  );

  const dateFormatToken = appSettingsStore((s: any) => s.dateFormatToken) || 'dd/MM/yyyy';
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const auditRetentionDays = appSettingsStore(
    (s: any) => s.settings?.auditRetentionDays ?? s.auditRetentionDays ?? 30
  );
  const colors = getThemeColors(activeTheme);

  const toggleHandlerRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    toggleHandlerRef.current = (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
    };
  });

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setCurrentDeviceId(getDeviceId());
      } catch {
        setCurrentDeviceId('');
      }
      if (!activeFirmId) return;
      try {
        // Step 1 Layer Hierarchy: Fetch via auditService instead of calling auditRepository directly
        const combined = await auditService.getEvents(activeFirmId);
        setLogs(combined);
      } catch (e) {
        console.error('[AuditLogScreen] Failed to load audit events:', e);
      }
    };
    void loadInitialData();
  }, [activeFirmId]);

  // Filter logs by Category, Date Range, and Search Query
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const query = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      // 1. Category Filter
      if (categoryFilter !== 'ALL') {
        const meta = getEventMeta(log.eventType, colors);
        if (meta.category !== categoryFilter) return false;
      }

      // 2. Date Filter
      const logDate = new Date(log.createdAt);
      if (dateFilter === 'TODAY' && logDate.toDateString() !== now.toDateString()) {
        return false;
      }
      if (
        dateFilter === 'LAST_7' &&
        logDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        dateFilter === 'LAST_30' &&
        logDate < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      ) {
        return false;
      }

      // 3. Search Query
      if (query) {
        const title = (EVENT_MAPPING[log.eventType] || log.eventType).toLowerCase();
        const payloadStr =
          typeof log.payload === 'string' ? log.payload.toLowerCase() : JSON.stringify(log.payload || {}).toLowerCase();
        const device = String(log.deviceId || '').toLowerCase();
        const refId = String(log.id || '').toLowerCase();

        return (
          title.includes(query) ||
          payloadStr.includes(query) ||
          device.includes(query) ||
          refId.includes(query)
        );
      }

      return true;
    });
  }, [logs, dateFilter, categoryFilter, searchQuery, colors]);

  // Group filtered logs into Timeline Sections (e.g. "Today", "Yesterday", "22 November 2026")
  const groupedSections = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    const order: string[] = [];

    for (const log of filteredLogs) {
      const label = getDateGroupLabel(log.createdAt, dateFormatToken);
      if (!groups[label]) {
        groups[label] = [];
        order.push(label);
      }
      groups[label].push(log);
    }

    return order.map((title) => ({
      title,
      data: groups[title],
    }));
  }, [filteredLogs, dateFormatToken]);

  // Category counts for quick-pills
  const categoryCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    logs.forEach((l) => {
      const cat = getEventMeta(l.eventType, colors).category;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [logs, colors]);

  const uniqueCategories = useMemo(() => {
    return Object.keys(categoryCounts).sort();
  }, [categoryCounts]);

  const filterSummaryText = useMemo(() => {
    const dateLabels: Record<string, string> = {
      ALL: 'All Time',
      TODAY: 'Today',
      LAST_7: 'Last 7 Days',
      LAST_30: 'Last 30 Days',
    };
    return `${dateLabels[dateFilter]} • ${categoryFilter === 'ALL' ? 'All Categories' : categoryFilter}`;
  }, [dateFilter, categoryFilter]);

  // Multi-Format Export Handler: PDF, TXT, CSV
  const handleExport = async (formatType: 'PDF' | 'TXT' | 'CSV') => {
    if (filteredLogs.length === 0) {
      Alert.alert('No Records Found', 'There are no audit logs matching your current filter criteria.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setIsExporting(true);
    const dateStamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const storeName = activeFirm?.name || 'Store';
    const storeCode = activeFirm?.firmCode || 'VJB';
    const sanitizedStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';

    try {
      if (formatType === 'PDF') {
        const html = generateAuditPdfHtml(
          filteredLogs,
          storeName,
          storeCode,
          filterSummaryText,
          dateFormatToken
        );
        const { uri } = await Print.printToFileAsync({ html });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            UTI: '.pdf',
            mimeType: 'application/pdf',
            dialogTitle: `Share ${storeName} Audit Trail PDF`,
          });
        } else {
          await Share.share({
            message: `VJ Billing Audit Trail Report (${filteredLogs.length} records)`,
            title: `${sanitizedStore}_AuditTrail_${dateStamp}.pdf`,
          });
        }
      } else if (formatType === 'TXT') {
        const txt = generateAuditTxt(
          filteredLogs,
          storeName,
          storeCode,
          filterSummaryText,
          dateFormatToken
        );
        const filePath = `${baseDir}${sanitizedStore}_AuditTrail_${dateStamp}.txt`;
        await FileSystem.writeAsStringAsync(filePath, txt, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filePath, {
            UTI: 'public.plain-text',
            mimeType: 'text/plain',
            dialogTitle: `Share ${storeName} Audit Trail TXT`,
          });
        } else {
          await Share.share({
            message: txt,
            title: `${sanitizedStore}_AuditTrail_${dateStamp}.txt`,
          });
        }
      } else if (formatType === 'CSV') {
        const csv = generateAuditCsv(filteredLogs);
        const filePath = `${baseDir}${sanitizedStore}_AuditTrail_${dateStamp}.csv`;
        await FileSystem.writeAsStringAsync(filePath, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filePath, {
            UTI: 'public.comma-separated-values-text',
            mimeType: 'text/csv',
            dialogTitle: `Share ${storeName} Audit Trail CSV`,
          });
        } else {
          await Share.share({
            message: csv,
            title: `${sanitizedStore}_AuditTrail_${dateStamp}.csv`,
          });
        }
      }
      setShowExportModal(false);
    } catch (e: any) {
      console.error('[AuditLogScreen] Export error:', e);
      Alert.alert('Export Failed', e?.message || 'Could not export audit log file.');
    } finally {
      setIsExporting(false);
    }
  };

  const auditHeaderPills = (
    <View style={s.headerPillRow}>
      <HeaderPill
        icon={<FileText size={12} color={colors.vjBg} />}
        label={`${filteredLogs.length} Records`}
      />
      <HeaderPill
        icon={<CalendarClock size={12} color="#4ADE80" />}
        label={`${auditRetentionDays}-Day Retention`}
        variant="success"
      />
    </View>
  );

  return (
    <ToggleHandlerRef.Provider value={toggleHandlerRef}>
      <TwoToneWrapper
        title="Audit Trail"
        showBack
        actionIcon={<Share2 size={20} color={colors.vjBg} />}
        onAction={() => setShowExportModal(true)}
        headerContent={auditHeaderPills}
      >
        <View style={s.container}>
          {/* Quick Search Bar */}
          <View style={s.searchSection}>
            <View
              style={[
                s.searchBox,
                {
                  borderColor: `${colors.vjAccent}25`,
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                },
              ]}
            >
              <Search size={16} color={colors.vjText} style={{ opacity: 0.5, marginRight: 8 }} />
              <TextInput
                style={[s.searchInput, { color: colors.vjText }]}
                placeholder="Search audit events, SKUs, devices..."
                placeholderTextColor={`${colors.vjText}60`}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={s.searchClearBtn}
                  activeOpacity={0.7}
                >
                  <X size={14} color={colors.vjText} style={{ opacity: 0.6 }} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filter Chips Section */}
          <View style={s.filterSection}>
            {/* Time Filter Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }}
            >
              <View style={s.filterRow}>
                <View style={{ marginRight: 4 }}>
                  <Filter size={14} color={colors.vjText} style={{ opacity: 0.5 }} />
                </View>
                <FilterChip
                  testID="audit-filter-date-all"
                  label="All Time"
                  active={dateFilter === 'ALL'}
                  onPress={() => setDateFilter('ALL')}
                  colors={colors}
                />
                <FilterChip
                  testID="audit-filter-date-today"
                  label="Today"
                  active={dateFilter === 'TODAY'}
                  onPress={() => setDateFilter('TODAY')}
                  colors={colors}
                />
                <FilterChip
                  testID="audit-filter-date-7d"
                  label="Last 7 Days"
                  active={dateFilter === 'LAST_7'}
                  onPress={() => setDateFilter('LAST_7')}
                  colors={colors}
                />
                <FilterChip
                  testID="audit-filter-date-30d"
                  label="Last 30 Days"
                  active={dateFilter === 'LAST_30'}
                  onPress={() => setDateFilter('LAST_30')}
                  colors={colors}
                />
              </View>
            </ScrollView>

            {/* Category Filter Scroll with Counts */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.filterRow}>
                <FilterChip
                  testID="audit-filter-cat-all"
                  label={`All Categories (${logs.length})`}
                  active={categoryFilter === 'ALL'}
                  onPress={() => setCategoryFilter('ALL')}
                  colors={colors}
                />
                {uniqueCategories.map((cat) => (
                  <FilterChip
                    testID={`audit-filter-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    key={cat}
                    label={`${cat} (${categoryCounts[cat] || 0})`}
                    active={categoryFilter === cat}
                    onPress={() => setCategoryFilter(cat)}
                    colors={colors}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Grouped Timeline SectionList */}
          <SectionList
            sections={groupedSections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <View style={s.sectionHeader}>
                <View
                  style={[
                    s.sectionHeaderBadge,
                    {
                      backgroundColor: `${colors.vjAccent}15`,
                      borderColor: `${colors.vjAccent}30`,
                    },
                  ]}
                >
                  <Calendar size={12} color={colors.vjText} style={{ opacity: 0.7 }} />
                  <Text style={[s.sectionHeaderText, { color: colors.vjText }]}>
                    {section.title}
                  </Text>
                </View>
                <Text style={[s.sectionCountText, { color: colors.vjText }]}>
                  {section.data.length} {section.data.length === 1 ? 'record' : 'records'}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <AuditLogItem
                itemId={String(item.id)}
                itemCreatedAt={String(item.createdAt)}
                itemEventType={String(item.eventType)}
                itemDeviceId={String(item.deviceId)}
                itemPayload={
                  item.payload
                    ? typeof item.payload === 'string'
                      ? item.payload
                      : JSON.stringify(item.payload)
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
              paddingTop: 4,
              paddingBottom: Math.max(insets.bottom + 40, 80),
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[s.emptyBox, { borderColor: `${colors.vjAccent}25` }]}>
                <View style={s.emptyIconCircle}>
                  <FileText size={44} color={colors.vjText} style={{ opacity: 0.35 }} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No audit records found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText }]}>
                  {searchQuery
                    ? `No events match "${searchQuery}". Try clearing your search.`
                    : 'Try adjusting your time range or category filter criteria.'}
                </Text>
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    style={[s.clearSearchPill, { borderColor: `${colors.vjAccent}40` }]}
                  >
                    <Text style={[s.clearSearchText, { color: colors.vjAccent }]}>Clear Search</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />

          {/* Export Options Modal (PDF, TXT, CSV) */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={showExportModal}
            onRequestClose={() => !isExporting && setShowExportModal(false)}
          >
            <View style={s.modalBackdrop}>
              <View
                style={[
                  s.exportModalContent,
                  {
                    backgroundColor: colors.vjBg,
                    borderColor: `${colors.vjAccent}40`,
                  },
                ]}
              >
                <View style={s.exportHeader}>
                  <View>
                    <Text style={[s.exportTitle, { color: colors.vjText }]}>
                      Export Audit Trail
                    </Text>
                    <Text style={[s.exportSubtitle, { color: colors.vjText }]}>
                      {filteredLogs.length} record(s) ready to export
                    </Text>
                  </View>
                  <TouchableOpacity
                    disabled={isExporting}
                    onPress={() => setShowExportModal(false)}
                    style={s.exportCloseBtn}
                  >
                    <X size={20} color={colors.vjText} />
                  </TouchableOpacity>
                </View>

                {isExporting ? (
                  <View style={s.exportLoadingBox}>
                    <ActivityIndicator size="large" color={colors.vjAccent} />
                    <Text style={[s.exportLoadingText, { color: colors.vjText }]}>
                      Generating export document...
                    </Text>
                  </View>
                ) : (
                  <View style={s.exportOptionsContainer}>
                    {/* PDF Export Option */}
                    <TouchableOpacity
                      onPress={() => handleExport('PDF')}
                      activeOpacity={0.7}
                      style={[s.exportOptionCard, { borderColor: `${colors.vjAccent}30` }]}
                    >
                      <View style={[s.exportOptionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.14)' }]}>
                        <FileText size={22} color="#DC2626" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.exportOptionTitleRow}>
                          <Text style={[s.exportOptionTitle, { color: colors.vjText }]}>
                            PDF Report
                          </Text>
                          <View style={[s.formatBadge, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <Text style={[s.formatBadgeText, { color: '#DC2626' }]}>.PDF</Text>
                          </View>
                        </View>
                        <Text style={[s.exportOptionDesc, { color: colors.vjText }]}>
                          Formal formatted document with store header, timeline & signatures. Ready to print or submit for compliance.
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* TXT Export Option */}
                    <TouchableOpacity
                      onPress={() => handleExport('TXT')}
                      activeOpacity={0.7}
                      style={[s.exportOptionCard, { borderColor: `${colors.vjAccent}30` }]}
                    >
                      <View style={[s.exportOptionIconBox, { backgroundColor: 'rgba(37, 99, 235, 0.14)' }]}>
                        <FileType size={22} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.exportOptionTitleRow}>
                          <Text style={[s.exportOptionTitle, { color: colors.vjText }]}>
                            Plain Text File
                          </Text>
                          <View style={[s.formatBadge, { backgroundColor: 'rgba(37, 99, 235, 0.12)' }]}>
                            <Text style={[s.formatBadgeText, { color: '#2563EB' }]}>.TXT</Text>
                          </View>
                        </View>
                        <Text style={[s.exportOptionDesc, { color: colors.vjText }]}>
                          Clean structured log file. Light, portable, and easy to read or attach to notes and messages.
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* CSV Export Option */}
                    <TouchableOpacity
                      onPress={() => handleExport('CSV')}
                      activeOpacity={0.7}
                      style={[s.exportOptionCard, { borderColor: `${colors.vjAccent}30` }]}
                    >
                      <View style={[s.exportOptionIconBox, { backgroundColor: 'rgba(5, 150, 105, 0.14)' }]}>
                        <FileSpreadsheet size={22} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.exportOptionTitleRow}>
                          <Text style={[s.exportOptionTitle, { color: colors.vjText }]}>
                            CSV Spreadsheet
                          </Text>
                          <View style={[s.formatBadge, { backgroundColor: 'rgba(5, 150, 105, 0.12)' }]}>
                            <Text style={[s.formatBadgeText, { color: '#059669' }]}>.CSV</Text>
                          </View>
                        </View>
                        <Text style={[s.exportOptionDesc, { color: colors.vjText }]}>
                          Raw tabular data with column headers. Directly opens in Microsoft Excel, Google Sheets, or CA audit tools.
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </Modal>
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
          : { backgroundColor: 'rgba(255, 255, 255, 0.78)', borderColor: `${colors.vjAccent}30` },
      ]}
    >
      <Text style={[s.chipText, active ? { color: colors.vjBg } : { color: colors.vjText }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, marginTop: 2 },
  headerPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    padding: 0,
  },
  searchClearBtn: {
    padding: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 999,
  },
  filterSection: { paddingHorizontal: 16, paddingVertical: 6, marginBottom: 2 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipContainer: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  sectionHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  sectionCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    opacity: 0.5,
  },
  cardContainer: {
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.55,
  },
  eventTitle: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.65,
    lineHeight: 16,
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  drawerContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  summaryBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3.5,
    borderWidth: 1,
    marginBottom: 10,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  summaryLabel: {
    fontWeight: '800',
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  summaryText: {
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },
  particularsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  particularsLabel: {
    fontWeight: '800',
    fontSize: 9.5,
    letterSpacing: 0.8,
    marginBottom: 6,
    paddingHorizontal: 4,
    opacity: 0.5,
  },
  particularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
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
    fontSize: 12.5,
    textAlign: 'right',
  },
  monoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
    borderWidth: 1,
  },
  monoText: {
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 11,
  },
  deviceBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  deviceBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  deviceText: {
    fontWeight: '600',
    fontSize: 11.5,
    opacity: 0.7,
  },
  deviceVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
  },
  deviceVerifiedText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#16A34A',
  },
  refBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
  },
  refNumber: {
    fontWeight: '800',
    fontSize: 9.5,
    letterSpacing: 0.8,
    fontFamily: 'monospace',
    opacity: 0.6,
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
  },
  emptyIconCircle: { marginBottom: 12 },
  emptyTitle: { textAlign: 'center', fontWeight: '800', fontSize: 17 },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.6,
    lineHeight: 18,
  },
  clearSearchPill: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  clearSearchText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  exportModalContent: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  exportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  exportSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 2,
  },
  exportCloseBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  exportLoadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  exportLoadingText: {
    fontSize: 13.5,
    fontWeight: '700',
    opacity: 0.7,
  },
  exportOptionsContainer: {
    gap: 10,
  },
  exportOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  exportOptionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  exportOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  exportOptionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  exportOptionDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    opacity: 0.6,
  },
});
