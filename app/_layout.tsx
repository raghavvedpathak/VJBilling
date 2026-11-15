/* eslint-disable no-restricted-imports */
// ================================================================
// app/_layout.tsx — Phase 1 v7.47 & Phase 2 Canonical Layout & Bootloader
// Call Order (FIX-V741-3): 1. assertCryptoAvailable() -> 2. PIN Gate -> 3. Step 0 Snapshot -> 4. Bootstrap
// Implements FIX-VSEC-3, FIX-VSEC-12, FIX-V729-1/2, FIX-V741-1..3, FIX-V7411-3/13, FIX-V744-12, FIX-V745-4, FIX-V747-2
// ================================================================

import { useEffect, useState, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ActivityIndicator,
  StatusBar,
  LogBox,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import quickCrypto, { Buffer } from 'react-native-quick-crypto';

import { useDatabase } from '@/db/client';
import {
  bootstrapService,
  PRE_MIGRATION_SNAPSHOT_PATH,
} from '@/services/phase1/bootstrapService';
import { performFactoryResetFiles } from '@/services/phase1/factoryResetService';
import { registerAutoBackupTask } from '@/services/phase1/autoBackupService';
import {
  initBackupNotifications,
  rescheduleOverdueReminder,
} from '@/services/phase1/backupNotificationService';
import { assertCryptoAvailable, decryptSnapshot } from '@/utils/backupCrypto';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';
import { storage } from '@/utils/storage';
import { AB_KEYS } from '@/constants';
import './global.css';
import { AlertTriangle, Download, LifeBuoy, ShieldOff, Trash2 } from 'lucide-react-native';

import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { PinGate } from '@/components/phase1/PinGate';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';

import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { getThemeColors } from '@/constants/theme';

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'SafeAreaView',
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

type BootstrapResult =
  | 'DASHBOARD'
  | 'SETUP'
  | 'SAFE_MODE'
  | 'SUCCESS'
  | 'SUCCESS_WITH_WARNING'
  | 'DATABASE_ERROR'
  | 'DASHBOARD_WARNING'
  | null;

export default function RootLayout() {
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const vjTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.vjBg,
    },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={vjTheme}>
        <RootBootloader colors={colors} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootBootloader({ colors }: { colors: any }) {
  // 0. FIX-V741-3: Crypto preflight runs BEFORE the PIN gate
  const [cryptoState, setCryptoState] = useState<'CHECKING' | 'OK' | 'UNAVAILABLE'>('CHECKING');
  const [cryptoErrorMsg, setCryptoErrorMsg] = useState<string | null>(null);

  // 1. Step 16 Flow: PIN Gate evaluated after crypto preflight, BEFORE Step 0 Snapshot
  const [pinPassed, setPinPassed] = useState<boolean>(() => {
    return !isPinSet() && isPinSkipped();
  });

  const [snapshotDone, setSnapshotDone] = useState(false);
  // Gated: database migrations strictly execute AFTER crypto + PIN + Step 0 snapshot complete
  const { isLoaded, error: dbError } = useDatabase(
    cryptoState === 'OK' && pinPassed && snapshotDone
  );
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult>(null);
  const [dbMigrationError, setDbMigrationError] = useState<string | null>(null);
  const pendingNotificationRouteRef = useRef<string | null>(null);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Step 0a (FIX-V741-3): Run assertCryptoAvailable() before touching PIN or data
  useEffect(() => {
    let cancelled = false;
    assertCryptoAvailable()
      .then(() => {
        if (!cancelled) setCryptoState('OK');
      })
      .catch((err: any) => {
        if (!cancelled) {
          setCryptoErrorMsg(err?.message ?? String(err));
          setCryptoState('UNAVAILABLE');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for local backup notification taps (FIX-V745-4: routes to /settings/backup-restore after bootstrapComplete)
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      if (typeof (Notifications as any).addNotificationResponseReceivedListener === 'function') {
        sub = (Notifications as any).addNotificationResponseReceivedListener((response: any) => {
          const kind = response?.notification?.request?.content?.data?.kind;
          if (
            kind === 'BACKUP_OVERDUE' ||
            kind === 'BACKUP_FAILED' ||
            kind === 'BACKUP_DONE' ||
            kind === 'BACKUP_MISSED'
          ) {
            if (
              bootstrapResult === 'DASHBOARD' ||
              bootstrapResult === 'DASHBOARD_WARNING'
            ) {
              router.push('/settings/backup-restore');
            } else {
              pendingNotificationRouteRef.current = '/settings/backup-restore';
            }
          }
        });
      }
    } catch {}
    return () => {
      sub?.remove();
    };
  }, [bootstrapResult]);

  // Re-verify PIN skip state on mount
  useEffect(() => {
    if (cryptoState === 'OK' && !pinPassed && !isPinSet() && isPinSkipped()) {
      setPinPassed(true);
    }
  }, [cryptoState, pinPassed]);

  // 1. STEP 0: PRE-MIGRATION SNAPSHOT (Executes ONLY after crypto preflight + PIN pass)
  useEffect(() => {
    if (cryptoState !== 'OK' || !pinPassed) return;

    let isCancelled = false;
    const executeStep0Snapshot = async () => {
      await bootstrapService.takePreMigrationSnapshot();
      if (!isCancelled) {
        setSnapshotDone(true);
      }
    };

    executeStep0Snapshot();
    return () => {
      isCancelled = true;
    };
  }, [cryptoState, pinPassed]);

  // 2. STEPS 1–12: APP BOOTSTRAP ENGINE (Executes after Snapshot & Migrations complete)
  useEffect(() => {
    if (!hasMounted || cryptoState !== 'OK' || !pinPassed || !snapshotDone) return;

    if (dbError) {
      setDbMigrationError(dbError.message);
      setBootstrapResult('DATABASE_ERROR');
      return;
    }
    if (!isLoaded) return;

    const runBootstrap = async () => {
      try {
        const result = await bootstrapService.initApp();
        setBootstrapResult(result);

        // FIX-V745-4 & FIX-V747-2: Non-blocking notification channel init, reminder reconciliation, and background task registration
        void (async () => {
          try {
            await initBackupNotifications();
            if (storage.getString(AB_KEYS.enabled) === 'true') {
              await registerAutoBackupTask().catch(() => {});
              const lastSuccess = storage.getString(AB_KEYS.lastSuccessAt);
              const reminderId = storage.getString(AB_KEYS.reminderId);
              if (lastSuccess && !Number.isNaN(Date.parse(lastSuccess))) {
                let needsReschedule = !reminderId;
                if (
                  reminderId &&
                  typeof (Notifications as any).getAllScheduledNotificationsAsync === 'function'
                ) {
                  const scheduled = await (
                    Notifications as any
                  ).getAllScheduledNotificationsAsync();
                  if (
                    Array.isArray(scheduled) &&
                    !scheduled.some((n: any) => n?.identifier === reminderId)
                  ) {
                    needsReschedule = true;
                  }
                }
                if (needsReschedule) {
                  await rescheduleOverdueReminder(new Date(lastSuccess)).catch(() => {});
                }
              }
            }
          } catch {}
        })();
      } catch (e: any) {
        console.error('[Layout] Bootstrap threw unexpectedly:', e);
        setDbMigrationError(e?.message ?? 'Unknown bootstrap error');
        setBootstrapResult('DATABASE_ERROR');
      }
    };

    runBootstrap();
  }, [isLoaded, dbError, cryptoState, pinPassed, snapshotDone, hasMounted]);

  // 3. TARGET ROUTING (Step 16 Formal Decision Tree)
  useEffect(() => {
    if (!hasMounted || !bootstrapResult) return;

    const timer = setTimeout(() => {
      if (bootstrapResult === 'DASHBOARD' || bootstrapResult === 'DASHBOARD_WARNING') {
        if (pendingNotificationRouteRef.current) {
          const targetRoute = pendingNotificationRouteRef.current;
          pendingNotificationRouteRef.current = null;
          router.replace('/dashboard');
          setTimeout(() => router.push(targetRoute as any), 100);
        } else {
          router.replace('/dashboard');
        }
      } else if (bootstrapResult === 'SETUP') {
        router.replace('/welcome');
      } else if (bootstrapResult === 'SAFE_MODE') {
        router.replace('/safe-mode');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [bootstrapResult, hasMounted]);

  const showCryptoChecking = cryptoState === 'CHECKING';
  const showCryptoUnavailable = cryptoState === 'UNAVAILABLE';
  const showPinGate = cryptoState === 'OK' && !pinPassed;
  const showSnapshotLoading = cryptoState === 'OK' && pinPassed && !snapshotDone;
  const showBootstrapLoading =
    cryptoState === 'OK' &&
    pinPassed &&
    snapshotDone &&
    (!isLoaded || bootstrapResult === null);
  const showError = bootstrapResult === 'DATABASE_ERROR';
  const loadingMsg = !isLoaded
    ? 'Updating Database Schema...'
    : 'Verifying Data Integrity...';

  const showOverlay =
    showCryptoChecking ||
    showCryptoUnavailable ||
    showPinGate ||
    showSnapshotLoading ||
    showBootstrapLoading ||
    showError;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.vjBg} />

      {/* 1. Stack is ALWAYS mounted to preserve React Fiber hooks */}
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.vjBg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="safe-mode" options={{ headerShown: false }} />
        </Stack>
      </View>

      {/* 2. OVERLAY Container */}
      {showOverlay && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.vjBg, zIndex: 99999, elevation: 99999 },
          ]}
        >
          <OverlayContainer
            showCryptoChecking={showCryptoChecking}
            showCryptoUnavailable={showCryptoUnavailable}
            cryptoErrorMsg={cryptoErrorMsg}
            showPinGate={showPinGate}
            showSnapshotLoading={showSnapshotLoading}
            showBootstrapLoading={showBootstrapLoading}
            showError={showError}
            loadingMsg={loadingMsg}
            dbMigrationError={dbMigrationError}
            colors={colors}
            onPinSuccess={() => setPinPassed(true)}
          />
        </View>
      )}
    </>
  );
}

function OverlayContainer({
  showCryptoChecking,
  showCryptoUnavailable,
  cryptoErrorMsg,
  showPinGate,
  showSnapshotLoading,
  showBootstrapLoading,
  showError,
  loadingMsg,
  dbMigrationError,
  colors,
  onPinSuccess,
}: {
  showCryptoChecking: boolean;
  showCryptoUnavailable: boolean;
  cryptoErrorMsg: string | null;
  showPinGate: boolean;
  showSnapshotLoading: boolean;
  showBootstrapLoading: boolean;
  showError: boolean;
  loadingMsg: string;
  dbMigrationError: string | null;
  colors: any;
  onPinSuccess: () => void;
}) {
  if (showCryptoChecking) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <LoadingScreen message="Verifying Security Engine..." />
      </View>
    );
  }

  if (showCryptoUnavailable) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <CryptoUnavailableScreen message={cryptoErrorMsg} />
      </View>
    );
  }

  if (showPinGate) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <PinGate onSuccess={onPinSuccess} />
      </View>
    );
  }

  if (showSnapshotLoading) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <LoadingScreen message="Securing Pre-Migration Snapshot..." />
      </View>
    );
  }

  if (showBootstrapLoading && !showError) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <LoadingScreen message={loadingMsg} />
      </View>
    );
  }

  if (showError) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg },
        ]}
      >
        <DatabaseErrorScreen
          title="CRITICAL DATABASE ERROR"
          message={dbMigrationError ?? 'An unknown database error occurred.'}
        />
      </View>
    );
  }

  return null;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <View className="flex-1 justify-center items-center bg-vj-bg">
      <ActivityIndicator size="large" color="#D4AF37" />
      <Text className="text-vj-text mt-4 font-bold">{message}</Text>
    </View>
  );
}

// FIX-V741-3 & FIX-V7411-13: Blocking CryptoUnavailableScreen — no data access and no reset button
function CryptoUnavailableScreen({ message }: { message: string | null }) {
  return (
    <View className="flex-1 justify-center items-center bg-vj-danger/10 p-6">
      <View className="bg-vj-danger/20 p-4 rounded-full mb-4">
        <ShieldOff size={48} color="#ef4444" />
      </View>
      <Text className="text-vj-danger text-2xl font-bold mb-2 text-center">
        SECURITY ENGINE UNAVAILABLE
      </Text>
      <Text className="text-vj-danger/80 text-center mb-4">
        The native cryptographic provider required to protect your data is unavailable on this build.
        No data has been accessed or modified. Please reinstall or update the application.
      </Text>
      {message ? (
        <View className="w-full bg-white p-4 rounded-xl border border-vj-danger/30 shadow-sm">
          <Text className="text-vj-danger font-mono text-xs">{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DatabaseErrorScreen({ title, message }: { title: string; message: string }) {
  const [snapshotExists, setSnapshotExists] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(5);

  const firms = useFirmStore((s) => s.firms);
  const activeFirmId = useFirmStore((s) => s.activeFirmId);
  const activeFirm = firms.find((f) => f.id === activeFirmId) ?? firms[0];
  // FIX-VSEC-12: Require active firm's firmCode when known, or 'DELETE' when DB failed before firm load
  const requiredConfirmationToken = activeFirm?.firmCode ? activeFirm.firmCode : 'DELETE';

  useEffect(() => {
    FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH)
      .then((info) => setSnapshotExists(info.exists))
      .catch(() => setSnapshotExists(false));
  }, []);

  // FIX-VSEC-12: 5-second enforced countdown when Factory Reset modal opens
  useEffect(() => {
    if (!showResetModal) {
      setDelaySeconds(5);
      return;
    }
    setDelaySeconds(5);
    const interval = setInterval(() => {
      setDelaySeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showResetModal]);

  const handleExportRawData = async () => {
    if (!snapshotExists) return;
    try {
      setIsExporting(true);
      const fileContent = await FileSystem.readAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      let decryptedStr: string;
      const parsedBlob = JSON.parse(fileContent);

      // FIX-V7411-3: Use decryptSnapshot() for v2 Keystore snapshots, with legacy v1 fallback
      if (parsedBlob?.v === 2) {
        decryptedStr = await decryptSnapshot(fileContent);
      } else {
        const saltBytes = Buffer.from(parsedBlob.salt, 'base64');
        const ivBytes = Buffer.from(parsedBlob.iv, 'base64');
        const combinedCipher = Buffer.from(parsedBlob.ciphertext, 'base64');
        const authTag = combinedCipher.subarray(combinedCipher.length - 16);
        const ciphertextBody = combinedCipher.subarray(0, combinedCipher.length - 16);
        const keySourceMaterial = Buffer.from(await getDeviceDerivedKeyMaterial());
        const key = quickCrypto.pbkdf2Sync(
          keySourceMaterial,
          saltBytes,
          100_000,
          32,
          'sha256'
        );
        const decipher = (quickCrypto as any).createDecipheriv('aes-256-gcm', key, ivBytes);
        decipher.setAuthTag(authTag);
        decryptedStr = Buffer.concat([
          decipher.update(ciphertextBody),
          decipher.final(),
        ]).toString('utf8');
      }

      const fsAny = FileSystem as any;
      const tempPath =
        (fsAny.cacheDirectory ?? fsAny.documentDirectory ?? '') +
        'vjbilling_premigration_decrypted.json';
      await FileSystem.writeAsStringAsync(tempPath, decryptedStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(tempPath, {
          dialogTitle: 'Export Decrypted Pre-Migration Data',
          mimeType: 'application/json',
        });
      }

      await FileSystem.deleteAsync(tempPath, { idempotent: true });
    } catch (e: any) {
      Alert.alert('Export Failed', 'Could not decrypt snapshot: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSupport = () => {
    const body = `CRITICAL DATABASE FAILURE\n\nError:\n${message}\n\nPlease help restore my database.`;
    Linking.openURL(
      `mailto:support@vjbilling.com?subject=VJ Billing - Database Error&body=${encodeURIComponent(body)}`
    );
  };

  const handleConfirmReset = async () => {
    if (delaySeconds > 0) return;
    if (
      resetInput.trim().toUpperCase() !== requiredConfirmationToken.toUpperCase() &&
      resetInput.trim() !== 'DELETE'
    ) {
      Alert.alert(
        'Aborted',
        `You must type '${requiredConfirmationToken}' to confirm factory reset.`
      );
      setResetInput('');
      return;
    }
    try {
      setIsResetting(true);
      await performFactoryResetFiles(requiredConfirmationToken);
      setShowResetModal(false);
    } catch (e: any) {
      Alert.alert('Reset Failed', e.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-vj-danger/10 p-6">
      <View className="items-center mb-8">
        <View className="bg-vj-danger/20 p-4 rounded-full mb-4">
          <AlertTriangle size={48} color="#ef4444" />
        </View>
        <Text className="text-vj-danger text-2xl font-bold mb-2 text-center">{title}</Text>
        <Text className="text-vj-danger/80 text-center mb-4">
          The system halted to prevent data corruption. You are in emergency recovery mode.
        </Text>
        <View className="w-full bg-white p-4 rounded-xl border border-vj-danger/30 shadow-sm">
          <Text className="text-vj-danger font-mono text-xs">{message}</Text>
        </View>
      </View>

      <View className="w-full gap-3">
        <TouchableOpacity
          onPress={snapshotExists && !isExporting ? handleExportRawData : undefined}
          activeOpacity={snapshotExists ? 0.7 : 1}
          className={`bg-white flex-row items-center justify-center p-4 rounded-xl border ${
            snapshotExists ? 'border-vj-danger/30' : 'border-gray-200 opacity-50'
          }`}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Download size={20} color={snapshotExists ? '#ef4444' : '#9ca3af'} />
          )}
          <Text
            className={`font-bold text-center ml-2 ${
              snapshotExists ? 'text-vj-danger' : 'text-gray-500 text-xs'
            }`}
          >
            {snapshotExists
              ? isExporting
                ? 'Decrypting Snapshot...'
                : 'Export Pre-Migration Snapshot'
              : 'No snapshot available — pre-migration backup did not complete'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSupport}
          className="bg-white flex-row items-center justify-center p-4 rounded-xl border border-vj-danger/30"
        >
          <LifeBuoy size={20} color="#ef4444" />
          <Text className="text-vj-danger font-bold ml-2">Contact Support</Text>
        </TouchableOpacity>

        <View className="h-[1px] bg-vj-danger/30 my-4" />

        <TouchableOpacity
          onPress={() => {
            setResetInput('');
            setShowResetModal(true);
          }}
          className="bg-vj-danger flex-row items-center justify-center p-4 rounded-xl"
        >
          <Trash2 size={20} color="#ffffff" />
          <Text className="text-white font-bold ml-2">Factory Reset (Data Loss)</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showResetModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowResetModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="w-full bg-white rounded-2xl p-6 shadow-xl">
            <Text className="text-vj-danger text-lg font-black mb-2 text-center uppercase">
              FACTORY RESET
            </Text>
            <Text className="text-gray-600 text-center text-sm mb-4">
              WARNING: This permanently deletes the database, encryption key, and all records.
              {'\n'}Type{' '}
              <Text className="font-black text-vj-danger">{requiredConfirmationToken}</Text>{' '}
              to confirm.
            </Text>
            <TextInput
              value={resetInput}
              onChangeText={setResetInput}
              placeholder={`Type ${requiredConfirmationToken} here`}
              autoCapitalize="characters"
              autoFocus
              className="bg-white border border-vj-danger/40 rounded-lg px-4 py-3 text-center font-bold text-lg mb-4 tracking-widest"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowResetModal(false)}
                disabled={isResetting}
                className="flex-1 border border-gray-300 p-3 rounded-xl items-center"
              >
                <Text className="text-center font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmReset}
                disabled={delaySeconds > 0 || isResetting}
                className={`flex-1 bg-vj-danger p-3 rounded-xl items-center ${
                  delaySeconds > 0 || isResetting ? 'opacity-50' : ''
                }`}
              >
                <Text className="font-bold text-white">
                  {isResetting
                    ? 'Resetting...'
                    : delaySeconds > 0
                      ? `Wait ${delaySeconds}s`
                      : 'Nuke Database'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
