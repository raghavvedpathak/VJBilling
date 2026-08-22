// app/settings/index.tsx — Phase 1 & Phase 2 Canonical Settings Hub

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import * as Device from 'expo-device';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { storage } from '@/utils/storage';
import { settingsService } from '@/services/phase1/settingsService'; 
import { GlassCard, HeaderPill, GlassSettingsTile } from '@/components/ui/Glass';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService'; 
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { ThemeSelectorModal } from '@/components/ThemeSelectorModal';
import { DateFormatModal } from '@/components/DateFormatModal';
import {
  Building2,
  HardDriveDownload,
  ShieldAlert,
  Database,
  CalendarClock,
  Palette,
  Lock,
  FileText,
  AlertCircle,
  IndianRupee,
  Wrench,
  Percent,
  MonitorSmartphone,
  FileBox,
  KeyRound,
  ShieldCheck
} from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { firm } = useSession();

  // Settings State
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy'); 
  const [unsavedWarning, setUnsavedWarning] = useState(true); 
  const [theme, setTheme] = useState('system');
  const [hasPin, setHasPin] = useState(false); 
  const [skippedPin, setSkippedPin] = useState(false); 
  
  // Modal State
  const [showDateModal, setShowDateModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const settings = await settingsService.getSettings() as any; 
        if (settings) {
          if (settings.dateFormatToken) setDateFormat(settings.dateFormatToken);
          if (settings.warnUnsavedChanges !== undefined) setUnsavedWarning(settings.warnUnsavedChanges === 1);
          if (settings.theme) setTheme(settings.theme);
        }
      } catch (e) {
        console.error("Failed to load DB settings", e);
      }

      const storedWarning = storage.getString('vjb_unsaved_warning');
      if (storedWarning) {
        setUnsavedWarning(storedWarning !== 'false'); 
      }

      // Check PIN State
      setHasPin(isPinSet());
      setSkippedPin(isPinSkipped());
    };
    loadPreferences();
  }, []);

  const getTodayPreview = (format: string) => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[today.getMonth()];

    switch(format) {
      case 'dd/MM/yyyy': return `${d}/${m}/${y}`;
      case 'd MMMM yyyy': return `${Number(d)} ${monthName} ${y}`;
      case 'dd-MM-yyyy': return `${d}-${m}-${y}`;
      case 'yyyy-MM-dd': return `${y}-${m}-${d}`;
      default: return `${d}/${m}/${y}`;
    }
  };

  const activeStoreTheme = appSettingsStore((s) => s.theme);

  const getThemeLabel = (t: string) => {
    const currentTheme = t && t !== 'system' ? t : activeStoreTheme;
    switch(currentTheme) {
      case 'lotus_silk': return 'Kashmir Lotus Silk & Rose Gold';
      case 'sandstone_ochre': return 'Reth Sandstone Silk & Ochre';
      default: return 'Royal Kesari Gold (Default)';
    }
  };

  const toggleUnsavedWarning = async (value: boolean) => {
    setUnsavedWarning(value);
    storage.set('vjb_unsaved_warning', value ? 'true' : 'false');
    
    try {
      await settingsService.updateSettings({ warnUnsavedChanges: value ? 1 : 0 });
    } catch(e: any) {
      console.error('Failed to update unsaved warning setting:', e?.message ?? e);
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

  const updateTheme = async (newTheme: string) => {
    try {
      await settingsService.updateSettings({ theme: newTheme });
      setTheme(newTheme);
      setShowThemeModal(false);
    } catch (e: any) {
      Alert.alert("Cannot Update Settings", e.message);
    }
  };

  const colors = getThemeColors(theme);

  const settingsHeader = (
    <View className="mt-1">
      <View className="flex-row items-center gap-3 mb-2">
        <View className="h-10 w-10 rounded-full bg-white/10 justify-center items-center border border-white/20">
          <Building2 size={20} color={colors.vjBg} />
        </View>
        <View className="flex-1">
          <Text className="text-vj-bg text-xl font-bold tracking-tight" numberOfLines={2}>
            {firm?.name || 'ACTIVE FIRM'}
          </Text>
          {firm?.proprietor ? (
            <Text className="text-vj-bg/60 text-xs font-medium">{firm.proprietor}</Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center gap-2 flex-wrap">
        <HeaderPill icon={<ShieldCheck size={12} color={hasPin ? "#4ADE80" : "#FDBA74"} />} label={hasPin ? 'PIN PROTECTED' : 'PIN NOT SET'} variant={hasPin ? 'success' : 'warning'} />
        <HeaderPill icon={<Database size={12} color={colors.vjBg} />} label="SQLITE v7" />
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="Settings" showBack headerContent={settingsHeader}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{paddingBottom: 120, paddingTop: 20}}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        overScrollMode="never"
        removeClippedSubviews={false} 
        bounces={false}
      >
        
        <SectionHeader title="General" />
        
        <View className="px-1 mb-2" pointerEvents="none">
          <GlassCard style={{ opacity: 0.5, borderWidth: 1, borderColor: COLORS.border }}>
            <View className="flex-row items-center gap-4" accessibilityRole="text" accessibilityLabel="Currency: Indian Rupee, fixed">
              <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                <IndianRupee size={24} color={COLORS.vjText} />
              </View>
              <View className="flex-1">
                <Text className="text-vj-text font-bold text-base">Currency</Text>
                <Text className="text-vj-text/60 text-xs">{['I','N','R'].join('')} — Indian Rupee</Text>
                <Text className="text-vj-text/40 text-[10px] mt-0.5">Fixed for Indian GST compliance</Text>
              </View>
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title={hasPin ? "Change PIN" : "Set Up PIN"}
          subtitle={hasPin ? "PIN is set" : "Not set — tap to secure your app"}
          icon={
            <View className="relative">
              <KeyRound size={24} color="#D4AF37" />
              {(!hasPin && skippedPin) && (
                <View className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-vj-danger rounded-full border border-white" />
              )}
            </View>
          }
          onPress={() => router.push('/settings/pin')}
        />

        <GlassSettingsTile
          title="Date Format"
          subtitle={getTodayPreview(dateFormat)}
          icon={<CalendarClock size={24} color={COLORS.vjText} />}
          onPress={() => setShowDateModal(true)}
        />

        <View className="px-1 mb-2">
          <GlassCard style={{ borderWidth: 1, borderColor: COLORS.border }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-4 flex-1">
                <View className="bg-vj-glass p-3 rounded-full border border-white/20">
                  <AlertCircle size={24} color="#D4AF37" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">Unsaved Changes</Text>
                  <Text className="text-vj-text/60 text-xs">Warn before exiting forms</Text>
                </View>
              </View>
              <Switch
                value={unsavedWarning}
                onValueChange={toggleUnsavedWarning}
                trackColor={{ false: "#D1D1D1", true: "#D4AF37" }}
                thumbColor={"#FCFBF8"}
              />
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title="App Theme"
          subtitle={`${getThemeLabel(theme)} • APPLIED`}
          icon={<Palette size={24} color={COLORS.vjText} />}
          onPress={() => setShowThemeModal(true)}
        />

        <GlassSettingsTile
          title="Invoice Settings"
          subtitle="Prefixes, Terms & Conditions"
          icon={<FileBox size={24} color={COLORS.vjText} />}
          onPress={() => Alert.alert("Coming Soon", "Invoice customization unlocks in Phase 4.")}
        />

        <SectionHeader title="Identity & Structure" />
        <GlassSettingsTile
          title="Firm Identity"
          subtitle="Manage Firms, Addresses & Logos"
          icon={<Building2 size={24} color="#D4AF37" />}
          onPress={() => router.push('/settings/firms')}
        />

        <GlassSettingsTile
          title="Close Financial Year"
          subtitle="Lock current year data"
          icon={<Lock size={24} color="#D4AF37" />}
          onPress={() => router.push('/settings/close-fy')}
        />

        <SectionHeader title="Tax & Devices" />
        <GlassSettingsTile
          title="GST Tax Rates"
          subtitle="Manage CGST/SGST groups"
          icon={<Percent size={24} color={COLORS.vjText} />}
          onPress={() => Alert.alert("Phase 3 Feature", "GST settings are configured in the full setup. Available after Phase 3.")}
        />
        <GlassSettingsTile
          title="Paired Devices"
          subtitle="Primary/Secondary Sync setup"
          icon={<MonitorSmartphone size={24} color={COLORS.vjText} />}
          onPress={() => Alert.alert("Future Feature", "Device sync is available in a future update.")}
        />

        <SectionHeader title="Utilities & Safety" />
        
        <GlassSettingsTile
          title="Backup & Restore"
          subtitle="Encrypted .vjb Exports, Public Mirroring & Restore"
          icon={<HardDriveDownload size={24} color="#D4AF37" />}
          onPress={() => router.push('/settings/backup-restore')}
        />

        <GlassSettingsTile
          title="Audit Logs"
          subtitle="View immutable system events"
          icon={<FileText size={24} color={COLORS.vjText} />}
          onPress={() => router.push('/settings/audit-logs')}
        />

        <GlassSettingsTile
          title="Verify My Data"
          subtitle="Run deep integrity scan"
          icon={<ShieldAlert size={24} color={COLORS.vjText} />}
          onPress={() => router.push('/settings/verify')}
        />

        <GlassSettingsTile
          title="Data Utilities"
          subtitle="Export Ledgers & Inventory"
          icon={<Wrench size={24} color={COLORS.vjText} />}
          onPress={() => Alert.alert("Phase 6 Feature", "Data Utilities unlock in Phase 6.")}
        />

        <View className="mt-8 items-center opacity-40 mb-10">
          <Database size={20} color={COLORS.vjText} />
          <Text className="text-[10px] font-bold text-vj-text mt-2">
            VJ BILLING • PHASE 2 • INVENTORY
          </Text>
          <Text className="text-[10px] text-vj-text">
            Firm Code: {firm?.firmCode || 'N/A'}
          </Text>
          <Text className="text-[10px] text-vj-text mt-1">
            Device: {Device.modelName || Device.deviceName || 'Unknown'}
          </Text>
        </View>

      </ScrollView>

      {/* Modular Date Format Modal */}
      <DateFormatModal
        visible={showDateModal}
        activeFormat={dateFormat}
        onSelectFormat={updateDateFormat}
        onClose={() => setShowDateModal(false)}
      />

      {/* Modular Theme Modal */}
      <ThemeSelectorModal
        visible={showThemeModal}
        activeTheme={theme}
        onSelectTheme={updateTheme}
        onClose={() => setShowThemeModal(false)}
      />

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