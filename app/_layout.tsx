/* eslint-disable no-restricted-imports */
// app/_layout.tsx
import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
  StyleSheet
} from "react-native";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { useDatabase } from "../db/client";
import { bootstrapService, PRE_MIGRATION_SNAPSHOT_PATH } from "../services/bootstrapService";
import { getDeviceDerivedKeyMaterial } from "../utils/deviceId";
import { STORAGE_PATHS, COLORS } from "../constants";
import "./global.css";
import { AlertTriangle, Download, LifeBuoy, Trash2 } from "lucide-react-native";

import { ThemeProvider, DefaultTheme } from "@react-navigation/native";
import { PinGate } from "../components/PinGate";
import { isPinSet, isPinSkipped } from "../services/pinService"; // v7.29 evaluation helpers

import { useStore } from "zustand";
import { appSettingsStore } from "../store/appSettingsStore";
import { getThemeColors } from "../constants/theme";

LogBox.ignoreLogs(["SafeAreaView has been deprecated", "SafeAreaView"]);

type BootstrapResult =
  | "DASHBOARD"
  | "SETUP"
  | "SAFE_MODE"
  | "SUCCESS"
  | "SUCCESS_WITH_WARNING"
  | "DATABASE_ERROR"
  | "DASHBOARD_WARNING"
  | null;

export default function RootLayout() {
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
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
  const [snapshotStatus, setSnapshotStatus] = useState<"PENDING" | "DONE">("PENDING");
  const [pinVerified, setPinVerified] = useState(false); 
  
  const { isLoaded, error: dbError } = useDatabase();
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult>(null);
  const [dbMigrationError, setDbMigrationError] = useState<string | null>(null);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // 0. PRE-MIGRATION SNAPSHOT & v7.29 PIN BYPASS EVALUATION
  useEffect(() => {
    const runSnapshot = async () => {
      await bootstrapService.takePreMigrationSnapshot();
      
      // Evaluation Gate: If no PIN is configured but setup was explicitly skipped, bypass gate
      if (!isPinSet() && isPinSkipped()) {
        setPinVerified(true);
      }
      
      setSnapshotStatus("DONE");
    };
    runSnapshot();
  }, []);

  useEffect(() => {
    if (!hasMounted) return; // Wait for layout Stack / NavigationContainer to mount
    if (!pinVerified) return; // Hard Halt: Wait for explicit validation or skip authorization

    if (dbError) {
      setDbMigrationError(dbError.message);
      setBootstrapResult("DATABASE_ERROR");
      return;
    }
    if (!isLoaded) return;

    const runBootstrap = async () => {
      try {
        const result = await bootstrapService.initApp();
        setBootstrapResult(result);
      } catch (e: any) {
        console.error("[Layout] Bootstrap threw unexpectedly:", e);
        setDbMigrationError(e?.message ?? "Unknown bootstrap error");
        setBootstrapResult("DATABASE_ERROR");
      }
    };

    runBootstrap();
  }, [isLoaded, dbError, pinVerified, hasMounted]);

  // Navigate after bootstrap result is committed
  useEffect(() => {
    if (!hasMounted || !bootstrapResult) return;

    const timer = setTimeout(() => {
      if (bootstrapResult === "DASHBOARD" || bootstrapResult === "DASHBOARD_WARNING") {
        router.replace("/dashboard");
      } else if (bootstrapResult === "SETUP") {
        router.replace("/welcome");
      } else if (bootstrapResult === "SAFE_MODE") {
        router.replace("/safe-mode");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [bootstrapResult, hasMounted]);

  const showSnapshotLoading = snapshotStatus === "PENDING";
  const showPinGate = snapshotStatus === "DONE" && !pinVerified; 
  const showBootstrapLoading = !showSnapshotLoading && !showPinGate && (!isLoaded || bootstrapResult === null);
  const showError = bootstrapResult === "DATABASE_ERROR";
  const loadingMsg = !isLoaded ? "Updating Database Schema..." : "Verifying Data Integrity...";

  const showOverlay = showSnapshotLoading || showPinGate || showBootstrapLoading || showError;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.vjBg} />
      
      {/* 1. ALWAYS mount Stack so React 19 Fiber hooks are never interrupted or reordered */}
      <View style={StyleSheet.absoluteFill}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.vjBg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="safe-mode" options={{ headerShown: false }} />
        </Stack>
      </View>

      {/* 2. OVERLAY our Bootstrap / PinGate / Error screens ON TOP of the Stack */}
      {showOverlay && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.vjBg, zIndex: 99999, elevation: 99999 }]}>
          <OverlayContainer
            showSnapshotLoading={showSnapshotLoading}
            showPinGate={showPinGate}
            showBootstrapLoading={showBootstrapLoading}
            showError={showError}
            loadingMsg={loadingMsg}
            dbMigrationError={dbMigrationError}
            colors={colors}
            onPinSuccess={() => setPinVerified(true)}
          />
        </View>
      )}
    </>
  );
}

function OverlayContainer({
  showSnapshotLoading,
  showPinGate,
  showBootstrapLoading,
  showError,
  loadingMsg,
  dbMigrationError,
  colors,
  onPinSuccess,
}: {
  showSnapshotLoading: boolean;
  showPinGate: boolean;
  showBootstrapLoading: boolean;
  showError: boolean;
  loadingMsg: string;
  dbMigrationError: string | null;
  colors: any;
  onPinSuccess: () => void;
}) {
  if (showSnapshotLoading) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg }]}>
        <LoadingScreen message="Securing Pre-Migration Snapshot..." />
      </View>
    );
  }

  if (showPinGate) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg }]}>
        <PinGate onSuccess={onPinSuccess} />
      </View>
    );
  }

  if (showBootstrapLoading && !showError) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg }]}>
        <LoadingScreen message={loadingMsg} />
      </View>
    );
  }

  if (showError) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: colors.vjBg }]}>
        <DatabaseErrorScreen
          title="CRITICAL MIGRATION ERROR"
          message={dbMigrationError ?? "An unknown database error occurred."}
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

function DatabaseErrorScreen({ title, message }: { title: string; message: string }) {
  const [snapshotExists, setSnapshotExists] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH)
      .then((info) => setSnapshotExists(info.exists))
      .catch(() => setSnapshotExists(false));
  }, []);

  const handleExportRawData = async () => {
    if (!snapshotExists) return;
    try {
      setIsExporting(true);
      const fileContent = await FileSystem.readAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, { encoding: 'utf8' });
      const parsedBlob = JSON.parse(fileContent);

      const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const saltBytes = fromBase64(parsedBlob.salt);
      const ivBytes = fromBase64(parsedBlob.iv);
      const cipherBytes = fromBase64(parsedBlob.ciphertext);

      const keySourceMaterial = await getDeviceDerivedKeyMaterial();
      
      const globalCrypto = (globalThis as any).crypto;
      const keyMaterial = await globalCrypto.subtle.importKey('raw', keySourceMaterial as any, 'PBKDF2', false, ['deriveKey']);
      const key = await globalCrypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );

      const decrypted = await globalCrypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
      const decryptedStr = new TextDecoder().decode(decrypted);

      const tempPath = FileSystem.cacheDirectory + 'vjbilling_premigration_decrypted.json';
      await FileSystem.writeAsStringAsync(tempPath, decryptedStr, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(tempPath, {
          dialogTitle: "Export Decrypted Pre-Migration Data",
          mimeType: 'application/json'
        });
      }
      
      await FileSystem.deleteAsync(tempPath, { idempotent: true });

    } catch (e: any) {
      Alert.alert("Export Failed", "Could not decrypt the snapshot. Error: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSupport = () => {
    const body = `CRITICAL MIGRATION FAILURE\n\nError:\n${message}\n\nPlease help restore my database.`;
    Linking.openURL(
      `mailto:support@vjbilling.com?subject=VJ Billing - Database Error&body=${encodeURIComponent(body)}`
    );
  };

  const handleConfirmReset = async () => {
    if (resetInput !== "DELETE") {
      Alert.alert("Aborted", "You must type exactly 'DELETE' to reset.");
      setResetInput("");
      return;
    }
    try {
      const dbFile = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      await FileSystem.deleteAsync(dbFile, { idempotent: true });
      setShowResetModal(false);
      Alert.alert(
        "Reset Complete",
        "The database has been wiped. Please completely close and restart the app."
      );
    } catch (e: any) {
      Alert.alert("Reset Failed", e.message);
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
            snapshotExists ? "border-vj-danger/30" : "border-gray-200 opacity-50"
          }`}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Download size={20} color={snapshotExists ? "#ef4444" : "#9ca3af"} />
          )}
          <Text
            className={`font-bold text-center ml-2 ${
              snapshotExists ? "text-vj-danger" : "text-gray-500 text-xs"
            }`}
          >
            {snapshotExists
              ? (isExporting ? "Decrypting Snapshot..." : "Export Pre-Migration Snapshot")
              : "No snapshot available — pre-migration backup did not complete"}
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
            setResetInput("");
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
              WARNING: This permanently deletes the database and all records.{"\n"}
              Type <Text className="font-black text-vj-danger">DELETE</Text> to confirm.
            </Text>
            <TextInput
              value={resetInput}
              onChangeText={setResetInput}
              placeholder="Type DELETE here"
              autoCapitalize="characters"
              autoFocus
              className="bg-white border border-vj-danger/40 rounded-lg px-4 py-3 text-center font-bold text-lg mb-4 tracking-widest"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowResetModal(false)}
                className="flex-1 border border-gray-300 p-3 rounded-xl items-center"
              >
                <Text className="text-center font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmReset}
                className="flex-1 bg-vj-danger p-3 rounded-xl items-center"
              >
                <Text className="font-bold text-white">Nuke Database</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}