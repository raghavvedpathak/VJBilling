/* eslint-disable no-restricted-imports */
// ================================================================
// app/_layout.tsx — Phase 1 v8.0 & Phase 2–4 Canonical Layout & Bootloader
// Call Order (FIX-V741-3): 1. assertCryptoAvailable() -> 2. PIN Gate -> 3. Step 0 Snapshot -> 4. Bootstrap
// Implements FIX-VSEC-3, FIX-VSEC-12, FIX-V729-1/2, FIX-V741-1..3, FIX-V7411-13, FIX-V745-4
// ================================================================

import { useEffect, useState, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StatusBar, LogBox, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useDatabase } from '@/db/client';
import { bootstrapService } from '@/services/phase1/bootstrapService';
import { assertCryptoAvailable } from '@/utils/backupCrypto';
import './global.css';
import { ShieldOff } from 'lucide-react-native';

import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { PinGate } from '@/components/phase1/PinGate';
import { isPinSet, isPinSkipped } from '@/services/phase1/pinService';
import DatabaseErrorScreen from './database-error';

import { appSettingsStore } from '@/store/phase1/appSettingsStore';
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

const BACKUP_NOTIF_KINDS = new Set([
  'BACKUP_OVERDUE',
  'BACKUP_FAILED',
  'BACKUP_DONE',
  'BACKUP_MISSED',
]);

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
  const [pinPassed, setPinPassed] = useState<boolean>(() => !isPinSet() && isPinSkipped());

  const [snapshotDone, setSnapshotDone] = useState(false);
  // Gated: database migrations strictly execute AFTER crypto + PIN + Step 0 snapshot complete
  const { isLoaded, error: dbError } = useDatabase(
    cryptoState === 'OK' && pinPassed && snapshotDone
  );
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult>(null);
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

  // FIX-V745-4: Handle both cold-start and foreground backup notification taps
  useEffect(() => {
    const handleNotificationResponse = (response: any) => {
      const kind = response?.notification?.request?.content?.data?.kind;
      if (!kind || !BACKUP_NOTIF_KINDS.has(kind)) return;

      if (bootstrapResult === 'DASHBOARD' || bootstrapResult === 'DASHBOARD_WARNING') {
        router.push('/settings/backup-restore');
      } else {
        pendingNotificationRouteRef.current = '/settings/backup-restore';
      }
    };

    try {
      if (typeof (Notifications as any).getLastNotificationResponseAsync === 'function') {
        void (Notifications as any)
          .getLastNotificationResponseAsync()
          .then((resp: any) => {
            if (resp) handleNotificationResponse(resp);
          })
          .catch(() => {});
      }
    } catch {}

    let sub: { remove: () => void } | null = null;
    try {
      if (typeof (Notifications as any).addNotificationResponseReceivedListener === 'function') {
        sub = (Notifications as any).addNotificationResponseReceivedListener(
          handleNotificationResponse
        );
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

    void executeStep0Snapshot();
    return () => {
      isCancelled = true;
    };
  }, [cryptoState, pinPassed]);

  // 2. STEPS 1–12: APP BOOTSTRAP ENGINE (Executes after Snapshot & Migrations complete)
  useEffect(() => {
    if (!hasMounted || cryptoState !== 'OK' || !pinPassed || !snapshotDone) return;

    if (dbError) {
      setBootstrapResult('DATABASE_ERROR');
      return;
    }
    if (!isLoaded) return;

    const runBootstrap = async () => {
      try {
        const result = await bootstrapService.initApp();
        setBootstrapResult(result);
      } catch (e: any) {
        console.error('[Layout] Bootstrap threw unexpectedly:', e);
        setBootstrapResult('DATABASE_ERROR');
      }
    };

    void runBootstrap();
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
          {showCryptoChecking ? (
            <LoadingScreen message="Verifying Security Engine..." />
          ) : showCryptoUnavailable ? (
            <CryptoUnavailableScreen message={cryptoErrorMsg} />
          ) : showPinGate ? (
            <PinGate onSuccess={() => setPinPassed(true)} />
          ) : showSnapshotLoading ? (
            <LoadingScreen message="Securing Pre-Migration Snapshot..." />
          ) : showBootstrapLoading && !showError ? (
            <LoadingScreen message={loadingMsg} />
          ) : showError ? (
            <DatabaseErrorScreen />
          ) : null}
        </View>
      )}
    </>
  );
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
