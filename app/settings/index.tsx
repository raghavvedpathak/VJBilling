// app/settings/index.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import * as Device from 'expo-device';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useSession } from '../../hooks/useSession';
import { backupService } from '../../services/backupService';
import { restoreService } from '../../services/restoreService';
import { auditService } from '../../services/auditService';
import { storage } from '../../utils/storage';
import { settingsService } from '../../services/settingsService'; 
import { GlassCard } from '../../components/ui/Glass';
import {
  Building2,
  HardDriveDownload,
  HardDriveUpload,
  ShieldAlert,
  ChevronRight,
  Database,
  CalendarClock,
  Palette,
  Lock,
  FileText,
  CheckCircle2,
  X,
  AlertCircle,
  IndianRupee,
  Wrench,
  Percent,
  MonitorSmartphone,
  FileBox
} from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { firm, refreshSession } = useSession();
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy'); 
  const [unsavedWarning, setUnsavedWarning] = useState(true); 
  
  const [showDateModal, setShowDateModal] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const settings = await settingsService.getSettings() as any; 
        if (settings) {
          if (settings.dateFormatToken) setDateFormat(settings.dateFormatToken);
          if (settings.warnUnsavedChanges !== undefined) setUnsavedWarning(settings.warnUnsavedChanges === 1);
        }
      } catch (e) {
        console.error("Failed to load DB settings", e);
      }

      const storedWarning = await storage.getItem('vjb_unsaved_warning');
      if (storedWarning) {
          setUnsavedWarning(storedWarning !== 'false'); 
      }
    };
    loadPreferences();
  }, []);

  const getTodayPreview = (format: string) => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[today.getMonth()];

    switch(format) {
      case 'dd/MM/yyyy': return `${d}/${m}/${y}`;
      case 'd MMMM yyyy': return `${Number(d)} ${monthName} ${y}`;
      case 'dd-MM-yyyy': return `${d}-${m}-${y}`;
      case 'yyyy-MM-dd': return `${y}-${m}-${d}`;
      default: return `${d}/${m}/${y}`;
    }
  };

  const toggleUnsavedWarning = async (value: boolean) => {
    setUnsavedWarning(value);
    await storage.setItem('vjb_unsaved_warning', value ? 'true' : 'false');
    
    try {
       await settingsService.updateSettings({ warnUnsavedChanges: value ? 1 : 0 });
    } catch(e) {
       console.error(e);
    }

    if (firm) {
      await auditService.log(null, firm.id, 'SETTINGS_CHANGED', {
        setting: 'UNSAVED_CHANGES_WARNING',
        value: value ? 'ENABLED' : 'DISABLED'
      });
    }
  };

  const updateDateFormat = async (newFormat: string) => {
    try {
      await settingsService.updateSettings({ dateFormatToken: newFormat });
      setDateFormat(newFormat);
      setShowDateModal(false);
    } catch (e: any) {
      Alert.alert("Cannot Update Settings", e.message);
    }
  };

  const handleBackup = async () => {
    try {
      setBackingUp(true);
      await backupService.createBackup();
    } catch (error: any) {
      Alert.alert("Backup Failed", error.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    Alert.alert(
      "Restore Database?",
      "WARNING: This will replace ALL current data with the backup file. This action cannot be undone.\n\nAre you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Replace Everything",
          style: "destructive",
          onPress: async () => {
              try {
                setRestoring(true);
                const status = await restoreService.restoreFromFile();
                if (status === 'CANCELED') return;
                await refreshSession();
                if (status === 'COMPLETED_WITH_ISSUES') {
                   Alert.alert("Restored with Warnings", "Issues found. Safe Mode activated.");
                   router.replace('/settings/verify');
                } else {
                   Alert.alert("Success", "Database restored successfully.");
                   router.replace('/dashboard');
                }
              } catch (error: any) {
                Alert.alert("Restore Failed", error.message);
              } finally {
                setRestoring(false);
              }
          }
        }
      ]
    );
  };

  // Removed 'if (!firm) return null;' to prevent screen blinking on mount

  return (
    <TwoToneWrapper title="Settings" showBack>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        overScrollMode="never"
        removeClippedSubviews={false} 
        bounces={false}
      >
        
        <SectionHeader title="General" />
        
        <View className="px-1 mb-2">
          <GlassCard style={{ opacity: 0.7 }}>
            <View className="flex-row items-center gap-4" accessibilityRole="text" accessibilityLabel="Currency: Indian Rupee, fixed">
              <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                <IndianRupee size={24} color="#2E1D00" />
              </View>
              <View className="flex-1">
                <Text className="text-vj-text font-bold text-base">Currency</Text>
                <Text className="text-vj-text/60 text-xs">INR — Indian Rupee</Text>
                <Text className="text-vj-text/40 text-[10px] mt-0.5">Fixed for Indian GST compliance</Text>
              </View>
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title="Date Format"
          subtitle={getTodayPreview(dateFormat)}
          icon={<CalendarClock size={24} color="#2E1D00" />}
          onPress={() => setShowDateModal(true)}
        />

        <View className="px-1 mb-2">
          <GlassCard>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-4 flex-1">
                <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                  <AlertCircle size={24} color="#B87333" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">Unsaved Changes</Text>
                  <Text className="text-vj-text/60 text-xs">Warn before exiting forms</Text>
                </View>
              </View>
              <Switch
                value={unsavedWarning}
                onValueChange={toggleUnsavedWarning}
                trackColor={{ false: "#D1D1D1", true: "#B87333" }}
                thumbColor={"#FAF3E0"}
              />
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title="App Theme"
          subtitle="Light (System Default)"
          icon={<Palette size={24} color="#2E1D00" />}
          onPress={() => Alert.alert("Coming Soon", "Theme Engine is locked for Phase 2 Polish.")}
        />

        <GlassSettingsTile
          title="Invoice Settings"
          subtitle="Prefixes, Terms & Conditions"
          icon={<FileBox size={24} color="#2E1D00" />}
          onPress={() => Alert.alert("Coming Soon", "Invoice customization unlocks in Phase 4.")}
        />

        <SectionHeader title="Identity & Structure" />
        <GlassSettingsTile
          title="Firm Identity"
          subtitle="Manage Firms, Addresses & Logos"
          icon={<Building2 size={24} color="#B87333" />}
          onPress={() => router.push('/settings/firms')}
        />

        {/* UPDATED ROUTE: No longer throws an alert, navigates to the FY Close Wizard */}
        <GlassSettingsTile
          title="Close Financial Year"
          subtitle="Lock current year data"
          icon={<Lock size={24} color="#B87333" />}
          onPress={() => router.push('/settings/close-fy')}
        />

        <SectionHeader title="Tax & Devices" />
        <GlassSettingsTile
          title="GST Tax Rates"
          subtitle="Manage CGST/SGST groups"
          icon={<Percent size={24} color="#2E1D00" />}
          onPress={() => Alert.alert("Phase 3 Feature", "GST settings are configured in the full setup. Available after Phase 3.")}
        />
        <GlassSettingsTile
          title="Paired Devices"
          subtitle="Primary/Secondary Sync setup"
          icon={<MonitorSmartphone size={24} color="#2E1D00" />}
          onPress={() => Alert.alert("Future Feature", "Device sync is available in a future update.")}
        />

        <SectionHeader title="Utilities & Safety" />
        <GlassSettingsTile
          title="Data Utilities"
          subtitle="Export Ledgers & Inventory"
          icon={<Wrench size={24} color="#2E1D00" />}
          onPress={() => Alert.alert("Phase 6 Feature", "Data Utilities unlock in Phase 6.")}
        />
        
        <GlassSettingsTile
          title="Audit Logs"
          subtitle="View immutable system events"
          icon={<FileText size={24} color="#2E1D00" />}
          onPress={() => router.push('/settings/audit-logs')}
          disabled={restoring}
        />

        <GlassSettingsTile
          title={backingUp ? "Generating Backup..." : "Backup Data"}
          subtitle="Export secure .vjb file"
          icon={backingUp ? <ActivityIndicator size="small" color="#B87333" /> : <HardDriveDownload size={24} color="#2E1D00" />}
          onPress={handleBackup}
          disabled={backingUp || restoring}
        />
        <GlassSettingsTile
          title={restoring ? "Restoring..." : "Restore Data"}
          subtitle="Import from .vjb file"
          icon={restoring ? <ActivityIndicator size="small" color="#B87333" /> : <HardDriveUpload size={24} color="#2E1D00" />}
          onPress={handleRestore}
          disabled={backingUp || restoring}
        />
        <GlassSettingsTile
          title="Verify My Data"
          subtitle="Run deep integrity scan"
          icon={<ShieldAlert size={24} color="#2E1D00" />}
          onPress={() => router.push('/settings/verify')}
          disabled={restoring}
        />

        <View className="mt-8 items-center opacity-40 mb-10">
          <Database size={20} color="#2E1D00" />
          <Text className="text-[10px] font-bold text-vj-text mt-2">
            VJ BILLING • PHASE 2 • INVENTORY
          </Text>
          <Text className="text-[10px] text-vj-text">
            Firm Code: {firm?.firmCode || 'N/A'}
          </Text>
          <Text className="text-[10px] text-vj-text mt-1">
            Device: {Device.modelName || 'Unknown'} ({Device.osName})
          </Text>
        </View>

      </ScrollView>

      <Modal animationType="fade" transparent={true} visible={showDateModal} onRequestClose={() => setShowDateModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-6 shadow-xl border border-white/50">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-vj-text font-bold text-xl">Date Format</Text>
              <TouchableOpacity onPress={() => setShowDateModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
              </TouchableOpacity>
            </View>

            {[
              { token: 'dd/MM/yyyy', label: 'Compact (Default)' },
              { token: 'd MMMM yyyy', label: 'Professional' },
              { token: 'dd-MM-yyyy', label: 'Hyphen Variant' },
              { token: 'yyyy-MM-dd', label: 'ISO 8601 (Export)' }
            ].map((fmt) => (
              <TouchableOpacity
                key={fmt.token}
                onPress={() => updateDateFormat(fmt.token)}
                className={`p-4 rounded-xl border mb-3 flex-row justify-between items-center ${dateFormat === fmt.token ? 'bg-vj-text border-vj-text' : 'bg-white/60 border-black/10'}`}
              >
                <View>
                  <Text className={`font-bold text-base ${dateFormat === fmt.token ? 'text-vj-bg' : 'text-vj-text'}`}>{fmt.label}</Text>
                  <Text className={`text-xs ${dateFormat === fmt.token ? 'text-vj-bg/70' : 'text-vj-text/60'}`}>{getTodayPreview(fmt.token)}</Text>
                </View>
                {dateFormat === fmt.token && <CheckCircle2 size={24} color="#FAF3E0" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

    </TwoToneWrapper>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-3 mt-4 ml-1">
      {title}
    </Text>
  );
}

function GlassSettingsTile({ title, subtitle, icon, onPress, disabled }: any) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} className="mb-2">
      <GlassCard style={{ padding: 16 }}>
        <View className={`flex-row items-center gap-4 ${disabled ? 'opacity-50' : ''}`}>
          <View className="bg-white/40 p-3 rounded-full border border-white/50">
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-vj-text font-bold text-base">{title}</Text>
            <Text className="text-vj-text/60 text-xs">{subtitle}</Text>
          </View>
          <View className="opacity-50">
             <ChevronRight size={20} color="#B87333" />
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}