import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ShieldAlert, Unlock, HardDriveUpload, RefreshCw, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeModeStore } from '../store/safeModeStore';
import { safeModeService } from '../services/safeModeService';
import { bootstrapService } from '../services/bootstrapService';
import { GlassCard, GlassButton, GlassInput } from '../components/ui/Glass';

export default function SafeModeScreen() {
  const router = useRouter();
  const { reason, activatedAt } = useSafeModeStore();
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [retrying, setRetrying] = useState(false);

  // -------------------------------------------------------------------------
  // RETRY — Runs the full bootstrap sequence again.
  // initApp() result MUST drive the navigation outcome.
  // Previously this ignored the result and always routed to /dashboard — fixed.
  // -------------------------------------------------------------------------
  const handleRetry = async () => {
    try {
      setRetrying(true);
      const result = await bootstrapService.initApp();

      switch (result) {
        case 'DASHBOARD':
        case 'DASHBOARD_WARNING':
          router.replace('/dashboard');
          break;
        case 'SETUP':
          router.replace('/welcome');
          break;
        case 'SAFE_MODE':
          // Still in Safe Mode — show feedback and stay on this screen
          Alert.alert(
            'Still Unsafe',
            'The system detected the same integrity issues. Retry failed.'
          );
          break;
        case 'DATABASE_ERROR':
          // Bubble to layout's error surface — replace to root which will re-evaluate
          router.replace('/');
          break;
      }
    } catch (e: any) {
      Alert.alert('Retry Failed', e?.message ?? 'An unexpected error occurred.');
    } finally {
      setRetrying(false);
    }
  };

  // -------------------------------------------------------------------------
  // ADMIN OVERRIDE — Phase 1 placeholder code "0000".
  //
  // ARCHITECTURE NOTE: safeModeService.clear() is marked INTERNAL ONLY in the
  // spec (called only by verifyService or restoreService in normal flow).
  // The admin override is the documented escape-path exception — it bypasses
  // integrity checks by design. This is a Phase 1 escape valve, not normal flow.
  // The override code must be replaced with a proper admin key mechanism in
  // a future security phase.
  // -------------------------------------------------------------------------
  const submitUnlock = async () => {
    if (unlockCode === '0000') {
      await safeModeService.clear();
      router.replace('/dashboard');
    } else {
      Alert.alert('Access Denied', 'Invalid override code.');
      setUnlockCode('');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-vj-danger/10"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      >
        {/* ICON */}
        <View className="items-center mb-8">
          <View className="bg-vj-danger/20 p-6 rounded-full border-4 border-vj-danger/30">
            <ShieldAlert size={64} color="#ef4444" />
          </View>
        </View>

        {/* TITLE */}
        <Text className="text-vj-danger text-3xl font-black text-center mb-2 uppercase tracking-tight">
          Safe Mode Active
        </Text>
        <Text className="text-vj-danger/80 text-center font-bold mb-6">
          System integrity compromised.
        </Text>

        {/* DIAGNOSTICS */}
        <GlassCard>
          <Text className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">
            Diagnostic Report
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Error Code:</Text>
            <Text className="text-vj-danger font-mono font-bold">
              {reason || 'UNKNOWN_ERROR'}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-300">Timestamp:</Text>
            <Text className="text-gray-400 font-mono text-xs">
              {activatedAt ? new Date(activatedAt).toLocaleString() : 'N/A'}
            </Text>
          </View>
        </GlassCard>

        {/* ACTIONS */}
        {!showUnlock ? (
          <View className="gap-4">
            <GlassButton
              title={retrying ? 'Running Diagnostics...' : 'Retry Diagnostics'}
              onPress={handleRetry}
              loading={retrying}
              variant="danger"
              icon={<RefreshCw size={20} color="white" />}
            />

            <GlassButton
              title="Restore Backup"
              onPress={() =>
                Alert.alert(
                  'Manual Restore',
                  'To restore a healthy backup, please reinstall the app to access the "Restore from Backup" option on the welcome screen.'
                )
              }
              variant="secondary"
              icon={<HardDriveUpload size={20} color="#ef4444" />}
            />

            <TouchableOpacity
              onPress={() => setShowUnlock(true)}
              className="p-4 flex-row justify-center items-center gap-2 mt-4"
            >
              <Unlock size={16} color="#ef4444" />
              <Text className="text-vj-danger/80 font-bold">Admin Override</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <GlassCard>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-vj-danger font-bold text-lg">Admin Access</Text>
              <TouchableOpacity onPress={() => setShowUnlock(false)}>
                <X size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <Text className="text-gray-400 text-xs mb-3">
              Enter the emergency bypass code.
            </Text>
            <GlassInput
              value={unlockCode}
              onChangeText={setUnlockCode}
              placeholder="Enter Code"
              secureTextEntry
              keyboardType="number-pad"
            />
            <GlassButton
              title="UNLOCK SYSTEM"
              onPress={submitUnlock}
              variant="danger"
            />
          </GlassCard>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}