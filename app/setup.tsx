// app/setup.tsx — Phase 1 v7.47 & Phase 2 Canonical Setup Screen
// Implements Step 16 Decision Tree, FIX-V741-5 (schemaWarning), FIX-V745-7 (always offer file picker + SAF folder scan)

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { ScreenWrapper } from '@/components/common/ScreenWrapper';
import { GlassCard } from '@/components/ui/Glass';
import { restoreService } from '@/services/phase1/restoreService';
import '@/services/phase2/inventoryRestoreService';
import { useSession } from '@/hooks/useSession';
import { RestorePreviewModal } from '@/components/phase1/RestorePreviewModal';
import { BackupEnvelope, getOrCreateSafFolder } from '@/services/phase1/backupService';
import { storage } from '@/utils/storage';
import { ANY_BACKUP_FILE_REGEX } from '@/constants/backup';
import {
  ArrowRight,
  ShieldCheck,
  Store,
  HardDriveDownload,
  FolderSearch,
  Gem,
  CheckCircle2,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

export default function SetupScreen() {
  const router = useRouter();
  const { refreshSession } = useSession();

  const [hasBackup, setHasBackup] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const checkBackups = async () => {
        try {
          const fsAny = FileSystem as any;
          const docDir = fsAny.documentDirectory ?? fsAny.cacheDirectory ?? '';
          const backupDir = docDir + 'backups/';
          let vjbExists = false;

          try {
            const backupDirInfo = await FileSystem.getInfoAsync(backupDir);
            if (backupDirInfo.exists) {
              const backupFiles = await FileSystem.readDirectoryAsync(backupDir);
              if (backupFiles.some((file: string) => ANY_BACKUP_FILE_REGEX.test(file) || file.endsWith('.vjb'))) {
                vjbExists = true;
              }
            }
          } catch {}

          if (!vjbExists && docDir) {
            try {
              const rootFiles = await FileSystem.readDirectoryAsync(docDir);
              if (rootFiles.some((file: string) => ANY_BACKUP_FILE_REGEX.test(file) || file.endsWith('.vjb'))) {
                vjbExists = true;
              }
            } catch {}
          }

          if (isMounted) setHasBackup(vjbExists);
        } catch (e) {
          console.error('Failed to scan for backups:', e);
          if (isMounted) setHasBackup(false);
        }
      };
      checkBackups();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  const handleRestore = async () => {
    try {
      const result = await restoreService.inspectBackupFile();
      if (!result) return;

      setPreviewBackup(result.backup);
      setPreviewFileContent(result.fileContent);
      setPreviewWarning(result.warning ?? null);
      setPreviewModalVisible(true);
    } catch (error: any) {
      Alert.alert('Invalid Backup File', error.message || 'Failed to parse backup file.');
    }
  };

  // FIX-V745-7: Find backups in public SAF folder after reinstall
  const handleFindInFolder = async () => {
    try {
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;

      storage.set('vjbilling_public_backup_dir_uri', perm.directoryUri);
      let targetFolderUri = perm.directoryUri;
      try {
        const vjFolder = await getOrCreateSafFolder(perm.directoryUri, 'VJ Billing');
        targetFolderUri = await getOrCreateSafFolder(vjFolder, 'backups');
      } catch {
        targetFolderUri = perm.directoryUri;
      }

      const children = await StorageAccessFramework.readDirectoryAsync(targetFolderUri);
      const vjbEntries = children
        .map((uri) => ({
          uri,
          name: (decodeURIComponent(uri.split('/').pop() ?? '')).replace(/\.bin$/, ''),
        }))
        .filter((e) => ANY_BACKUP_FILE_REGEX.test(e.name) || e.name.endsWith('.vjb'))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (vjbEntries.length === 0) {
        Alert.alert(
          'No Backups Found',
          'No .vjb backup files were found in the selected folder. Try selecting a specific .vjb file instead.'
        );
        return;
      }

      const newest = vjbEntries[0];
      const fileContent = await FileSystem.readAsStringAsync(newest.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = JSON.parse(fileContent);
      // If password-protected, open preview with metadata header so user can type password in RestorePreviewModal
      if (parsed.passwordProtected === true) {
        setPreviewBackup({
          ...parsed,
          payload: parsed.payload ?? {
            firms: [],
            financialYears: [],
            settings: [],
            auditLogs: [],
            bisLogos: [],
            safeModeState: null,
            writerLeases: [],
          },
        });
        setPreviewFileContent(fileContent);
        setPreviewWarning(null);
        setPreviewModalVisible(true);
        return;
      }

      // Portable APP_KEY backup: decrypt and validate immediately for full preview
      const { decryptBackup } = await import('@/utils/backupCrypto');
      const innerStr = await decryptBackup(parsed);
      const inner = JSON.parse(innerStr);
      const fullEnvelope: BackupEnvelope = {
        ...parsed,
        deviceId: inner.deviceId ?? parsed.deviceId ?? 'UNKNOWN',
        payload: inner,
      };
      const schemaCheck = await restoreService.validateBackupSchema(fullEnvelope);
      setPreviewBackup(fullEnvelope);
      setPreviewFileContent(fileContent);
      setPreviewWarning(schemaCheck && 'warning' in schemaCheck ? schemaCheck.warning ?? null : null);
      setPreviewModalVisible(true);
    } catch (error: any) {
      Alert.alert('Folder Scan Failed', error.message || 'Could not read backups from folder.');
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
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message);
    } finally {
      setRestoring(false);
    }
  };

  const renderEstablishNewFirmCard = () => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => router.push('/create-firm')}
      disabled={restoring}
      key="card-new-firm"
    >
      <GlassCard style={{ padding: 20, marginBottom: 0 }}>
        <View className="flex-row items-center gap-5">
          <View className="bg-vj-text p-4 rounded-2xl shadow-sm">
            <Store size={28} color={COLORS.vjBg} />
          </View>
          <View className="flex-1">
            <Text className="text-vj-text font-bold text-lg mb-0.5">
              Set Up New Firm
            </Text>
            <Text className="text-vj-text/60 text-xs">
              Start fresh. Establish shop details.
            </Text>
          </View>
          <View className="bg-vj-glass p-2 rounded-full border border-white/20">
            <ArrowRight size={20} color={COLORS.vjText} />
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );

  const renderRestoreCard = () => (
    <View key="card-restore" className="gap-3">
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleRestore}
        disabled={restoring}
      >
        <GlassCard
          style={{
            padding: 20,
            marginBottom: 0,
            ...(hasBackup ? { borderColor: COLORS.vjAccent, borderWidth: 2 } : {}),
          }}
        >
          <View className="flex-row items-center gap-5">
            <View className="bg-vj-bg p-4 rounded-2xl border border-vj-accent/30">
              {restoring ? (
                <ActivityIndicator size="small" color={COLORS.vjAccent} />
              ) : (
                <HardDriveDownload size={28} color={COLORS.vjAccent} />
              )}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text className="text-vj-text font-bold text-lg">
                  {restoring ? 'Restoring...' : 'Restore from Backup'}
                </Text>
                {hasBackup && (
                  <View className="px-2 py-0.5 rounded-full bg-emerald-600/15 border border-emerald-600/30 flex-row items-center gap-1">
                    <CheckCircle2 size={10} color="#15803D" />
                    <Text className="text-emerald-800 font-extrabold text-[8px] uppercase tracking-wider">
                      File Found
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-vj-text/60 text-xs">
                Choose a .vjb backup file from your device
              </Text>
            </View>
            <View className="bg-vj-glass p-2 rounded-full border border-white/20">
              <ArrowRight size={20} color={COLORS.vjText} />
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>

      {/* FIX-V745-7: Always offer scanning a backup folder (for post-reinstall recovery) */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleFindInFolder}
        disabled={restoring}
      >
        <GlassCard style={{ padding: 16, marginBottom: 0 }}>
          <View className="flex-row items-center gap-4">
            <View className="bg-vj-bg p-3 rounded-xl border border-vj-accent/25">
              <FolderSearch size={22} color={COLORS.vjAccent} />
            </View>
            <View className="flex-1">
              <Text className="text-vj-text font-bold text-sm">
                Find Backups in Folder
              </Text>
              <Text className="text-vj-text/60 text-xs">
                Scan Documents/VJ Billing/backups after reinstall
              </Text>
            </View>
            <ArrowRight size={18} color={COLORS.vjText} />
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingVertical: 24,
          paddingBottom: 40,
        }}
      >
        <View className="w-full px-2">
          <View className="items-center mb-12">
            <View className="h-24 w-24 bg-vj-glass rounded-full border border-white/50 justify-center items-center mb-6 shadow-sm">
              <View className="h-20 w-20 bg-white/60 rounded-full justify-center items-center shadow-inner">
                <Gem size={40} color={COLORS.vjAccent} />
              </View>
            </View>

            <Text className="text-vj-text font-bold text-4xl tracking-tighter text-center">
              VJ BILLING
            </Text>
            <Text className="text-vj-text/60 text-sm tracking-[0.2em] uppercase mt-2 text-center">
              Jewellery Management Suite
            </Text>
          </View>

          <View className="mb-8">
            <Text className="text-vj-text text-2xl font-bold text-center">
              Welcome
            </Text>
            <Text className="text-vj-text/60 text-center mt-3 leading-6 px-4">
              Your secure, offline-first command center. To begin, please establish your
              firm&apos;s identity or restore an existing backup.
            </Text>
          </View>

          {/* Step 16 Decision Tree: If backup detected, render Restore FIRST */}
          <View className="gap-4">
            {hasBackup === null ? (
              <ActivityIndicator size="large" color={COLORS.vjAccent} className="mt-4" />
            ) : hasBackup ? (
              <>
                {renderRestoreCard()}
                {renderEstablishNewFirmCard()}
              </>
            ) : (
              <>
                {renderEstablishNewFirmCard()}
                {renderRestoreCard()}
              </>
            )}
          </View>

          <View className="mt-12 items-center flex-row justify-center gap-2 opacity-50">
            <ShieldCheck size={14} color={COLORS.vjText} />
            <Text className="text-vj-text text-xs font-medium">
              100% Offline & Secure Storage
            </Text>
          </View>
        </View>
      </ScrollView>

      <RestorePreviewModal
        visible={previewModalVisible}
        backup={previewBackup}
        fileContent={previewFileContent}
        schemaWarning={previewWarning}
        isRestoring={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPreviewModalVisible(false)}
      />
    </ScreenWrapper>
  );
}
