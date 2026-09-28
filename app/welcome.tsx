// app/welcome.tsx — Phase 1 (v7.39) & Phase 2 Modern Welcome & Store Hub
// Step 16 Decision Tree: If no firms and backup detected -> Prioritize Restore Card

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { restoreService } from '@/services/phase1/restoreService';
import '@/services/phase2/inventoryRestoreService';
import { useSession } from '@/hooks/useSession';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { firmRepository, Firm } from '@/repositories/phase1/firmRepository';
import { RestorePreviewModal } from '@/components/phase1/RestorePreviewModal';
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
  Database,
  Lock,
} from 'lucide-react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshSession } = useSession();
  const { switchFirm, setFirms } = useFirmStore();
  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

  const [isScanning, setIsScanning] = useState(true);
  const [hasBackup, setHasBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [existingFirms, setExistingFirms] = useState<Firm[]>([]);
  const [enteringFirmId, setEnteringFirmId] = useState<string | null>(null);

  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<BackupEnvelope | null>(null);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);

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
          const docDir = fsAny.documentDirectory ?? fsAny.cacheDirectory ?? '';
          const backupDir = docDir + 'backups/';
          let vjbExists = false;

          try {
            const backupDirInfo = await FileSystem.getInfoAsync(backupDir);
            if (backupDirInfo.exists) {
              const backupFiles = await FileSystem.readDirectoryAsync(backupDir);
              if (backupFiles.some((f: string) => f.endsWith('.vjb'))) {
                vjbExists = true;
              }
            }
          } catch {}

          if (!vjbExists && docDir) {
            try {
              const rootFiles = await FileSystem.readDirectoryAsync(docDir);
              if (rootFiles.some((f: string) => f.endsWith('.vjb'))) {
                vjbExists = true;
              }
            } catch {}
          }

          if (isMounted) {
            setHasBackup(vjbExists);
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

  // Theme-aware dynamic card color tokens
  const baseCardBg = isDark ? 'rgba(28, 20, 24, 0.88)' : 'rgba(255, 255, 255, 0.90)';
  const baseCardBorder = isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.45)';

  const restoreCardBg = hasBackup
    ? (isDark ? 'rgba(6, 78, 59, 0.32)' : 'rgba(236, 253, 245, 0.92)')
    : baseCardBg;
  const restoreCardBorder = hasBackup
    ? (isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(16, 185, 129, 0.55)')
    : (isDark ? 'rgba(124, 58, 237, 0.35)' : 'rgba(124, 58, 237, 0.30)');

  const establishCardBg = (existingFirms.length === 0 && !hasBackup)
    ? (isDark ? 'rgba(120, 53, 15, 0.25)' : 'rgba(255, 251, 235, 0.92)')
    : baseCardBg;
  const establishCardBorder = (existingFirms.length === 0 && !hasBackup)
    ? (isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(212, 175, 55, 0.55)')
    : baseCardBorder;

  const welcomeHeader = (
    <View className="items-center pb-2 pt-1">
      <View
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.16)',
          padding: 14,
          borderRadius: 28,
          marginBottom: 10,
          borderWidth: 1.5,
          borderColor: 'rgba(255, 255, 255, 0.30)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ShieldCheck size={40} color="#FCFBF8" />
      </View>

      <Text className="text-3xl font-black text-vj-bg text-center tracking-tight mb-1">
        VJ Billing
      </Text>

      <View className="bg-white/10 px-3.5 py-1 rounded-full border border-white/20 shadow-xs mb-2">
        <Text className="text-[#FDBA74] text-center font-black tracking-widest text-[9px] uppercase">
          By Raghav Ramdas Vedpathak
        </Text>
      </View>

      {existingFirms.length > 0 ? (
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
      ) : (
        <View className="flex-row items-center gap-2 mt-1">
          <HeaderPill
            icon={<Lock size={12} color="#FDBA74" />}
            label="SECURE OFFLINE SUITE"
          />
          <HeaderPill
            icon={<Database size={12} color={colors.vjBg} />}
            label="SQLITE v7"
          />
        </View>
      )}
    </View>
  );

  const renderEstablishNewFirmCard = () => {
    if (isMaxFirmsReached) {
      return (
        <GlassCard
          key="card-establish-limit"
          style={{
            marginBottom: 14,
            borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.30)',
            borderWidth: 1.2,
            backgroundColor: baseCardBg,
            padding: 16,
          }}
        >
          <View className="flex-row items-center gap-3">
            <View
              style={{
                padding: 10,
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
              }}
            >
              <Store size={22} color={colors.vjText} style={{ opacity: 0.5 }} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.vjText, fontWeight: '800', fontSize: 14 }}>
                Maximum Store Capacity (3/3)
              </Text>
              <Text style={{ color: `${colors.vjText}99`, fontSize: 11.5, fontWeight: '600', marginTop: 1 }}>
                All 3 active store slots are allocated. Manage or archive stores in Settings.
              </Text>
            </View>
          </View>
        </GlassCard>
      );
    }

    const isPrimary = existingFirms.length === 0 && !hasBackup;

    return (
      <GlassCard
        key="card-establish"
        style={{
          marginBottom: 14,
          borderColor: establishCardBorder,
          borderWidth: isPrimary ? 1.8 : 1.4,
          backgroundColor: establishCardBg,
        }}
      >
        <View className="flex-row items-start gap-4 mb-4">
          <View
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(245, 158, 11, 0.12)',
              borderWidth: 1.5,
              borderColor: isDark ? 'rgba(212, 175, 55, 0.40)' : 'rgba(212, 175, 55, 0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Store size={26} color="#D4AF37" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text style={{ color: colors.vjText, fontWeight: '900', fontSize: 17 }}>
                {existingFirms.length === 0 ? 'Create Firm' : 'Create Another Firm'}
              </Text>
              {existingFirms.length > 0 && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.20)' : 'rgba(245, 158, 11, 0.15)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.40)' : 'rgba(245, 158, 11, 0.30)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: '900',
                      color: isDark ? '#FDE68A' : '#92400E',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    NEW STORE
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: `${colors.vjText}B3`, fontSize: 12, lineHeight: 16 }}>
              {existingFirms.length === 0
                ? 'Create your firm identity with GSTIN, BIS hallmarking, logos & custom invoice headers.'
                : 'Register an additional firm profile with separate GSTIN, invoices & stock books.'}
            </Text>
          </View>
        </View>

        <GlassButton
          title="Create Firm"
          onPress={() => router.push('/create-firm')}
          disabled={restoring || enteringFirmId !== null}
          variant={isPrimary ? "primary" : "secondary"}
          icon={<Plus size={18} color={isPrimary ? "#FCFBF8" : colors.vjText} />}
        />
      </GlassCard>
    );
  };

  const renderRestoreCard = () => {
    const isPrimary = existingFirms.length === 0 && hasBackup;

    return (
      <GlassCard
        key="card-restore"
        style={{
          marginBottom: 14,
          borderWidth: isPrimary ? 1.8 : 1.4,
          borderColor: restoreCardBorder,
          backgroundColor: restoreCardBg,
        }}
      >
        <View className="flex-row items-start gap-4 mb-4">
          <View
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: hasBackup
                ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.14)')
                : (isDark ? 'rgba(124, 58, 237, 0.20)' : 'rgba(124, 58, 237, 0.10)'),
              borderWidth: 1.5,
              borderColor: hasBackup
                ? (isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(16, 185, 129, 0.35)')
                : (isDark ? 'rgba(167, 139, 250, 0.40)' : 'rgba(124, 58, 237, 0.25)'),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HardDriveUpload size={26} color={hasBackup ? "#10B981" : "#7C3AED"} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text style={{ color: colors.vjText, fontWeight: '900', fontSize: 17 }}>
                Restore Database
              </Text>
              {hasBackup ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(52, 211, 153, 0.40)' : 'rgba(16, 185, 129, 0.30)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircle2 size={10} color="#10B981" />
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: '900',
                      color: isDark ? '#6EE7B7' : '#047857',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    BACKUP FOUND
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: '800',
                      color: `${colors.vjText}80`,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    .VJB VAULT
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: `${colors.vjText}B3`, fontSize: 12, lineHeight: 16 }}>
              {hasBackup
                ? "Encrypted .vjb file detected on device. Inspect and restore your existing store data."
                : "Import an encrypted .vjb backup file from your phone's storage or Google Drive."}
            </Text>
          </View>
        </View>

        <GlassButton
          title={restoring ? "Restoring Database..." : "Select & Restore Backup"}
          onPress={handleRestore}
          loading={restoring}
          disabled={enteringFirmId !== null}
          variant={isPrimary ? "primary" : "secondary"}
          icon={!restoring ? <HardDriveUpload size={18} color={isPrimary ? "#FCFBF8" : colors.vjText} /> : undefined}
        />
      </GlassCard>
    );
  };

  return (
    <TwoToneWrapper title="" headerContent={welcomeHeader}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={true}
          alwaysBounceVertical={true}
          overScrollMode="always"
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom + 48, 64),
            flexGrow: 1,
            alignItems: 'center',
          }}
        >
          <View className="w-full max-w-md">
            {/* Active Store Workspaces */}
            {existingFirms.length > 0 && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-3 px-1">
                  <Text
                    style={{
                      color: `${colors.vjText}99`,
                      fontWeight: '900',
                      fontSize: 11.5,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    Active Store Workspaces
                  </Text>
                  <Text style={{ color: `${colors.vjText}66`, fontWeight: '700', fontSize: 10.5 }}>
                    Tap to enter
                  </Text>
                </View>

                {existingFirms.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.85}
                    disabled={enteringFirmId !== null}
                    onPress={() => handleEnterFirm(f.id)}
                    style={{ marginBottom: 12 }}
                  >
                    <GlassCard
                      style={{
                        marginBottom: 0,
                        padding: 16,
                        borderColor: baseCardBorder,
                        borderWidth: 1.5,
                        backgroundColor: baseCardBg,
                      }}
                    >
                      <View className="flex-row items-center gap-3.5 mb-3.5">
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 16,
                            backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(212, 175, 55, 0.12)',
                            borderWidth: 1.5,
                            borderColor: 'rgba(212, 175, 55, 0.35)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          {f.firmLogoRef ? (
                            <Image
                              source={{ uri: f.firmLogoRef }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text
                              style={{
                                fontWeight: '900',
                                fontSize: 20,
                                color: isDark ? '#FDE68A' : '#92400E',
                              }}
                            >
                              {f.name.substring(0, 1).toUpperCase()}
                            </Text>
                          )}
                        </View>

                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              style={{
                                color: colors.vjText,
                                fontWeight: '900',
                                fontSize: 16,
                                flex: 1,
                              }}
                              numberOfLines={1}
                            >
                              {f.name}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.20)' : 'rgba(212, 175, 55, 0.15)',
                                borderWidth: 1,
                                borderColor: 'rgba(212, 175, 55, 0.35)',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: '900',
                                  color: isDark ? '#FDE68A' : '#92400E',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {f.firmCode || 'MAIN'}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={{
                              color: `${colors.vjText}99`,
                              fontSize: 12,
                              fontWeight: '600',
                              marginTop: 1,
                            }}
                            numberOfLines={1}
                          >
                            {f.proprietor} • {f.city || 'Store'}
                          </Text>

                          {f.gstin ? (
                            <Text
                              style={{
                                color: `${colors.vjText}70`,
                                fontSize: 10,
                                fontWeight: '700',
                                marginTop: 1,
                              }}
                              numberOfLines={1}
                            >
                              GSTIN: {f.gstin}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Interactive Action Row */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 10,
                          borderTopWidth: 1,
                          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(212, 175, 55, 0.20)',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.vjAccent }}>
                          {enteringFirmId === f.id ? 'Entering Workspace...' : 'Enter Store Workspace'}
                        </Text>
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            backgroundColor: colors.vjText,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {enteringFirmId === f.id ? (
                            <ActivityIndicator size="small" color={colors.vjBg} />
                          ) : (
                            <ArrowRight size={15} color={colors.vjBg} />
                          )}
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Setup & Recovery Section */}
            <View className="mb-2">
              {existingFirms.length > 0 && (
                <Text
                  style={{
                    color: `${colors.vjText}99`,
                    fontWeight: '900',
                    fontSize: 11.5,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 12,
                    paddingHorizontal: 4,
                  }}
                >
                  Store Setup & Recovery
                </Text>
              )}

              {/* Step 16 Decision Tree: If no firms and backup detected, show Restore FIRST */}
              {existingFirms.length === 0 && hasBackup ? (
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

            {/* Security & Offline Certification Badge */}
            <View
              style={{
                marginTop: 16,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: 0.7,
              }}
            >
              <ShieldCheck size={14} color={colors.vjAccent} />
              <Text style={{ color: colors.vjText, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 }}>
                100% Offline • AES-256 Encrypted • SQLite v7
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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