// app/settings/index.tsx — Phase 1 v8.1 & Phase 2–4 Canonical Settings Hub
// Implements G67-UI (opacity: 0.5, pointerEvents: none, accessibilityRole: text), G68, G69, G71, FIX-VSEC-12, FIX-V740-6, FIX-V81-5

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Switch,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { settingsService } from '@/services/phase1/settingsService';
import { performFactoryResetFiles } from '@/services/phase1/factoryResetService';
import {
  GlassCard,
  GlassButton,
  HeaderPill,
  GlassSettingsTile,
  RupeeCoin3D,
  BhartiyaFlagEmblem,
} from '@/components/ui/Glass';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { ThemeSelectorModal } from '@/components/phase1/ThemeSelectorModal';
import { DateFormatModal } from '@/components/phase1/DateFormatModal';
import { format as formatDateFns } from 'date-fns';
import { getCurrencySymbol } from '@/utils/currency';
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
  Coins,
  Trash2,
  History,
  X,
} from 'lucide-react-native';
import { getThemeColors } from '@/constants/theme';
import { MIN_AUDIT_RETENTION_DAYS, MAX_AUDIT_RETENTION_DAYS } from '@/constants/auditRetention';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { firm } = useSession();

  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');
  const [unsavedWarning, setUnsavedWarning] = useState(true);
  const [theme, setTheme] = useState('system');
  const [retentionDays, setRetentionDays] = useState(30);
  const [hasPin, setHasPin] = useState(false);
  const [skippedPin, setSkippedPin] = useState(false);

  const [showDateModal, setShowDateModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [retentionInput, setRetentionInput] = useState('30');

  // FIX-VSEC-12: Factory Reset state (firmCode confirmation + 5-second delay)
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [resetFirmCodeInput, setResetFirmCodeInput] = useState('');
  const [resetDelaySecs, setResetDelaySecs] = useState(5);
  const [isResetting, setIsResetting] = useState(false);

  const activeStoreTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeStoreTheme);
  const requiredFirmCode = firm?.firmCode || 'DELETE';

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const settings = (await settingsService.getSettings()) as any;
        if (settings) {
          if (settings.dateFormatToken) setDateFormat(settings.dateFormatToken);
          if (settings.warnUnsavedChanges !== undefined) {
            setUnsavedWarning(settings.warnUnsavedChanges === 1);
          }
          if (settings.theme) setTheme(settings.theme);
          if (settings.auditRetentionDays) {
            setRetentionDays(settings.auditRetentionDays);
            setRetentionInput(String(settings.auditRetentionDays));
          }
        }
      } catch (e) {
        console.error('[Settings] Failed to load DB settings:', e);
      }
    };
    void loadPreferences();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setHasPin(isPinSet());
      setSkippedPin(isPinSkipped());
    }, [])
  );

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (showFactoryResetModal && resetDelaySecs > 0) {
      timer = setInterval(() => {
        setResetDelaySecs((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showFactoryResetModal, resetDelaySecs]);

  const getTodayPreview = (formatStr: string) => {
    try {
      return formatDateFns(new Date(), formatStr);
    } catch {
      return formatDateFns(new Date(), 'dd/MM/yyyy');
    }
  };

  const getThemeLabel = (t: string) => {
    const currentTheme = t && t !== 'system' ? t : activeStoreTheme;
    switch (currentTheme) {
      case 'saffron':
        return 'Royal Kesari Gold (Default)';
      case 'platinum_sapphire':
        return 'Platinum & Star Sapphire';
      case 'sandstone_ochre':
        return 'Reth Sandstone Silk & Ochre';
      case 'tourmaline_rosegold':
        return 'Rose Gold & Pink Tourmaline';
      default:
        return 'Royal Kesari Gold (Default)';
    }
  };

  const toggleUnsavedWarning = async (value: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setUnsavedWarning(value);

    try {
      await settingsService.updateSettings({ warnUnsavedChanges: value ? 1 : 0 });
    } catch (e: any) {
      setUnsavedWarning(!value);
      Alert.alert(
        'Cannot Update Settings',
        e?.message || 'Failed to update unsaved changes preference.'
      );
    }
  };

  const updateDateFormat = async (newFormat: string) => {
    try {
      await settingsService.updateSettings({ dateFormatToken: newFormat });
      setDateFormat(newFormat);
      setShowDateModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Cannot Update Settings', e?.message || 'Failed to update date format.');
    }
  };

  const updateTheme = async (newTheme: string) => {
    try {
      await settingsService.updateSettings({ theme: newTheme });
      setTheme(newTheme);
      setShowThemeModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Cannot Update Settings', e?.message || 'Failed to update theme.');
    }
  };

  const handleSaveRetentionDays = async () => {
    const parsed = parseInt(retentionInput.trim(), 10);
    if (
      isNaN(parsed) ||
      parsed < MIN_AUDIT_RETENTION_DAYS ||
      parsed > MAX_AUDIT_RETENTION_DAYS
    ) {
      Alert.alert(
        'Invalid Retention Period',
        `Please enter a value between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS} days.`
      );
      return;
    }
    try {
      await settingsService.updateSettings({ auditRetentionDays: parsed });
      setRetentionDays(parsed);
      setShowRetentionModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not save retention policy.');
    }
  };

  const openFactoryResetModal = () => {
    setResetFirmCodeInput('');
    setResetDelaySecs(5);
    setIsResetting(false);
    setShowFactoryResetModal(true);
  };

  const handleExecuteFactoryReset = async () => {
    if (resetFirmCodeInput.trim().toUpperCase() !== requiredFirmCode.toUpperCase()) {
      Alert.alert(
        'Validation Failed',
        `Please type "${requiredFirmCode}" exactly to confirm.`
      );
      return;
    }

    try {
      setIsResetting(true);
      // FIX-VSEC-12: Pass confirmedFirmCode so FACTORY_RESET_EXECUTED audit row is written before wipe
      await performFactoryResetFiles(requiredFirmCode);
      setShowFactoryResetModal(false);
      Alert.alert(
        'Factory Reset Complete',
        'All application data, encryption keys, and stores have been removed. The app will now reload.',
        [
          {
            text: 'Restart App',
            onPress: () => router.replace('/welcome'),
          },
        ]
      );
    } catch (err: any) {
      setIsResetting(false);
      Alert.alert('Factory Reset Error', err?.message || 'Could not complete factory reset.');
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
            <Text style={[s.firmProprietor, { color: `${colors.vjBg}99` }]}>
              {firm.proprietor}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={s.headerPillRow}>
        <HeaderPill
          icon={<ShieldCheck size={12} color={hasPin ? '#4ADE80' : '#FDBA74'} />}
          label={hasPin ? 'PIN PROTECTED' : 'PIN NOT SET'}
          variant={hasPin ? 'success' : 'warning'}
        />
        <HeaderPill
          icon={<MonitorSmartphone size={12} color={colors.vjBg} />}
          label={Device.modelName || 'Mobile'}
        />
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

        {/* Fixed Currency Card (G67-UI: fixed, pointerEvents none, no onPress, no chevron, accessibilityRole='text') */}
        <View style={{ marginBottom: 12 }} pointerEvents="none">
          <GlassCard style={[s.currencyCard, { borderColor: `${colors.vjAccent}35` }]}>
            <View
              style={s.currencyMainRow}
              accessibilityRole="text"
              accessibilityLabel="Currency: Bhartiya Rupee, fixed for Bhartiya Jewellers, Bhartiya Region"
            >
              <View style={s.currencyCoinBox}>
                <RupeeCoin3D size={42} />
              </View>
              <View style={s.currencyContent}>
                <Text style={[s.currencyTitle, { color: colors.vjText }]}>
                  {`Bhartiya Rupee (${getCurrencySymbol()})`}
                </Text>
                <Text style={[s.currencySubtitle, { color: colors.vjText, opacity: 0.65 }]}>
                  Fixed For Bhartiya Jewellers
                </Text>
                <View style={s.regionBadgeRow}>
                  <View style={s.regionBadge}>
                    <BhartiyaFlagEmblem width={15} height={10} />
                    <Text style={s.regionBadgeText}>BHARTIYA REGION</Text>
                    <Lock size={9} color="#B8860B" />
                  </View>
                </View>
              </View>
            </View>
          </GlassCard>
        </View>

        <GlassSettingsTile
          title={hasPin ? 'Change PIN' : 'Set Up PIN'}
          subtitle={
            hasPin
              ? 'PIN is set'
              : skippedPin
                ? 'PIN deferred · Set up store PIN now'
                : 'Not set — tap to secure your app'
          }
          iconBg="rgba(217, 119, 6, 0.12)"
          borderColor="rgba(217, 119, 6, 0.25)"
          icon={
            <View style={{ position: 'relative' }}>
              <KeyRound size={22} color="#D97706" />
              {!hasPin && skippedPin && <View style={s.pinAlertDot} />}
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

        <View style={{ marginBottom: 12 }}>
          <GlassCard style={[s.switchCard, { borderColor: `${colors.vjAccent}25` }]}>
            <View style={s.switchCardRow}>
              <View style={s.switchCardLeft}>
                <View style={[s.switchIconBox, { backgroundColor: `${colors.vjAccent}15` }]}>
                  <AlertCircle size={22} color={colors.vjAccent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.switchCardTitle, { color: colors.vjText }]}>
                    Unsaved Changes
                  </Text>
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
          subtitle="Paper Canvas, Prefixes & Terms"
          iconBg="rgba(8, 145, 178, 0.12)"
          borderColor="rgba(8, 145, 178, 0.25)"
          icon={<FileBox size={22} color="#0891B2" />}
          onPress={() => router.push('/settings/invoice')}
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
          title="Daily Metal Rates"
          subtitle="Configure Gold & Silver daily rates"
          iconBg="rgba(217, 119, 6, 0.12)"
          borderColor="rgba(217, 119, 6, 0.25)"
          icon={<Coins size={22} color="#D97706" />}
          onPress={() => router.push('/settings/rates')}
        />

        <GlassSettingsTile
          title="GST Tax Rates"
          subtitle="Manage CGST/SGST groups"
          iconBg="rgba(124, 58, 237, 0.12)"
          borderColor="rgba(124, 58, 237, 0.25)"
          icon={<Percent size={22} color="#7C3AED" />}
          onPress={() => router.push('/settings/gst')}
        />

        <GlassSettingsTile
          title="Paired Devices"
          subtitle="Primary/Secondary Sync setup"
          iconBg="rgba(2, 132, 199, 0.12)"
          borderColor="rgba(2, 132, 199, 0.25)"
          icon={<MonitorSmartphone size={22} color="#0284C7" />}
          onPress={() =>
            Alert.alert('Future Feature', 'Device sync is available in a future update.')
          }
        />

        <SectionHeader title="Utilities & Safety" colors={colors} />
        <GlassSettingsTile
          title="Backup & Restore"
          subtitle="Encrypted database export, restore & auto-backup"
          iconBg="rgba(212, 175, 55, 0.12)"
          borderColor="rgba(212, 175, 55, 0.35)"
          icon={<HardDriveDownload size={22} color="#D4AF37" />}
          onPress={() => router.push('/settings/backup-restore')}
        />

        <GlassSettingsTile
          title="Audit Logs"
          subtitle="View immutable system activity ledger"
          iconBg="rgba(99, 102, 241, 0.12)"
          borderColor="rgba(99, 102, 241, 0.25)"
          icon={<FileText size={22} color="#6366F1" />}
          onPress={() => router.push('/settings/audit-logs')}
        />

        <GlassSettingsTile
          title="Verify My Data"
          subtitle="Deep database integrity scan & verify check"
          iconBg="rgba(16, 185, 129, 0.12)"
          borderColor="rgba(16, 185, 129, 0.25)"
          icon={<ShieldAlert size={22} color="#10B981" />}
          onPress={() => router.push('/settings/verify')}
        />

        <GlassSettingsTile
          title="Audit Retention Window"
          subtitle={`${retentionDays} Days (Automatic Purge)`}
          iconBg="rgba(139, 92, 246, 0.12)"
          borderColor="rgba(139, 92, 246, 0.25)"
          icon={<History size={22} color="#8B5CF6" />}
          onPress={() => setShowRetentionModal(true)}
        />

        <GlassSettingsTile
          title="Data Utilities"
          subtitle="Export Ledgers & Inventory"
          iconBg="rgba(180, 83, 9, 0.12)"
          borderColor="rgba(180, 83, 9, 0.25)"
          icon={<Wrench size={22} color="#B45309" />}
          onPress={() => Alert.alert('Phase 6 Feature', 'Data Utilities unlock in Phase 6.')}
        />

        <SectionHeader title="Danger Zone" colors={colors} />
        <GlassSettingsTile
          title="Factory Reset Application"
          subtitle="Irrevocably erase all databases, security keys, and stores"
          iconBg="rgba(239, 68, 68, 0.12)"
          borderColor="rgba(239, 68, 68, 0.35)"
          icon={<Trash2 size={22} color="#EF4444" />}
          onPress={openFactoryResetModal}
        />

        <View style={s.footerInfo}>
          <Database size={20} color={colors.vjText} style={{ opacity: 0.45 }} />
          <Text style={[s.footerTextBold, { color: colors.vjText }]}>
            VJ BILLING
          </Text>
          <Text style={[s.footerText, { color: colors.vjText }]}>
            Firm Code: {firm?.firmCode || 'N/A'}
          </Text>
          <Text style={[s.footerText, { color: colors.vjText, marginTop: 2 }]}>
            Device: {Device.modelName || Device.deviceName || 'Unknown'}
          </Text>
        </View>
      </ScrollView>

      <DateFormatModal
        visible={showDateModal}
        activeFormat={dateFormat}
        onSelectFormat={updateDateFormat}
        onClose={() => setShowDateModal(false)}
      />

      <ThemeSelectorModal
        visible={showThemeModal}
        activeTheme={theme}
        onSelectTheme={updateTheme}
        onClose={() => setShowThemeModal(false)}
      />

      {/* Audit Retention Modal */}
      <Modal
        visible={showRetentionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRetentionModal(false)}
      >
        <View style={s.modalOverlay}>
          <GlassCard style={s.retentionModalContent}>
            <View style={s.modalHeaderRow}>
              <View style={s.modalTitleBox}>
                <History size={20} color={colors.vjAccent} />
                <Text style={[s.modalTitle, { color: colors.vjText }]}>
                  Audit Retention Window
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowRetentionModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.vjText} style={{ opacity: 0.6 }} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalDesc, { color: colors.vjText }]}>
              Enter how many days audit records should be retained before automatic cleanup. Must
              be between {MIN_AUDIT_RETENTION_DAYS} and {MAX_AUDIT_RETENTION_DAYS} days.
            </Text>

            <View style={s.inputWrapper}>
              <TextInput
                value={retentionInput}
                onChangeText={setRetentionInput}
                keyboardType="numeric"
                maxLength={4}
                style={[
                  s.retentionTextInput,
                  { color: colors.vjText, borderColor: `${colors.vjAccent}35` },
                ]}
                placeholder="30"
                placeholderTextColor="rgba(0,0,0,0.3)"
              />
              <Text style={[s.unitLabel, { color: colors.vjText }]}>Days</Text>
            </View>

            <View style={s.modalActionRow}>
              <GlassButton
                title="Cancel"
                variant="secondary"
                onPress={() => setShowRetentionModal(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <GlassButton
                title="Save Policy"
                onPress={handleSaveRetentionDays}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* FIX-VSEC-12: Factory Reset Modal */}
      <Modal
        visible={showFactoryResetModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isResetting) setShowFactoryResetModal(false);
        }}
      >
        <View style={s.modalOverlay}>
          <GlassCard
            style={[
              s.resetModalContent,
              { borderColor: '#EF4444', backgroundColor: '#FFFFFF' },
            ]}
          >
            <View style={s.resetHeader}>
              <View style={s.resetIconBadge}>
                <ShieldAlert size={28} color="#EF4444" />
              </View>
              <Text style={s.resetTitle}>Factory Reset</Text>
            </View>

            <Text style={s.resetWarningText}>
              This will permanently delete all company accounts, inventory, settings, encryption
              keys, and unrecoverable records.
            </Text>

            <View style={s.confirmBox}>
              <Text style={s.confirmInstruct}>
                Type firm code <Text style={{ fontWeight: '800' }}>{requiredFirmCode}</Text> to
                proceed:
              </Text>
              <TextInput
                value={resetFirmCodeInput}
                onChangeText={setResetFirmCodeInput}
                placeholder={requiredFirmCode}
                placeholderTextColor="rgba(239, 68, 68, 0.4)"
                autoCapitalize="characters"
                autoCorrect={false}
                style={s.confirmTextInput}
                editable={!isResetting}
              />
            </View>

            {resetDelaySecs > 0 && (
              <View style={s.countdownBox}>
                <Text style={s.countdownText}>
                  Safety lock active: wait {resetDelaySecs}s before resetting...
                </Text>
              </View>
            )}

            <View style={s.modalActionRow}>
              <GlassButton
                title="Cancel"
                variant="secondary"
                disabled={isResetting}
                onPress={() => setShowFactoryResetModal(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <GlassButton
                title={
                  isResetting
                    ? 'Resetting...'
                    : resetDelaySecs > 0
                      ? `Wait (${resetDelaySecs}s)`
                      : 'Factory Reset'
                }
                variant="danger"
                disabled={
                  resetDelaySecs > 0 ||
                  resetFirmCodeInput.trim().toUpperCase() !== requiredFirmCode.toUpperCase() ||
                  isResetting
                }
                loading={isResetting}
                onPress={handleExecuteFactoryReset}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

function SectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return <Text style={[s.sectionHeaderTitle, { color: colors.vjText }]}>{title}</Text>;
}

const s = StyleSheet.create({
  headerContainer: { marginTop: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  firmName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  firmProprietor: { fontSize: 12, fontWeight: '600' },
  headerPillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    marginBottom: 0,
  },
  currencyMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  currencyCoinBox: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  currencyContent: { flex: 1, minWidth: 0, justifyContent: 'center' },
  currencyTitle: { fontWeight: '800', fontSize: 16, lineHeight: 21 },
  currencySubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 16 },
  regionBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignSelf: 'flex-start',
  },
  regionBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#78350F',
    letterSpacing: 0.6,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 20,
    marginBottom: 0,
  },
  switchCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 0,
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
  switchCardTitle: { fontWeight: '800', fontSize: 16, lineHeight: 21 },
  switchCardSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  footerInfo: { marginTop: 32, alignItems: 'center', marginBottom: 20 },
  footerTextBold: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 0.8,
    opacity: 0.45,
  },
  footerText: { fontSize: 10, fontWeight: '600', opacity: 0.4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  retentionModalContent: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitleBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalDesc: { fontSize: 13, lineHeight: 19, opacity: 0.7, marginBottom: 16 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  retentionTextInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  unitLabel: { fontSize: 15, fontWeight: '700', marginLeft: 12, opacity: 0.7 },
  modalActionRow: { flexDirection: 'row', alignItems: 'center' },
  resetModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 22,
    borderWidth: 2,
  },
  resetHeader: { alignItems: 'center', marginBottom: 14 },
  resetIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  resetTitle: { fontSize: 20, fontWeight: '800', color: '#EF4444' },
  resetWarningText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmBox: { marginBottom: 14 },
  confirmInstruct: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmTextInput: {
    height: 48,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'center',
    backgroundColor: '#FEF2F2',
    letterSpacing: 2,
  },
  countdownBox: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 14,
    alignItems: 'center',
  },
  countdownText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
});
