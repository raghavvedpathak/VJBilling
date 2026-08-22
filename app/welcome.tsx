// app/welcome.tsx — Phase 1 & Phase 2 Modern Welcome & Store Hub

import React, { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, Image, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { restoreService } from '@/services/phase1/restoreService';
import { useSession } from '@/hooks/useSession';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { firmRepository, Firm } from '@/repositories/phase1/firmRepository';
import { RestorePreviewModal } from '@/components/RestorePreviewModal';
import { BackupEnvelope } from '@/services/phase1/backupService';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';
import {
  ShieldCheck,
  HardDriveUpload,
  Plus,
  Building2,
  ArrowRight,
  CheckCircle2,
  Store,
  Sparkles,
  Lock,
  Database
} from 'lucide-react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const { refreshSession } = useSession();
  const { switchFirm, setFirms } = useFirmStore();
  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

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
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
      setEnteringFirmId(firmId);
      await switchFirm(firmId);
      await refreshSession();
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/dashboard');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to enter store workspace.');
      setEnteringFirmId(null);
    }
  };

  const handleRestore = async () => {
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
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

  const isMaxFirmsReached = existingFirms.length >= 3;

  const welcomeHeader = (
    <View className="items-center pb-2 pt-1">
      <View className="bg-white/15 p-3.5 rounded-3xl mb-3 border border-white/25 shadow-sm items-center justify-center">
        <ShieldCheck size={42} color="#FCFBF8" />
      </View>

      <Text className="text-3xl font-black text-vj-bg text-center tracking-tight mb-1.5">
        VJ Billing
      </Text>

      <View className="bg-white/10 px-3.5 py-1 rounded-full border border-white/20 shadow-xs mb-2">
        <Text className="text-[#FDBA74] text-center font-black tracking-widest text-[9px] uppercase">
          By Raghav Ramdas Vedpathak
        </Text>
      </View>

      {existingFirms.length > 0 && (
        <View className="flex-row items-center gap-2 mt-1">
          <HeaderPill
            icon={<Building2 size={12} color="#4ADE80" />}
            label={`${existingFirms.length} OF 3 STORES ACTIVE`}
            variant="success"
          />
          <HeaderPill
            icon={<Database size={12} color={colors.vjBg} />}
            label="SQLITE v7"
          />
        </View>
      )}
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={welcomeHeader}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 20,
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View className="w-full max-w-md">
        {/* 1. ACTIVE STORE WORKSPACES (WHEN FIRMS EXIST) */}
        {existingFirms.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3 px-1">
              <Text className="text-vj-text/60 font-black text-xs uppercase tracking-widest">
                Active Store Workspaces
              </Text>
              <Text className="text-vj-text/40 font-bold text-[10px]">
                Tap to enter
              </Text>
            </View>

            {existingFirms.map((f) => (
              <GlassCard
                key={f.id}
                style={{
                  marginBottom: 12,
                  padding: 16,
                  borderColor: 'rgba(212, 175, 55, 0.45)',
                  borderWidth: 1.5,
                  backgroundColor: 'rgba(255, 255, 255, 0.92)',
                }}
              >
                <View className="flex-row items-center gap-3.5 mb-4">
                  {/* Store Logo / Monogram */}
                  <View className="h-12 w-12 rounded-2xl bg-amber-500/10 items-center justify-center border-2 border-amber-500/30 overflow-hidden shadow-xs">
                    {f.firmLogoRef ? (
                      <Image
                        source={{ uri: f.firmLogoRef }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text className="font-black text-xl text-amber-800">
                        {f.name.substring(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>

                  {/* Store Details */}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-vj-text font-black text-base leading-tight flex-1" numberOfLines={1}>
                        {f.name}
                      </Text>
                      <View className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30">
                        <Text className="text-[9px] font-black text-amber-900 uppercase">
                          {f.firmCode || 'MAIN'}
                        </Text>
                      </View>
                    </View>

                    <Text className="text-vj-text/60 text-xs font-semibold mt-0.5" numberOfLines={1}>
                      {f.proprietor} • {f.city || 'Store'}
                    </Text>

                    {f.gstin && (
                      <Text className="text-vj-text/40 text-[10px] font-bold mt-0.5">
                        GSTIN: {f.gstin}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Enter Action Button */}
                <GlassButton
                  title={enteringFirmId === f.id ? "Entering Workspace..." : `Enter ${f.name}`}
                  icon={enteringFirmId !== f.id ? <ArrowRight size={18} color="#FCFBF8" /> : undefined}
                  onPress={() => handleEnterFirm(f.id)}
                  loading={enteringFirmId === f.id}
                  variant="primary"
                />
              </GlassCard>
            ))}
          </View>
        )}

        {/* 2. ACTIONS SECTION: ESTABLISH NEW FIRM & RESTORE BACKUP */}
        <View className="mb-2">
          {existingFirms.length > 0 && (
            <Text className="text-vj-text/60 font-black text-xs uppercase tracking-widest mb-3 px-1">
              Store Setup & Recovery
            </Text>
          )}

          {/* Card A: Establish New Firm */}
          <GlassCard
            style={{
              marginBottom: 14,
              borderColor: 'rgba(212, 175, 55, 0.40)',
              borderWidth: 1.5,
              backgroundColor: 'rgba(255, 255, 255, 0.90)',
            }}
          >
            <View className="flex-row items-start gap-4 mb-4">
              <View className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 items-center justify-center">
                <Store size={26} color="#D4AF37" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-vj-text font-black text-lg">Establish New Firm</Text>
                  <View className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                    <Text className="text-[8px] font-black text-amber-800 uppercase tracking-wider">
                      SETUP
                    </Text>
                  </View>
                </View>
                <Text className="text-vj-text/70 text-xs leading-4">
                  {isMaxFirmsReached
                    ? "Maximum capacity reached (3 of 3 active firms registered)."
                    : "Create a fresh store profile with GSTIN, BIS hallmarking, logos & address."}
                </Text>
              </View>
            </View>

            <GlassButton
              title={isMaxFirmsReached ? "Maximum 3 Firms Reached" : "Establish New Firm"}
              onPress={() => router.push('/create-firm')}
              disabled={isMaxFirmsReached || restoring || enteringFirmId !== null}
              variant={existingFirms.length === 0 ? "primary" : "secondary"}
              icon={!isMaxFirmsReached ? <Plus size={18} color={existingFirms.length === 0 ? "#FCFBF8" : COLORS.vjText} /> : undefined}
            />
          </GlassCard>

          {/* Card B: Restore Database Backup */}
          <GlassCard
            style={{
              marginBottom: 14,
              borderWidth: 1.5,
              borderColor: hasBackup ? 'rgba(16, 185, 129, 0.55)' : 'rgba(124, 58, 237, 0.35)',
              backgroundColor: hasBackup ? 'rgba(236, 253, 245, 0.90)' : 'rgba(255, 255, 255, 0.90)',
            }}
          >
            <View className="flex-row items-start gap-4 mb-4">
              <View
                className={`p-3 rounded-2xl border items-center justify-center ${
                  hasBackup
                    ? 'bg-emerald-500/15 border-emerald-500/35'
                    : 'bg-purple-500/10 border-purple-500/25'
                }`}
              >
                <HardDriveUpload size={26} color={hasBackup ? "#10B981" : "#7C3AED"} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-vj-text font-black text-lg">Restore Database</Text>
                  {hasBackup ? (
                    <View className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex-row items-center gap-1">
                      <CheckCircle2 size={10} color="#10B981" />
                      <Text className="text-emerald-800 font-black text-[8px] uppercase tracking-wider">
                        BACKUP FOUND
                      </Text>
                    </View>
                  ) : (
                    <View className="px-2 py-0.5 rounded-full bg-black/5 border border-black/10">
                      <Text className="text-vj-text/50 font-bold text-[8px] uppercase tracking-wider">
                        .VJB VAULT
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-vj-text/70 text-xs leading-4">
                  {hasBackup
                    ? "Encrypted .vjb file detected on device. Inspect and restore your existing store data."
                    : "Import an encrypted .vjb backup file from your phone's storage or Drive."}
                </Text>
              </View>
            </View>

            <GlassButton
              title={restoring ? "Restoring Database..." : "Select & Restore Backup"}
              onPress={handleRestore}
              loading={restoring}
              disabled={enteringFirmId !== null}
              variant="secondary"
              icon={!restoring ? <HardDriveUpload size={18} color={COLORS.vjText} /> : undefined}
            />
          </GlassCard>
        </View>

        {/* 3. SECURITY FOOTER */}
        <View className="mt-4 items-center flex-row justify-center gap-2 opacity-50">
          <ShieldCheck size={14} color={COLORS.vjText} />
          <Text className="text-vj-text text-xs font-semibold">
            100% Offline • AES-256 Encrypted • SQLite v7
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
    </TwoToneWrapper>
  );
}