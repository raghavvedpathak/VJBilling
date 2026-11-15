// app/settings/backup-restore.tsx — Phase 1 v7.47 & Phase 2–4 Dedicated Backup & Restore Screen
// Implements FIX-V733-4, FIX-V7411-1 (2 masked fields, >=8 chars, warning + ack box),
// FIX-V745-4/5 (Auto-backup toggle with consent, status rows, Back up now),
// FIX-V746-5 (8:00-8:30 pm schedule row & "Make it reliable" card), FIX-V747-2

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Switch,
  Linking,
  StyleSheet,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { backupService, BackupEnvelope } from '@/services/phase1/backupService';
import { restoreService } from '@/services/phase1/restoreService';
import {
  runAutoBackupIfDue,
  setAutoBackupEnabled,
} from '@/services/phase1/autoBackupService';
import { ensureNotificationPermission } from '@/services/phase1/backupNotificationService';
import '@/services/phase2/inventoryBackupService';
import '@/services/phase2/inventoryRestoreService';
import '@/services/phase3/billingBackupService';
import '@/services/phase3/billingRestoreService';
import '@/services/phase4/goldIntelligenceBackupService';
import '@/services/phase4/goldIntelligenceRestoreService';
import { storage } from '@/utils/storage';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  HeaderPill,
} from '@/components/ui/Glass';
import { RestorePreviewModal } from '@/components/phase1/RestorePreviewModal';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import {
  AB_KEYS,
  MIN_BACKUP_PASSWORD_LENGTH,
} from '@/constants';
import {
  HardDriveDownload,
  HardDriveUpload,
  FolderLock,
  Database,
  ShieldCheck,
  Lock,
  X,
  Info,
  Clock,
  Bell,
  BatteryCharging,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react-native';

export default function BackupRestoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { firm, refreshSession } = useSession();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [backingUp, setBackingUp] = useState(false);
  const [runningAutoNow, setRunningAutoNow] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Public SAF Directory Storage Key
  const [publicDirUri, setPublicDirUri] = useState<string | null>(null);

  // Automatic Daily Backup State (FIX-V745-5, FIX-V746-5)
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoLastSuccessAt, setAutoLastSuccessAt] = useState<string | null>(null);
  const [autoLastStatus, setAutoLastStatus] = useState<string | null>(null);
  const [autoLastFile, setAutoLastFile] = useState<string | null>(null);
  const [autoLastSize, setAutoLastSize] = useState<number>(0);
  const [notifGranted, setNotifGranted] = useState<boolean>(false);

  // Consent Modal for Turning Automatic Backup ON (FIX-V745-1, FIX-V745-5)
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentAck, setConsentAck] = useState(false);

  // Restore Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);

  // Manual Backup Password Modal State (FIX-V7411-1: two masked fields, >=8 chars, warning + ack box)
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  const [passwordAck, setPasswordAck] = useState(false);
  const [lastBackupInfo, setLastBackupInfo] = useState<{
    fileName: string;
    sizeKb: string;
    time: string;
    path: string;
  } | null>(null);

  const refreshAutoBackupStatus = useCallback(async () => {
    setPublicDirUri(storage.getString('vjbilling_public_backup_dir_uri') ?? null);
    setAutoEnabled(storage.getString(AB_KEYS.enabled) === 'true');
    setAutoLastSuccessAt(storage.getString(AB_KEYS.lastSuccessAt) ?? null);
    setAutoLastStatus(storage.getString(AB_KEYS.lastStatus) ?? null);
    setAutoLastFile(storage.getString(AB_KEYS.lastFileName) ?? null);
    setAutoLastSize(Number(storage.getString(AB_KEYS.lastSizeBytes) ?? '0'));
    try {
      const perm = await Notifications.getPermissionsAsync();
      setNotifGranted(!!perm.granted);
    } catch {
      setNotifGranted(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAutoBackupStatus();
    }, [refreshAutoBackupStatus])
  );

  const requestSafFolderPermission = async (): Promise<string | null> => {
    const permissions =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) {
      storage.set('vjbilling_public_backup_dir_uri', permissions.directoryUri);
      setPublicDirUri(permissions.directoryUri);
      return permissions.directoryUri;
    }
    return null;
  };

  const handleGrantPublicAccess = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      Alert.alert(
        'Select Public Folder',
        "In the next screen, open your 'Documents' folder and tap 'USE THIS FOLDER' at the bottom to enable public backup mirroring.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Folder Picker',
            onPress: async () => {
              const uri = await requestSafFolderPermission();
              if (uri) {
                Alert.alert(
                  'Public Backup Access Granted',
                  "Backups will now automatically be mirrored to your public Documents folder under 'VJ Billing/backups/'."
                );
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert(
        'Permission Error',
        e?.message || 'Could not grant public storage access.'
      );
    }
  };

  // FIX-V745-5: Toggle handler for Automatic Daily Backup
  const handleToggleAutoBackup = async (nextVal: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (!nextVal) {
      await setAutoBackupEnabled(false);
      await refreshAutoBackupStatus();
      return;
    }
    setConsentAck(false);
    setShowConsentModal(true);
  };

  const handleConfirmEnableAutoBackup = async () => {
    if (!consentAck) return;
    setShowConsentModal(false);

    try {
      // 1. Ensure public folder permission is granted (required by FIX-V745-3)
      let folderUri = storage.getString('vjbilling_public_backup_dir_uri');
      if (!folderUri) {
        folderUri = (await requestSafFolderPermission()) ?? undefined;
      }
      if (!folderUri) {
        Alert.alert(
          'Folder Access Required',
          'Automatic daily backup requires access to your public Documents folder so backups survive app uninstallation.'
        );
        return;
      }

      // 2. Request notification permission ONLY from this toggle (FIX-V745-4)
      storage.set(AB_KEYS.notifAsked, 'true');
      const notifOk = await ensureNotificationPermission().catch(() => false);

      // 3. Enable automatic backup, register background task (FIX-V747-2), and log audit event
      await setAutoBackupEnabled(true, {
        publicFolderGranted: true,
        notificationsGranted: notifOk,
      });
      await refreshAutoBackupStatus();
    } catch (e: any) {
      Alert.alert(
        'Could Not Enable Auto-Backup',
        e?.message || 'An unexpected error occurred.'
      );
    }
  };

  // FIX-V745-5 & FIX-V746-4: Manual "Back up now" button for automatic backup (in-app toast/alert, no OS notification)
  const handleRunAutoBackupNow = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setRunningAutoNow(true);
    try {
      const res = await runAutoBackupIfDue('NOW');
      await refreshAutoBackupStatus();
      if (res === 'OK') {
        Alert.alert(
          'Automatic Backup Saved',
          'Your portable daily backup has been saved to Documents/VJ Billing/backups/.'
        );
      } else if (res === 'NEEDS_FOLDER') {
        Alert.alert(
          'Folder Access Needed',
          'Please grant public backup folder access first.'
        );
      } else if (res === 'NO_DATA') {
        Alert.alert('No Firm Data', 'Create a firm before running automatic backup.');
      } else if (res === 'BUSY') {
        Alert.alert(
          'System Busy',
          'A backup or write operation is already in progress. Please wait a moment.'
        );
      } else {
        Alert.alert(
          'Backup Did Not Complete',
          `Result: ${res}. Check folder permissions and available storage.`
        );
      }
    } finally {
      setRunningAutoNow(false);
    }
  };

  const handleStartBackup = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setBackupPassword('');
    setBackupPasswordConfirm('');
    setPasswordAck(false);
    setShowBackupModal(true);
  };

  // FIX-V7411-1 & FIX-V742-10: Two masked fields, min 8 chars, unrecoverable warning + ack checkbox
  const hasTypedPassword =
    backupPassword.length > 0 || backupPasswordConfirm.length > 0;
  const isPasswordValid =
    !hasTypedPassword ||
    (backupPassword.length >= MIN_BACKUP_PASSWORD_LENGTH &&
      backupPassword === backupPasswordConfirm &&
      passwordAck);

  const handleConfirmBackup = async () => {
    if (hasTypedPassword) {
      if (backupPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
        Alert.alert(
          'Password Too Short',
          `Backup password must be at least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`
        );
        return;
      }
      if (backupPassword !== backupPasswordConfirm) {
        Alert.alert('Password Mismatch', 'Both password fields must match.');
        return;
      }
      if (!passwordAck) {
        Alert.alert(
          'Acknowledgement Required',
          'Please acknowledge the unrecoverable password warning.'
        );
        return;
      }
    }

    setShowBackupModal(false);
    try {
      setBackingUp(true);
      const passwordToUse = hasTypedPassword ? backupPassword : undefined;
      const result = await backupService.createBackup(passwordToUse, {
        share: true,
        kind: 'MANUAL',
        trigger: 'NOW',
      });

      const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);
      setLastBackupInfo({
        fileName: result.fileName,
        sizeKb: `${sizeKb} KB`,
        time: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        path: result.filePath,
      });

      let successMsg = `File: ${result.fileName}\nSize: ${sizeKb} KB\nLocation: ${result.filePath}`;

      if (result.mirroredToPublicStorage) {
        successMsg += '\n\n✓ Also copied to: Documents/VJ Billing/backups/';
      } else {
        successMsg +=
          '\n\n⚠️ Note: Saved in internal app sandbox storage.\n\nTip: Tap "Grant public backup folder access" to also mirror backups to your Documents folder.';
      }

      Alert.alert('Backup Created Successfully', successMsg);
    } catch (error: any) {
      Alert.alert('Backup Failed', error.message || 'Failed to create backup.');
    } finally {
      setBackingUp(false);
      setBackupPassword('');
      setBackupPasswordConfirm('');
      setPasswordAck(false);
    }
  };

  const handleRestore = async () => {
    try {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      const result = await restoreService.inspectBackupFile();
      if (!result) return;

      setPreviewBackup(result.backup);
      setPreviewFileContent(result.fileContent);
      setPreviewWarning(result.warning ?? null);
      setPreviewModalVisible(true);
    } catch (error: any) {
      Alert.alert(
        'Invalid Backup File',
        error.message || 'Failed to parse backup file.'
      );
    }
  };

  const handleConfirmRestore = async (password?: string) => {
    if (!previewFileContent) return;
    try {
      setRestoring(true);
      await restoreService.restore(previewFileContent, password);
      await refreshSession();
      setPreviewModalVisible(false);
      Alert.alert('Success', 'Database restored successfully.');
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert(
        'Restore Failed',
        error.message || 'Database restoration encountered an error.'
      );
    } finally {
      setRestoring(false);
    }
  };

  const backupHeader = (
    <View style={s.headerContainer}>
      <View style={s.headerTitleRow}>
        <View style={[s.headerIconCircle, { borderColor: `${colors.vjBg}35` }]}>
          <Database size={20} color={colors.vjBg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.vjBg }]} numberOfLines={1}>
            Backup & Restore
          </Text>
          <Text style={[s.headerSubtitle, { color: `${colors.vjBg}99` }]}>
            Encrypted Database Vault ({firm?.name || 'Active Firm'})
          </Text>
        </View>
      </View>

      <View style={s.pillsRow}>
        <HeaderPill
          icon={<FolderLock size={12} color={publicDirUri ? '#4ADE80' : '#FDBA74'} />}
          label={publicDirUri ? 'PUBLIC SAF MIRROR ON' : 'PUBLIC SAF MIRROR OFF'}
          variant={publicDirUri ? 'success' : 'warning'}
        />
        <HeaderPill
          icon={<ShieldCheck size={12} color="#4ADE80" />}
          label="AES-256-GCM v2"
          variant="success"
        />
      </View>
    </View>
  );

  return (
    <TwoToneWrapper
      title="Backup & Restore"
      showBack
      headerContent={backupHeader}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom + 40, 100),
        }}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        bounces={false}
      >
        {/* 0. AUTOMATIC DAILY BACKUP SECTION (v7.45 FIX-V745-5 & v7.46 FIX-V746-5) */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Automatic Daily Backup (v7.47)
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}30` }}>
          <View style={s.cardTopRow}>
            <View
              style={[
                s.iconBox,
                {
                  backgroundColor: autoEnabled
                    ? 'rgba(16, 185, 129, 0.14)'
                    : `${colors.vjAccent}15`,
                  borderColor: autoEnabled
                    ? 'rgba(16, 185, 129, 0.30)'
                    : `${colors.vjAccent}30`,
                },
              ]}
            >
              <Clock size={26} color={autoEnabled ? '#059669' : colors.vjAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <View className="flex-row items-center justify-between">
                <Text style={[s.cardTitle, { color: colors.vjText }]}>
                  Automatic Daily Backup
                </Text>
                <Switch
                  value={autoEnabled}
                  onValueChange={handleToggleAutoBackup}
                  trackColor={{ false: '#D1D1D1', true: '#059669' }}
                  thumbColor="#FCFBF8"
                />
              </View>
              {/* FIX-V746-5: Read-only schedule row */}
              <Text
                style={[
                  s.cardDescription,
                  { color: colors.vjText, fontWeight: '700', marginTop: 2 },
                ]}
              >
                Scheduled time: every day 8:00 to 8:30 pm
              </Text>
              <Text
                style={[
                  s.cardDescription,
                  { color: colors.vjText, opacity: 0.7, marginTop: 4 },
                ]}
              >
                Saves the 7 newest automatic backups to Documents/VJ Billing/backups/.
                Portable across reinstalls (not confidential — anyone holding the file
                and app can restore it; use manual password export when sharing).
              </Text>
            </View>
          </View>

          {autoEnabled && (
            <View
              style={[
                s.lastBackupBox,
                {
                  backgroundColor: `${colors.vjAccent}08`,
                  borderColor: `${colors.vjAccent}20`,
                },
              ]}
            >
              <View style={s.lastBackupHeader}>
                <Text style={[s.lastBackupLabel, { color: colors.vjText }]}>
                  Status: {autoLastStatus || 'PENDING FIRST RUN'}
                </Text>
                {autoLastSize > 0 && (
                  <Text style={s.lastBackupSize}>
                    {(autoLastSize / 1024).toFixed(1)} KB
                  </Text>
                )}
              </View>
              <Text style={[s.lastBackupName, { color: colors.vjText }]}>
                Last saved:{' '}
                {autoLastSuccessAt
                  ? new Date(autoLastSuccessAt).toLocaleString('en-IN')
                  : 'Never'}
              </Text>
              {autoLastFile && (
                <Text
                  style={[s.lastBackupPath, { color: colors.vjText }]}
                  numberOfLines={1}
                >
                  {autoLastFile}
                </Text>
              )}

              {/* FIX-V745-4: Notification status row with button to open Android settings when off */}
              <View className="flex-row items-center justify-between mt-3 pt-2 border-t border-black/10">
                <View className="flex-row items-center gap-1.5">
                  <Bell
                    size={14}
                    color={notifGranted ? '#059669' : '#D97706'}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: notifGranted ? '#059669' : '#B45309',
                    }}
                  >
                    {notifGranted
                      ? 'Backup notifications are ON'
                      : 'Notifications are off'}
                  </Text>
                </View>
                {!notifGranted && (
                  <TouchableOpacity
                    onPress={() => Linking.openSettings()}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40"
                  >
                    <Text className="text-[10px] font-extrabold text-amber-900 uppercase">
                      Open Settings
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {autoEnabled && (
            <GlassButton
              title={runningAutoNow ? 'Backing Up Now...' : 'Back up now'}
              variant="secondary"
              loading={runningAutoNow}
              disabled={runningAutoNow || backingUp || restoring}
              onPress={handleRunAutoBackupNow}
              icon={<HardDriveDownload size={18} color={colors.vjText} />}
            />
          )}
        </GlassCard>

        {/* FIX-V746-5: "Make it reliable" Card shown while automatic backup is ON */}
        {autoEnabled && (
          <GlassCard
            style={{
              marginBottom: 20,
              borderColor: 'rgba(217, 119, 6, 0.35)',
              backgroundColor: 'rgba(254, 243, 199, 0.45)',
            }}
          >
            <View className="flex-row items-start gap-3 mb-3">
              <View className="p-2.5 rounded-xl bg-amber-500/20">
                <BatteryCharging size={22} color="#B45309" />
              </View>
              <View className="flex-1">
                <Text className="text-amber-950 font-black text-base mb-1">
                  Make it reliable
                </Text>
                <Text className="text-amber-900/80 text-xs font-medium leading-4">
                  Some phones stop background work to save battery. To help the
                  8:00–8:30 pm backup run on time, set VJ Billing battery usage
                  to Unrestricted and allow Auto-start if your phone has that
                  setting.
                </Text>
              </View>
            </View>
            <GlassButton
              title="Open App Settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
            />
          </GlassCard>
        )}

        {/* 1. Public SAF Storage Mirroring Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Public Storage Mirroring (SAF)
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View
              style={[
                s.iconBox,
                {
                  backgroundColor: `${colors.vjAccent}15`,
                  borderColor: `${colors.vjAccent}30`,
                },
              ]}
            >
              <FolderLock
                size={26}
                color={publicDirUri ? '#10B981' : colors.vjAccent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.cardTitleRow}>
                <Text style={[s.cardTitle, { color: colors.vjText }]}>
                  Documents Mirror
                </Text>
                <View
                  style={[
                    s.statusTag,
                    {
                      backgroundColor: publicDirUri
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                      borderColor: publicDirUri
                        ? 'rgba(16, 185, 129, 0.25)'
                        : 'rgba(245, 158, 11, 0.25)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.statusTagText,
                      { color: publicDirUri ? '#047857' : '#B45309' },
                    ]}
                  >
                    {publicDirUri ? 'ACTIVE' : 'ACTION REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  s.cardDescription,
                  { color: colors.vjText, opacity: 0.7 },
                ]}
              >
                {publicDirUri
                  ? '✓ Backups automatically copy to: Documents/VJ Billing/backups/.'
                  : "Allow VJ Billing to automatically copy your backups to your phone's public Documents folder so they are accessible in your file manager."}
              </Text>
            </View>
          </View>

          <GlassButton
            title={
              publicDirUri
                ? 'Update public backup folder access'
                : 'Grant public backup folder access'
            }
            variant={publicDirUri ? 'secondary' : 'primary'}
            icon={
              <FolderLock
                size={18}
                color={publicDirUri ? colors.vjText : '#FCFBF8'}
              />
            }
            onPress={handleGrantPublicAccess}
          />
        </GlassCard>

        {/* 2. Create Encrypted Backup Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Create Database Backup
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View
              style={[
                s.iconBox,
                {
                  backgroundColor: 'rgba(5, 150, 105, 0.12)',
                  borderColor: 'rgba(5, 150, 105, 0.25)',
                },
              ]}
            >
              <HardDriveDownload size={26} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[s.cardTitle, { color: colors.vjText, marginBottom: 4 }]}
              >
                Encrypted .vjb Export
              </Text>
              <Text
                style={[
                  s.cardDescription,
                  { color: colors.vjText, opacity: 0.7 },
                ]}
              >
                Exports all firm profiles, inventory items, master categories,
                purity matrices, logos, and audit logs into a single encrypted
                snapshot.
              </Text>
            </View>
          </View>

          {lastBackupInfo && (
            <View
              style={[
                s.lastBackupBox,
                {
                  backgroundColor: `${colors.vjAccent}08`,
                  borderColor: `${colors.vjAccent}20`,
                },
              ]}
            >
              <View style={s.lastBackupHeader}>
                <Text style={[s.lastBackupLabel, { color: colors.vjText }]}>
                  Last Created Backup
                </Text>
                <Text style={s.lastBackupSize}>{lastBackupInfo.sizeKb}</Text>
              </View>
              <Text style={[s.lastBackupName, { color: colors.vjText }]}>
                {lastBackupInfo.fileName}
              </Text>
              <Text
                style={[s.lastBackupPath, { color: colors.vjText }]}
                numberOfLines={1}
              >
                {lastBackupInfo.path}
              </Text>
            </View>
          )}

          <GlassButton
            title={
              backingUp ? 'Generating Encrypted Backup...' : 'Create Backup Now'
            }
            variant="primary"
            icon={
              backingUp ? (
                <ActivityIndicator size="small" color="#FCFBF8" />
              ) : (
                <HardDriveDownload size={18} color="#FCFBF8" />
              )
            }
            onPress={handleStartBackup}
            disabled={backingUp || restoring || runningAutoNow}
          />
        </GlassCard>

        {/* 3. Restore Database Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Restore Database
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View
              style={[
                s.iconBox,
                {
                  backgroundColor: 'rgba(124, 58, 237, 0.12)',
                  borderColor: 'rgba(124, 58, 237, 0.25)',
                },
              ]}
            >
              <HardDriveUpload size={26} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[s.cardTitle, { color: colors.vjText, marginBottom: 4 }]}
              >
                Restore from .vjb File
              </Text>
              <Text
                style={[
                  s.cardDescription,
                  { color: colors.vjText, opacity: 0.7 },
                ]}
              >
                Select a previously exported .vjb backup to preview and restore.
                All records will be verified for referential integrity before
                applying.
              </Text>
            </View>
          </View>

          <GlassButton
            title={
              restoring
                ? 'Restoring Database...'
                : 'Select & Inspect Backup File'
            }
            variant="secondary"
            icon={
              restoring ? (
                <ActivityIndicator size="small" color={colors.vjAccent} />
              ) : (
                <HardDriveUpload size={18} color={colors.vjText} />
              )
            }
            onPress={handleRestore}
            disabled={backingUp || restoring || runningAutoNow}
          />
        </GlassCard>

        {/* 4. Safety & Encryption Info Card */}
        <GlassCard style={[s.infoCard, { borderColor: `${colors.vjAccent}25` }]}>
          <View style={s.infoCardInner}>
            <Info size={20} color={colors.vjAccent} />
            <Text style={[s.infoCardText, { color: colors.vjText }]}>
              Password backups use AES-256-GCM with PBKDF2-HMAC-SHA256 at 600,000
              iterations. Always set a password when sending a backup file to
              another person or cloud drive.
            </Text>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Automatic Backup Consent Modal (FIX-V745-1, FIX-V745-5) */}
      <Modal
        animationType="fade"
        transparent
        visible={showConsentModal}
        onRequestClose={() => setShowConsentModal(false)}
      >
        <View style={s.modalOverlay}>
          <View
            style={[
              s.modalContent,
              { backgroundColor: colors.vjBg, borderColor: colors.border },
            ]}
          >
            <View style={s.modalHeaderRow}>
              <Text style={[s.modalTitle, { color: colors.vjText }]}>
                Enable Automatic Daily Backup
              </Text>
              <TouchableOpacity
                onPress={() => setShowConsentModal(false)}
                style={[
                  s.modalCloseBtn,
                  { backgroundColor: `${colors.vjAccent}12` },
                ]}
              >
                <X size={20} color={colors.vjText} />
              </TouchableOpacity>
            </View>

            <Text
              style={[
                s.modalDescription,
                { color: colors.vjText, opacity: 0.8 },
              ]}
            >
              Automatic backups are saved without a password so you can restore
              them after reinstalling the app or moving to a new phone.{'\n\n'}
              Because they have no password, anyone who obtains a copy of the
              backup file from your Documents folder and has the VJ Billing app
              can open it. Keep your phone and Documents folder private, and use
              manual password export when sharing a file.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setConsentAck(!consentAck)}
              className="flex-row items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4"
            >
              {consentAck ? (
                <CheckSquare size={20} color="#B45309" />
              ) : (
                <Square size={20} color="#B45309" />
              )}
              <Text className="text-amber-950 text-xs font-bold flex-1">
                I understand that automatic backups have no password and can be
                restored on any phone with VJ Billing.
              </Text>
            </TouchableOpacity>

            <View style={{ gap: 10 }}>
              <GlassButton
                title="Enable Daily Backup"
                onPress={handleConfirmEnableAutoBackup}
                disabled={!consentAck}
                variant="primary"
              />
              <GlassButton
                title="Cancel"
                onPress={() => setShowConsentModal(false)}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Backup Password Modal (FIX-V7411-1: two masked fields, min 8 chars, warning + ack box) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showBackupModal}
        onRequestClose={() => setShowBackupModal(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBackupModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              s.modalContent,
              {
                backgroundColor: colors.vjBg,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={s.modalHeaderRow}>
              <Text style={[s.modalTitle, { color: colors.vjText }]}>
                Create Secure Backup
              </Text>
              <TouchableOpacity
                onPress={() => setShowBackupModal(false)}
                style={[
                  s.modalCloseBtn,
                  { backgroundColor: `${colors.vjAccent}12` },
                ]}
              >
                <X size={20} color={colors.vjText} />
              </TouchableOpacity>
            </View>

            <Text
              style={[
                s.modalDescription,
                { color: colors.vjText, opacity: 0.75 },
              ]}
            >
              Enter an optional password (minimum {MIN_BACKUP_PASSWORD_LENGTH}{' '}
              characters) to encrypt this backup with PBKDF2-SHA256 (600,000
              iterations). Leave both fields blank for a portable no-password
              backup.
            </Text>

            <View style={{ marginBottom: 8 }}>
              <GlassInput
                label="Backup Password (Optional, min 8 chars)"
                value={backupPassword}
                onChangeText={setBackupPassword}
                placeholder="Enter password (min 8 characters)"
                secureTextEntry
                icon={<Lock size={18} color={colors.vjAccent} />}
              />
              <GlassInput
                label="Confirm Backup Password"
                value={backupPasswordConfirm}
                onChangeText={setBackupPasswordConfirm}
                placeholder="Re-enter password to confirm"
                secureTextEntry
                icon={<Lock size={18} color={colors.vjAccent} />}
              />
            </View>

            {/* FIX-V7411-1: Unrecoverable-password warning + acknowledge checkbox when password is typed */}
            {hasTypedPassword && (
              <View className="mb-4">
                <View className="flex-row items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 mb-2.5">
                  <AlertTriangle size={16} color="#DC2626" />
                  <Text className="text-red-800 text-[11px] font-bold flex-1 leading-4">
                    WARNING: Losing this password means permanent data loss for
                    this backup file. There is no password recovery path.
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setPasswordAck(!passwordAck)}
                  className="flex-row items-center gap-2.5 p-2.5 rounded-xl bg-black/5 border border-black/10"
                >
                  {passwordAck ? (
                    <CheckSquare size={18} color={colors.vjText} />
                  ) : (
                    <Square size={18} color={colors.vjText} />
                  )}
                  <Text
                    style={{
                      color: colors.vjText,
                      fontSize: 11.5,
                      fontWeight: '700',
                      flex: 1,
                    }}
                  >
                    I understand that if I forget this password, this backup
                    cannot be recovered.
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <GlassButton
                title="Create & Export Backup"
                onPress={handleConfirmBackup}
                disabled={!isPasswordValid}
                variant="primary"
                icon={<HardDriveDownload size={18} color="#FCFBF8" />}
              />
              <GlassButton
                title="Cancel"
                onPress={() => setShowBackupModal(false)}
                variant="secondary"
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <RestorePreviewModal
        visible={previewModalVisible}
        backup={previewBackup}
        fileContent={previewFileContent}
        schemaWarning={previewWarning}
        isRestoring={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPreviewModalVisible(false)}
      />
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerContainer: { marginTop: 4 },
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  iconBox: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontWeight: '900',
    fontSize: 17,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 8.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  lastBackupBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  lastBackupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  lastBackupLabel: {
    fontWeight: '800',
    fontSize: 12,
  },
  lastBackupSize: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  lastBackupName: {
    fontSize: 11.5,
    fontFamily: 'monospace',
    fontWeight: '700',
    opacity: 0.85,
  },
  lastBackupPath: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'monospace',
    opacity: 0.45,
  },
  infoCard: {
    opacity: 0.9,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoCardText: {
    fontWeight: '700',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
    opacity: 0.85,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontWeight: '900',
    fontSize: 19,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 999,
  },
  modalDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: '500',
  },
});
