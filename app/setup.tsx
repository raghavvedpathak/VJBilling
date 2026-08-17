// app/setup.tsx — Phase 2 v2.11 Canonical Screen

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { GlassCard } from '@/components/ui/Glass';
import { restoreService } from '@/services/phase1/restoreService';
import { useSession } from '@/hooks/useSession';
import { RestorePreviewModal } from '@/components/RestorePreviewModal';
import { BackupEnvelope } from '@/services/phase1/backupService';
import { 
  ArrowRight, 
  ShieldCheck, 
  Store, 
  HardDriveDownload, 
  Gem
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

export default function SetupScreen() {
  const router = useRouter();
  const { refreshSession } = useSession();
  
  const [hasBackup, setHasBackup] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Restore Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);

  useEffect(() => {
    const checkBackups = async () => {
      try {
        const fsAny = FileSystem as any;
        const dir = fsAny.documentDirectory ?? fsAny.cacheDirectory ?? '';
        if (!dir) {
          setHasBackup(false);
          return;
        }
        
        const files = await FileSystem.readDirectoryAsync(dir);
        const vjbExists = files.some((file: string) => file.endsWith('.vjb'));
        setHasBackup(vjbExists);
      } catch (e) {
        console.error("Failed to scan for backups:", e);
        setHasBackup(false);
      }
    };
    checkBackups();
  }, []);

  const handleRestore = async () => {
    try {
      const result = await restoreService.inspectBackupFile();
      if (!result) return; // User canceled document picker

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
      try { router.dismissAll(); } catch {}
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert("Restore Failed", error.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24, paddingBottom: 40 }}
      >
        <View className="w-full px-2">
        
          {/* 1. HERO SECTION (Logo & Title) */}
          <View className="items-center mb-12">
          {/* Glowing Glass Logo Container */}
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

        {/* 2. WELCOME TEXT */}
        <View className="mb-8">
          <Text className="text-vj-text text-2xl font-bold text-center">
            Welcome
          </Text>
          <Text className="text-vj-text/60 text-center mt-3 leading-6 px-4">
            Your secure, offline-first command center. To begin, please establish your firm's identity or restore an existing backup.
          </Text>
        </View>

        {/* 3. ACTION CARDS */}
        <View className="gap-4">
          
          {hasBackup === null ? (
            <ActivityIndicator size="large" color={COLORS.vjAccent} className="mt-4" />
          ) : (
            <>
              {/* Show Restore FIRST if Backup Detected */}
              {hasBackup && (
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={handleRestore}
                  disabled={restoring}
                >
                  <GlassCard style={{ padding: 20, marginBottom: 0, borderColor: COLORS.vjAccent, borderWidth: 2 }}>
                    <View className="flex-row items-center gap-5">
                      <View className="bg-vj-bg p-4 rounded-2xl border border-vj-accent/30">
                        {restoring ? (
                          <ActivityIndicator size="small" color={COLORS.vjAccent} />
                        ) : (
                          <HardDriveDownload size={28} color={COLORS.vjAccent} />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-vj-text font-bold text-lg mb-0.5">
                          {restoring ? "Restoring Backup..." : "Restore Backup Detected"}
                        </Text>
                        <Text className="text-vj-text/60 text-xs">
                          Import your existing .vjb data file
                        </Text>
                      </View>
                      <View className="bg-vj-glass p-2 rounded-full border border-white/20">
                        <ArrowRight size={20} color={COLORS.vjText} />
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}

              {/* Create New Firm */}
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => router.push("/create-firm")}
                disabled={restoring}
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
            </>
          )}

        </View>

        {/* 4. FOOTER BADGE */}
        <View className="mt-12 items-center flex-row justify-center gap-2 opacity-50">
          <ShieldCheck size={14} color={COLORS.vjText} />
          <Text className="text-vj-text text-xs font-medium">
            100% Offline & Secure Storage
          </Text>
        </View>

      </View>
    </ScrollView>

      {/* Modern Restore Preview Modal */}
      <RestorePreviewModal
        visible={previewModalVisible}
        backup={previewBackup}
        fileContent={previewFileContent}
        isRestoring={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPreviewModalVisible(false)}
      />
    </ScreenWrapper>
  );
}