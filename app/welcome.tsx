// app/welcome.tsx — Phase 2 v2.11 Canonical Welcome Screen

import React, { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassButton } from '@/components/ui/Glass';
import { restoreService } from '@/services/phase1/restoreService';
import { useSession } from '@/hooks/useSession';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { firmRepository, Firm } from '@/repositories/phase1/firmRepository';
import { ShieldCheck, HardDriveUpload, Plus, Building2, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { RestorePreviewModal } from '@/components/RestorePreviewModal';
import { BackupEnvelope } from '@/services/phase1/backupService';
import { COLORS } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { refreshSession } = useSession();
  const { switchFirm, setFirms } = useFirmStore();

  const [isScanning, setIsScanning] = useState(true);
  const [hasBackup, setHasBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [existingFirms, setExistingFirms] = useState<Firm[]>([]);
  const [enteringFirmId, setEnteringFirmId] = useState<string | null>(null);

  // Restore Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);

  // Refresh active firms and backup file detection every time screen gains focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadWelcomeData = async () => {
        try {
          const allFirms = firmRepository.getAll();
          const activeFirms = allFirms.filter((f) => !f.isArchived);
          
          if (isMounted) {
            setExistingFirms(activeFirms);
            setFirms(allFirms);
          }

          const fsAny = FileSystem as any;
          const baseDir = fsAny.documentDirectory ?? fsAny.cacheDirectory ?? '';
          if (baseDir) {
            const files = await FileSystem.readDirectoryAsync(baseDir);
            const vjbFiles = files.filter((f) => f.endsWith('.vjb'));
            if (isMounted) {
              setHasBackup(vjbFiles.length > 0);
            }
          }
        } catch (error) {
          console.error('[Welcome] Focus initialization error:', error);
        } finally {
          if (isMounted) {
            setIsScanning(false);
          }
        }
      };

      loadWelcomeData();

      return () => {
        isMounted = false;
      };
    }, [setFirms])
  );

  const handleEnterFirm = async (firmId: string) => {
    try {
      setEnteringFirmId(firmId);
      await switchFirm(firmId);
      await refreshSession();
      try { router.dismissAll(); } catch {}
      router.replace('/dashboard');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to enter store workspace.');
      setEnteringFirmId(null);
    }
  };

  const handleRestore = async () => {
    try {
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
      Alert.alert('Welcome Back', 'Database restored successfully.');
      try { router.dismissAll(); } catch {}
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message);
    } finally {
      setRestoring(false);
    }
  };

  if (isScanning) {
    return (
      <TwoToneWrapper title="">
        <View className="flex-1 justify-center items-center gap-4 py-20">
          <ActivityIndicator size="large" color={COLORS.vjAccent} />
          <Text className="text-vj-text/50 font-bold text-xs uppercase tracking-widest">
            Loading System...
          </Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const welcomeHeader = (
    <View className="items-center pb-3 pt-2">
      <View className="bg-white/15 p-4 rounded-full mb-3 border border-white/20 shadow-sm items-center justify-center">
        <ShieldCheck size={48} color="#FCFBF8" />
      </View>
      
      <Text className="text-4xl font-black text-vj-bg text-center tracking-tight mb-2">
        VJ Billing
      </Text>

      <View className="bg-white/10 px-4 py-1.5 rounded-full border border-white/20 shadow-xs">
        <Text className="text-[#FDBA74] text-center font-black tracking-widest text-[10px] uppercase">
          By Raghav Ramdas Vedpathak
        </Text>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={welcomeHeader}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 60, flexGrow: 1, justifyContent: 'center' }}
        className="w-full max-w-md self-center"
      >
        {/* ACTIVE STORE WORKSPACE */}
        {existingFirms.length > 0 && (
          <GlassCard 
            style={{ 
              backgroundColor: 'rgba(238, 242, 255, 0.85)', 
              borderColor: 'rgba(99, 102, 241, 0.35)', 
              marginBottom: 16
            }}
          >
            <View className="items-center text-center">
              <View className="bg-indigo-600/15 p-2.5 rounded-2xl mb-2 border border-indigo-600/25 items-center justify-center">
                <Building2 size={22} color="#4338CA" />
              </View>
              <Text className="text-vj-text/60 font-black text-[10px] uppercase tracking-widest mb-2 text-center">
                Active Store Workspace
              </Text>

              {existingFirms.map((f) => (
                <View key={f.id} className="w-full bg-white/85 p-3.5 rounded-2xl border border-white/90 shadow-xs items-center mb-1">
                  <View className="flex-row items-center gap-3 mb-3 w-full">
                    <View className="h-11 w-11 bg-indigo-500/10 rounded-2xl items-center justify-center border border-indigo-500/20 overflow-hidden">
                      {f.firmLogoRef ? (
                        <Image source={{ uri: f.firmLogoRef }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text className="font-black text-xl text-indigo-900">{f.name.substring(0, 1)}</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-vj-text font-black text-base leading-tight" numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text className="text-vj-text/60 text-xs font-semibold mt-0.5" numberOfLines={1}>
                        {f.proprietor} • Code: {f.firmCode || 'MAIN'}
                      </Text>
                    </View>
                  </View>

                  <View className="w-full">
                    <GlassButton
                      title={enteringFirmId === f.id ? "Entering Workspace..." : "Enter Store Workspace"}
                      icon={enteringFirmId !== f.id ? <ArrowRight size={18} color="#FCFBF8" /> : undefined}
                      onPress={() => handleEnterFirm(f.id)}
                      loading={enteringFirmId === f.id}
                    />
                  </View>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        {/* CREATE FIRM & RESTORE BACKUP */}
        <View className="flex-row justify-between items-stretch w-full gap-3">
          {/* Left Card: Establish New Firm */}
          <View className="flex-1">
            <GlassCard style={{ marginBottom: 0 }}>
              <View className="items-center text-center justify-between min-h-[160px]">
                <View className="items-center text-center">
                  <View className="bg-vj-text/10 p-3 rounded-2xl mb-2 border border-vj-text/10 items-center justify-center">
                    <Plus size={22} color={COLORS.vjText} />
                  </View>
                  <Text className="text-vj-text font-black text-sm text-center leading-tight mb-1">
                    Establish New Firm
                  </Text>
                  <Text className="text-vj-text/50 text-[10px] text-center font-semibold mb-3">
                    Create from scratch
                  </Text>
                </View>

                <View className="w-full">
                  <GlassButton 
                    title="Create Firm"
                    onPress={() => router.push('/create-firm')}
                    disabled={restoring || enteringFirmId !== null}
                  />
                </View>
              </View>
            </GlassCard>
          </View>

          {/* Right Card: Restore Backup */}
          <View className="flex-1">
            <GlassCard 
              style={{ 
                marginBottom: 0,
                ...(hasBackup ? { backgroundColor: 'rgba(220, 252, 231, 0.65)', borderColor: 'rgba(22, 163, 74, 0.35)' } : {})
              }}
            >
              <View className="items-center text-center justify-between min-h-[160px]">
                <View className="items-center text-center">
                  <View className="bg-emerald-600/15 p-3 rounded-2xl mb-2 border border-emerald-600/25 items-center justify-center">
                    <HardDriveUpload size={22} color="#15803D" />
                  </View>
                  <Text className="text-vj-text font-black text-sm text-center leading-tight mb-1">
                    Restore Backup
                  </Text>
                  {hasBackup ? (
                    <View className="px-2 py-0.5 rounded-full bg-emerald-600/15 border border-emerald-600/30 flex-row items-center gap-1 mb-3">
                      <CheckCircle2 size={10} color="#15803D" />
                      <Text className="text-emerald-800 font-extrabold text-[8px] uppercase tracking-wider text-center">
                        Backup Found
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-vj-text/50 text-[10px] text-center font-semibold mb-3">
                      From .vjb file
                    </Text>
                  )}
                </View>

                <View className="w-full">
                  <GlassButton 
                    title={restoring ? "Restoring..." : "Restore Backup"}
                    onPress={handleRestore}
                    loading={restoring}
                    disabled={enteringFirmId !== null}
                  />
                </View>
              </View>
            </GlassCard>
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
    </TwoToneWrapper>
  );
}