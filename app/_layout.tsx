import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
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
} from "react-native";

// FIX: Use ONLY the legacy namespace for both constants and methods in SDK 56
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { useDatabase } from "../db/client";
import { bootstrapService, PRE_MIGRATION_SNAPSHOT_PATH } from "../services/bootstrapService";
import { getDeviceDerivedKeyMaterial } from "../utils/deviceId";
import { STORAGE_PATHS } from "../constants/storagePaths";
import "./global.css";
import { AlertTriangle, Download, LifeBuoy, Trash2 } from "lucide-react-native";

LogBox.ignoreLogs(["SafeAreaView has been deprecated", "SafeAreaView"]);

// ============================================================================
// BOOTSTRAP RESULT TYPE
// ============================================================================
type BootstrapResult =
  | "DASHBOARD"
  | "SETUP"
  | "SAFE_MODE"
  | "DATABASE_ERROR"
  | "DASHBOARD_WARNING"
  | null;

export default function RootLayout() {
  const [snapshotStatus, setSnapshotStatus] = useState<"PENDING" | "DONE">("PENDING");

  useEffect(() => {
    const runSnapshot = async () => {
      await bootstrapService.takePreMigrationSnapshot();
      setSnapshotStatus("DONE");
    };
    runSnapshot();
  }, []);

  if (snapshotStatus === "PENDING") {
    return <LoadingScreen message="Securing Pre-Migration Snapshot..." />;
  }

  return <AppMigratorAndRunner />;
}

function AppMigratorAndRunner() {
  const router = useRouter();
  const { isLoaded, error: dbError } = useDatabase();
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult>(null);
  const [dbMigrationError, setDbMigrationError] = useState<string | null>(null);

  // 1. RUN BOOTSTRAP AND SET STATE
  useEffect(() => {
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
  }, [isLoaded, dbError]);

  // 2. SAFE ROUTING LIFECYCLE
  useEffect(() => {
    if (bootstrapResult && bootstrapResult !== "DATABASE_ERROR") {
      setTimeout(() => {
        switch (bootstrapResult) {
          case "DASHBOARD":
          case "DASHBOARD_WARNING":
            router.replace("/dashboard");
            break;
          case "SETUP":
            router.replace("/welcome");
            break;
          case "SAFE_MODE":
            router.replace("/safe-mode");
            break;
        }
      }, 50);
    }
  }, [bootstrapResult, router]);

  if (!isLoaded || bootstrapResult === null) {
    return (
      <LoadingScreen
        message={!isLoaded ? "Updating Database Schema..." : "Verifying Data Integrity..."}
      />
    );
  }

  if (bootstrapResult === "DATABASE_ERROR") {
    return (
      <DatabaseErrorScreen
        title="CRITICAL MIGRATION ERROR"
        message={dbMigrationError ?? "An unknown database error occurred."}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FCFBF8" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FCFBF8' }, animation: 'slide_from_right' }} />
    </SafeAreaProvider>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <SafeAreaProvider>
      <View className="flex-1 justify-center items-center bg-vj-bg">
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text className="text-vj-text mt-4 font-bold">{message}</Text>
      </View>
    </SafeAreaProvider>
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
      const keyMaterial = await crypto.subtle.importKey('raw', keySourceMaterial as any, 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
      const decryptedStr = new TextDecoder().decode(decrypted);

      // Write temp plaintext file using FileSystem.cacheDirectory
      const tempPath = FileSystem.cacheDirectory + 'vjbilling_premigration_decrypted.json';
      await FileSystem.writeAsStringAsync(tempPath, decryptedStr, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(tempPath, {
          dialogTitle: "Export Decrypted Pre-Migration Data",
          mimeType: 'application/json'
        });
      }
      
      // Cleanup temp file to maintain zero-trace security
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
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}