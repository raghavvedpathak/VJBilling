// app/settings/index.tsx — Phase 1 v7.47 & Phase 2 Canonical Settings Hub
// Implements G67-UI (opacity 0.5, pointerEvents none, accessibilityRole='text'),
// G68, G69, G71, FIX-VSEC-12 (Factory Reset with firmCode + 5s delay), FIX-V740-6 (Audit Retention)

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
import { storage } from '@/utils/storage';
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
import {
  MIN_AUDIT_RETENTION_DAYS,
  MAX_AUDIT_RETENTION_DAYS,
} from '@/constants/auditRetention';

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
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadPreferences();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setHasPin(isPinSet());
      setSkippedPin(isPinSkipped());
    }, [])
  );

  // 5-second countdown delay for Factory Reset modal
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

  const handleToggleUnsavedWarning = async (value: boolean) => {
    setUnsavedWarning(value);
    try {
      await settingsService.updateSettings({
        warnUnsavedChanges: value ? 1 : 0,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setUnsavedWarning(!value);
      Alert.alert('Error', 'Failed to save preference.');
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
        `Please enter a valid duration between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS} days.`
      );
      return;
    }

    try {
      await settingsService.updateSettings({ auditRetentionDays: parsed });
      setRetentionDays(parsed);
      setShowRetentionModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Retention Policy Updated',
        `Audit trail logs will be retained for ${parsed} days.`
      );
    } catch (err) {
      Alert.alert('Save Error', 'Failed to update audit retention policy.');
    }
  };

  const openFactoryResetModal = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setResetFirmCodeInput('');
    setResetDelaySecs(5);
    setShowFactoryResetModal(true);
  };

  const handleExecuteFactoryReset = async () => {
    if (resetFirmCodeInput.trim().toUpperCase() !== requiredFirmCode.toUpperCase()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Confirmation Mismatch',
        `You must type "${requiredFirmCode}" exactly to proceed.`
      );
      return;
    }

    setIsResetting(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await performFactoryResetFiles(firm?.firmCode || undefined);
    } catch (err: any) {
      setIsResetting(false);
      Alert.alert(
        'Factory Reset Error',
        err?.message || 'Could not complete factory reset.'
      );
    }
  };

  const getFormattedDatePreview = () => {
    try {
      return formatDateFns(new Date(), dateFormat);
    } catch {
      return 'Preview unavailable';
    }
  };

  const settingsHeader = (
    <View style={s.headerPillRow}>
      <HeaderPill
        icon={<MonitorSmartphone size={12} color={colors.vjBg} />}
        label={Device.modelName || 'Mobile'}
      />
      <HeaderPill
        icon={
          hasPin ? (
            <ShieldCheck size={12} color="#4ADE80" />
          ) : (
            <AlertCircle size={12} color="#F59E0B" />
          )
        }
        label={hasPin ? 'PIN Secured' : 'PIN Unset'}
        variant={hasPin ? 'success' : 'warning'}
      />
    </View>
  );

  return (
    <TwoToneWrapper title="Settings" showBack headerContent={settingsHeader}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom + 40, 80),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Firm & Organization */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.vjText }]}>
            ORGANIZATION & IDENTITY
          </Text>
        </View>
        <GlassCard style={s.cardGroup}>
          <GlassSettingsTile
            icon={<Building2 size={22} color={colors.vjAccent} />}
            title="Firm Profiles"
            subtitle={
              firm
                ? `${firm.name} (${firm.firmCode})`
                : 'Manage active & secondary firms'
            }
            onPress={() => router.push('/settings/firms')}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<CalendarClock size={22} color={colors.vjAccent} />}
            title="Financial Years"
            subtitle="Manage operational FY & constitutional close"
            onPress={() => router.push('/settings/financial-years')}
          />
        </GlassCard>

        {/* Section 2: Security & App Access */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.vjText }]}>
            SECURITY & ACCESS CONTROL
          </Text>
        </View>
        <GlassCard style={s.cardGroup}>
          <GlassSettingsTile
            icon={<Lock size={22} color={hasPin ? '#15803d' : '#F59E0B'} />}
            title="App Lock & PIN Security"
            subtitle={
              hasPin
                ? 'App lock active · Change security PIN'
                : skippedPin
                ? 'PIN deferred · Set up store PIN now'
                : 'Configure quick-access store lock'
            }
            onPress={() => router.push('/settings/pin')}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<FileText size={22} color={colors.vjAccent} />}
            title="Security Audit Trail"
            subtitle="Immutable activity ledger & administrative log"
            onPress={() => router.push('/settings/audit-logs')}
          />
        </GlassCard>

        {/* Section 3: Data Integrity & Storage */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.vjText }]}>
            DATA INTEGRITY & BACKUP
          </Text>
        </View>
        <GlassCard style={s.cardGroup}>
          <GlassSettingsTile
            icon={<HardDriveDownload size={22} color={colors.vjAccent} />}
            title="Backup & Restore"
            subtitle="Encrypted database export, restore & auto-backup"
            onPress={() => router.push('/settings/backup-restore')}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<ShieldCheck size={22} color={colors.vjAccent} />}
            title="System Integrity Diagnostics"
            subtitle="Deep database integrity scan & verify check"
            onPress={() => router.push('/settings/verify')}
          />
        </GlassCard>

        {/* Section 4: Display & Preferences */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.vjText }]}>
            APPLICATION PREFERENCES
          </Text>
        </View>
        <GlassCard style={s.cardGroup}>
          <GlassSettingsTile
            icon={<Palette size={22} color={colors.vjAccent} />}
            title="Visual Theme"
            subtitle={
              theme === 'system'
                ? 'System Default'
                : theme === 'saffron'
                ? 'Royal Kesari Gold'
                : theme === 'platinum_sapphire'
                ? 'Platinum & Sapphire'
                : theme === 'tourmaline_rosegold'
                ? 'Rose Gold & Tourmaline'
                : 'Sandstone & Ochre'
            }
            onPress={() => setShowThemeModal(true)}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<FileBox size={22} color={colors.vjAccent} />}
            title="Date Format Display"
            subtitle={`${dateFormat} (e.g., ${getFormattedDatePreview()})`}
            onPress={() => setShowDateModal(true)}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          {/* G67-UI: Currency Row (Non-interactive, opacity 0.5) */}
          <View style={{ opacity: 0.5 }} pointerEvents="none" accessibilityRole="text">
            <GlassSettingsTile
              icon={<RupeeCoin3D size={28} />}
              title="Currency & Locale"
              subtitle={`Indian Rupee (${getCurrencySymbol()}) — Non-configurable`}
              rightElement={<BhartiyaFlagEmblem width={24} height={16} />}
              disabled
            />
          </View>
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          {/* Audit Retention Days Setting Row (FIX-V740-6) */}
          <GlassSettingsTile
            icon={<History size={22} color={colors.vjAccent} />}
            title="Audit Retention Window"
            subtitle={`${retentionDays} Days (Automatic Purge)`}
            onPress={() => setShowRetentionModal(true)}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<AlertCircle size={22} color={colors.vjAccent} />}
            title="Unsaved Changes Warning"
            subtitle="Warn before navigating away with uncommitted entries"
            rightElement={
              <Switch
                value={unsavedWarning}
                onValueChange={handleToggleUnsavedWarning}
                trackColor={{ false: '#d1d5db', true: colors.vjAccent }}
                thumbColor="#ffffff"
              />
            }
          />
        </GlassCard>

        {/* Section 5: Master Data Setup */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.vjText }]}>
            CATALOG & RATES MASTER
          </Text>
        </View>
        <GlassCard style={s.cardGroup}>
          <GlassSettingsTile
            icon={<Percent size={22} color={colors.vjAccent} />}
            title="Bullion Live Rates Master"
            subtitle="Live 24K, 22K, 18K and Silver base trading board"
            onPress={() => router.push('/settings/rates')}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<Coins size={22} color={colors.vjAccent} />}
            title="Jewellery Categories & Designs"
            subtitle="Product classifications, purity benchmarks & designs"
            onPress={() => router.push('/settings/categories')}
          />
          <View style={[s.divider, { backgroundColor: `${colors.vjAccent}15` }]} />
          <GlassSettingsTile
            icon={<Wrench size={22} color={colors.vjAccent} />}
            title="Karigar & Goldsmith Registry"
            subtitle="Artisans, issue ledgers & wastage benchmarks"
            onPress={() => router.push('/settings/karigars')}
          />
        </GlassCard>

        {/* Section 6: Danger Zone / Factory Reset (FIX-VSEC-12) */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: '#EF4444' }]}>DANGER ZONE</Text>
        </View>
        <GlassCard
          style={[
            s.cardGroup,
            { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.04)' },
          ]}
        >
          <GlassSettingsTile
            icon={<Trash2 size={22} color="#EF4444" />}
            title="Factory Reset Application"
            subtitle="Irrevocably erase all databases, security keys, and stores"
            onPress={openFactoryResetModal}
            borderColor="rgba(239, 68, 68, 0.4)"
            iconBg="rgba(239, 68, 68, 0.1)"
          />
        </GlassCard>

        {/* App Version Info */}
        <View style={s.footerInfo}>
          <Text style={[s.footerText, { color: colors.vjText }]}>
            VJ Billing v1.0.0 (Phase 1 v7.47 Canonical)
          </Text>
          <Text style={[s.footerSub, { color: colors.vjText }]}>
            High-Security Offline Constitutional Jewellery ERP
          </Text>
        </View>
      </ScrollView>

      {/* Date Format Modal */}
      <DateFormatModal
        visible={showDateModal}
        activeFormat={dateFormat}
        onClose={() => setShowDateModal(false)}
        onSelectFormat={async (fmt: string) => {
          setDateFormat(fmt);
          try {
            await settingsService.updateSettings({ dateFormatToken: fmt });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert('Error', 'Failed to save date format.');
          }
        }}
      />

      {/* Theme Selector Modal */}
      <ThemeSelectorModal
        visible={showThemeModal}
        activeTheme={theme}
        onClose={() => setShowThemeModal(false)}
        onSelectTheme={async (thm: string) => {
          setTheme(thm);
          try {
            await settingsService.updateSettings({ theme: thm });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert('Error', 'Failed to update theme.');
          }
        }}
      />

      {/* Audit Retention Modal (Step 15, FIX-V740-6) */}
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
              Enter how many days audit records should be retained before
              automatic cleanup. Must be between {MIN_AUDIT_RETENTION_DAYS} and{' '}
              {MAX_AUDIT_RETENTION_DAYS} days.
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

      {/* FIX-VSEC-12: Dangerous Factory Reset Modal */}
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
              <Text style={s.resetTitle}>Factory Reset App?</Text>
            </View>

            <Text style={s.resetWarningText}>
              This is a permanent, non-reversible administrative action. All
              firm profiles, transaction ledgers, inventory records, and the
              underlying SQLCipher database encryption key will be permanently
              erased from this device.
            </Text>

            <View style={s.confirmBox}>
              <Text style={s.confirmInstruct}>
                To confirm, type the store code &quot;
                <Text style={{ fontWeight: '800', color: '#EF4444' }}>
                  {requiredFirmCode}
                </Text>
                &quot; below:
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
                  resetFirmCodeInput.trim().toUpperCase() !==
                    requiredFirmCode.toUpperCase() ||
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

const s = StyleSheet.create({
  headerPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    opacity: 0.6,
  },
  cardGroup: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 0,
    borderWidth: 1,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.6,
  },
  footerSub: {
    fontSize: 10.5,
    marginTop: 3,
    opacity: 0.45,
  },
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
  modalTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.7,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
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
  unitLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
    opacity: 0.7,
  },
  modalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 22,
    borderWidth: 2,
  },
  resetHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  resetIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  resetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#EF4444',
  },
  resetWarningText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmBox: {
    marginBottom: 14,
  },
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
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
});
