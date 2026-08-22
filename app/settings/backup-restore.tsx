// app/settings/backup-restore.tsx — Phase 1 & Phase 2 Dedicated Backup & Restore Screen

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
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
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Info
} from 'lucide-react-native';

export default function BackupRestoreScreen() {
  const router = useRouter();
  const { firm, refreshSession } = useSession();
  const activeTheme = appSettingsStore((s) => s.theme);
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
  const [lastBackupInfo, setLastBackupInfo] = useState<{ fileName: string; sizeKb: string; time: string } | null>(null);

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
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        storage.set('vjbilling_public_backup_dir_uri', permissions.directoryUri);
        setPublicDirUri(permissions.directoryUri);
        Alert.alert(
          "Public Backup Access Granted",
          "Backups will now automatically be mirrored to your public Documents folder under 'VJ Billing/backups/'."
        );
      }
    } catch (e: any) {
      Alert.alert("Permission Error", e?.message || "Could not grant public storage access.");
    }
  };

  const handleStartBackup = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
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
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      });

      let successMsg = `Backup File: ${result.fileName}\nSize: ${sizeKb} KB\nSaved at: App Internal Storage`;

      if (result.mirroredToPublicStorage) {
        successMsg += '\n\n✓ Also copied to Documents/VJ Billing/backups/';
      } else {
        successMsg += '\n\nTip: Tap "Grant Public Backup Access" to also mirror backups to your Documents folder.';
      }

      Alert.alert("Backup Created Successfully", successMsg);
    } catch (error: any) {
      Alert.alert("Backup Failed", error.message);
    } finally {
      setBackingUp(false);
      setBackupPassword('');
    }
  };

  const handleRestore = async () => {
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
      const result = await restoreService.inspectBackupFile();
      if (!result) return; // User canceled picker

      setPreviewBackup(result.backup);
      setPreviewFileContent(result.fileContent);
      setPreviewModalVisible(true);
    } catch (error: any) {
      Alert.alert("Invalid Backup File", error.message || "Failed to parse backup file.");
    }
  };

  const handleConfirmRestore = async (password?: string) => {
    if (!previewFileContent) return;
    try {
      setRestoring(true);
      await restoreService.restore(previewFileContent, password);
      await refreshSession();
      setPreviewModalVisible(false);
      Alert.alert("Success", "Database restored successfully.");
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert("Restore Failed", error.message);
    } finally {
      setRestoring(false);
    }
  };

  const backupHeader = (
    <View className="mt-1">
      <View className="flex-row items-center gap-3 mb-2">
        <View className="h-10 w-10 rounded-full bg-white/10 justify-center items-center border border-white/20">
          <Database size={20} color={colors.vjBg} />
        </View>
        <View className="flex-1">
          <Text className="text-vj-bg text-xl font-bold tracking-tight" numberOfLines={1}>
            Backup & Restore
          </Text>
          <Text className="text-vj-bg/60 text-xs font-medium">
            Encrypted Database Vault ({firm?.name || 'Active Firm'})
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 flex-wrap">
        <HeaderPill
          icon={<FolderLock size={12} color={publicDirUri ? "#4ADE80" : "#FDBA74"} />}
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
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 20 }}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        bounces={false}
      >

        {/* 1. Public SAF Storage Mirroring Card */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-3 ml-1">
          Public Storage Mirroring (SAF)
        </Text>
        <GlassCard style={{ marginBottom: 20 }}>
          <View className="flex-row items-start gap-4 mb-4">
            <View className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 items-center justify-center">
              <FolderLock size={26} color={publicDirUri ? "#10B981" : "#D4AF37"} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-1">
                <Text className="text-vj-text font-black text-lg">Documents Mirror</Text>
                <View
                  className={`px-2 py-0.5 rounded-full border ${
                    publicDirUri
                      ? 'bg-emerald-500/15 border-emerald-500/30'
                      : 'bg-amber-500/15 border-amber-500/30'
                  }`}
                >
                  <Text
                    className={`text-[8px] font-black uppercase tracking-wider ${
                      publicDirUri ? 'text-emerald-800' : 'text-amber-800'
                    }`}
                  >
                    {publicDirUri ? 'ACTIVE' : 'ACTION REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text className="text-vj-text/70 text-xs leading-4">
                {publicDirUri
                  ? "✓ Backups automatically copy to: Documents/VJ Billing/backups/."
                  : "Allow VJ Billing to automatically copy your backups to your phone's public Documents folder so they are accessible even if the app is reinstalled."}
              </Text>
            </View>
          </View>

          <GlassButton
            title={publicDirUri ? "Update Public Storage Location" : "Grant Public Backup Access"}
            variant={publicDirUri ? "secondary" : "primary"}
            icon={<FolderLock size={18} color={publicDirUri ? COLORS.vjText : "#FCFBF8"} />}
            onPress={handleGrantPublicAccess}
          />
        </GlassCard>

        {/* 2. Create Encrypted Backup Card */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-3 ml-1">
          Create Database Backup
        </Text>
        <GlassCard style={{ marginBottom: 20 }}>
          <View className="flex-row items-start gap-4 mb-4">
            <View className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center">
              <HardDriveDownload size={26} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-vj-text font-black text-lg mb-1">Encrypted .vjb Export</Text>
              <Text className="text-vj-text/70 text-xs leading-4">
                Exports all firm profiles, inventory items, master categories, purity matrices, and audit logs into a single encrypted snapshot.
              </Text>
            </View>
          </View>

          {lastBackupInfo && (
            <View className="bg-vj-text/5 p-3 rounded-2xl border border-vj-text/10 mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-vj-text font-bold text-xs">Last Created Backup</Text>
                <Text className="text-vj-text/60 text-[11px] mt-0.5">{lastBackupInfo.fileName}</Text>
              </View>
              <View className="items-end">
                <Text className="text-emerald-700 font-bold text-xs">{lastBackupInfo.sizeKb}</Text>
                <Text className="text-vj-text/50 text-[10px]">{lastBackupInfo.time}</Text>
              </View>
            </View>
          )}

          <GlassButton
            title={backingUp ? "Generating Encrypted Backup..." : "Create Backup Now"}
            variant="primary"
            icon={backingUp ? <ActivityIndicator size="small" color="#FCFBF8" /> : <HardDriveDownload size={18} color="#FCFBF8" />}
            onPress={handleStartBackup}
            disabled={backingUp || restoring}
          />
        </GlassCard>

        {/* 3. Restore Database Card */}
        <Text className="text-vj-text/60 text-xs font-black uppercase tracking-widest mb-3 ml-1">
          Restore Database
        </Text>
        <GlassCard style={{ marginBottom: 20 }}>
          <View className="flex-row items-start gap-4 mb-4">
            <View className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 items-center justify-center">
              <HardDriveUpload size={26} color="#7C3AED" />
            </View>
            <View className="flex-1">
              <Text className="text-vj-text font-black text-lg mb-1">Restore from .vjb File</Text>
              <Text className="text-vj-text/70 text-xs leading-4">
                Select a previously exported .vjb backup to preview and restore. All records will be verified for integrity before applying.
              </Text>
            </View>
          </View>

          <GlassButton
            title={restoring ? "Restoring Database..." : "Select & Inspect Backup File"}
            variant="secondary"
            icon={restoring ? <ActivityIndicator size="small" color="#D4AF37" /> : <HardDriveUpload size={18} color={COLORS.vjText} />}
            onPress={handleRestore}
            disabled={backingUp || restoring}
          />
        </GlassCard>

        {/* 4. Safety & Encryption Info Card */}
        <GlassCard style={{ opacity: 0.85, padding: 14 }}>
          <View className="flex-row items-center gap-3">
            <Info size={20} color={COLORS.vjText} />
            <Text className="text-vj-text font-bold text-xs flex-1">
              All backups are protected with AES-256-GCM encryption and SHA-256 checksums to ensure 100% data integrity.
            </Text>
          </View>
        </GlassCard>

      </ScrollView>

      {/* Manual Backup Password Modal */}
      <Modal animationType="fade" transparent={true} visible={showBackupModal} onRequestClose={() => setShowBackupModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-6 shadow-xl border border-white/50">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-vj-text font-black text-xl">Create Secure Backup</Text>
              <TouchableOpacity onPress={() => setShowBackupModal(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>

            <Text className="text-vj-text/70 text-xs mb-4">
              Enter an optional password to encrypt this backup. If left blank, it will be secured with this device's internal encryption key.
            </Text>

            <GlassInput
              label="Backup Password (Optional)"
              value={backupPassword}
              onChangeText={setBackupPassword}
              placeholder="Leave empty for device-key encryption"
              secureTextEntry
              icon={<Lock size={18} color="#D4AF37" />}
            />

            <View className="mt-4 gap-2">
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
          </View>
        </View>
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
