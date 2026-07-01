import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Share, ScrollView, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { auditRepository } from '../../repositories/auditRepository';
import { useFirmStore } from '../../store/firmStore';
// FIX: Import useStore and the compliant store
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { getDeviceId } from '../../utils/deviceId';
import { FileText, Smartphone, Calendar, ChevronDown, ChevronUp, Share2, Filter } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

const ToggleHandlerRef = React.createContext<React.MutableRefObject<(id: string) => void> | null>(null);

const EVENT_MAPPING: Record<string, string> = {
  'FIRM_CREATED': 'Firm Created',
  'FIRM_UPDATED': 'Firm Updated',
  'FIRM_SWITCHED': 'Switched Active Firm',
  'FIRM_ARCHIVED': 'Firm Archived',
  'FIRM_UNARCHIVED': 'Firm Reactivated',
  'FIRM_CODE_SET': 'Firm Code Assigned',
  'SAFE_MODE_ACTIVATED': 'Safe Mode Activated',
  'SAFE_MODE_CLEARED': 'Safe Mode Cleared',
  'BACKUP_CREATED': 'Backup Created',
  'RESTORE_COMPLETED': 'Data Restored',
  'RESTORE_OLD_SCHEMA': 'Old Backup Restored',
  'FY_CLOSED': 'Financial Year Closed',
  'SETTINGS_CHANGED': 'Settings Modified',
  'DEVICE_ID_GENERATED': 'New Device Registered',
  'BIS_LOGO_ARCHIVED': 'BIS Logo Removed',
  'PRE_MIGRATION_SNAPSHOT_FAILED': 'Pre-Migration Snapshot Failed',
  'AUDIT_RETENTION_PURGE_EXECUTED': 'Audit Log Retention Purge Ran'
};

const colors = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#C8860A',
  success: '#16a34a',
  danger: '#dc2626',
  blue: '#3b82f6',
  orange: '#f97316',
};

function getEventBgColor(type: string): string {
  if (type.includes('CREATED')) return 'rgba(22,163,74,0.12)';
  if (type.includes('UPDATED') || type.includes('SWITCHED')) return '#dbeafe';
  if (type.includes('SAFE_MODE')) return 'rgba(220,38,38,0.12)';
  if (type.includes('BACKUP') || type.includes('RESTORE')) return '#ffedd5';
  return '#ffffff';
}

function formatEventType(type: string) {
  return String(type).replace(/_/g, ' ');
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

  let dateStr = "Unknown Date";
  let timeStr = "Unknown Time";
  try {
    const parsedDate = parseISO(itemCreatedAt);
    dateStr = format(parsedDate, dateFormatToken);
    timeStr = format(parsedDate, 'hh:mm a');
  } catch (e) {
    console.error("Date formatting failed for:", itemCreatedAt);
  }

  let parsedPayload: Record<string, any> = {};
  if (itemPayload) {
    try {
      parsedPayload = JSON.parse(itemPayload);
    } catch {
      parsedPayload = { "System Note": itemPayload };
    }
  }

  const displayDeviceName = itemDeviceId === currentDeviceId
    ? (Device.modelName || 'Current Device')
    : `Other device (${String(itemDeviceId).slice(-8)})`;

  return (
    <TouchableOpacity
      onPress={() => toggleRef?.current?.(itemId)}
      style={[
        s.card,
        isExpanded ? s.cardExpanded : s.cardCollapsed
      ]}
    >
      <View style={s.cardHeader}>
        <View style={[s.iconCircle, { backgroundColor: getEventBgColor(itemEventType) }]}>
          <FileText size={20} color={colors.vjText} />
        </View>

        <View style={s.cardHeaderText}>
          <Text style={s.eventTitle}>
            {EVENT_MAPPING[itemEventType] || formatEventType(itemEventType)}
          </Text>
          <View style={s.dateRow}>
            <Calendar size={12} color="#999" />
            <Text style={s.dateText}>{dateStr} • {timeStr}</Text>
          </View>
        </View>

        {isExpanded
          ? <ChevronUp size={20} color="#999" />
          : <ChevronDown size={20} color="#999" />
        }
      </View>

      {isExpanded && (
        <View style={s.expandedBody}>
          <View style={s.deviceBadge}>
            <Smartphone size={14} color="#666" />
            <Text style={s.deviceText}>{String(displayDeviceName).toUpperCase()}</Text>
          </View>

          <View style={s.payloadCard}>
            {Object.keys(parsedPayload).length > 0 ? (
              Object.entries(parsedPayload).map(([k, v]) => {
                const cleanKey = String(k)
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase());

                let displayVal: string;
                if (v === null || v === undefined || v === '') {
                  displayVal = 'None provided';
                } else if (typeof v === 'boolean') {
                  displayVal = v ? 'Enabled (Yes)' : 'Disabled (No)';
                } else if (typeof v === 'object') {
                  try { displayVal = JSON.stringify(v).replace(/[{}"]/g, ' '); }
                  catch { displayVal = 'Complex Data'; }
                } else {
                  displayVal = String(v);
                }

                return (
                  <View key={String(k)} style={s.payloadRow}>
                    <Text style={s.payloadKey}>{cleanKey}</Text>
                    <Text style={s.payloadVal}>{displayVal}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={s.payloadEmpty}>No specific details recorded for this event.</Text>
            )}
          </View>

          <Text style={s.refId}>Ref ID: {String(itemId).split('-')[0]}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardCollapsed: {
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  cardExpanded: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    padding: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeaderText: {
    flex: 1,
  },
  eventTitle: {
    color: colors.vjText,
    fontWeight: '700',
    fontSize: 15,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dateText: {
    color: 'rgba(92,22,35,0.50)',
    fontSize: 12,
    fontWeight: '500',
  },
  expandedBody: {
    backgroundColor: 'rgba(92,22,35,0.05)',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(92,22,35,0.10)',
  },
  deviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(92,22,35,0.10)',
  },
  deviceText: {
    color: 'rgba(92,22,35,0.70)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  payloadCard: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  payloadRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92,22,35,0.05)',
    alignItems: 'flex-start',
  },
  payloadKey: {
    color: 'rgba(92,22,35,0.60)',
    fontSize: 11,
    fontWeight: '700',
    width: '40%',
    paddingRight: 8,
    paddingTop: 2,
  },
  payloadVal: {
    color: 'rgba(92,22,35,0.90)',
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  payloadEmpty: {
    color: 'rgba(92,22,35,0.50)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  refId: {
    color: 'rgba(92,22,35,0.30)',
    fontSize: 10,
    marginTop: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'right',
  },
});

export default function AuditLogScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30' | 'CUSTOM'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const { activeFirmId } = useFirmStore();
  
  // FIX: Use useStore to reactively bind to the static store and strongly type 's'
  const dateFormatToken = useStore(appSettingsStore, (s: any) => s.dateFormatToken);

  const toggleHandlerRef = useRef<(id: string) => void>(() => {});
  toggleHandlerRef.current = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

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
      if (typeFilter !== 'ALL' && log.eventType !== typeFilter) return false;
      const logDate = new Date(log.createdAt);
      if (dateFilter === 'TODAY') return logDate.toDateString() === now.toDateString();
      if (dateFilter === 'LAST_7') return logDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'LAST_30') return logDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  }, [logs, dateFilter, typeFilter]);

  const uniqueEventTypes = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.eventType)));
  }, [logs]);

  const handleExport = async () => {
    try {
      const csvContent = filteredLogs.map(l =>
        `${l.createdAt},${l.eventType},${l.deviceId},${l.firmId || 'SYSTEM'},"${(l.payload || '').replace(/"/g, '""')}"`
      ).join('\n');
      await Share.share({
        message: `Date,Event,DeviceID,FirmID,Payload\n${csvContent}`,
        title: 'VJBilling_Audit_Log.csv'
      });
    } catch (e) {
      console.error(e);
    }
  };

  const headerContent = (
    <View>
      <View className="flex-row justify-between items-center mb-6">
        <View className="bg-white/10 p-4 rounded-full border border-white/20">
          <FileText size={32} color="#FCFBF8" />
        </View>
        <TouchableOpacity
          onPress={handleExport}
          className="flex-row items-center gap-2 bg-vj-accent px-4 py-2 rounded-full border border-vj-accent/50 shadow-sm"
        >
          <Share2 size={16} color="#FCFBF8" />
          <Text className="text-vj-bg text-sm font-bold">Export Logs</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-vj-bg font-bold text-3xl mb-1 tracking-tight">Audit Trail</Text>
      <Text className="text-vj-bg/60 font-medium tracking-widest text-xs uppercase">
        {filteredLogs.length} Immutable System Events
      </Text>
    </View>
  );

  return (
    <ToggleHandlerRef.Provider value={toggleHandlerRef}>
      <TwoToneWrapper title="" showBack headerContent={headerContent}>
        <View className="flex-1 mt-2">
          <View className="px-2 py-2 border-b border-black/5 mb-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row items-center gap-2 mr-4">
                <View className="mr-1"><Filter size={16} color="#999" /></View>
                <FilterChip label="All Time"     active={dateFilter === 'ALL'}     onPress={() => setDateFilter('ALL')} />
                <FilterChip label="Today"        active={dateFilter === 'TODAY'}   onPress={() => setDateFilter('TODAY')} />
                <FilterChip label="Last 7 Days"  active={dateFilter === 'LAST_7'}  onPress={() => setDateFilter('LAST_7')} />
                <FilterChip label="Last 30 Days" active={dateFilter === 'LAST_30'} onPress={() => setDateFilter('LAST_30')} />
                <FilterChip label="Custom"       active={dateFilter === 'CUSTOM'}  onPress={() => setDateFilter('CUSTOM')} />
              </View>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2">
                <FilterChip label="All Event Types" active={typeFilter === 'ALL'} onPress={() => setTypeFilter('ALL')} />
                {uniqueEventTypes.map(type => (
                  <FilterChip
                    key={type}
                    label={EVENT_MAPPING[type] || formatEventType(type)}
                    active={typeFilter === type}
                    onPress={() => setTypeFilter(type)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

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
            contentContainerStyle={{paddingHorizontal: 4, paddingBottom: 100, paddingTop: 32}}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="items-center mt-12 bg-white/40 p-8 rounded-3xl border border-white/50">
                <View className="mb-4 opacity-50"><FileText size={48} color="#999" /></View>
                <Text className="text-center text-vj-text/50 font-bold text-lg">No records found</Text>
                <Text className="text-center text-vj-text/40 text-sm mt-1">Try adjusting your filters.</Text>
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
      className={`px-4 py-2 rounded-full border ${active ? 'bg-vj-text border-vj-text' : 'bg-white border-vj-text/10 shadow-sm'}`}
    >
      <Text className={`text-xs font-bold ${active ? 'text-vj-bg' : 'text-vj-text/60'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}