// app/settings/backup-restore.tsx — Phase 1 & Phase 2 Dedicated Backup & Restore Screen

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { backupService, BackupEnvelope } from '@/services/phase1/backupService';
import { restoreService } from '@/services/phase1/restoreService';
import { storage } from '@/utils/storage';
import { GlassCard, GlassButton, GlassInput, HeaderPill } from '@/components/ui/Glass';
import { RestorePreviewModal } from '@/components/RestorePreviewModal';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';
import {
  HardDriveDownload,
  HardDriveUpload,
  FolderLock,
  Database,
  ShieldCheck,
  Lock,
  X,
  Info,
} from 'lucide-react-native';

export default function BackupRestoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { firm, refreshSession } = useSession();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Public SAF Directory Storage Key
  const [publicDirUri, setPublicDirUri] = useState<string | null>(null);

  // Restore Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);

  // Manual Backup Password Modal State
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [lastBackupInfo, setLastBackupInfo] = useState<{ fileName: string; sizeKb: string; time: string; path: string } | null>(null);

  useEffect(() => {
    // Check SAF Public Backup Directory URI
    const storedPublicDir = storage.getString('vjbilling_public_backup_dir_uri');
    if (storedPublicDir) {
      setPublicDirUri(storedPublicDir);
    }
  }, []);

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
              const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
              if (permissions.granted) {
                storage.set('vjbilling_public_backup_dir_uri', permissions.directoryUri);
                setPublicDirUri(permissions.directoryUri);
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
      Alert.alert('Permission Error', e?.message || 'Could not grant public storage access.');
    }
  };

  const handleStartBackup = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setBackupPassword('');
    setShowBackupModal(true);
  };

  const handleConfirmBackup = async () => {
    setShowBackupModal(false);
    try {
      setBackingUp(true);
      const passwordToUse = backupPassword.trim() ? backupPassword.trim() : undefined;
      const result = await backupService.createBackup(passwordToUse);

      const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);
      setLastBackupInfo({
        fileName: result.fileName,
        sizeKb: `${sizeKb} KB`,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        path: result.filePath,
      });

      let successMsg = `File: ${result.fileName}\nSize: ${sizeKb} KB\nLocation: ${result.filePath}`;

      if (result.mirroredToPublicStorage) {
        successMsg += '\n\n✓ Also copied to: Documents/VJ Billing/backups/';
      } else {
        successMsg += '\n\n⚠️ Note: Saved in internal app sandbox storage (not directly visible in standard file managers).\n\nTip: Tap "Grant Public Backup Access" to also mirror backups to your Documents folder.';
      }

      Alert.alert('Backup Created Successfully', successMsg);
    } catch (error: any) {
      Alert.alert('Backup Failed', error.message || 'Failed to create backup.');
    } finally {
      setBackingUp(false);
      setBackupPassword('');
    }
  };

  const handleRestore = async () => {
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const result = await restoreService.inspectBackupFile();
      if (!result) return;

      setPreviewBackup(result.backup);
      setPreviewFileContent(result.fileContent);
      setPreviewModalVisible(true);
    } catch (error: any) {
      Alert.alert('Invalid Backup File', error.message || 'Failed to parse backup file.');
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
      Alert.alert('Restore Failed', error.message || 'Database restoration encountered an error.');
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
        <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="AES-256 ENCRYPTED" variant="success" />
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="Backup & Restore" showBack headerContent={backupHeader}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ 
          paddingHorizontal: 16,
          paddingTop: 20, 
          paddingBottom: Math.max(insets.bottom + 40, 100) 
        }}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        bounces={false}
      >
        {/* 1. Public SAF Storage Mirroring Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Public Storage Mirroring (SAF)
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View style={[s.iconBox, { backgroundColor: `${colors.vjAccent}15`, borderColor: `${colors.vjAccent}30` }]}>
              <FolderLock size={26} color={publicDirUri ? '#10B981' : colors.vjAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.cardTitleRow}>
                <Text style={[s.cardTitle, { color: colors.vjText }]}>Documents Mirror</Text>
                <View
                  style={[
                    s.statusTag,
                    {
                      backgroundColor: publicDirUri ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                      borderColor: publicDirUri ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
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
              <Text style={[s.cardDescription, { color: colors.vjText, opacity: 0.7 }]}>
                {publicDirUri
                  ? '✓ Backups automatically copy to: Documents/VJ Billing/backups/.'
                  : "Allow VJ Billing to automatically copy your backups to your phone's public Documents folder so they are accessible in your file manager."}
              </Text>
            </View>
          </View>

          <GlassButton
            title={publicDirUri ? 'Update Public Storage Location' : 'Grant Public Backup Access'}
            variant={publicDirUri ? 'secondary' : 'primary'}
            icon={<FolderLock size={18} color={publicDirUri ? colors.vjText : '#FCFBF8'} />}
            onPress={handleGrantPublicAccess}
          />
        </GlassCard>

        {/* 2. Create Encrypted Backup Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Create Database Backup
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(5, 150, 105, 0.12)', borderColor: 'rgba(5, 150, 105, 0.25)' }]}>
              <HardDriveDownload size={26} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.vjText, marginBottom: 4 }]}>Encrypted .vjb Export</Text>
              <Text style={[s.cardDescription, { color: colors.vjText, opacity: 0.7 }]}>
                Exports all firm profiles, inventory items, master categories, purity matrices, and audit logs into a single encrypted snapshot.
              </Text>
            </View>
          </View>

          {lastBackupInfo && (
            <View style={[s.lastBackupBox, { backgroundColor: `${colors.vjAccent}08`, borderColor: `${colors.vjAccent}20` }]}>
              <View style={s.lastBackupHeader}>
                <Text style={[s.lastBackupLabel, { color: colors.vjText }]}>Last Created Backup</Text>
                <Text style={s.lastBackupSize}>{lastBackupInfo.sizeKb}</Text>
              </View>
              <Text style={[s.lastBackupName, { color: colors.vjText }]}>{lastBackupInfo.fileName}</Text>
              <Text style={[s.lastBackupPath, { color: colors.vjText }]} numberOfLines={1}>
                {lastBackupInfo.path}
              </Text>
            </View>
          )}

          <GlassButton
            title={backingUp ? 'Generating Encrypted Backup...' : 'Create Backup Now'}
            variant="primary"
            icon={
              backingUp ? (
                <ActivityIndicator size="small" color="#FCFBF8" />
              ) : (
                <HardDriveDownload size={18} color="#FCFBF8" />
              )
            }
            onPress={handleStartBackup}
            disabled={backingUp || restoring}
          />
        </GlassCard>

        {/* 3. Restore Database Card */}
        <Text style={[s.sectionHeader, { color: colors.vjText, opacity: 0.6 }]}>
          Restore Database
        </Text>
        <GlassCard style={{ marginBottom: 20, borderColor: `${colors.vjAccent}25` }}>
          <View style={s.cardTopRow}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(124, 58, 237, 0.12)', borderColor: 'rgba(124, 58, 237, 0.25)' }]}>
              <HardDriveUpload size={26} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.vjText, marginBottom: 4 }]}>Restore from .vjb File</Text>
              <Text style={[s.cardDescription, { color: colors.vjText, opacity: 0.7 }]}>
                Select a previously exported .vjb backup to preview and restore. All records will be verified for integrity before applying.
              </Text>
            </View>
          </View>

          <GlassButton
            title={restoring ? 'Restoring Database...' : 'Select & Inspect Backup File'}
            variant="secondary"
            icon={
              restoring ? (
                <ActivityIndicator size="small" color={colors.vjAccent} />
              ) : (
                <HardDriveUpload size={18} color={colors.vjText} />
              )
            }
            onPress={handleRestore}
            disabled={backingUp || restoring}
          />
        </GlassCard>

        {/* 4. Safety & Encryption Info Card */}
        <GlassCard style={[s.infoCard, { borderColor: `${colors.vjAccent}25` }]}>
          <View style={s.infoCardInner}>
            <Info size={20} color={colors.vjAccent} />
            <Text style={[s.infoCardText, { color: colors.vjText }]}>
              All backups are protected with AES-256-GCM encryption and SHA-256 checksums to ensure 100% data integrity across all phases.
            </Text>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Manual Backup Password Modal */}
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
              <Text style={[s.modalTitle, { color: colors.vjText }]}>Create Secure Backup</Text>
              <TouchableOpacity
                onPress={() => setShowBackupModal(false)}
                style={[s.modalCloseBtn, { backgroundColor: `${colors.vjAccent}12` }]}
              >
                <X size={20} color={colors.vjText} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalDescription, { color: colors.vjText, opacity: 0.75 }]}>
              Enter an optional password to encrypt this backup. If left blank, it will be secured with this device's internal encryption key.
            </Text>

            <View style={{ marginBottom: 16 }}>
              <GlassInput
                label="Backup Password (Optional)"
                value={backupPassword}
                onChangeText={setBackupPassword}
                placeholder="Leave empty for device-key encryption"
                secureTextEntry
                icon={<Lock size={18} color={colors.vjAccent} />}
              />
            </View>

            <View style={{ gap: 10 }}>
              <GlassButton
                title="Create & Export Backup"
                onPress={handleConfirmBackup}
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

      {/* Modern Restore Preview Modal */}
      <RestorePreviewModal
        visible={previewModalVisible}
        backup={previewBackup}
        fileContent={previewFileContent}
        isRestoring={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPreviewModalVisible(false)}
      />
    </TwoToneWrapper>
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
