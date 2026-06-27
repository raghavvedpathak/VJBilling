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
import * as FileSystem from "expo-file-system";
import { deleteAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useDatabase } from "../db/client";
import { bootstrapService } from "../services/bootstrapService";
import { STORAGE_PATHS } from "../constants/storagePaths";
import "./global.css";
import { AlertTriangle, Download, LifeBuoy, Trash2 } from "lucide-react-native";

LogBox.ignoreLogs(["SafeAreaView has been deprecated", "SafeAreaView"]);

// ============================================================================
// BOOTSTRAP RESULT TYPE
// Mirrors bootstrapService.initApp() return union exactly.
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
        // ARCHITECT FIX: Only set state here. DO NOT ROUTE YET.
        setBootstrapResult(result);
      } catch (e: any) {
        console.error("[Layout] Bootstrap threw unexpectedly:", e);
        setDbMigrationError(e?.message ?? "Unknown bootstrap error");
        setBootstrapResult("DATABASE_ERROR");
      }
    };

    runBootstrap();
  }, [isLoaded, dbError]);

  // 2. SAFE ROUTING LIFECYCLE (Fixes the Infinite Loop Crash)
  useEffect(() => {
    if (bootstrapResult && bootstrapResult !== "DATABASE_ERROR") {
      // ARCHITECT FIX: setTimeout ensures the <Slot /> below is fully mounted into the 
      // native view hierarchy before Expo Router attempts to replace the route. 
      // This completely eliminates the "Attempted to navigate before mounting" crash loop.
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

  // While migrations are running or bootstrap hasn't finished routing
  if (!isLoaded || bootstrapResult === null) {
    return (
      <LoadingScreen
        message={!isLoaded ? "Updating Database Schema..." : "Verifying Data Integrity..."}
      />
    );
  }

  // Migration failed — render the escape-path error screen inline
  if (bootstrapResult === "DATABASE_ERROR") {
    return (
      <DatabaseErrorScreen
        title="CRITICAL MIGRATION ERROR"
        message={dbMigrationError ?? "An unknown database error occurred."}
      />
    );
  }

  // After router.replace() fires, render the Slot (which will show the routed screen)
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FCFBF8" />
      <Stack screenOptions={{ headerShown: false }} />
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

  useEffect(() => {
    FileSystem.getInfoAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT)
      .then((info) => setSnapshotExists(info.exists))
      .catch(() => setSnapshotExists(false));
  }, []);

  const handleExportRawData = async () => {
    if (!snapshotExists) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT, {
          dialogTitle: "Export Pre-Migration Data Snapshot",
        });
      }
    } catch (e: any) {
      Alert.alert("Export Failed", e.message);
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
      await deleteAsync(dbFile, { idempotent: true });
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
            onPress={snapshotExists ? handleExportRawData : undefined}
            activeOpacity={snapshotExists ? 0.7 : 1}
            className={`bg-white flex-row items-center justify-center p-4 rounded-xl border ${
              snapshotExists ? "border-vj-danger/30" : "border-gray-200 opacity-50"
            }`}
          >
            <Download size={20} color={snapshotExists ? "#ef4444" : "#9ca3af"} />
            <Text
              className={`font-bold text-center ml-2 ${
                snapshotExists ? "text-vj-danger" : "text-gray-500 text-xs"
              }`}
            >
              {snapshotExists
                ? "Export Pre-Migration Snapshot"
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