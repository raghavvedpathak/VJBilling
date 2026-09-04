// app/settings/index.tsx — Phase 1 & Phase 2 Canonical Settings Hub

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Switch, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { storage } from '@/utils/storage';
import { settingsService } from '@/services/phase1/settingsService'; 
import { GlassCard, HeaderPill, GlassSettingsTile, RupeeCoin3D, BhartiyaFlagEmblem } from '@/components/ui/Glass';
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
  Wrench,
  Percent,
  MonitorSmartphone,
  FileBox,
  KeyRound,
  ShieldCheck,
} from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const activeStoreTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeStoreTheme);

  // Sync Preferences from Database & Storage on Mount
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
        console.error('[Settings] Failed to load DB settings:', e);
      }

      const storedWarning = storage.getString('vjb_unsaved_warning');
      if (storedWarning) {
        setUnsavedWarning(storedWarning !== 'false'); 
      }
    };
    loadPreferences();
  }, []);

  // Sync PIN Status on Screen Focus
  useFocusEffect(
    useCallback(() => {
      setHasPin(isPinSet());
      setSkippedPin(isPinSkipped());
    }, [])
  );

  const getTodayPreview = (formatStr: string) => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[today.getMonth()];

    switch (formatStr) {
      case 'dd/MM/yyyy': return `${d}/${m}/${y}`;
      case 'd MMMM yyyy': return `${Number(d)} ${monthName} ${y}`;
      case 'dd-MM-yyyy': return `${d}-${m}-${y}`;
      case 'yyyy-MM-dd': return `${y}-${m}-${d}`;
      default: return `${d}/${m}/${y}`;
    }
  };

  const getThemeLabel = (t: string) => {
    const currentTheme = t && t !== 'system' ? t : activeStoreTheme;
    switch (currentTheme) {
      case 'saffron': return 'Royal Kesari Gold (Default)';
      case 'platinum_sapphire': return 'Platinum & Star Sapphire';
      case 'sandstone_ochre': return 'Reth Sandstone Silk & Ochre';
      case 'tourmaline_rosegold': return 'Rose Gold & Pink Tourmaline';
      default: return 'Royal Kesari Gold (Default)';
    }
  };

  const toggleUnsavedWarning = async (value: boolean) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setUnsavedWarning(value);
    storage.set('vjb_unsaved_warning', value ? 'true' : 'false');
    
    try {
      await settingsService.updateSettings({ warnUnsavedChanges: value ? 1 : 0 });
    } catch (e: any) {
      console.error('[Settings] Failed to update unsaved warning setting:', e?.message ?? e);
    }
  };

  const updateDateFormat = async (newFormat: string) => {
    try {
      await settingsService.updateSettings({ dateFormatToken: newFormat });
      setDateFormat(newFormat);
      setShowDateModal(false);
    } catch (e: any) {
      Alert.alert('Cannot Update Settings', e.message || 'Failed to update date format.');
    }
  };

  const updateTheme = async (newTheme: string) => {
    try {
      await settingsService.updateSettings({ theme: newTheme });
      setTheme(newTheme);
      setShowThemeModal(false);
    } catch (e: any) {
      Alert.alert('Cannot Update Settings', e.message || 'Failed to update theme.');
    }
  };

  const settingsHeader = (
    <View style={s.headerContainer}>
      <View style={s.headerTitleRow}>
        <View style={[s.headerIconCircle, { borderColor: `${colors.vjBg}35` }]}>
          <Building2 size={20} color={colors.vjBg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.firmName, { color: colors.vjBg }]} numberOfLines={2}>
            {firm?.name || 'ACTIVE FIRM'}
          </Text>
          {firm?.proprietor ? (
            <Text style={[s.firmProprietor, { color: `${colors.vjBg}99` }]}>{firm.proprietor}</Text>
          ) : null}
        </View>
      </View>

      <View style={s.headerPillRow}>
        <HeaderPill 
          icon={<ShieldCheck size={12} color={hasPin ? '#4ADE80' : '#FDBA74'} />} 
          label={hasPin ? 'PIN PROTECTED' : 'PIN NOT SET'} 
          variant={hasPin ? 'success' : 'warning'} 
        />
        <HeaderPill icon={<Database size={12} color={colors.vjBg} />} label="SQLITE v7" />
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="Settings" showBack headerContent={settingsHeader}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom + 40, 100),
        }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        overScrollMode="never"
        removeClippedSubviews={false} 
        bounces={false}
      >
        <SectionHeader title="General" colors={colors} />
        
        {/* Fixed Currency Card (Constitutional Requirement) */}
        <View style={{ marginBottom: 10 }} pointerEvents="none">
          <GlassCard style={[s.currencyCard, { borderColor: `${colors.vjAccent}35` }]}>
            <View 
              style={s.currencyRow} 
              accessibilityRole="text" 
              accessibilityLabel="Currency: Bhartiya Rupee, fixed"
            >
              <View style={s.currencyLeft}>
                <RupeeCoin3D size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.currencyTitle, { color: colors.vjText }]}>
                    {`Bhartiya Rupee (${['I', 'N', 'R'].join('')})`}
                  </Text>
                  <Text style={[s.currencySubtitle, { color: colors.vjText, opacity: 0.6 }]}>
                    Fixed For Bhartiya Jewellers
                  </Text>
                </View>
              </View>
              <View style={s.regionBadge}>
                <BhartiyaFlagEmblem width={18} height={12} />
                <Text style={s.regionBadgeText}>
                  BHARTIYA REGION
                </Text>
                <Lock size={10} color="#B8860B" />
              </View>
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title={hasPin ? 'Change PIN' : 'Set Up PIN'}
          subtitle={hasPin ? 'PIN is set' : 'Not set — tap to secure your app'}
          iconBg="rgba(217, 119, 6, 0.12)"
          borderColor="rgba(217, 119, 6, 0.25)"
          icon={
            <View style={{ position: 'relative' }}>
              <KeyRound size={22} color="#D97706" />
              {(!hasPin && skippedPin) && (
                <View style={s.pinAlertDot} />
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

        {/* Unsaved Changes Form Safeguard */}
        <View style={{ marginBottom: 10 }}>
          <GlassCard style={[s.switchCard, { borderColor: `${colors.vjAccent}25` }]}>
            <View style={s.switchCardRow}>
              <View style={s.switchCardLeft}>
                <View style={[s.switchIconBox, { backgroundColor: `${colors.vjAccent}15` }]}>
                  <AlertCircle size={22} color={colors.vjAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.switchCardTitle, { color: colors.vjText }]}>Unsaved Changes</Text>
                  <Text style={[s.switchCardSubtitle, { color: colors.vjText, opacity: 0.6 }]}>
                    Warn before exiting forms
                  </Text>
                </View>
              </View>
              <Switch
                value={unsavedWarning}
                onValueChange={toggleUnsavedWarning}
                trackColor={{ false: '#D1D1D1', true: colors.vjAccent }}
                thumbColor="#FCFBF8"
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
          onPress={() => Alert.alert('Coming Soon', 'Invoice customization unlocks in Phase 4.')}
        />

        <SectionHeader title="Identity & Structure" colors={colors} />
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

        <SectionHeader title="Tax & Devices" colors={colors} />
        <GlassSettingsTile
          title="GST Tax Rates"
          subtitle="Manage CGST/SGST groups"
          iconBg="rgba(124, 58, 237, 0.12)"
          borderColor="rgba(124, 58, 237, 0.25)"
          icon={<Percent size={22} color="#7C3AED" />}
          onPress={() => Alert.alert('Phase 3 Feature', 'GST settings are configured in the full setup. Available after Phase 3.')}
        />
        <GlassSettingsTile
          title="Paired Devices"
          subtitle="Primary/Secondary Sync setup"
          iconBg="rgba(2, 132, 199, 0.12)"
          borderColor="rgba(2, 132, 199, 0.25)"
          icon={<MonitorSmartphone size={22} color="#0284C7" />}
          onPress={() => Alert.alert('Future Feature', 'Device sync is available in a future update.')}
        />

        <SectionHeader title="Utilities & Safety" colors={colors} />
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
          onPress={() => Alert.alert('Phase 6 Feature', 'Data Utilities unlock in Phase 6.')}
        />

        {/* Database & Environment Metadata */}
        <View style={s.footerInfo}>
          <Database size={20} color={colors.vjText} style={{ opacity: 0.45 }} />
          <Text style={[s.footerTextBold, { color: colors.vjText }]}>
            VJ BILLING • PHASE 2 • INVENTORY
          </Text>
          <Text style={[s.footerText, { color: colors.vjText }]}>
            Firm Code: {firm?.firmCode || 'N/A'}
          </Text>
          <Text style={[s.footerText, { color: colors.vjText, marginTop: 2 }]}>
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

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof getThemeColors> }) {
  return (
    <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>
      {title}
    </Text>
  );
}

const s = StyleSheet.create({
  headerContainer: {
    marginTop: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  firmName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  firmProprietor: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 14,
    marginLeft: 4,
    opacity: 0.6,
  },
  currencyCard: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currencyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 8,
  },
  currencyTitle: {
    fontWeight: '800',
    fontSize: 16.5,
    lineHeight: 21,
  },
  currencySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  regionBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#78350F',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pinAlertDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    backgroundColor: '#DC2626',
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  switchCard: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 20,
  },
  switchCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 8,
  },
  switchIconBox: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchCardTitle: {
    fontWeight: '800',
    fontSize: 16.5,
    lineHeight: 21,
  },
  switchCardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  footerInfo: {
    marginTop: 32,
    alignItems: 'center',
    marginBottom: 20,
  },
  footerTextBold: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 0.8,
    opacity: 0.45,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.4,
  },
});