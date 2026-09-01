// app/settings/index.tsx — Phase 1 & Phase 2 Canonical Settings Hub

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import * as Device from 'expo-device';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { storage } from '@/utils/storage';
import { settingsService } from '@/services/phase1/settingsService'; 
import { GlassCard, HeaderPill, GlassSettingsTile, RupeeCoin3D, BhartiyaFlagEmblem } from '@/components/ui/Glass';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService'; 
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getCurrencySymbol } from '@/utils/currency';
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
          <GlassCard style={{ padding: 14, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.35)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }}>
            <View className="flex-row items-center justify-between" accessibilityRole="text" accessibilityLabel="Currency: Bhartiya Rupee, fixed">
              <View className="flex-row items-center gap-3.5 flex-1 mr-2">
                <RupeeCoin3D size={40} />
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">{`Bhartiya Rupee (${['I','N','R'].join('')})`}</Text>
                  <Text className="text-vj-text/60 text-xs mt-0.5">Fixed For Bhartiya Jewellers</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                <BhartiyaFlagEmblem width={18} height={12} />
                <Text className="text-[9px] font-black text-amber-950 tracking-wider uppercase">
                  BHARTIYA REGION
                </Text>
                <Lock size={10} color="#B8860B" />
              </View>
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title={hasPin ? "Change PIN" : "Set Up PIN"}
          subtitle={hasPin ? "PIN is set" : "Not set — tap to secure your app"}
          iconBg="rgba(217, 119, 6, 0.12)"
          borderColor="rgba(217, 119, 6, 0.25)"
          icon={
            <View className="relative">
              <KeyRound size={22} color="#D97706" />
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
          iconBg="rgba(79, 70, 229, 0.12)"
          borderColor="rgba(79, 70, 229, 0.25)"
          icon={<CalendarClock size={22} color="#4F46E5" />}
          onPress={() => setShowDateModal(true)}
        />

        <View className="px-1 mb-2">
          <GlassCard style={{ padding: 14, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.25)', backgroundColor: 'rgba(255, 255, 255, 0.92)' }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3.5 flex-1 mr-2">
                <View style={{ backgroundColor: 'rgba(212, 175, 55, 0.12)', padding: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={22} color="#D4AF37" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">Unsaved Changes</Text>
                  <Text className="text-vj-text/60 text-xs mt-0.5">Warn before exiting forms</Text>
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
          iconBg="rgba(219, 39, 119, 0.12)"
          borderColor="rgba(219, 39, 119, 0.25)"
          icon={<Palette size={22} color="#DB2777" />}
          onPress={() => setShowThemeModal(true)}
        />

        <GlassSettingsTile
          title="Invoice Settings"
          subtitle="Prefixes, Terms & Conditions"
          iconBg="rgba(8, 145, 178, 0.12)"
          borderColor="rgba(8, 145, 178, 0.25)"
          icon={<FileBox size={22} color="#0891B2" />}
          onPress={() => Alert.alert("Coming Soon", "Invoice customization unlocks in Phase 4.")}
        />

        <SectionHeader title="Identity & Structure" />
        <GlassSettingsTile
          title="Firm Identity"
          subtitle="Manage Firms, Addresses & Logos"
          iconBg="rgba(5, 150, 105, 0.12)"
          borderColor="rgba(5, 150, 105, 0.25)"
          icon={<Building2 size={22} color="#059669" />}
          onPress={() => router.push('/settings/firms')}
        />

        <GlassSettingsTile
          title="Close Financial Year"
          subtitle="Lock current year data"
          iconBg="rgba(225, 29, 72, 0.12)"
          borderColor="rgba(225, 29, 72, 0.25)"
          icon={<Lock size={22} color="#E11D48" />}
          onPress={() => router.push('/settings/close-fy')}
        />

        <SectionHeader title="Tax & Devices" />
        <GlassSettingsTile
          title="GST Tax Rates"
          subtitle="Manage CGST/SGST groups"
          iconBg="rgba(124, 58, 237, 0.12)"
          borderColor="rgba(124, 58, 237, 0.25)"
          icon={<Percent size={22} color="#7C3AED" />}
          onPress={() => Alert.alert("Phase 3 Feature", "GST settings are configured in the full setup. Available after Phase 3.")}
        />
        <GlassSettingsTile
          title="Paired Devices"
          subtitle="Primary/Secondary Sync setup"
          iconBg="rgba(2, 132, 199, 0.12)"
          borderColor="rgba(2, 132, 199, 0.25)"
          icon={<MonitorSmartphone size={22} color="#0284C7" />}
          onPress={() => Alert.alert("Future Feature", "Device sync is available in a future update.")}
        />

        <SectionHeader title="Utilities & Safety" />
        
        <GlassSettingsTile
          title="Backup & Restore"
          subtitle="Encrypted .vjb Exports, Public Mirroring & Restore"
          iconBg="rgba(212, 175, 55, 0.12)"
          borderColor="rgba(212, 175, 55, 0.35)"
          icon={<HardDriveDownload size={22} color="#D4AF37" />}
          onPress={() => router.push('/settings/backup-restore')}
        />

        <GlassSettingsTile
          title="Audit Logs"
          subtitle="View immutable system events"
          iconBg="rgba(99, 102, 241, 0.12)"
          borderColor="rgba(99, 102, 241, 0.25)"
          icon={<FileText size={22} color="#6366F1" />}
          onPress={() => router.push('/settings/audit-logs')}
        />

        <GlassSettingsTile
          title="Verify My Data"
          subtitle="Run deep integrity scan"
          iconBg="rgba(16, 185, 129, 0.12)"
          borderColor="rgba(16, 185, 129, 0.25)"
          icon={<ShieldAlert size={22} color="#10B981" />}
          onPress={() => router.push('/settings/verify')}
        />

        <GlassSettingsTile
          title="Data Utilities"
          subtitle="Export Ledgers & Inventory"
          iconBg="rgba(180, 83, 9, 0.12)"
          borderColor="rgba(180, 83, 9, 0.25)"
          icon={<Wrench size={22} color="#B45309" />}
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